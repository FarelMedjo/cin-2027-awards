/**
 * Limitation de débit, pour qu'un code ne puisse pas être trouvé par force brute.
 *
 * Aucune adresse IP n'est stockée : la clé est une empreinte HMAC salée par
 * TOKEN_PEPPER, à laquelle est mêlé le jour courant. Les empreintes changent
 * donc chaque jour et ne permettent pas de suivre un visiteur dans le temps.
 *
 * L'espace des codes (31^10, environ 8 x 10^14) rend de toute façon une attaque
 * illusoire ; cette limite est là pour éviter qu'on sature les fonctions.
 */

import { shortFingerprint } from './crypto.ts';
import { keys, type StoreLike } from './store.ts';

export interface RateRule {
  /** Nom du compteur, pour que deux usages ne se mélangent pas. */
  bucket: string;
  max: number;
  windowMs: number;
}

export const CODE_CHECK_RULE: RateRule = {
  bucket: 'code',
  max: 12,
  windowMs: 10 * 60 * 1000,
};

export const ADMIN_LOGIN_RULE: RateRule = {
  bucket: 'admin',
  max: 6,
  windowMs: 15 * 60 * 1000,
};

interface Counter {
  /** Nombre de tentatives dans la fenêtre courante. */
  c: number;
  /** Début de la fenêtre (epoch ms). */
  w: number;
}

export interface RateVerdict {
  allowed: boolean;
  retryAfterSeconds: number;
}

function counterKey(rule: RateRule, ip: string, pepper: string, now: number): string {
  const day = Math.floor(now / 86_400_000);
  return keys.rateLimit(shortFingerprint(`${rule.bucket}|${ip}|${day}`, pepper));
}

async function readCounter(
  store: StoreLike,
  key: string,
  rule: RateRule,
  now: number,
): Promise<Counter | null> {
  try {
    const counter = (await store.get(key, { type: 'json' })) as Counter | null;
    if (!counter || typeof counter.w !== 'number' || typeof counter.c !== 'number') return null;
    // Fenêtre expirée : le compteur repart de zéro.
    if (now - counter.w >= rule.windowMs) return null;
    return counter;
  } catch {
    // Si le compteur est inaccessible, on laisse passer : mieux vaut un site qui
    // fonctionne qu'un vote bloqué par une limite qu'on ne sait pas lire.
    return null;
  }
}

/**
 * Consulte la limite sans la consommer.
 *
 * Seules les tentatives *ratées* sont comptées (voir recordFailure) : un votant
 * qui enchaîne ses 56 catégories avec un code valide n'est donc jamais ralenti.
 */
export async function peekRateLimit(
  store: StoreLike,
  rule: RateRule,
  ip: string,
  pepper: string,
  now: number = Date.now(),
): Promise<RateVerdict> {
  const counter = await readCounter(store, counterKey(rule, ip, pepper, now), rule, now);
  if (!counter || counter.c < rule.max) return { allowed: true, retryAfterSeconds: 0 };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((counter.w + rule.windowMs - now) / 1000)),
  };
}

/** Compte une tentative ratée (code inconnu, mot de passe refusé). */
export async function recordFailure(
  store: StoreLike,
  rule: RateRule,
  ip: string,
  pepper: string,
  now: number = Date.now(),
): Promise<void> {
  const key = counterKey(rule, ip, pepper, now);
  const existing = await readCounter(store, key, rule, now);
  const counter: Counter = existing ? { c: existing.c + 1, w: existing.w } : { c: 1, w: now };
  try {
    // L'expiration est portée par la valeur ; la métadonnée sert au balayage.
    await store.setJSON(key, counter, { metadata: { exp: counter.w + rule.windowMs } });
  } catch {
    // Une écriture ratée ne doit pas empêcher de voter.
  }
}

/** Supprime les compteurs dont la fenêtre est passée depuis plus d'un jour. */
export async function sweepRateLimits(store: StoreLike, now: number = Date.now()): Promise<number> {
  const { blobs } = await store.list({ prefix: keys.rateLimit('') });
  let removed = 0;
  for (const blob of blobs) {
    const found = await store.getWithMetadata(blob.key, { type: 'json' });
    const exp = Number(found?.metadata?.exp ?? 0);
    if (!exp || now - exp > 86_400_000) {
      await store.delete(blob.key);
      removed += 1;
    }
  }
  return removed;
}
