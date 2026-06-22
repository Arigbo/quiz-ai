import { NextRequest, NextResponse } from 'next/server';
import { autoAnswerQuizQuestion } from '@/ai/flows/auto-answer-quiz-question';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await autoAnswerQuizQuestion(body);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to answer question.';
    const isUnavailable = msg.toLowerCase().includes('503') ||
      msg.toLowerCase().includes('unavailable') ||
      msg.toLowerCase().includes('high demand');

    return NextResponse.json(
      { error: msg },
      { status: isUnavailable ? 503 : 500 },
    );
  }
}
