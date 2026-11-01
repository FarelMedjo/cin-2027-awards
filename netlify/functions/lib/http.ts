/** Petites aides HTTP communes aux fonctions. */

import type { ApiError } from '../../../shared/types.ts';

const BASE_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function errorResponse(
  message: string,
  status: number,
  code?: string,
  headers: Record<string, string> = {},
): Response {
  const body: ApiError = code ? { error: message, code } : { error: message };
  return jsonResponse(body, status, headers);
}

export function textResponse(
  body: string,
  contentType: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'cache-control': 'no-store, max-age=0',
      'referrer-policy': 'no-referrer',
      ...headers,
    },
  });
}

/** Lit un corps JSON. Renvoie null si absent, illisible ou trop gros. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw = await req.text();
    if (!raw || raw.length > 32_000) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Adresse du client, uniquement pour en calculer une empreinte de limitation de
 * débit. Elle n'est jamais écrite dans le stockage ni dans un journal.
 */
export function clientIp(req: Request): string {
  return (
    req.headers.get('x-nf-client-connection-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'inconnue'
  );
}

/** Vrai derrière HTTPS. En local (`netlify dev` en http), les cookies ne sont pas marqués Secure. */
export function isSecureRequest(req: Request): boolean {
  const proto = req.headers.get('x-forwarded-proto');
  if (proto) return proto.split(',')[0]?.trim() === 'https';
  return new URL(req.url).protocol === 'https:';
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

/** Variable d'environnement obligatoire. Erreur explicite si elle manque. */
export function requireEnv(name: 'ADMIN_PASSWORD' | 'TOKEN_PEPPER'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `La variable d'environnement ${name} n'est pas definie. Voir .env.example et le README.`,
    );
  }
  return value;
}
