import { GoogleGenAI } from "@google/genai";
import type { LlmClient } from "./explain";

/** Returns null when GEMINI_API_KEY or GEMINI_MODEL is missing, so the app falls back to template explanations. */
export function createGeminiClient(env: Record<string, string | undefined> = process.env): LlmClient | null {
  const apiKey = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_MODEL?.trim();
  if (!apiKey || !model) return null;

  const ai = new GoogleGenAI({ apiKey });

  return {
    async generateJson({ system, prompt, timeoutMs }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const timeout = new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error(`Gemini call timed out after ${timeoutMs} ms`)));
      });
      try {
        const response = await Promise.race([
          ai.models.generateContent({
            model,
            contents: prompt,
            config: { systemInstruction: system, responseMimeType: "application/json", temperature: 0.2, abortSignal: controller.signal },
          }),
          timeout,
        ]);
        if (!response.text) throw new Error("Gemini returned no text");
        return response.text;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
