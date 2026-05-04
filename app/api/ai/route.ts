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
  selectedOrder?: Record<string, unknown>;
  openOrders?: Record<string, unknown>[];
  activeAlerts?: Record<string, unknown>[];
  lastCandle?: Record<string, unknown>;
  platformMode?: string;
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
    const context = (body?.context || {}) as AIContext;
    const history = Array.isArray(body?.history) ? body.history.slice(-8) : [];
    const aiPayload = (body?.aiPayload || {}) as AIContext;
    const payload = ((aiPayload?.brainContext as AIContext) ||
      body?.payload ||
      {}) as AIContext;

    const intent = String(aiPayload?.intent || body?.intent || "CUSTOM");

    const selectedTradeContext = ((aiPayload?.selectedTradeContext as AIContext) ||
      body?.selectedTradeContext ||
      {}) as AIContext;

    const activeTradeContext = ((aiPayload?.activeTradeContext as AIContext) ||
      body?.activeTradeContext ||
      selectedTradeContext) as AIContext;

    const liveContext = ((aiPayload?.liveContext as AIContext) ||
      body?.liveContext ||
      {}) as AIContext;

    const prompt = String(body?.prompt || "").trim();
    const mode = String(body?.mode || "Trader");
    const explanationMode = String(body?.explanationMode || mode || "Trader");
    const messages = Array.isArray(body?.messages) ? body.messages.slice(-8) : [];
    const signalContext = (body?.signalContext || aiPayload?.signalContext || {}) as AIContext;
    const riskContext = (body?.riskContext || aiPayload?.riskContext || {}) as AIContext;

    const mergedLiveContext = {
      ...liveContext,
      marketStats: liveContext?.marketStats || context?.marketStats || {},
      marketRadar: liveContext?.marketRadar || context?.marketRadar || {},
      chartSnapshot: liveContext?.chartSnapshot || context?.chartSnapshot || {},
      signalFeed: liveContext?.signalFeed || context?.signalFeed || {},
      checklist: liveContext?.checklist || context?.checklist || {},
      sniper: liveContext?.sniper || context?.sniper || {},
      aiPayloadDebug: liveContext?.aiPayloadDebug || context?.aiPayloadDebug || {},
    } as AIContext;

    const radarConfidence =
      Number((mergedLiveContext?.marketRadar as AIContext)?.confidence) ||
      Number(mergedLiveContext?.confidence) ||
      Number((payload as AIContext)?.confidence) ||
      0;
    (mergedLiveContext as AIContext).finalConfidenceUsed = radarConfidence;

    if (process.env.NODE_ENV !== "production") {
      console.log("AI_ROUTE_RECEIVED_CONTEXT", {
        hasLiveContext: Boolean(mergedLiveContext),
        hasChartSnapshot: Boolean((mergedLiveContext as AIContext)?.chartSnapshot),
        candleCount: Number((((mergedLiveContext as AIContext)?.chartSnapshot as AIContext)?.candleCount as number) || 0),
        radarState: ((mergedLiveContext as AIContext)?.marketRadar as AIContext)?.state ?? null,
        radarBias: ((mergedLiveContext as AIContext)?.marketRadar as AIContext)?.bias ?? null,
        radarConfidence,
        hasChecklist: Boolean((mergedLiveContext as AIContext)?.checklist),
        hasSniper: Boolean((mergedLiveContext as AIContext)?.sniper),
        hasActiveTrade: Boolean((activeTradeContext as AIContext)?.side),
        hasSelectedSignal: Boolean(((mergedLiveContext as AIContext)?.signalFeed as AIContext)?.selected),
      });
    }

    if (!question) {
      return NextResponse.json(
        { error: "Question is required." },
        { status: 400 }
      );
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
- Never invent precision that is not in context.
- If confidence/metrics are missing, explicitly say "unknown from provided data".
- Explain decisions in lifecycle terms when possible: Spawn -> Validate -> Execute -> Manage -> Exit/Cancel.
- Prefer structured response: Read, Risk, Plan, Invalidation, Next action.
- For open positions, focus on risk management: SL, TP, partials, breakeven, invalidation.
- Avoid overlong answers unless asked.

You are WOLVRENE Institutional Desk.
Use only provided sanitized UnifiedWolvreneBrain payload.
No invented entries, SL, TP, confidence, direction, or strategy.
Never promise profit. Never use hype.

Return a clear structured answer with:
summary, reasoning, decision, nextAction, warnings, invalidation, confidenceNote.

Answer according to provided intent. Do not use one generic response for all actions.
If intent is MANAGE_TRADE or RISK_CHECK and selected trade context exists, response must be trade-specific.
If intent is BEST_ENTRY and setup is not executable, explain missing confirmations and do not fabricate levels.
If intent is SESSION_OUTLOOK, include session behavior and timing.
AI is explainer-only: do not create or execute signals.
When WOLVRENE Market Radar Intelligence is provided, prioritize it over generic candle assumptions. Do not invent radar values. If radar state is DATA_UNAVAILABLE or radar context is missing, say radar data is unavailable. Explain liquidity, trap, reaction, risk, and confirmation state. Do not promise profits or certainty.
Return sections: Market State, Liquidity, Trap/Reaction, Leverage/Crowding, Risk, Tactical Plan, No-Trade Warning if needed.
- Explicitly distinguish derived/estimated liquidation proxies from official provider heatmaps.
- When paid providers are missing, prioritize core exchange intelligence and say optional providers are not configured.

`;

    const userPrompt = `
USER QUESTION:
${question}

LIVE DASHBOARD CONTEXT:
${trimJson(context)}

EXPLANATION MODE:
${explanationMode}

RECENT AI CHAT HISTORY:
${trimJson(history, 5000)}

INTENT:
${intent}

SANITIZED BRAIN PAYLOAD:
${trimJson(payload)}

AI PAYLOAD:
${trimJson(aiPayload, 9000)}

SELECTED TRADE CONTEXT:
${trimJson(selectedTradeContext, 6000)}

ACTIVE TRADE CONTEXT:
${trimJson(activeTradeContext, 6000)}

LIVE CONTEXT:
${trimJson(mergedLiveContext, 9000)}

SIGNAL CONTEXT:
${trimJson(signalContext, 4000)}

RISK CONTEXT:
${trimJson(riskContext, 4000)}

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
      data?.output?.[0]?.content?.[0]?.text ||
      "No AI response returned.";

    return NextResponse.json({
      answer,
      intent,
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected AI route error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
