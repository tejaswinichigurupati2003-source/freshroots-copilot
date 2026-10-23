import { describe, expect, it } from "vitest";
import { createOpenRouterClient, createUsageMeter, GOOGLE_PROVIDER_ROUTING, type LlmUsage } from "./openrouter-client";

const env = { OPENROUTER_API_KEY: "test-key-123" };
const ok = (content = "[]", extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ model: "google/gemini-3.7-flash", choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001 }, ...extra }), { status: 200 });

function fakeFetch(...responses: Response[]) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return responses[Math.min(calls.length - 1, responses.length - 1)].clone();
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

const ask = (client: NonNullable<ReturnType<typeof createOpenRouterClient>>) => client.generateJson({ system: "sys", prompt: "hi", timeoutMs: 5_000 });
const noSleep = async () => {};

describe("createOpenRouterClient", () => {
  it("returns null without a key so the app uses templates", () => {
    expect(createOpenRouterClient({})).toBeNull();
    expect(createOpenRouterClient({ OPENROUTER_API_KEY: "  " })).toBeNull();
  });

  it("refuses a model that is not a Google model", () => {
    expect(() => createOpenRouterClient({ ...env, OPENROUTER_MODEL: "openai/gpt-5" })).toThrow('must be a Google model');
  });

  it("sends the key as a bearer token and pins Google-only providers with no fallback", async () => {
    const { fetchFn, calls } = fakeFetch(ok("[1]"));
    const client = createOpenRouterClient(env, { fetchFn })!;
    expect(await ask(client)).toBe("[1]");

    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[0].headers.Authorization).toBe("Bearer test-key-123");
    expect(calls[0].body).toMatchObject({
      model: "google/gemini-3.7-flash",
      messages: [{ role: "system", content: "sys" }, { role: "user", content: "hi" }],
      provider: { only: ["google-vertex", "google-ai-studio"], allow_fallbacks: false },
      max_tokens: 8192,
    });
    expect(GOOGLE_PROVIDER_ROUTING.allow_fallbacks).toBe(false);
  });

  it("uses OPENROUTER_MODEL when set", async () => {
    const { fetchFn, calls } = fakeFetch(ok());
    await ask(createOpenRouterClient({ ...env, OPENROUTER_MODEL: "google/gemini-3.5-flash-lite" }, { fetchFn })!);
    expect(calls[0].body.model).toBe("google/gemini-3.5-flash-lite");
  });

  it("retries a 429 and a 5xx, then succeeds", async () => {
    const { fetchFn, calls } = fakeFetch(new Response("{}", { status: 429 }), new Response("{}", { status: 503 }), ok("done"));
    expect(await ask(createOpenRouterClient(env, { fetchFn, sleep: noSleep })!)).toBe("done");
    expect(calls).toHaveLength(3);
  });

  it("gives up after 3 retries", async () => {
    const { fetchFn, calls } = fakeFetch(new Response(JSON.stringify({ error: { message: "busy" } }), { status: 429 }));
    await expect(ask(createOpenRouterClient(env, { fetchFn, sleep: noSleep })!)).rejects.toThrow("HTTP 429");
    expect(calls).toHaveLength(4);
  });

  it("stops at once on 402 and repeats what OpenRouter said", async () => {
    const { fetchFn, calls } = fakeFetch(new Response(JSON.stringify({ error: { message: "Insufficient credits" } }), { status: 402 }));
    await expect(ask(createOpenRouterClient(env, { fetchFn, sleep: noSleep })!)).rejects.toThrow("HTTP 402): Insufficient credits.");
    expect(calls).toHaveLength(1);
  });

  it("reports usage from the response and never puts the key in an error", async () => {
    const usage: LlmUsage[] = [];
    const { fetchFn } = fakeFetch(ok("x"));
    await ask(createOpenRouterClient(env, { fetchFn, onUsage: (u) => usage.push(u) })!);
    expect(usage).toEqual([{ model: "google/gemini-3.7-flash", promptTokens: 10, completionTokens: 5, costUsd: 0.0001 }]);

    const failing = fakeFetch(new Response(JSON.stringify({ error: { message: "No endpoints found" } }), { status: 404 }));
    const error = await ask(createOpenRouterClient(env, { fetchFn: failing.fetchFn })!).catch((e: Error) => e);
    expect((error as Error).message).toBe("OpenRouter call failed (HTTP 404): No endpoints found.");
    expect((error as Error).message).not.toContain("test-key-123");
  });
});

describe("createUsageMeter", () => {
  it("adds up calls and reports unknown cost when any call lacks one", () => {
    const meter = createUsageMeter();
    expect(meter.summary()).toBeNull();
    meter.record({ model: "m", promptTokens: 10, completionTokens: 5, costUsd: 0.001 });
    meter.record({ model: "m", promptTokens: 20, completionTokens: 10, costUsd: 0.002 });
    expect(meter.summary()).toMatchObject({ calls: 2, promptTokens: 30, completionTokens: 15 });
    expect(meter.summary()!.costUsd).toBeCloseTo(0.003);
    meter.record({ model: "m", promptTokens: 1, completionTokens: 1, costUsd: null });
    expect(meter.summary()!.costUsd).toBeNull();
  });
});
