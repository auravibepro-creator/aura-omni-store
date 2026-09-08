import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, MapPin, Navigation, Package, TrendingUp, Wallet } from "lucide-react";

import { OnboardingDialog } from "@/components/auth/OnboardingDialog";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, primaryRole, useAuth, type AppRole } from "@/lib/auth";
import { readCache, writeCache } from "@/lib/local-cache";
import {
  ORDER_STATUSES,
  captureLocation,
  distanceKm,
  fetchOrders,
  mapsUrl,
  updateOrder,
  type GeoPoint,
  type OrderRow,
  type OrderStatus,
} from "@/lib/orders";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "My dashboard — Aura Omni Store Retail Hub" },
      {
        name: "description",
        content:
          "Track your Aura Omni Store orders, sales commission and delivery routes from one personal dashboard.",
      },
      { property: "og:title", content: "My dashboard — Aura Omni Store" },
      {
        property: "og:description",
        content: "Orders, earnings and delivery routes in one place for customers, sales agents and riders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

type StaffSettings = {
  base_salary: number;
  commission_percent: number;
  monthly_target: number;
};

const DASH_CACHE_KEY = "dashboard";

const money = (value: number, currency = "PKR") =>
  `${currency === "PKR" ? "Rs. " : currency + " "}${Math.round(value).toLocaleString()}`;

function DashboardPage() {
  const navigate = useNavigate();
  const { loading, session, profile, roles, hasRole, refresh } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [staff, setStaff] = useState<StaffSettings | null>(null);
  const [busy, setBusy] = useState(true);
  const [here, setHere] = useState<GeoPoint | null>(null);

  const userId = session?.user.id;

  /** Paint last-known data straight away, then refresh in the background. */
  useEffect(() => {
    if (!userId) return;
    const cached = readCache<{ orders: OrderRow[]; staff: StaffSettings | null }>(
      `${DASH_CACHE_KEY}:${userId}`,
    );
    if (cached) {
      setOrders(cached.orders);
      setStaff(cached.staff);
      setBusy(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void (async () => {
      setBusy((current) => current || orders.length === 0);
      try {
        const filter = hasRole("admin")
          ? {}
          : hasRole("sales")
            ? { salesAgentId: userId }
            : hasRole("delivery")
              ? { deliveryAgentId: userId }
              : { userId };
        const [rows, settings] = await Promise.all([
          fetchOrders(filter),
          supabase.from("staff_settings").select("base_salary,commission_percent,monthly_target").eq("user_id", userId).maybeSingle(),
        ]);
        if (!active) return;
        const nextStaff = (settings.data as StaffSettings | null) ?? null;
        setOrders(rows);
        setStaff(nextStaff);
        writeCache(DASH_CACHE_KEY, { orders: rows, staff: nextStaff });
      } catch (error) {
        if (active && orders.length === 0) {
          toast.error(error instanceof Error ? error.message : "Could not load your dashboard.");
        }
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, roles.join(",")]);

  const totals = useMemo(() => {
    const percent = Number(staff?.commission_percent ?? 0);
    const delivered = orders.filter((order) => order.status === "delivered");
    const sales = delivered.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
    const commission = delivered.reduce((sum, order) => {
      const stored = Number(order.commission_amount ?? 0);
      return sum + (stored > 0 ? stored : (Number(order.total ?? 0) * percent) / 100);
    }, 0);
    const open = orders.filter((order) => order.status !== "delivered" && order.status !== "cancelled");
    const today = new Date().toDateString();
    const doneToday = delivered.filter((order) => new Date(order.created_at).toDateString() === today).length;
    return { sales, commission, pending: open.length, deliveredCount: delivered.length, doneToday };
  }, [orders, staff]);

  /** Riders see the nearest drop-off first once GPS is on. */
  const routeOrders = useMemo(() => {
    const open = orders.filter((order) => order.status !== "delivered" && order.status !== "cancelled");
    const rest = orders.filter((order) => order.status === "delivered" || order.status === "cancelled");
    if (!here) return [...open, ...rest];
    const withDistance = open
      .map((order) => ({
        order,
        km:
          order.latitude != null && order.longitude != null
            ? distanceKm(here, { latitude: Number(order.latitude), longitude: Number(order.longitude) })
            : Number.POSITIVE_INFINITY,
      }))
      .sort((a, b) => a.km - b.km)
      .map((entry) => entry.order);
    return [...withDistance, ...rest];
  }, [orders, here]);


  async function setStatus(order: OrderRow, status: OrderStatus) {
    try {
      await updateOrder(order.id, { status });
      setOrders((prev) => prev.map((row) => (row.id === order.id ? { ...row, status } : row)));
      toast.success(`Order ${order.order_code} marked ${status}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the order.");
    }
  }

  async function locateMe() {
    const point = await captureLocation();
    if (!point) {
      toast.error("Location is off. Turn on GPS to see distances.");
      return;
    }
    setHere(point);
    toast.success("Location updated.");
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const role = primaryRole(roles);
  const isStaff = (["admin", "agent", "sales", "delivery"] as AppRole[]).some((item) => roles.includes(item));

  return (
    <div className="min-h-screen pb-24">
      <ShopHeader title="My dashboard" showBack />

      <OnboardingDialog
        open={Boolean(profile?.must_onboard)}
        username={profile?.username ?? ""}
        defaultName={profile?.full_name ?? ""}
        onDone={refresh}
      />

      <div className="mx-auto w-full max-w-3xl space-y-4 px-3 pt-4">
        <section className="rounded-2xl bg-card p-4 card-shadow">
          <p className="text-xs text-muted-foreground">Signed in as</p>
          <h1 className="font-display text-lg font-bold">
            {profile?.full_name?.trim() || session.user.email}
          </h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(roles.length ? roles : (["user"] as AppRole[])).map((item) => (
              <span
                key={item}
                className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground"
              >
                {ROLE_LABELS[item]}
              </span>
            ))}
          </div>
          {hasRole("admin") ? (
            <Link to="/admin" className="mt-3 inline-block">
              <Button size="sm">Open admin control centre</Button>
            </Link>
          ) : null}
        </section>

        {isStaff ? (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={<Package className="h-4 w-4" />} label="Active orders" value={String(totals.pending)} />
            <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Delivered" value={`${totals.deliveredCount} (${totals.doneToday} today)`} />
            <StatCard icon={<Wallet className="h-4 w-4" />} label="Sales value" value={money(totals.sales)} />
            <StatCard
              icon={<Wallet className="h-4 w-4" />}
              label="Commission"
              value={money(totals.commission)}
            />
          </section>
        ) : null}

        {isStaff && staff ? (
          <section className="rounded-2xl bg-card p-4 card-shadow">
            <h2 className="font-display text-sm font-bold">My pay setup</h2>
            <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">Base salary</p>
                <p className="font-semibold">{money(Number(staff.base_salary))}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Commission</p>
                <p className="font-semibold">{Number(staff.commission_percent)}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Monthly target</p>
                <p className="font-semibold">{money(Number(staff.monthly_target))}</p>
              </div>
            </div>
            {Number(staff.monthly_target) > 0 ? (
              <div className="mt-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(100, (totals.sales / Number(staff.monthly_target)) * 100).toFixed(1)}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {money(totals.sales)} of {money(Number(staff.monthly_target))} target reached
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        {hasRole("delivery") ? (
          <div className="flex items-center justify-between rounded-2xl bg-card p-3 card-shadow">
            <p className="text-xs text-muted-foreground">
              {here
                ? `Distances shown from your live position.`
                : `Turn on location to see how far each drop-off is.`}
            </p>
            <Button size="sm" variant="secondary" onClick={locateMe}>
              <Navigation className="mr-1 h-3.5 w-3.5" /> Locate me
            </Button>
          </div>
        ) : null}

        <section className="space-y-3">
          <h2 className="font-display text-sm font-bold">
            {role === "user" ? "My orders" : "Assigned orders"}
          </h2>

          {busy ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <p className="rounded-2xl bg-card p-6 text-center text-xs text-muted-foreground card-shadow">
              Nothing here yet.{" "}
              <Link to="/" className="font-semibold text-primary">
                Start shopping
              </Link>
              .
            </p>
          ) : (
            routeOrders.map((order, index) => {
              const km =
                here && order.latitude != null && order.longitude != null
                  ? distanceKm(here, { latitude: Number(order.latitude), longitude: Number(order.longitude) })
                  : null;
              return (
                <article key={order.id} className="rounded-2xl bg-card p-4 card-shadow">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-sm font-bold">{order.order_code}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(order.created_at).toLocaleString()} · {order.payment_method.toUpperCase()}
                      </p>
                    </div>
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold capitalize text-secondary-foreground">
                      {order.status}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {order.customer_name} · {order.customer_phone}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.address}
                    {order.city ? `, ${order.city}` : ""}
                  </p>

                  <ul className="mt-2 space-y-1 text-xs">
                    {(order.order_items ?? []).map((item) => (
                      <li key={item.id} className="flex justify-between gap-3">
                        <span className="truncate">
                          {item.name}
                          {item.variant ? ` · ${item.variant}` : ""} × {item.quantity}
                        </span>
                        <span className="font-semibold">{money(Number(item.line_total), order.currency)}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-2 flex items-center justify-between text-sm font-bold">
                    <span>Total</span>
                    <span>{money(Number(order.total), order.currency)}</span>
                  </div>

                  {isStaff ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <a
                        href={mapsUrl(order)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-[11px] font-semibold text-secondary-foreground"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        Stop {index + 1}{km != null ? ` · ${km.toFixed(1)} km` : ""}
                      </a>
                      {ORDER_STATUSES.filter((status) => status !== order.status).map((status) => (
                        <button
                          key={status}
                          onClick={() => setStatus(order, status)}
                          className="rounded-full border border-input px-3 py-1.5 text-[11px] font-semibold capitalize transition-colors hover:bg-accent"
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-3 card-shadow">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <p className="mt-1 font-display text-base font-bold">{value}</p>
    </div>
  );
}
