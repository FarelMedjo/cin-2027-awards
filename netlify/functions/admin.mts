/**
 * POST /api/admin — espace administrateur.
 *
 * Une seule fonction, une action par appel :
 *
 *   login / logout / status
 *   generate-codes   crée un lot de codes et les renvoie EN CLAIR, une seule fois
 *   open / close / schedule
 *   results          refusé tant que les votes ne sont pas fermés
 *   ceremony-get / ceremony-set
 *   category-add     ajoute une catégorie à celles de data/categories.json
 *   reset           remet l'élection à zéro (double confirmation côté serveur)
 *
 * Les codes en clair ne sont jamais stockés : le serveur n'en garde que le HMAC.
 * C'est donc la page d'administration qui construit le CSV, les tickets et les
 * QR codes, dans le navigateur, à partir de cette unique réponse.
 */

import type { Config } from '@netlify/functions';
import type { ElectionState } from '../../shared/types.ts';
import { addCustomCategory, listCategories, readCustomCategories } from './lib/categories.ts';
import { codeId, formatCode, generateCodeBody } from './lib/crypto.ts';
import { isVotingOpen, readState, toPublicState, writeState } from './lib/election.ts';
import { errorResponse, jsonResponse, readJson, requireEnv } from './lib/http.ts';
import { clientIp } from './lib/http.ts';
import { ADMIN_LOGIN_RULE, peekRateLimit, recordFailure, sweepRateLimits } from './lib/ratelimit.ts';
import { computeParticipation, computeResults, resultsToCsv } from './lib/results.ts';
import { createSession, destroySession, hasAdminSession, sweepSessions, verifyPassword } from './lib/session.ts';
import { openStore } from './lib/blobs.ts';
import { deleteByPrefix, keys, type StoreLike } from './lib/store.ts';

/** Nombre de codes par défaut, et garde-fou. */
const DEFAULT_CODE_COUNT = 45;
const MAX_CODE_COUNT = 200;
/** Fuseau du Cameroun : UTC+1, sans heure d'été. */
const DOUALA_OFFSET = '+01:00';

async function generateCodes(store: StoreLike, count: number, pepper: string): Promise<string[]> {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    // Collision d'un tirage sur 31^10 : invraisemblable, mais l'écriture
    // conditionnelle la rend simplement impossible.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const body = generateCodeBody();
      const written = await store.setJSON(keys.code(codeId(body, pepper)), { v: 1 }, { onlyIfNew: true });
      if (written.modified) {
        codes.push(formatCode(body));
        break;
      }
    }
  }
  return codes;
}

function parseClosesAt(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === '' || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string' || raw.length > 40) return { ok: false };
  // « 2026-11-15T18:00 » est compris comme une heure de Douala.
  const candidate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)
    ? `${raw}:00${DOUALA_OFFSET}`
    : raw;
  const parsed = Date.parse(candidate);
  if (Number.isNaN(parsed)) return { ok: false };
  return { ok: true, value: new Date(parsed).toISOString() };
}

async function readCeremonyOrder(store: StoreLike): Promise<string[]> {
  const [raw, categories] = await Promise.all([
    store.get(keys.ceremony, { type: 'json' }) as Promise<{ order?: unknown } | null>,
    listCategories(store),
  ]);
  const knownIds = new Set(categories.map((c) => c.id));
  const order = Array.isArray(raw?.order) ? (raw?.order as unknown[]) : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of order) {
    if (typeof id !== 'string' || seen.has(id) || !knownIds.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return errorResponse('Méthode non autorisée.', 405, 'bad_method');

  let pepper: string;
  try {
    pepper = requireEnv('TOKEN_PEPPER');
  } catch {
    console.error('[admin] TOKEN_PEPPER manquant');
    return errorResponse('TOKEN_PEPPER n’est pas configuré sur le site.', 500, 'misconfigured');
  }

  const body = await readJson(req);
  if (!body) return errorResponse('Requête invalide.', 400, 'bad_request');
  const action = typeof body.action === 'string' ? body.action : '';
  const store = await openStore();

  try {
    // ---- Connexion ----------------------------------------------------------
    if (action === 'login') {
      const ip = clientIp(req);
      const verdict = await peekRateLimit(store, ADMIN_LOGIN_RULE, ip, pepper);
      if (!verdict.allowed) {
        return errorResponse(
          'Trop de tentatives. Patiente quelques minutes.',
          429,
          'rate_limited',
          { 'retry-after': String(verdict.retryAfterSeconds) },
        );
      }
      let expected: string;
      try {
        expected = requireEnv('ADMIN_PASSWORD');
      } catch {
        console.error('[admin] ADMIN_PASSWORD manquant');
        return errorResponse('ADMIN_PASSWORD n’est pas configuré sur le site.', 500, 'misconfigured');
      }
      if (!verifyPassword(body.password, expected)) {
        await recordFailure(store, ADMIN_LOGIN_RULE, ip, pepper);
        return errorResponse('Mot de passe refusé.', 401, 'bad_password');
      }
      const cookie = await createSession(store, req, pepper);
      // Ménage opportuniste, pendant qu'on y est.
      await sweepSessions(store).catch(() => undefined);
      return jsonResponse({ ok: true }, 200, { 'set-cookie': cookie });
    }

    // ---- Tout le reste exige une session ------------------------------------
    if (!(await hasAdminSession(store, req, pepper))) {
      if (action === 'status') return jsonResponse({ authenticated: false });
      return errorResponse('Session expirée. Reconnecte-toi.', 401, 'unauthenticated');
    }

    if (action === 'logout') {
      const cookie = await destroySession(store, req, pepper);
      return jsonResponse({ ok: true }, 200, { 'set-cookie': cookie });
    }

    if (action === 'status') {
      const [state, participation, ceremonyOrder, customCategories] = await Promise.all([
        readState(store),
        computeParticipation(store),
        readCeremonyOrder(store),
        readCustomCategories(store),
      ]);
      return jsonResponse({
        authenticated: true,
        state: toPublicState(state),
        participation,
        ceremonyOrder,
        customCategories,
      });
    }

    if (action === 'generate-codes') {
      const requested = Number(body.count ?? DEFAULT_CODE_COUNT);
      if (!Number.isInteger(requested) || requested < 1 || requested > MAX_CODE_COUNT) {
        return errorResponse(`Indique un nombre de codes entre 1 et ${MAX_CODE_COUNT}.`, 400, 'bad_count');
      }
      const codes = await generateCodes(store, requested, pepper);
      // Seule réponse de tout le site à contenir des codes en clair.
      return jsonResponse({ codes, total: await computeParticipation(store).then((p) => p.codesGenerated) });
    }

    if (action === 'open' || action === 'close') {
      const current = await readState(store);
      const next: ElectionState = { ...current, isOpen: action === 'open' };
      await writeState(store, next);
      return jsonResponse({ state: toPublicState(next) });
    }

    if (action === 'schedule') {
      const parsed = parseClosesAt(body.closesAt);
      if (!parsed.ok) return errorResponse('Date de clôture illisible.', 400, 'bad_date');
      const current = await readState(store);
      const next: ElectionState = { ...current, closesAt: parsed.value };
      await writeState(store, next);
      return jsonResponse({ state: toPublicState(next) });
    }

    if (action === 'results' || action === 'results-csv') {
      const state = await readState(store);
      if (isVotingOpen(state)) {
        return errorResponse(
          'Les résultats ne sont consultables qu’après la clôture des votes.',
          409,
          'voting_still_open',
        );
      }
      const results = await computeResults(store);
      if (action === 'results-csv') {
        return jsonResponse({ csv: resultsToCsv(results) });
      }
      return jsonResponse({ results, state: toPublicState(state) });
    }

    if (action === 'ceremony-get') {
      const [order, categories] = await Promise.all([readCeremonyOrder(store), listCategories(store)]);
      return jsonResponse({
        order,
        categories: categories.map((c) => ({ id: c.id, title: c.title, theme: c.theme })),
      });
    }

    if (action === 'category-add') {
      const added = await addCustomCategory(store, body.category);
      if (!added.ok) {
        return errorResponse(added.error, added.code === 'write_conflict' ? 409 : 400, added.code);
      }
      return jsonResponse({ category: added.value });
    }

    if (action === 'ceremony-set') {
      const submitted = Array.isArray(body.order) ? body.order : null;
      if (!submitted) return errorResponse('Ordre de révélation invalide.', 400, 'bad_order');
      const knownIds = new Set((await listCategories(store)).map((c) => c.id));
      const seen = new Set<string>();
      const order: string[] = [];
      for (const id of submitted) {
        if (typeof id !== 'string' || seen.has(id) || !knownIds.has(id)) continue;
        seen.add(id);
        order.push(id);
      }
      await store.setJSON(keys.ceremony, { order });
      return jsonResponse({ order });
    }

    if (action === 'reset') {
      // Double confirmation : la case cochée du front, et ce mot exact.
      if (body.confirm !== 'REINITIALISER' || body.confirmTwice !== true) {
        return errorResponse('Réinitialisation non confirmée.', 400, 'not_confirmed');
      }
      const removed = {
        votes: await deleteByPrefix(store, keys.votesPrefix()),
        voters: await deleteByPrefix(store, keys.votersPrefix),
        codes: await deleteByPrefix(store, keys.codesPrefix),
      };
      await deleteByPrefix(store, keys.rateLimit(''));
      await writeState(store, { isOpen: false, closesAt: null });
      await store.setJSON(keys.ceremony, { order: [] });
      return jsonResponse({ ok: true, removed });
    }

    if (action === 'sweep') {
      const [sessions, counters] = await Promise.all([sweepSessions(store), sweepRateLimits(store)]);
      return jsonResponse({ sessions, counters });
    }

    return errorResponse('Action inconnue.', 400, 'unknown_action');
  } catch (error) {
    console.error('[admin] erreur interne', error instanceof Error ? error.stack : 'inconnue');
    return errorResponse('Le serveur a rencontré une erreur.', 500, 'server_error');
  }
};

export const config: Config = { path: '/api/admin' };
