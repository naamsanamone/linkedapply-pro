/* ============================================================
   LinkedApply Pro — AI Proxy API Route
   Proxies AI requests through backend for users without
   their own API keys (uses platform credits / shared key)
   ============================================================ */

import { NextResponse, NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/libs/supabase-admin";

// Rate limits per plan (requests per day)
const AI_RATE_LIMITS: Record<string, number> = {
  free_trial: 10,
  day: 100,
  week: 500,
  month: 2000,
  year: 5000,
  lifetime: 10000,
};

export async function POST(req: NextRequest) {
  try {
    // ---- Auth ----
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // ---- Rate Limiting ----
    const { data: profile } = await supabase
      .from("profiles")
      .select("price_id, has_access")
      .eq("id", user.id)
      .single();

    if (!profile?.has_access) {
      return NextResponse.json({ error: "No active subscription" }, { status: 403 });
    }

    const plan = resolvePlanFromPriceId(profile.price_id);
    const dailyLimit = AI_RATE_LIMITS[plan] || 10;

    const today = new Date().toISOString().slice(0, 10);
    const { data: aiUsage } = await supabase
      .from("ai_usage_logs")
      .select("request_count")
      .eq("user_id", user.id)
      .eq("date", today)
      .single();

    const currentCount = aiUsage?.request_count || 0;
    if (currentCount >= dailyLimit) {
      return NextResponse.json(
        {
          error: "AI daily limit reached",
          limit: dailyLimit,
          used: currentCount,
          plan,
        },
        { status: 429 }
      );
    }

    // ---- Parse Request ----
    const body = await req.json();
    const { prompt, provider, model, temperature, maxTokens, responseFormat } = body;

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    // ---- Route to Provider ----
    let aiResponse: string;

    const targetProvider = provider || "openai";
    const targetModel = model || getDefaultModel(targetProvider);

    if (targetProvider === "gemini") {
      aiResponse = await callGemini(prompt, targetModel, temperature);
    } else {
      // OpenAI / DeepSeek (OpenAI-compatible)
      const apiUrl = targetProvider === "deepseek"
        ? "https://api.deepseek.com/v1"
        : "https://api.openai.com/v1";
      const apiKey = targetProvider === "deepseek"
        ? process.env.DEEPSEEK_API_KEY
        : process.env.OPENAI_API_KEY;

      if (!apiKey) {
        return NextResponse.json(
          { error: `${targetProvider} API key not configured on server` },
          { status: 503 }
        );
      }

      aiResponse = await callOpenAICompatible(
        apiUrl,
        apiKey,
        targetModel,
        prompt,
        temperature,
        maxTokens,
        responseFormat
      );
    }

    // ---- Track Usage ----
    if (aiUsage) {
      await supabase
        .from("ai_usage_logs")
        .update({ request_count: currentCount + 1 })
        .eq("user_id", user.id)
        .eq("date", today);
    } else {
      await supabase
        .from("ai_usage_logs")
        .insert({
          user_id: user.id,
          date: today,
          request_count: 1,
        });
    }

    return NextResponse.json({
      response: aiResponse,
      usage: {
        used: currentCount + 1,
        limit: dailyLimit,
        remaining: dailyLimit - currentCount - 1,
      },
    });
  } catch (error: any) {
    console.error("ai-proxy error:", error);
    return NextResponse.json(
      { error: error.message || "AI proxy error" },
      { status: 500 }
    );
  }
}

// ---- Provider Calls ----

async function callOpenAICompatible(
  apiUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  temperature?: number,
  maxTokens?: number,
  responseFormat?: string
): Promise<string> {
  const body: any = {
    model,
    messages: [{ role: "user", content: prompt }],
    stream: false,
  };

  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens) body.max_tokens = maxTokens;
  if (responseFormat === "json") body.response_format = { type: "json_object" };

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI provider error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGemini(
  prompt: string,
  model: string,
  temperature?: number
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key not configured on server");
  }

  const body: any = {
    contents: [{ parts: [{ text: prompt }] }],
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
  };

  if (temperature !== undefined) {
    body.generationConfig = { temperature };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ---- Helpers ----

function resolvePlanFromPriceId(priceId: string | null): string {
  if (!priceId) return "free_trial";
  if (priceId.includes("day")) return "day";
  if (priceId.includes("week")) return "week";
  if (priceId.includes("month")) return "month";
  if (priceId.includes("year")) return "year";
  if (priceId.includes("lifetime")) return "lifetime";
  return "free_trial";
}

function getDefaultModel(provider: string): string {
  switch (provider) {
    case "openai": return "gpt-4o-mini";
    case "gemini": return "gemini-1.5-flash";
    case "deepseek": return "deepseek-chat";
    default: return "gpt-4o-mini";
  }
}
