import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import OpenAI from 'openai';

async function chat(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method !== 'POST') {
        return { status: 405, body: 'Method Not Allowed' };
    }

    const { messages } = (await request.json()) as { messages: any[] };
    if (!messages || !Array.isArray(messages)) {
        return { status: 400, body: "'messages' array is required." };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return { status: 500, body: 'OPENAI_API_KEY is not set.' };
    }

    const openai = new OpenAI({
        apiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      });

    // ReadableStream for streaming the response
    const stream = new ReadableStream({
        async start(controller) {
            try {
                const llmStream = await openai.chat.completions.create({
                    model: 'gemini-2.5-flash-lite',
                    messages: messages as any,
                    stream: true,
                });

                for await (const chunk of llmStream) {
                    const token = chunk.choices?.[0]?.delta?.content || '';
                    if (token) {
                        // Note: The client-side code expects the raw string, not JSON.
                        // We previously had `data: ${JSON.stringify(token)}\n\n`, which sent extra quotes.
                        controller.enqueue(`data: ${token}\n\n`);
                    }
                }
                controller.enqueue('data: [DONE]\n\n');
            } catch (err) {
                context.error('Error calling OpenAI:', err);
                controller.enqueue('data: [ERROR]\n\n');
            } finally {
                controller.close();
            }
        },
    });

    return {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        },
        body: stream as any,
    };
}

app.http('chat', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: chat,
}); 