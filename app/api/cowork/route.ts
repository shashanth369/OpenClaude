import { NextRequest } from 'next/server';
import { createRouteClient, supabaseEnvConfigured } from '@/lib/supabase/server';
import { chatCompletion } from '@/lib/ai';
import type { ProviderId } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ROLES = ['Planner', 'Researcher', 'Engineer', 'Copywriter', 'Designer', 'Critic', 'Data Analyst'];

function fail(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function extractJsonArray(text: string): any[] | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }

  if (!supabaseEnvConfigured) return fail('Supabase is not configured', 503);
  const supabase = createRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('Not signed in', 401);

  const boardId = body?.boardId;
  if (typeof boardId !== 'string' || !boardId) return fail('boardId is required', 400);
  const keys = body?.keys ?? null;
  const provider = (body?.provider ?? 'openrouter') as ProviderId;
  const model = typeof body?.model === 'string' ? body.model : 'meta-llama/llama-3.3-70b-instruct:free';
  const action = body?.action;

  // Board must belong to the caller (RLS also enforces this)
  const { data: board, error: boardErr } = await supabase
    .from('cowork_boards')
    .select('*')
    .eq('id', boardId)
    .single();
  if (boardErr || !board) return fail('Board not found', 404);

  const loadTasks = async () => {
    const { data } = await supabase
      .from('cowork_tasks')
      .select('*')
      .eq('board_id', boardId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    return data ?? [];
  };

  // -------------------------------------------------------------
  // PLAN: coordinator decomposes the goal into tasks
  // -------------------------------------------------------------
  if (action === 'plan') {
    let plan: any[] | null = null;
    try {
      const raw = await chatCompletion({
        provider,
        model,
        clientKeys: keys,
        temperature: 0.4,
        maxTokens: 2000,
        messages: [
          {
            role: 'system',
            content:
              'You are the coordinator of an AI coworking harness. Break the user\'s goal into 3-6 concrete, non-overlapping tasks for a small team of AI coworkers. Output ONLY a JSON array — no prose, no markdown fences. Each item must be: {"role": one of ' +
              JSON.stringify(ROLES) +
              ', "title": short imperative task, "brief": one sentence of what done looks like}.',
          },
          { role: 'user', content: `Goal: ${board.goal || board.title}` },
        ],
      });
      plan = extractJsonArray(raw);
    } catch (err: any) {
      return fail(err?.message ?? 'Coordinator failed to produce a plan', 502);
    }
    if (!plan || plan.length === 0) {
      return fail('Coordinator did not return a usable plan — try a stronger model.', 502);
    }

    // Keep completed work, replace anything pending
    await supabase
      .from('cowork_tasks')
      .delete()
      .eq('board_id', boardId)
      .neq('status', 'done');

    const { data: doneTasks } = await supabase
      .from('cowork_tasks')
      .select('position')
      .eq('board_id', boardId)
      .eq('status', 'done')
      .order('position', { ascending: false })
      .limit(1);
    let position = doneTasks?.[0]?.position != null ? doneTasks[0].position + 1 : 0;

    const rows = plan.slice(0, 8).map((t) => ({
      board_id: boardId,
      user_id: user.id,
      title: String(t?.title ?? 'Untitled task').slice(0, 200),
      role: ROLES.includes(t?.role) ? t.role : 'Researcher',
      provider,
      model,
      status: 'todo',
      result: '',
      position: position++,
    }));
    const { error: insertErr } = await supabase.from('cowork_tasks').insert(rows);
    if (insertErr) return fail(insertErr.message, 500);
    return Response.json({ tasks: await loadTasks() });
  }

  // -------------------------------------------------------------
  // EXECUTE: one coworker runs one task (or the next pending task)
  // -------------------------------------------------------------
  if (action === 'execute') {
    const taskId = body?.taskId;
    const base = supabase.from('cowork_tasks').select('*').eq('board_id', boardId);
    const { data: tasks } = taskId
      ? await base.eq('id', taskId)
      : await base.neq('status', 'done').order('position', { ascending: true }).limit(1);
    const task = Array.isArray(tasks) ? (tasks[0] as any) : null;
    if (!task) return Response.json({ tasks: await loadTasks(), note: 'No pending tasks' });

    await supabase.from('cowork_tasks').update({ status: 'doing' }).eq('id', task.id);

    const { data: prior } = await supabase
      .from('cowork_tasks')
      .select('title, role, result')
      .eq('board_id', boardId)
      .eq('status', 'done')
      .order('position', { ascending: true });

    const priorContext =
      prior && prior.length
        ? prior
            .map(
              (p: any, i: number) =>
                `### Completed by ${p.role}: ${p.title}\n${String(p.result).slice(0, 1500)}`
            )
            .join('\n\n')
        : 'None yet — you are first.';

    try {
      const result = await chatCompletion({
        provider: (task.provider || provider) as ProviderId,
        model: task.model || model,
        clientKeys: keys,
        temperature: 0.6,
        maxTokens: 3500,
        messages: [
          {
            role: 'system',
            content: `You are ${task.role}, an AI coworker on a coordinated team inside OpenClaude Cowork. Deliver your piece of shared work completely and self-containedly — your output is read by teammates and the user verbatim. Be concrete, use markdown, no meta-commentary like "As an AI". If something you need is missing, make and state reasonable assumptions.`,
          },
          {
            role: 'user',
            content: `# Overall goal\n${board.goal || board.title}\n\n# Your assignment\n${task.title}\n\n# What the team has done so far\n${priorContext}\n\nDeliver your complete work now.`,
          },
        ],
      });
      await supabase
        .from('cowork_tasks')
        .update({ status: 'done', result })
        .eq('id', task.id);
    } catch (err: any) {
      await supabase
        .from('cowork_tasks')
        .update({ status: 'todo', result: `⚠️ ${err?.message ?? 'Agent failed'}` })
        .eq('id', task.id);
      return Response.json(
        { tasks: await loadTasks(), error: err?.message ?? 'Agent failed' },
        { status: 502 }
      );
    }
    return Response.json({ tasks: await loadTasks() });
  }

  return fail('Unknown action — use "plan" or "execute"', 400);
}
