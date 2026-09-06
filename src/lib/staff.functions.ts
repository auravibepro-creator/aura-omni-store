import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const passwordShape = z.object({ password: z.string().min(1).max(200) });

export type AssignOrderRow = {
  id: string;
  order_code: string;
  customer_name: string;
  city: string | null;
  address: string;
  total: number;
  status: string;
  sales_agent_id: string | null;
  delivery_agent_id: string | null;
  commission_amount: number;
  created_at: string;
};

const ROLES = ["admin", "agent", "sales", "delivery", "user"] as const;

async function assertPassword(password: string) {
  const { assertAdminPasswordValue } = await import("@/lib/admin-password.server");
  await assertAdminPasswordValue(password);
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Staff directory: every account with its roles, pay setup and live order totals. */
export const adminListStaff = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => passwordShape.parse(data))
  .handler(async ({ data }) => {
    await assertPassword(data.password);
    const db = await admin();

    const [profiles, roles, settings, orders] = await Promise.all([
      db.from("profiles").select("id,email,full_name,phone").order("created_at", { ascending: false }).limit(300),
      db.from("user_roles").select("user_id,role"),
      db.from("staff_settings").select("*"),
      db
        .from("orders")
        .select(
          "id,order_code,customer_name,city,address,total,status,sales_agent_id,delivery_agent_id,commission_amount,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const roleRows = (roles.data ?? []) as { user_id: string; role: string }[];
    const settingRows = (settings.data ?? []) as Record<string, unknown>[];
    const orderRows = (orders.data ?? []) as AssignOrderRow[];

    const people = ((profiles.data ?? []) as { id: string; email: string | null; full_name: string; phone: string | null }[]).map(
      (person) => {
        const personRoles = roleRows.filter((row) => row.user_id === person.id).map((row) => row.role);
        const setting = settingRows.find((row) => row['user_id'] === person.id) ?? null;
        const sales = orderRows.filter((row) => row.sales_agent_id === person.id);
        const deliveries = orderRows.filter((row) => row.delivery_agent_id === person.id);
        const deliveredSales = sales.filter((row) => row.status === "delivered");
        const percent = Number((setting?.['commission_percent'] as number | undefined) ?? 0);
        const salesValue = deliveredSales.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
        return {
          id: person.id,
          email: person.email,
          full_name: person.full_name,
          phone: person.phone,
          roles: personRoles,
          base_salary: Number((setting?.['base_salary'] as number | undefined) ?? 0),
          commission_percent: percent,
          monthly_target: Number((setting?.['monthly_target'] as number | undefined) ?? 0),
          is_active: Boolean(setting?.['is_active'] ?? true),
          sales_count: sales.length,
          delivered_count: deliveredSales.length,
          delivery_count: deliveries.length,
          sales_value: salesValue,
          earned_commission: (salesValue * percent) / 100,
        };
      },
    );

    return { people, orders: orderRows };
  });

export const adminSetRole = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    passwordShape
      .extend({
        user_id: z.string().uuid(),
        role: z.enum(ROLES),
        enabled: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await assertPassword(data.password);
    const db = await admin();
    if (data.enabled) {
      const { error } = await db
        .from("user_roles")
        .upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw error;
    } else {
      const { error } = await db
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", data.role);
      if (error) throw error;
    }
    return { ok: true as const };
  });

export const adminSaveStaffSettings = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    passwordShape
      .extend({
        user_id: z.string().uuid(),
        base_salary: z.number().min(0).max(100_000_000).default(0),
        commission_percent: z.number().min(0).max(100).default(0),
        monthly_target: z.number().min(0).max(1_000_000_000).default(0),
        is_active: z.boolean().default(true),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await assertPassword(data.password);
    const db = await admin();
    const { password: _password, ...fields } = data;
    const { error } = await db.from("staff_settings").upsert(fields, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true as const };
  });

/** Assign an order to a sales agent and/or delivery rider, with commission snapshot. */
export const adminAssignOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    passwordShape
      .extend({
        order_id: z.string().uuid(),
        sales_agent_id: z.string().uuid().nullable().default(null),
        delivery_agent_id: z.string().uuid().nullable().default(null),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await assertPassword(data.password);
    const db = await admin();

    const { data: order } = await db
      .from("orders")
      .select("total")
      .eq("id", data.order_id)
      .maybeSingle();

    let commission = 0;
    if (data.sales_agent_id) {
      const { data: setting } = await db
        .from("staff_settings")
        .select("commission_percent")
        .eq("user_id", data.sales_agent_id)
        .maybeSingle();
      const percent = Number((setting as { commission_percent?: number } | null)?.commission_percent ?? 0);
      commission = (Number((order as { total?: number } | null)?.total ?? 0) * percent) / 100;
    }

    const { error } = await db
      .from("orders")
      .update({
        sales_agent_id: data.sales_agent_id,
        delivery_agent_id: data.delivery_agent_id,
        commission_amount: commission,
      })
      .eq("id", data.order_id);
    if (error) throw error;
    return { ok: true as const, commission };
  });

/** Support desk: full conversation for one thread. */
export const adminThreadMessages = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => passwordShape.extend({ thread_id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await assertPassword(data.password);
    const db = await admin();
    const { data: messages } = await db
      .from("support_messages")
      .select("id,sender,body,created_at")
      .eq("thread_id", data.thread_id)
      .order("created_at", { ascending: true })
      .limit(200);
    return { messages: messages ?? [] };
  });

/** Support desk: agent reply inside the app (no external dialer). */
export const adminReplyThread = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    passwordShape
      .extend({ thread_id: z.string().uuid(), body: z.string().trim().min(1).max(2000) })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await assertPassword(data.password);
    const db = await admin();
    const { error } = await db
      .from("support_messages")
      .insert({ thread_id: data.thread_id, sender: "agent", body: data.body });
    if (error) throw error;
    await db.from("support_threads").update({ status: "active" }).eq("id", data.thread_id);
    return { ok: true as const };
  });
