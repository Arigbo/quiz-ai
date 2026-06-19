import { NextRequest, NextResponse } from 'next/server';
import { extractQuiz } from '@/ai/flows/extract-quiz-flow';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await extractQuiz(body);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to extract quiz.' },
      { status: 500 }
    );
  }
}
