import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";
import { FALLBACK_MODELS, FallbackModel } from "./genkit";

/**
 * Creates a one-off Genkit instance using the supplied API key.
 * Used for per-request user-provided keys so we don't mutate the shared instance.
 */
export function createAiWithKey(apiKey: string) {
  return genkit({
    plugins: [googleAI({ apiKey })],
    model: FALLBACK_MODELS[0] as FallbackModel,
  });
}
