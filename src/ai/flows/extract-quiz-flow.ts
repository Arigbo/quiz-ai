'use server';
/**
 * @fileOverview A flow to extract quiz questions from a URL or raw text.
 *
 * - extractQuiz - Fetches website content and parses it into structured quiz questions.
 */

import { ai, FALLBACK_MODELS } from '@/ai/genkit';
import { withRetry } from '@/ai/retry';
import { z } from 'genkit';

const QuizQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.string()),
  type: z.enum(['radio', 'checkbox']),
});

const ExtractQuizInputSchema = z.object({
  url: z.string().url().optional().describe('The URL of the quiz website to scan.'),
  rawText: z.string().optional().describe('Raw text or HTML to extract questions from.'),
});

const ExtractQuizOutputSchema = z.object({
  questions: z.array(QuizQuestionSchema),
  sourceTitle: z.string().optional(),
});

export type ExtractQuizOutput = z.infer<typeof ExtractQuizOutputSchema>;

export async function extractQuiz(input: z.infer<typeof ExtractQuizInputSchema>): Promise<ExtractQuizOutput> {
  return extractQuizFlow(input);
}

const extractPrompt = ai.definePrompt({
  name: 'extractPrompt',
  input: { schema: ExtractQuizInputSchema.extend({ content: z.string() }) },
  output: { schema: ExtractQuizOutputSchema },
  prompt: `You are an expert quiz parser. Your job is to extract all quiz questions and their answer options from the provided content.

The content may already be pre-structured in this format (from SkillsBridge LMS):
  Question 1: [question text]
    A. [option]
    B. [option]
    C. [option]
    D. [option]

  Question 2: ...

Or it may be raw HTML/text from a generic quiz website.

Rules:
1. Extract EVERY question you find. Do not skip any.
2. For each question, generate a unique short ID (e.g., "q1", "q2"...).
3. Determine the type:
   - 'radio' if only ONE answer is correct (single choice, multiple choice single, true/false)
   - 'checkbox' if MULTIPLE answers can be correct
4. The 'options' array must contain just the answer text (NOT the A/B/C labels).
5. Ignore navigation elements, headers, timers, progress bars, and non-question content.
6. If content is pre-structured with "Question N:" format, parse it directly.

Content to parse:
{{{content}}}
`,
});

const extractQuizFlow = ai.defineFlow(
  {
    name: 'extractQuizFlow',
    inputSchema: ExtractQuizInputSchema,
    outputSchema: ExtractQuizOutputSchema,
  },
  async (input) => {
    let contentToParse = input.rawText || "";

    if (input.url) {
      try {
        const response = await fetch(input.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        const html = await response.text();
        // Fixed regex flags: removed invalid 'b'
        contentToParse = html
          .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gm, '')
          .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gm, '')
          .replace(/<svg\b[^>]*>([\s\S]*?)<\/svg>/gm, '')
          .substring(0, 20000);
      } catch {
        throw new Error("Failed to fetch the URL. The website might be blocking automated access.");
      }
    }

    // Try each model in order, with retry+backoff per model.
    let lastError: unknown;

    for (const model of FALLBACK_MODELS) {
      try {
        const result = await withRetry(
          () => extractPrompt({ ...input, content: contentToParse }, { model }),
          3,
          1500,
        );
        return result.output!;
      } catch (error) {
        console.warn(`[extractQuiz] Model ${model} failed, trying next…`, error instanceof Error ? error.message : error);
        lastError = error;
      }
    }

    throw lastError;
  }
);