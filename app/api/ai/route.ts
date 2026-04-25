import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type AIContext = {
  symbol?: string;
  timeframe?: string;
  livePrice?: number | null;
  session?: string;
  sessionCountdown?: string;
  bias?: string;
  wolfMode?: string;
  confidence?: number;
  marketStats?: Record<string, string>;
  selectedOrder?: any;
  openOrders?: any[];
  activeAlerts?: any[];
  lastCandle?: any;
  platformMode?: string;
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
    const context = (body?.context || {}) as AIContext;
    const history = Array.isArray(body?.history) ? body.history.slice(-8) : [];

    if (!question) {
      return NextResponse.json({ error: "Question is required." }, { status: 400 });
    }

    const systemPrompt = `
You are WOLVRENE AI, a professional trading-analysis assistant embedded inside the user's private trading dashboard.
You must analyze ONLY the provided live dashboard context. Do not pretend you can see anything not supplied.
You are not a financial advisor. Keep responses educational and risk-focused.
Style: direct, sharp, professional, Wolvrene tone. No hype, no guaranteed profits.

Decision rules:
- Always mention timeframe, session, bias, and current mark if provided.
- If context is weak or missing, say what is missing and suggest waiting.
- Never force a trade.
- Prefer structured response: Read, Risk, Plan, Invalidation, Next action.
- For open positions, focus on risk management: SL, TP, partials, breakeven, invalidation.
- Avoid overlong answers unless asked.
`;

    const userPrompt = `
USER QUESTION:
${question}

LIVE DASHBOARD CONTEXT:
${trimJson(context)}

RECENT AI CHAT HISTORY:
${trimJson(history, 5000)}
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

    const data = await response.json();

    if (!response.ok) {
      const message = data?.error?.message || "OpenAI request failed.";
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const answer =
      data?.output_text ||
      data?.output?.flatMap((item: any) => item?.content || [])
        ?.map((content: any) => content?.text || "")
        ?.join("\n")
        ?.trim() ||
      "No AI answer returned.";

    return NextResponse.json({ answer });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "AI route crashed." },
      { status: 500 }
    );
  }
}
