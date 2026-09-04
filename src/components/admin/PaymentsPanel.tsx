import { useCallback, useEffect, useState } from "react";
import { Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { adminDeleteAccount, adminListWallets, adminSaveAccount } from "@/lib/admin.functions";
import { providerLabel, type PaymentAccount } from "@/lib/payments";
import { formatPKR } from "@/lib/shop";

type LedgerRow = { id: string; account_id: string | null; amount: number; note: string; created_at: string };
type OrderRow = { id: string; order_code: string; total: number; payment_method: string; status: string };

const empty = {
  provider: "jazzcash" as "jazzcash" | "easypaisa" | "bank",
  account_title: "",
  account_number: "",
  bank_name: "",
  instructions: "",
  is_active: true,
  sort_order: 0,
};

export function PaymentsPanel({ password }: { password: string }) {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [form, setForm] = useState<typeof empty & { id?: string }>(empty);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await adminListWallets({ data: { password } });
      setAccounts(data.accounts as unknown as PaymentAccount[]);
      setLedger(data.ledger as unknown as LedgerRow[]);
      setOrders(data.orders as unknown as OrderRow[]);
    } catch {
      /* ignore */
    }
  }, [password]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totals = accounts.map((account) => ({
    account,
    received: ledger
      .filter((row) => row.account_id === account.id)
      .reduce((sum, row) => sum + Number(row.amount), 0),
  }));
  const salesTotal = orders
    .filter((order) => order.status !== "cancelled")
    .reduce((sum, order) => sum + Number(order.total), 0);

  async function save() {
    setBusy(true);
    try {
      await adminSaveAccount({
        data: {
          password,
          account: {
            ...(form.id ? { id: form.id } : {}),
            provider: form.provider,
            account_title: form.account_title,
            account_number: form.account_number,
            bank_name: form.bank_name || null,
            instructions: form.instructions,
            is_active: form.is_active,
            sort_order: form.sort_order,
          },
        },
      });
      toast.success("Account saved");
      setForm(empty);
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
          <Wallet className="size-4" /> Aggregated sales ledger
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <Stat label="Orders" value={String(orders.length)} />
          <Stat label="Gross sales" value={formatPKR(salesTotal)} />
        </div>
        <ul className="mt-3 space-y-1.5 text-xs">
          {totals.map(({ account, received }) => (
            <li key={account.id} className="flex justify-between rounded-xl bg-muted/50 px-3 py-2">
              <span className="min-w-0 truncate">
                {providerLabel(account.provider)} · {account.account_number}
                <span className="block text-[10px] text-muted-foreground">
                  used {account.use_count}×
                </span>
              </span>
              <span className="font-bold">{formatPKR(received)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 rounded-2xl bg-card p-4 card-shadow">
        <p className="text-sm font-semibold">
          {form.id ? "Edit payment account" : "Add payment account"}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Provider</Label>
            <select
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value as typeof form.provider })}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="jazzcash">JazzCash</option>
              <option value="easypaisa">EasyPaisa</option>
              <option value="bank">Bank</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Account title</Label>
            <Input
              value={form.account_title}
              onChange={(e) => setForm({ ...form, account_title: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Account / IBAN number</Label>
            <Input
              value={form.account_number}
              onChange={(e) => setForm({ ...form, account_number: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Bank name (optional)</Label>
            <Input
              value={form.bank_name}
              onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
            />
          </div>
        </div>
        <label className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2 text-xs font-semibold">
          Active in rotation
          <Switch
            checked={form.is_active}
            onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
          />
        </label>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={save}>
            {form.id ? "Update" : "Add account"}
          </Button>
          {form.id ? (
            <Button variant="outline" onClick={() => setForm(empty)}>
              Cancel
            </Button>
          ) : null}
        </div>
      </section>

      <section className="space-y-2 rounded-2xl bg-card p-4 card-shadow">
        <p className="text-sm font-semibold">Accounts ({accounts.length})</p>
        {accounts.map((account) => (
          <div key={account.id} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs">
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left"
              onClick={() =>
                setForm({
                  id: account.id,
                  provider: account.provider as typeof empty.provider,
                  account_title: account.account_title,
                  account_number: account.account_number,
                  bank_name: account.bank_name ?? "",
                  instructions: account.instructions,
                  is_active: account.is_active,
                  sort_order: account.sort_order,
                })
              }
            >
              <span className="font-semibold">{providerLabel(account.provider)}</span> ·{" "}
              {account.account_title}
              <span className="block text-[10px] text-muted-foreground">{account.account_number}</span>
            </button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Delete account"
              onClick={async () => {
                await adminDeleteAccount({ data: { password, id: account.id } });
                await refresh();
              }}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}
