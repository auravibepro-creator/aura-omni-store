import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { BiometricPanel } from "@/components/admin/BiometricPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  adminAssignOrder,
  adminListStaff,
  adminSaveStaffSettings,
  adminSetRole,
  type AssignOrderRow,
} from "@/lib/staff.functions";
import { ROLE_LABELS, type AppRole } from "@/lib/auth";

type Person = {
  id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  roles: string[];
  base_salary: number;
  commission_percent: number;
  monthly_target: number;
  is_active: boolean;
  sales_count: number;
  delivered_count: number;
  delivery_count: number;
  sales_value: number;
  earned_commission: number;
};

const money = (value: number) => `Rs. ${Math.round(value).toLocaleString()}`;
const MANAGED_ROLES: AppRole[] = ["admin", "agent", "sales", "delivery"];

/** Staff accounts, roles, pay setup, order assignment and device security. */
export function UsersPanel({ password }: { password: string }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [orders, setOrders] = useState<AssignOrderRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await adminListStaff({ data: { password } });
      setPeople(data.people as Person[]);
      setOrders(data.orders as AssignOrderRow[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load staff");
    }
  }, [password]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const salesAgents = useMemo(() => people.filter((p) => p.roles.includes("sales")), [people]);
  const riders = useMemo(() => people.filter((p) => p.roles.includes("delivery")), [people]);
  const openOrders = useMemo(
    () => orders.filter((order) => order.status !== "delivered" && order.status !== "cancelled").slice(0, 25),
    [orders],
  );

  async function toggleRole(person: Person, role: AppRole, enabled: boolean) {
    setBusy(true);
    try {
      await adminSetRole({ data: { password, user_id: person.id, role, enabled } });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update role");
    } finally {
      setBusy(false);
    }
  }

  async function savePay(person: Person, patch: Partial<Person>) {
    setBusy(true);
    try {
      await adminSaveStaffSettings({
        data: {
          password,
          user_id: person.id,
          base_salary: Number(patch.base_salary ?? person.base_salary),
          commission_percent: Number(patch.commission_percent ?? person.commission_percent),
          monthly_target: Number(patch.monthly_target ?? person.monthly_target),
          is_active: patch.is_active ?? person.is_active,
        },
      });
      toast.success("Pay setup saved");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-card p-4 card-shadow">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Users className="size-4" /> Users &amp; security
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Give staff their roles, set salary and commission, hand orders to sales agents and riders,
          and manage fingerprint sign-in for this device.
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Stat label="Accounts" value={String(people.length)} />
          <Stat label="Sales agents" value={String(salesAgents.length)} />
          <Stat label="Riders" value={String(riders.length)} />
        </div>
      </section>

      <section className="space-y-2 rounded-2xl bg-card p-4 card-shadow">
        <p className="text-sm font-semibold">Staff accounts</p>
        {people.length === 0 ? (
          <p className="text-xs text-muted-foreground">No accounts yet.</p>
        ) : null}
        {people.map((person) => (
          <div key={person.id} className="rounded-xl bg-muted/50 p-3 text-xs">
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setOpenId(openId === person.id ? null : person.id)}
            >
              <p className="truncate font-semibold">{person.full_name || person.email || "Unnamed"}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {person.email ?? ""}
                {person.roles.length
                  ? ` · ${person.roles.map((role) => ROLE_LABELS[role as AppRole] ?? role).join(", ")}`
                  : " · Customer"}
              </p>
            </button>

            {openId === person.id ? (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {MANAGED_ROLES.map((role) => {
                    const on = person.roles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        disabled={busy}
                        onClick={() => void toggleRole(person, role, !on)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          on
                            ? "bg-primary text-primary-foreground"
                            : "border border-input bg-background text-muted-foreground"
                        }`}
                      >
                        {ROLE_LABELS[role]}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <PayField
                    label="Base salary"
                    value={person.base_salary}
                    onCommit={(value) => void savePay(person, { base_salary: value })}
                  />
                  <PayField
                    label="Commission %"
                    value={person.commission_percent}
                    onCommit={(value) => void savePay(person, { commission_percent: value })}
                  />
                  <PayField
                    label="Monthly target"
                    value={person.monthly_target}
                    onCommit={(value) => void savePay(person, { monthly_target: value })}
                  />
                </div>

                <label className="flex items-center justify-between rounded-xl bg-background px-3 py-2 text-[11px] font-semibold">
                  Active staff member
                  <Switch
                    checked={person.is_active}
                    onCheckedChange={(checked) => void savePay(person, { is_active: checked })}
                  />
                </label>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Sales orders" value={String(person.sales_count)} />
                  <Stat label="Completed" value={String(person.delivered_count)} />
                  <Stat label="Earned" value={money(person.earned_commission)} />
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </section>

      <section className="space-y-2 rounded-2xl bg-card p-4 card-shadow">
        <p className="text-sm font-semibold">Assign live orders ({openOrders.length})</p>
        {openOrders.length === 0 ? (
          <p className="text-xs text-muted-foreground">No open orders right now.</p>
        ) : null}
        {openOrders.map((order) => (
          <div key={order.id} className="rounded-xl bg-muted/50 p-3 text-xs">
            <p className="font-semibold">
              {order.order_code} · {money(Number(order.total))}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {order.customer_name} · {order.city ?? order.address} · {order.status}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <AssignSelect
                label="Sales agent"
                people={salesAgents}
                value={order.sales_agent_id}
                onChange={async (value) => {
                  await adminAssignOrder({
                    data: {
                      password,
                      order_id: order.id,
                      sales_agent_id: value,
                      delivery_agent_id: order.delivery_agent_id,
                    },
                  });
                  toast.success("Order assigned");
                  await refresh();
                }}
              />
              <AssignSelect
                label="Rider"
                people={riders}
                value={order.delivery_agent_id}
                onChange={async (value) => {
                  await adminAssignOrder({
                    data: {
                      password,
                      order_id: order.id,
                      sales_agent_id: order.sales_agent_id,
                      delivery_agent_id: value,
                    },
                  });
                  toast.success("Rider assigned");
                  await refresh();
                }}
              />
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-card p-4 card-shadow">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <ShieldCheck className="size-4" /> Device security
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Fingerprint / quick sign-in for the admin dashboard lives here.
        </p>
      </section>
      <BiometricPanel password={password} />
    </div>
  );
}

function PayField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={0}
        className="h-8 text-xs"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = Number(draft) || 0;
          if (next !== value) onCommit(next);
        }}
      />
    </div>
  );
}

function AssignSelect({
  label,
  people,
  value,
  onChange,
}: {
  label: string;
  people: Person[];
  value: string | null;
  onChange: (value: string | null) => Promise<void>;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <select
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
        value={value ?? ""}
        onChange={(event) => void onChange(event.target.value || null)}
      >
        <option value="">Unassigned</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.full_name || person.email}
          </option>
        ))}
      </select>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-2 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

export { Button };
