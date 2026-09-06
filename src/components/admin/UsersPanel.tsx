import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { BiometricPanel } from "@/components/admin/BiometricPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { adminCreateStaff, adminUpdateSelf } from "@/lib/accounts.functions";
import { MIN_PASSWORD_LENGTH, normalizeUsername } from "@/lib/account";
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

      <AdminSelfCard password={password} />
      <CreateStaffCard password={password} onCreated={refresh} />

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


/** Admin's own display name and password. */
function AdminSelfCard({ password }: { password: string }) {
  const [fullName, setFullName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <section className="space-y-2 rounded-2xl bg-card p-4 card-shadow">
      <p className="text-sm font-semibold">My admin profile</p>
      <p className="text-[11px] text-muted-foreground">
        Change the CEO display name or set a new password (at least 8 characters). The username
        stays <span className="font-semibold">ceo</span>.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="admin-name">Display name</Label>
          <Input
            id="admin-name"
            value={fullName}
            maxLength={80}
            placeholder="CEO Aura Vibe"
            onChange={(event) => setFullName(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="admin-pass">New password</Label>
          <Input
            id="admin-pass"
            type="password"
            value={newPassword}
            placeholder="At least 8 characters"
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </div>
      </div>
      <Button
        size="sm"
        disabled={busy || (!fullName.trim() && !newPassword)}
        onClick={async () => {
          if (newPassword && newPassword.length < MIN_PASSWORD_LENGTH) {
            toast.error("Use at least 8 characters for the password.");
            return;
          }
          setBusy(true);
          try {
            await adminUpdateSelf({
              data: {
                password,
                ...(fullName.trim() ? { full_name: fullName.trim() } : {}),
                ...(newPassword ? { new_password: newPassword } : {}),
              },
            });
            toast.success(
              newPassword ? "Saved — use the new password from now on." : "Name updated.",
            );
            setNewPassword("");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not save");
          } finally {
            setBusy(false);
          }
        }}
      >
        Save my details
      </Button>
    </section>
  );
}

/** Create a staff login with a temporary password. */
function CreateStaffCard({
  password,
  onCreated,
}: {
  password: string;
  onCreated: () => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    username: "",
    full_name: "",
    designation: "",
    role: "sales" as AppRole,
    temp_password: "",
  });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ username: string; temp: string } | null>(null);

  return (
    <section className="space-y-2 rounded-2xl bg-card p-4 card-shadow">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <ShieldCheck className="size-4" /> New staff account
      </p>
      <p className="text-[11px] text-muted-foreground">
        Give them a username and a temporary password. On their first sign-in they must complete
        their details, set a permanent password and turn on fingerprint / face unlock.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="new-username">Username</Label>
          <Input
            id="new-username"
            value={form.username}
            maxLength={32}
            placeholder="e.g. rider.ali"
            onChange={(event) => setForm({ ...form, username: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-name">Name</Label>
          <Input
            id="new-name"
            value={form.full_name}
            maxLength={80}
            placeholder="Full name"
            onChange={(event) => setForm({ ...form, full_name: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-designation">Designation</Label>
          <Input
            id="new-designation"
            value={form.designation}
            maxLength={80}
            placeholder="e.g. Delivery rider"
            onChange={(event) => setForm({ ...form, designation: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-role">Role</Label>
          <select
            id="new-role"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value as AppRole })}
          >
            {MANAGED_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="new-temp">Temporary password</Label>
          <div className="flex gap-2">
            <Input
              id="new-temp"
              value={form.temp_password}
              placeholder="At least 8 characters"
              onChange={(event) => setForm({ ...form, temp_password: event.target.value })}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setForm({
                  ...form,
                  temp_password: `Aura${Math.floor(1000 + Math.random() * 8999)}${Math.floor(
                    10 + Math.random() * 89,
                  )}`,
                })
              }
            >
              Generate
            </Button>
          </div>
        </div>
      </div>

      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          if (form.temp_password.length < MIN_PASSWORD_LENGTH) {
            toast.error("The temporary password needs at least 8 characters.");
            return;
          }
          setBusy(true);
          try {
            const result = await adminCreateStaff({
              data: {
                password,
                username: normalizeUsername(form.username),
                full_name: form.full_name.trim(),
                designation: form.designation.trim(),
                role: form.role,
                temp_password: form.temp_password,
              },
            });
            setCreated({ username: result.username, temp: form.temp_password });
            toast.success("Staff account created");
            setForm({
              username: "",
              full_name: "",
              designation: "",
              role: "sales",
              temp_password: "",
            });
            await onCreated();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not create the account");
          } finally {
            setBusy(false);
          }
        }}
      >
        Create account
      </Button>

      {created ? (
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-[11px]">
          Share these once: username <span className="font-semibold">{created.username}</span>,
          temporary password <span className="font-semibold">{created.temp}</span>.
        </p>
      ) : null}
    </section>
  );
}
