import { NextRequest, NextResponse } from 'next/server';
import { autoAnswerQuizQuestion } from '@/ai/flows/auto-answer-quiz-question';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await autoAnswerQuizQuestion(body);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to answer question.' },
      { status: 500 }
    );
  }
}
