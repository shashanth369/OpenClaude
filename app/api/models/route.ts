import { NextRequest } from 'next/server';
import { listModels } from '@/lib/ai';
import { PROVIDERS } from '@/lib/providers';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/** POST { keys? } → grouped, availability-aware model catalog for every provider. */
export async function POST(request: NextRequest) {
  let keys: any = null;
  try {
    const body = await request.json();
    keys = body?.keys ?? null;
  } catch {
    // no body is fine
  }

  const providers = await Promise.all(
    PROVIDERS.map(async (p) => {
      const { models, configured, live } = await listModels(
        p.id,
        keys ? { ...keys, airforce: keys.airforce ?? undefined } : null
      ).catch(() => ({ models: [], configured: false, live: false }));
      // a client-provided key also means "configured" for BYOK users
      const clientConfigured = Boolean(keys?.[p.id]?.trim());
      return {
        id: p.id,
        label: p.label,
        tagline: p.tagline,
        accent: p.accent,
        keyRequired: p.keyRequired,
        keyHelpUrl: p.keyHelpUrl,
        envKey: p.envKey,
        configured: configured || clientConfigured,
        live,
        models,
      };
    })
  );

  return Response.json(
    { providers },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET() {
  return POST(new NextRequest('http://localhost/api/models', { method: 'POST' }));
}
