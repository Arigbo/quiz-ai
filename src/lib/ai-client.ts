/**
 * Client-safe wrappers for AI flows.
 * These call the Next.js API routes instead of importing server actions directly,
 * which prevents Genkit module-level initialization from running during SSR.
 */

export type ExtractQuizInput = {
  url?: string;
  rawText?: string;
};

export type QuizQuestionResult = {
  id: string;
  question: string;
  options: string[];
  type: 'radio' | 'checkbox';
};

export type ExtractQuizOutput = {
  questions: QuizQuestionResult[];
  sourceTitle?: string;
};

export type AutoAnswerInput = {
  question: string;
  options: string[];
};

export type AutoAnswerOutput = {
  correctAnswer: string;
  correctAnswerIndex: number;
};

export async function extractQuizClient(input: ExtractQuizInput): Promise<ExtractQuizOutput> {
  const res = await fetch('/api/extract-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || 'Failed to extract quiz.');
  }
  return res.json();
}

export async function autoAnswerClient(input: AutoAnswerInput): Promise<AutoAnswerOutput> {
  const res = await fetch('/api/auto-answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || 'Failed to answer question.');
  }
  return res.json();
}
