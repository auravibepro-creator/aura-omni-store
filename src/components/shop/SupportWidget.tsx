import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bot, PhoneCall, Send, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchSocial } from "@/lib/branding";
import { supportAiChat, supportCreateThread } from "@/lib/support.functions";

type Msg = { role: "user" | "assistant"; content: string };

/** Floating AI assistant + one-tap in-app call request routed to a support agent. */
export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! Ask me about products, delivery or payments." },
  ]);
  const { data: social } = useQuery({
    queryKey: ["social"],
    queryFn: fetchSocial,
    staleTime: 5 * 60_000,
    enabled: open,
  });

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await supportAiChat({ data: { messages: next.slice(-10) } });
      setMessages([...next, { role: "assistant", content: res.reply }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Assistant unavailable");
    } finally {
      setBusy(false);
    }
  }

  async function requestCall() {
    setBusy(true);
    try {
      const res = await supportCreateThread({
        data: {
          channel: "call",
          customer_name: "",
          customer_phone: "",
          message: messages.filter((m) => m.role === "user").slice(-1)[0]?.content ?? "Call request",
        },
      });
      const phone = res.agent?.phone || social?.support_phone;
      toast.success(res.agent ? `Connecting you to ${res.agent.name}` : "You're in the queue");
      if (phone) window.location.href = `tel:+${phone.replace(/\D/g, "")}`;
    } catch {
      toast.error("Could not reach support");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open support assistant"
        className="fixed right-3 bottom-20 z-40 flex size-12 items-center justify-center rounded-full brand-gradient text-primary-foreground shadow-lg"
      >
        <Bot className="size-5" />
      </button>
    );
  }

  return (
    <div className="fixed right-3 bottom-20 z-40 flex max-h-[70vh] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl bg-card card-shadow">
      <div className="flex items-center gap-2 brand-gradient px-3 py-2 text-primary-foreground">
        <Bot className="size-4" />
        <p className="flex-1 text-xs font-bold">Smart support</p>
        <button type="button" onClick={requestCall} aria-label="Request a call" disabled={busy}>
          <PhoneCall className="size-4" />
        </button>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close support">
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.map((message, index) => (
          <p
            key={index}
            className={
              message.role === "user"
                ? "ml-auto w-fit max-w-[85%] rounded-xl bg-primary px-2.5 py-1.5 text-[11px] text-primary-foreground"
                : "w-fit max-w-[85%] rounded-xl bg-muted px-2.5 py-1.5 text-[11px]"
            }
          >
            {message.content}
          </p>
        ))}
        {busy ? <p className="text-[11px] text-muted-foreground">Typing…</p> : null}
      </div>

      <div className="flex items-center gap-1.5 border-t border-border p-2">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void send();
          }}
          placeholder="Type your question…"
          maxLength={500}
          className="h-9 text-xs"
        />
        <Button size="icon" className="size-9 shrink-0" disabled={busy} onClick={() => void send()}>
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
