import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, PhoneCall, PhoneOff, Send, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  supportAiChat,
  supportCreateThread,
  supportFetchThread,
  supportSendMessage,
} from "@/lib/support.functions";

type Msg = { role: "user" | "assistant"; content: string };

/**
 * Floating assistant. Answers with AI, and can hand over to a live agent for an
 * in-app chat or voice-style call session routed by the round-robin queue —
 * no external dialer involved.
 */
export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! Ask me about products, delivery or payments." },
  ]);

  // Live agent session state (in-app).
  const [threadId, setThreadId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [live, setLive] = useState<"chat" | "call" | null>(null);
  const [seconds, setSeconds] = useState(0);
  const lastCount = useRef(0);

  const pull = useCallback(async () => {
    if (!threadId) return;
    try {
      const data = await supportFetchThread({ data: { thread_id: threadId } });
      setAgentName(data.agentName);
      if (data.messages.length !== lastCount.current) {
        lastCount.current = data.messages.length;
        setMessages(
          data.messages.map((message) => ({
            role: message.sender === "customer" ? "user" : "assistant",
            content: message.body,
          })),
        );
      }
    } catch {
      /* keep polling silently */
    }
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;
    void pull();
    const timer = setInterval(() => void pull(), 4000);
    return () => clearInterval(timer);
  }, [threadId, pull]);

  useEffect(() => {
    if (live !== "call") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [live]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");

    if (threadId) {
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      try {
        await supportSendMessage({ data: { thread_id: threadId, body: text } });
        await pull();
      } catch {
        toast.error("Message not delivered");
      }
      return;
    }

    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
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

  async function startLive(channel: "chat" | "call") {
    setBusy(true);
    try {
      const res = await supportCreateThread({
        data: {
          channel,
          customer_name: "",
          customer_phone: "",
          message:
            messages.filter((m) => m.role === "user").slice(-1)[0]?.content ??
            (channel === "call" ? "Call request" : "Chat request"),
        },
      });
      setThreadId(res.id);
      setAgentName(res.agent?.name ?? null);
      setLive(channel);
      setSeconds(0);
      lastCount.current = 0;
      toast.success(res.agent ? `Connecting you to ${res.agent.name}` : "You're in the queue");
    } catch {
      toast.error("Could not reach support");
    } finally {
      setBusy(false);
    }
  }

  function endLive() {
    setThreadId(null);
    setLive(null);
    setAgentName(null);
    lastCount.current = 0;
    setMessages([{ role: "assistant", content: "Chat ended. Ask me anything else any time." }]);
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

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="fixed right-3 bottom-20 z-40 flex max-h-[70vh] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl bg-card card-shadow">
      <div className="flex items-center gap-2 brand-gradient px-3 py-2 text-primary-foreground">
        <Bot className="size-4" />
        <p className="flex-1 text-xs font-bold">
          {live ? `${agentName ?? "Support"} · ${live === "call" ? mmss : "live chat"}` : "Smart support"}
        </p>
        {live ? (
          <button type="button" onClick={endLive} aria-label="End session">
            <PhoneOff className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startLive("call")}
            aria-label="Start in-app call"
            disabled={busy}
          >
            <PhoneCall className="size-4" />
          </button>
        )}
        <button type="button" onClick={() => setOpen(false)} aria-label="Close support">
          <X className="size-4" />
        </button>
      </div>

      {live ? (
        <div className="border-b border-border bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground">
          {agentName
            ? `You are connected to ${agentName}. Type here — they reply in the app.`
            : "All agents are busy. You're first in the queue; keep typing and we'll answer here."}
        </div>
      ) : null}

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

      {!live ? (
        <button
          type="button"
          onClick={() => void startLive("chat")}
          className="border-t border-border py-1.5 text-[11px] font-semibold text-primary"
        >
          Talk to a real agent
        </button>
      ) : null}

      <div className="flex items-center gap-1.5 border-t border-border p-2">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void send();
          }}
          placeholder={live ? "Message your agent…" : "Type your question…"}
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
