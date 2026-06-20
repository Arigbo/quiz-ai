import { NextRequest, NextResponse } from 'next/server';
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const schema = z.object({
  projectTitle: z.string().describe('The project title from the brief'),
  projectDescription: z.string().describe('The project description from the brief'),
  requirements: z.string().describe('Any specific submission requirements'),
  userTopic: z.string().optional().describe('Additional topic/angle specified by the student'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.parse(body);

    const prompt = `You are an expert academic writer helping a student complete a project submission.

Project Title: ${parsed.projectTitle}

Project Description: ${parsed.projectDescription}

Submission Requirements: ${parsed.requirements || 'Write a clear, well-structured response addressing the project objectives.'}

${parsed.userTopic ? `Student's focus/topic: ${parsed.userTopic}` : ''}

Write a comprehensive, well-structured project submission response (500-900 words) that:
- Directly addresses the project title and description
- Meets the submission requirements
- Is written in clear, professional academic language
- Uses proper paragraphs and structure
- Sounds like a genuine student submission (not a generic essay)
- Avoids bullet points — write in flowing prose paragraphs

Write ONLY the project response text, no preamble or meta-commentary.`;

    const response = await ai.generate({ prompt });
    const text = response.text?.trim() ?? '';

    if (!text) throw new Error('AI returned empty response');

    return NextResponse.json({ content: text });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to generate project content.' },
      { status: 500 }
    );
  }
}
