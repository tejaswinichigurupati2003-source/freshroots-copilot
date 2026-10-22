/**
 * LLM client for the explanation layer. Every call goes through OpenRouter and is served by Google's own
 * infrastructure (Vertex or AI Studio) on Google models only. The key comes from OPENROUTER_API_KEY and is never logged.
 *
 * Docs used:
 * - Request format: https://openrouter.ai/docs/quickstart
 * - Provider routing (`provider.only`, `allow_fallbacks`): https://openrouter.ai/docs/guides/routing/provider-selection
 */
import type { LlmClient } from "./explain";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_MODEL = "google/gemini-3.7-flash";
/** Google-served endpoints only, with no fallback to other providers. */
export const GOOGLE_PROVIDER_ROUTING = { only: ["google-vertex", "google-ai-studio"], allow_fallbacks: false } as const;

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

export interface LlmUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** Cost in US dollars from the response's usage field, when OpenRouter reports it. */
  costUsd: number | null;
}

export interface OpenRouterOptions {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  onUsage?: (usage: LlmUsage) => void;
}

interface ChatResponse {
  model?: string;
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string };
}

/** Returns null when OPENROUTER_API_KEY is missing, so the app falls back to template explanations. */
export function createOpenRouterClient(env: Record<string, string | undefined> = process.env, options: OpenRouterOptions = {}): LlmClient | null {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  const model = env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  if (!model.startsWith("google/")) {
    throw new Error(`OPENROUTER_MODEL must be a Google model (an id starting with "google/"). Got "${model}".`);
  }

  const fetchFn = options.fetchFn ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  return {
    async generateJson({ system, prompt, timeoutMs }) {
      for (let attempt = 0; ; attempt++) {
        const response = await fetchFn(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: prompt },
            ],
            temperature: 0.2,
            provider: GOOGLE_PROVIDER_ROUTING,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.status === 402) throw new Error("OpenRouter is out of credits (HTTP 402). Add credits and run again.");

        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }

        const body = (await response.json().catch(() => ({}))) as ChatResponse;
        if (!response.ok) throw new Error(`OpenRouter call failed (HTTP ${response.status}): ${body.error?.message ?? "no message"}`);

        const text = body.choices?.[0]?.message?.content;
        if (!text) throw new Error("OpenRouter returned no text");

        options.onUsage?.({
          model: body.model ?? model,
          promptTokens: body.usage?.prompt_tokens ?? 0,
          completionTokens: body.usage?.completion_tokens ?? 0,
          costUsd: body.usage?.cost ?? null,
        });
        return text;
      }
    },
  };
}

/** Adds up usage across the calls of one run. */
export function createUsageMeter() {
  const total = { model: "", promptTokens: 0, completionTokens: 0, costUsd: 0, calls: 0, costKnown: true };
  return {
    record(usage: LlmUsage) {
      total.model = usage.model;
      total.promptTokens += usage.promptTokens;
      total.completionTokens += usage.completionTokens;
      total.calls += 1;
      if (usage.costUsd === null) total.costKnown = false;
      else total.costUsd += usage.costUsd;
    },
    summary: () => (total.calls === 0 ? null : { ...total, costUsd: total.costKnown ? total.costUsd : null }),
  };
}
