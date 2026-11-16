import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';

/**
 * Read-only Supabase client for route handlers — enough to verify the
 * caller's session from cookies. Row-level security still applies because
 * every query runs as the user.
 */
export function createRouteClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // no-op: route handlers only read the session
      },
    },
  });
}

export const supabaseEnvConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
