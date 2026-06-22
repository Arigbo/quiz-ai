import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [googleAI()],
  // Primary model. Falls back on demand spikes.
  model: 'googleai/gemini-2.5-flash',
});

/**
 * Ordered list of models to try when the primary is overloaded.
 * gemini-1.5-flash was removed from v1beta — use gemini-2.0-flash-lite instead.
 */
export const FALLBACK_MODELS = [
  'googleai/gemini-2.5-flash',
  'googleai/gemini-2.0-flash',
  'googleai/gemini-2.0-flash-lite',
] as const;

export type FallbackModel = typeof FALLBACK_MODELS[number];
