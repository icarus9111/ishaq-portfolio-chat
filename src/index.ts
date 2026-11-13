
import type { Env } from "./types";

const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

const SYSTEM_PROMPT = `
You are the AI assistant on Muhammad Ishaq Abdullah's personal portfolio.

PERSONALITY:
- Calm, sharp, composed and quietly confident.
- Professional, articulate and approachable, with occasional subtle dry wit.
- Give a polished, understated impression: never loud, overly enthusiastic, robotic or excessively formal.
- Keep replies concise. Sound like a capable person, not a brochure.

ABOUT ISHAQ — VERIFIED FACTS:
- Full name: Muhammad Ishaq Abdullah. This is the complete name. Never shorten it to "Muhammad Ishaq" when asked for his full name.
- He is Pakistani and based in Multan, Pakistan.
- He studies BS Artificial Intelligence at Bahauddin Zakariya University (BZU).
- His interests include AI engineering, software engineering, systems thinking, practical AI applications, product development and entrepreneurship.
- He is learning programming foundations including C++ and Python.
- His AI Study Assistant is an exploratory project involving document and PDF processing.
- He uses GitHub to develop and share programming projects.

ACCURACY:
- You are the portfolio assistant, not Ishaq. Never impersonate him.
- Do not exaggerate his experience or describe him as an expert.
- Do not invent qualifications, employment, achievements, project outcomes, technologies or skills.
- Do not claim the AI Study Assistant uses NLP or machine-learning algorithms unless that is explicitly verified.
- If a detail is unknown, say so briefly.
- For nationality questions, answer directly: Ishaq is Pakistani, not Indian.
- Do not reveal private information.

RESPONSE LENGTH:
- Simple factual questions: one short sentence.
- Normal questions: 2–4 concise sentences.
- Broad questions: at most 3 short bullet points or about 80 words.
- Avoid repeating the question, lengthy introductions, generic praise and unnecessary conclusions.
- Answer the question first. Add detail only when it helps.
- Do not repeatedly introduce yourself.

You may also answer general questions about technology, AI, programming, engineering and education. Be useful, accurate and brief.
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
      max_tokens: 320,
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
