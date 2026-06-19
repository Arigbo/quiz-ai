'use server';
/**
 * @fileOverview A flow to extract quiz questions from a URL or raw text.
 *
 * - extractQuiz - Fetches website content and parses it into structured quiz questions.
 */

import { ai } from '@/ai/genkit';
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
  prompt: `You are an expert web content parser. I will provide you with the text content (HTML or plain text) from a website that contains a quiz.
  
  Your task is to identify all quiz questions and their respective multiple-choice options.
  
  Rules:
  1. Generate a unique ID for each question.
  2. Identify if the question is 'radio' (single choice) or 'checkbox' (multiple choice).
  3. Extract all available options for each question.
  4. Ignore any non-quiz content (ads, navbars, footers).
  
  Website Content:
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
        // Fixed: Use valid 'gm' flags instead of invalid 'gmb'
        contentToParse = html
          .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gm, '')
          .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gm, '')
          .replace(/<svg\b[^>]*>([\s\S]*?)<\/svg>/gm, '')
          .substring(0, 20000); 
      } catch (e) {
        throw new Error("Failed to fetch the URL. The website might be blocking automated access.");
      }
    }

    const { output } = await extractPrompt({ ...input, content: contentToParse });
    return output!;
  }
);
