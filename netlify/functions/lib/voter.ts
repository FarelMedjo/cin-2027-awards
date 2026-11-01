/**
 * Reconnaissance d'un votant à partir de son code.
 *
 * Le code arrive dans le corps d'une requête POST — jamais dans une URL, pour
 * qu'il n'apparaisse ni dans les journaux d'accès, ni dans l'historique du
 * navigateur, ni dans un en-tête Referer. Il est utilisé puis oublié : rien
 * n'est mis en session côté serveur.
 */

import type { VoterContext } from './ballot.ts';
import { codeId, deriveDossierKey, normalizeCode } from './crypto.ts';
import { clientIp, errorResponse } from './http.ts';
import { CODE_CHECK_RULE, peekRateLimit, recordFailure } from './ratelimit.ts';
import { keys, type StoreLike } from './store.ts';

export type VoterAuth = { ok: true; ctx: VoterContext } | { ok: false; response: Response };

const INVALID_MESSAGE = 'Ce code ne correspond à aucun ticket. Vérifie les caractères saisis.';

export async function authenticateVoter(
  store: StoreLike,
  req: Request,
  rawCode: unknown,
  pepper: string,
): Promise<VoterAuth> {
  const ip = clientIp(req);

  const verdict = await peekRateLimit(store, CODE_CHECK_RULE, ip, pepper);
  if (!verdict.allowed) {
    return {
      ok: false,
      response: errorResponse(
        'Trop de codes refusés depuis cet appareil. Patiente quelques minutes.',
        429,
        'rate_limited',
        { 'retry-after': String(verdict.retryAfterSeconds) },
      ),
    };
  }

  const normalized = normalizeCode(rawCode);
  if (!normalized) {
    await recordFailure(store, CODE_CHECK_RULE, ip, pepper);
    return { ok: false, response: errorResponse(INVALID_MESSAGE, 401, 'invalid_code') };
  }

  const id = codeId(normalized, pepper);
  const known = await store.get(keys.code(id), { type: 'json' });
  if (!known) {
    await recordFailure(store, CODE_CHECK_RULE, ip, pepper);
    return { ok: false, response: errorResponse(INVALID_MESSAGE, 401, 'invalid_code') };
  }

  return { ok: true, ctx: { codeId: id, dossierKey: deriveDossierKey(normalized, pepper) } };
}
