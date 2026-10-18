/// <reference types="vite/client" />
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SupabaseEnvStatus =
  | 'configured'
  | 'missing_env_demo_available'
  | 'invalid_env';

export interface SupabaseEnvironmentConfig {
  status: SupabaseEnvStatus;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  diagnosticMessage: string | null;
}

const PLACEHOLDER_URLS = new Set([
  '',
  'https://your-project-ref.supabase.co',
  'http://your-project-ref.supabase.co',
]);

const PLACEHOLDER_KEYS = new Set([
  '',
  'your-public-anon-key-placeholder',
]);

/**
 * Inspects a candidate API key to ensure a privileged Supabase service_role or secret key
 * is never loaded in the browser bundle (Condition 1B).
 */
export function isForbiddenPrivilegedKey(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) {
    return false;
  }
  if (
    trimmed.startsWith('sb_secret_') ||
    trimmed.toLowerCase().includes('service_role')
  ) {
    return true;
  }
  // Inspect JWT payload segment if the key is a 3-part JWT
  const parts = trimmed.split('.');
  if (parts.length === 3 && parts[1]) {
    try {
      const normalizedBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded =
        normalizedBase64 +
        '='.repeat((4 - (normalizedBase64.length % 4)) % 4);
      const decoded =
        typeof atob === 'function'
          ? atob(padded)
          : Buffer.from(padded, 'base64').toString('utf8');
      if (decoded.includes('"service_role"')) {
        return true;
      }
    } catch {
      // Non-JSON payload segment; continue with standard validation
    }
  }
  return false;
}

/**
 * Evaluates raw environment variables and determines whether live Supabase is configured,
 * whether the app should offer explicitly labelled Demo Mode, or whether configuration is invalid.
 */
export function evaluateSupabaseEnvironment(
  env: Record<string, string | undefined> = import.meta.env as Record<
    string,
    string | undefined
  >,
): SupabaseEnvironmentConfig {
  const rawUrl = (env.VITE_SUPABASE_URL ?? '').trim();
  const rawAnonKey = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  const rawForbiddenServiceKey = (
    env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? ''
  ).trim();

  if (rawForbiddenServiceKey.length > 0 || isForbiddenPrivilegedKey(rawAnonKey)) {
    return {
      status: 'invalid_env',
      supabaseUrl: null,
      supabaseAnonKey: null,
      diagnosticMessage:
        'Security Error: A privileged Supabase service_role or secret key was detected in browser environment variables. Never expose service_role credentials in client code. Provide only the public anon key.',
    };
  }

  const urlIsMissingOrPlaceholder = PLACEHOLDER_URLS.has(rawUrl);
  const keyIsMissingOrPlaceholder = PLACEHOLDER_KEYS.has(rawAnonKey);

  if (urlIsMissingOrPlaceholder && keyIsMissingOrPlaceholder) {
    return {
      status: 'missing_env_demo_available',
      supabaseUrl: null,
      supabaseAnonKey: null,
      diagnosticMessage:
        'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not configured. Live authentication and database writes are unavailable; viewing explicitly labelled read-only Demo Mode.',
    };
  }

  if (urlIsMissingOrPlaceholder || keyIsMissingOrPlaceholder) {
    return {
      status: 'invalid_env',
      supabaseUrl: null,
      supabaseAnonKey: null,
      diagnosticMessage:
        'Incomplete Supabase configuration: both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set to non-placeholder values.',
    };
  }

  try {
    const parsedUrl = new URL(rawUrl);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return {
        status: 'invalid_env',
        supabaseUrl: null,
        supabaseAnonKey: null,
        diagnosticMessage: `Invalid VITE_SUPABASE_URL protocol '${parsedUrl.protocol}'. Expected https: or http: (for local Supabase CLI).`,
      };
    }
  } catch {
    return {
      status: 'invalid_env',
      supabaseUrl: null,
      supabaseAnonKey: null,
      diagnosticMessage:
        'Invalid VITE_SUPABASE_URL format. Expected a valid URL such as https://<project-ref>.supabase.co or http://127.0.0.1:54321.',
    };
  }

  return {
    status: 'configured',
    supabaseUrl: rawUrl,
    supabaseAnonKey: rawAnonKey,
    diagnosticMessage: null,
  };
}

let cachedClient: SupabaseClient | null = null;

/**
 * Returns a singleton `@supabase/supabase-js` client when environment variables are valid,
 * or `null` when running without a configured Supabase backend.
 */
export function getSupabaseBrowserClient(
  envOverride?: Record<string, string | undefined>,
): {
  config: SupabaseEnvironmentConfig;
  client: SupabaseClient | null;
} {
  const config = evaluateSupabaseEnvironment(envOverride);
  if (
    config.status !== 'configured' ||
    !config.supabaseUrl ||
    !config.supabaseAnonKey
  ) {
    return { config, client: null };
  }

  if (!envOverride && cachedClient) {
    return { config, client: cachedClient };
  }

  const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  if (!envOverride) {
    cachedClient = client;
  }

  return { config, client };
}
