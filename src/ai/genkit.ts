import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [googleAI()],
  // Primary model. Falls back to gemini-2.0-flash in the flows if 503/429.
  model: 'googleai/gemini-2.5-flash',
});

/** Ordered list of models to try when the primary is overloaded. */
export const FALLBACK_MODELS = [
  'googleai/gemini-2.5-flash',
  'googleai/gemini-2.0-flash',
  'googleai/gemini-1.5-flash',
] as const;

export type FallbackModel = typeof FALLBACK_MODELS[number];
