import { NextRequest } from 'next/server';
import { createRouteClient, supabaseEnvConfigured } from '@/lib/supabase/server';
import { streamChatCompletion } from '@/lib/ai';
import { OPENCLAUDE_SYSTEM_PROMPT } from '@/lib/systemPrompt';
import type { ProviderId } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_MESSAGES = 48;
const MAX_TOTAL_CHARS = 120_000;

function sse(data: unknown) {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (supabaseEnvConfigured) {
    const supabase = createRouteClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 });
  }

  const provider = (body?.provider ?? 'openrouter') as ProviderId;
  const model = typeof body?.model === 'string' ? body.model : 'meta-llama/llama-3.3-70b-instruct:free';
  const projectInstructions =
    typeof body?.projectInstructions === 'string' ? body.projectInstructions.slice(0, 8000) : '';
  const clientKeys = body?.keys ?? null;

  const rawMessages: any[] = Array.isArray(body?.messages) ? body.messages : [];
  const messages = rawMessages
    .filter(
      (m) =>
        (m?.role === 'user' || m?.role === 'assistant') &&
        typeof m?.content === 'string' &&
        m.content.trim().length > 0
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }));

  // hard cap on total prompt size
  let total = 0;
  const trimmed: typeof messages = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    total += messages[i].content.length;
    if (total > MAX_TOTAL_CHARS) break;
    trimmed.unshift(messages[i]);
  }
  if (!trimmed.length) return Response.json({ error: 'No messages to send' }, { status: 400 });

  let system = OPENCLAUDE_SYSTEM_PROMPT;
  if (projectInstructions.trim()) {
    system += `\n\n---\nActive project — follow these standing instructions for everything in this conversation:\n${projectInstructions.trim()}`;
  }

  const upstream = await streamChatCompletion({
    provider,
    model,
    clientKeys,
    messages: [{ role: 'system', content: system }, ...trimmed],
    temperature: 0.7,
  });

  if (!upstream.ok || !upstream.body) {
    // streamChatCompletion already produced a JSON error response
    return upstream;
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith('data:')) continue;
            const payload = trimmedLine.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const json = JSON.parse(payload);
              const delta = json?.choices?.[0]?.delta ?? {};
              const content: string = delta.content ?? delta.reasoning_content ?? '';
              if (content) controller.enqueue(sse({ content }));
            } catch {
              // keep-alive comment or partial JSON — ignore
            }
          }
        }
      } catch (err: any) {
        controller.enqueue(sse({ error: err?.message ?? 'Stream failed' }));
      } finally {
        controller.enqueue(sse({ done: true }));
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
