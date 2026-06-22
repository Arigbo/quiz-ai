'use server';
/**
 * @fileOverview An AI agent designed to automatically answer quiz questions.
 *
 * - autoAnswerQuizQuestion - A function that handles the automatic quiz question answering process.
 * - AutoAnswerQuizQuestionInput - The input type for the autoAnswerQuizQuestion function.
 * - AutoAnswerQuizQuestionOutput - The return type for the autoAnswerQuizQuestion function.
 */

import {ai, FALLBACK_MODELS} from '@/ai/genkit';
import {withRetry} from '@/ai/retry';
import {z} from 'genkit';

const AutoAnswerQuizQuestionInputSchema = z.object({
  question: z.string().describe('The quiz question to be answered.'),
  options: z
    .array(z.string())
    .describe('A list of multiple-choice answer options for the question.'),
});
export type AutoAnswerQuizQuestionInput = z.infer<
  typeof AutoAnswerQuizQuestionInputSchema
>;

const AutoAnswerQuizQuestionOutputSchema = z.object({
  correctAnswer: z.string().describe('The text of the identified correct answer.'),
  correctAnswerIndex: z
    .number()
    .describe('The 0-based index of the identified correct answer within the options list.'),
});
export type AutoAnswerQuizQuestionOutput = z.infer<
  typeof AutoAnswerQuizQuestionOutputSchema
>;

export async function autoAnswerQuizQuestion(
  input: AutoAnswerQuizQuestionInput
): Promise<AutoAnswerQuizQuestionOutput> {
  return autoAnswerQuizQuestionFlow(input);
}

const autoAnswerQuizQuestionPrompt = ai.definePrompt({
  name: 'autoAnswerQuizQuestionPrompt',
  input: {schema: AutoAnswerQuizQuestionInputSchema},
  output: {schema: AutoAnswerQuizQuestionOutputSchema},
  prompt: `You are an expert quiz solver AI. Your task is to analyze the given quiz question and multiple-choice options, and then identify the single best correct answer.

Quiz Question: {{{question}}}

Answer Options:
{{#each options}}
{{@index}}. {{{this}}}
{{/each}}

Identify the single most accurate answer from the options provided, and provide its text and 0-based index.
`,
});

const autoAnswerQuizQuestionFlow = ai.defineFlow(
  {
    name: 'autoAnswerQuizQuestionFlow',
    inputSchema: AutoAnswerQuizQuestionInputSchema,
    outputSchema: AutoAnswerQuizQuestionOutputSchema,
  },
  async (input) => {
    // Try each model in order, with retry+backoff per model.
    // This handles both transient 503s on the primary model AND
    // persistent overload by falling back to less-loaded models.
    let lastError: unknown;

    for (const model of FALLBACK_MODELS) {
      try {
        const result = await withRetry(
          () => autoAnswerQuizQuestionPrompt(input, { model }),
          // 3 attempts per model, 1.5s base delay
          3,
          1500,
        );
        return result.output!;
      } catch (error) {
        console.warn(`[autoAnswer] Model ${model} failed, trying next…`, error instanceof Error ? error.message : error);
        lastError = error;
      }
    }

    throw lastError;
  }
);
