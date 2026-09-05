import { useCallback, useEffect, useState } from "react";
import { Headphones, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  adminCloseThread,
  adminDeleteAgent,
  adminListSupport,
  adminSaveAgent,
} from "@/lib/admin.functions";
import { adminReplyThread, adminThreadMessages } from "@/lib/staff.functions";

type AgentRow = {
  id: string;
  name: string;
  phone: string | null;
  channels: string[];
  is_online: boolean;
  capacity: number;
  active_load: number;
  sort_order: number;
};

type ThreadRow = {
  id: string;
  channel: string;
  customer_name: string;
  customer_phone: string;
  message: string;
  agent_id: string | null;
  status: string;
  created_at: string;
};

const empty = { name: "", phone: "", capacity: 5, is_online: true, sort_order: 0 };

export function SupportPanel({ password }: { password: string }) {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [form, setForm] = useState<typeof empty & { id?: string }>(empty);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await adminListSupport({ data: { password } });
      setAgents(data.agents as unknown as AgentRow[]);
      setThreads(data.threads as unknown as ThreadRow[]);
    } catch {
      /* ignore */
    }
  }, [password]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save() {
    setBusy(true);
    try {
      await adminSaveAgent({
        data: {
          password,
          agent: {
            ...(form.id ? { id: form.id } : {}),
            name: form.name,
            phone: form.phone || null,
            channels: ["chat", "call"],
            is_online: form.is_online,
            capacity: form.capacity,
            sort_order: form.sort_order,
          },
        },
      });
      toast.success("Agent saved");
      setForm(empty);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const queued = threads.filter((thread) => thread.status !== "closed");

  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-card p-4 card-shadow">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Headphones className="size-4" /> Smart support desk
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Calls and chats are shared between online agents automatically (round-robin, least busy
          first). Add or pause agents any time to scale the desk.
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
          <Stat label="Agents" value={String(agents.length)} />
          <Stat label="Online" value={String(agents.filter((a) => a.is_online).length)} />
          <Stat label="Open" value={String(queued.length)} />
        </div>
      </section>

      <section className="space-y-2 rounded-2xl bg-card p-4 card-shadow">
        <p className="text-sm font-semibold">{form.id ? "Edit agent" : "Add support agent"}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Call number</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Concurrent chats/calls</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) || 1 })}
          />
        </div>
        <label className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2 text-xs font-semibold">
          Online and taking requests
          <Switch
            checked={form.is_online}
            onCheckedChange={(checked) => setForm({ ...form, is_online: checked })}
          />
        </label>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={save}>
            {form.id ? "Update agent" : "Add agent"}
          </Button>
          {form.id ? (
            <Button variant="outline" onClick={() => setForm(empty)}>
              Cancel
            </Button>
          ) : null}
        </div>
      </section>

      <section className="space-y-2 rounded-2xl bg-card p-4 card-shadow">
        <p className="text-sm font-semibold">Agents ({agents.length})</p>
        {agents.map((agent) => (
          <div key={agent.id} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs">
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left"
              onClick={() =>
                setForm({
                  id: agent.id,
                  name: agent.name,
                  phone: agent.phone ?? "",
                  capacity: agent.capacity,
                  is_online: agent.is_online,
                  sort_order: agent.sort_order,
                })
              }
            >
              <span className="font-semibold">{agent.name}</span>
              <span className="block text-[10px] text-muted-foreground">
                {agent.is_online ? "Online" : "Paused"} · load {agent.active_load}/{agent.capacity}
              </span>
            </button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Remove agent"
              onClick={async () => {
                await adminDeleteAgent({ data: { password, id: agent.id } });
                await refresh();
              }}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </section>

      <section className="space-y-2 rounded-2xl bg-card p-4 card-shadow">
        <p className="text-sm font-semibold">Live queue ({queued.length})</p>
        {queued.length === 0 ? (
          <p className="text-xs text-muted-foreground">No open conversations.</p>
        ) : null}
        {queued.map((thread) => (
          <ThreadCard
            key={thread.id}
            password={password}
            thread={thread}
            agentName={agents.find((a) => a.id === thread.agent_id)?.name ?? "Unassigned"}
            onClosed={refresh}
          />
        ))}
      </section>
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

type ThreadMessage = { id: string; sender: string; body: string; created_at: string };

/** One live conversation: agent replies in-app, no external dialer needed. */
function ThreadCard({
  password,
  thread,
  agentName,
  onClosed,
}: {
  password: string;
  thread: ThreadRow;
  agentName: string;
  onClosed: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await adminThreadMessages({ data: { password, thread_id: thread.id } });
    setMessages(data.messages as ThreadMessage[]);
  }, [password, thread.id]);

  useEffect(() => {
    if (!open) return;
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [open, load]);

  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2 text-xs">
      <button type="button" className="w-full text-left" onClick={() => setOpen(!open)}>
        <p className="font-semibold">
          {thread.channel === "call" ? "📞 Call" : "💬 Chat"} · {agentName}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{thread.message || "New request"}</p>
      </button>

      {open ? (
        <div className="mt-2 space-y-2">
          <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg bg-background p-2">
            {messages.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No messages yet.</p>
            ) : null}
            {messages.map((message) => (
              <p
                key={message.id}
                className={
                  message.sender === "agent"
                    ? "ml-auto w-fit max-w-[85%] rounded-lg bg-primary px-2 py-1 text-[11px] text-primary-foreground"
                    : "w-fit max-w-[85%] rounded-lg bg-muted px-2 py-1 text-[11px]"
                }
              >
                {message.body}
              </p>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Input
              className="h-8 text-xs"
              value={reply}
              maxLength={2000}
              placeholder="Reply to customer…"
              onChange={(event) => setReply(event.target.value)}
            />
            <Button
              size="sm"
              className="h-8"
              disabled={busy || !reply.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await adminReplyThread({ data: { password, thread_id: thread.id, body: reply.trim() } });
                  setReply("");
                  await load();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not send");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Send
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={async () => {
              await adminCloseThread({ data: { password, id: thread.id } });
              await onClosed();
            }}
          >
            Mark handled
          </Button>
        </div>
      ) : null}
    </div>
  );
}
