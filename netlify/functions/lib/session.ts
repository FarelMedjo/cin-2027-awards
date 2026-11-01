/**
 * Session administrateur.
 *
 * Le mot de passe n'est comparé qu'en temps constant, et n'est échangé qu'une
 * fois : la suite se fait avec un jeton aléatoire de 256 bits, déposé dans un
 * cookie HttpOnly. Le serveur ne stocke que l'empreinte du jeton, avec une
 * date d'expiration courte.
 */

import { randomBytes } from 'node:crypto';
import { constantTimeEqual, shortFingerprint } from './crypto.ts';
import { isSecureRequest, readCookie } from './http.ts';
import { keys, type StoreLike } from './store.ts';

export const ADMIN_COOKIE = 'cin_admin';
/** Durée d'une session : assez pour préparer la cérémonie, assez courte pour un téléphone oublié. */
const SESSION_TTL_MS = 45 * 60 * 1000;

interface SessionRecord {
  exp: number;
}

function cookieHeader(value: string, maxAgeSeconds: number, secure: boolean): string {
  const parts = [
    `${ADMIN_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function verifyPassword(submitted: unknown, expected: string): boolean {
  if (typeof submitted !== 'string' || submitted.length === 0 || submitted.length > 512) {
    return false;
  }
  return constantTimeEqual(submitted, expected);
}

/** Crée une session et renvoie l'en-tête Set-Cookie à poser. */
export async function createSession(
  store: StoreLike,
  req: Request,
  pepper: string,
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const record: SessionRecord = { exp: Date.now() + SESSION_TTL_MS };
  await store.setJSON(keys.adminSession(shortFingerprint(token, pepper)), record);
  return cookieHeader(token, Math.floor(SESSION_TTL_MS / 1000), isSecureRequest(req));
}

/** Vrai si la requête porte une session administrateur valide. */
export async function hasAdminSession(
  store: StoreLike,
  req: Request,
  pepper: string,
): Promise<boolean> {
  const token = readCookie(req, ADMIN_COOKIE);
  if (!token || token.length > 128) return false;
  const key = keys.adminSession(shortFingerprint(token, pepper));
  const record = (await store.get(key, { type: 'json' })) as SessionRecord | null;
  if (!record || typeof record.exp !== 'number') return false;
  if (record.exp <= Date.now()) {
    await store.delete(key);
    return false;
  }
  return true;
}

/** Détruit la session courante et renvoie l'en-tête Set-Cookie d'effacement. */
export async function destroySession(
  store: StoreLike,
  req: Request,
  pepper: string,
): Promise<string> {
  const token = readCookie(req, ADMIN_COOKIE);
  if (token && token.length <= 128) {
    await store.delete(keys.adminSession(shortFingerprint(token, pepper)));
  }
  return cookieHeader('', 0, isSecureRequest(req));
}

/** Supprime les sessions expirées. */
export async function sweepSessions(store: StoreLike): Promise<number> {
  const { blobs } = await store.list({ prefix: keys.adminSessionsPrefix });
  let removed = 0;
  for (const blob of blobs) {
    const record = (await store.get(blob.key, { type: 'json' })) as SessionRecord | null;
    if (!record || typeof record.exp !== 'number' || record.exp <= Date.now()) {
      await store.delete(blob.key);
      removed += 1;
    }
  }
  return removed;
}
