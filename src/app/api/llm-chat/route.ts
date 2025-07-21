import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request: messages array is required.' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key is not configured.' }, { status: 500 });
    }

    const openai = new OpenAI({
      apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });

    // Request a streaming chat completion
    const completion = await openai.chat.completions.create({
      model: 'gemini-2.5-flash',
      messages,
      stream: true,
    });

    const encoder = new TextEncoder();

    // Create an SSE stream so the browser can flush each token immediately
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const token = chunk.choices[0]?.delta?.content || "";
            if (token) {
              controller.enqueue(encoder.encode(`data: ${token}\n\n`));
            }
          }
          // indicate completion
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("Streaming error:", err);
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    console.error('Error communicating with OpenAI:', error);
    return NextResponse.json({ error: 'Failed to process the request.' }, { status: 500 });
  }
} 