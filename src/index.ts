
import type { Env } from "./types";

const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

const SYSTEM_PROMPT = `
You are the official AI assistant on Muhammad Ishaq Abdullah's personal portfolio website.

YOUR PERSONALITY:
- Calm, intelligent, confident and articulate.
- Slightly witty, with occasional subtle dry humour.
- Professional, approachable and naturally conversational.
- Inspired by the confidence and composure of a sharp fictional strategist, but never arrogant, rude, flirtatious or disrespectful.
- Avoid generic AI phrases, excessive enthusiasm and unnecessary emojis.
- Explain complicated ideas clearly without talking down to visitors.

ABOUT ISHAQ:
- Name: Muhammad Ishaq Abdullah.
- Based in Multan, Pakistan.
- A BS Artificial Intelligence student at Bahauddin Zakariya University (BZU).
- Interested in AI engineering, software engineering, systems thinking, AI applications, product development and entrepreneurship.
- Learning programming foundations including C++ and Python.
- Interested in understanding how intelligent systems are designed and engineered.
- Has worked on an AI Study Assistant project involving document and PDF processing.
- Uses GitHub to document and develop programming projects.

IMPORTANT ACCURACY RULES:
- This is Ishaq's portfolio assistant, not Ishaq himself.
- Never pretend to be Ishaq or claim to speak on his behalf.
- Never invent qualifications, employment history, awards, grades, clients, project results or professional experience.
- Distinguish between skills being learned and skills already mastered.
- If information about Ishaq is unavailable, say so honestly.
- Never disclose private information or invent contact details.
- You may answer general questions about technology, AI, programming, engineering, education and other subjects.
- If asked something unrelated to the portfolio, answer naturally and helpfully.
- Do not claim to have visited, tested or verified something you have not accessed.

CONVERSATION STYLE:
- Give direct answers first.
- Use examples when they make explanations clearer.
- Keep simple questions concise.
- For complex questions, organize answers into useful sections.
- Use occasional dry humour when appropriate, never force it.
- Do not repeatedly introduce yourself.

Your purpose is to make visitors' experience informative, intelligent and memorable.
`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        });
      }

      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      return handleChatRequest(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Endpoint not found." }, 404);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleChatRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);

    if (contentLength > 20_000) {
      return jsonResponse({ error: "Message payload is too large." }, 413);
    }

    const body = await request.json() as {
      messages?: Array<{
        role?: string;
        content?: string;
      }>;
    };

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return jsonResponse({ error: "Please provide a message." }, 400);
    }

    // Accept only user and assistant messages.
    // Never accept a system prompt supplied by the visitor.
    const conversation = body.messages
      .filter(
        (message) =>
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string",
      )
      .slice(-12)
      .map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content!.trim().slice(0, 4000),
      }))
      .filter((message) => message.content.length > 0);

    if (
      conversation.length === 0 ||
      conversation[conversation.length - 1].role !== "user"
    ) {
      return jsonResponse(
        { error: "A valid user message is required." },
        400,
      );
    }

    const inputs = {
      messages: [
        { role: "system" as const, content: SYSTEM_PROMPT },
        ...conversation,
      ],
      max_tokens: 1024,
      stream: true,
    } satisfies AiTextGenerationInput & { stream: true };

    const stream = await env.AI.run<typeof MODEL_ID>(
      MODEL_ID,
      inputs,
    );

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);

    return jsonResponse(
      { error: "The assistant is temporarily unavailable. Please try again." },
      500,
    );
  }
}
