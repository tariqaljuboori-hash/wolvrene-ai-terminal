import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type AIContext = {
  [key: string]: unknown;
};

type ResponseContent = { text?: string };
type ResponseOutputItem = { content?: ResponseContent[] };
type OpenAIResponsesPayload = {
  output_text?: string;
  output?: ResponseOutputItem[];
  error?: { message?: string };
};

function trimJson(value: unknown, max = 12000) {
  const text = JSON.stringify(value, null, 2);
  return text.length > max ? text.slice(0, max) + "\n...TRIMMED" : text;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY is missing. Create .env.local with OPENAI_API_KEY=your_key_here and restart npm run dev.",
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const question = String(body?.question || "").trim();
    const payload = (body?.payload || {}) as AIContext;
    const prompt = String(body?.prompt || "").trim();
    const mode = String(body?.mode || "Trader");
    const messages = Array.isArray(body?.messages) ? body.messages.slice(-8) : [];

    if (!question) {
      return NextResponse.json({ error: "Question is required." }, { status: 400 });
    }

    const systemPrompt = `
You are WOLVRENE Institutional Desk.
Use only provided sanitized UnifiedWolvreneBrain payload.
No invented entries, SL, TP, confidence, direction, or strategy.
Never promise profit. Never use hype.
Return JSON-like object with keys:
summary, reasoning, decision, nextAction, warnings, invalidation, confidenceNote.
`;

    const userPrompt = `
USER QUESTION:
${question}

EXPLANATION MODE:
${mode}

SANITIZED BRAIN PAYLOAD:
${trimJson(payload)}

PRE-BUILT PROMPT:
${prompt || "N/A"}

RECENT CHAT HISTORY:
${trimJson(messages, 5000)}
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
        instructions: systemPrompt,
        input: userPrompt,
        max_output_tokens: 800,
      }),
    });

    const data = (await response.json()) as OpenAIResponsesPayload;

    if (!response.ok) {
      const message = data?.error?.message || "OpenAI request failed.";
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const answer =
      data?.output_text ||
      data?.output?.flatMap((item) => item?.content || [])
        ?.map((content) => content?.text || "")
        ?.join("\n")
        ?.trim() ||
      "No AI answer returned.";

    return NextResponse.json({ answer });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI route crashed." },
      { status: 500 }
    );
  }
}
