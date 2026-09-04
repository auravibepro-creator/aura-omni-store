import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const threadShape = z.object({
  channel: z.enum(["chat", "call"]),
  customer_name: z.string().trim().max(80).default(""),
  customer_phone: z.string().trim().max(30).default(""),
  message: z.string().trim().max(2000).default(""),
});

/**
 * Public support intake. Assigns the request to the least-loaded online agent
 * (round-robin) so incoming calls and chats spread across the support desk.
 */
export const supportCreateThread = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => threadShape.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: agents } = await supabaseAdmin
      .from("support_agents")
      .select("id,name,phone,capacity,active_load,channels,is_online")
      .eq("is_online", true)
      .order("active_load", { ascending: true })
      .order("sort_order", { ascending: true });

    const pool = (agents ?? []).filter(
      (agent) =>
        (agent.channels as string[]).includes(data.channel) &&
        Number(agent.active_load) < Number(agent.capacity),
    );
    const agent = pool[0] ?? (agents ?? [])[0] ?? null;

    const { data: thread, error } = await supabaseAdmin
      .from("support_threads")
      .insert({
        channel: data.channel,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        message: data.message,
        agent_id: agent?.id ?? null,
        status: agent ? "assigned" : "queued",
      })
      .select("id,status")
      .single();
    if (error) throw new Error(error.message);

    if (agent) {
      await supabaseAdmin
        .from("support_agents")
        .update({ active_load: Number(agent.active_load) + 1 })
        .eq("id", agent.id);
    }

    return {
      id: (thread as { id: string }).id,
      agent: agent ? { name: agent.name as string, phone: (agent.phone as string) ?? "" } : null,
    };
  });

const chatShape = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
});

/** Storefront AI assistant (text). Answers shopping questions in short replies. */
export const supportAiChat = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => chatShape.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI assistant is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are the Aura Vibe shop assistant for a Pakistani beauty and personal care store. Answer in 2-3 short sentences. Help with products, prices in PKR, delivery, cash on delivery, JazzCash/EasyPaisa/bank payment and order status. If you do not know, offer to connect a human support agent.",
          },
          ...data.messages,
        ],
      }),
    });

    if (response.status === 429) throw new Error("Assistant is busy, please retry in a moment");
    if (response.status === 402) throw new Error("AI credits exhausted");
    if (!response.ok) throw new Error("Assistant is unavailable right now");

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { reply: json.choices?.[0]?.message?.content ?? "Sorry, I could not answer that." };
  });
