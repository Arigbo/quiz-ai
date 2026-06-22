import { NextRequest, NextResponse } from 'next/server';
import { extractQuiz } from '@/ai/flows/extract-quiz-flow';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await extractQuiz(body);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to extract quiz.';
    const isUnavailable = msg.toLowerCase().includes('503') ||
      msg.toLowerCase().includes('unavailable') ||
      msg.toLowerCase().includes('high demand');

    return NextResponse.json(
      { error: msg },
      { status: isUnavailable ? 503 : 500 },
    );
  }
}
