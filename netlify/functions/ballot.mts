/**
 * POST /api/ballot — tout le parcours du votant.
 *
 *   { action: "load",  code }                        -> ses votes actuels
 *   { action: "cast",  code, categoryId, nomineeIds} -> enregistre ou modifie un vote
 *   { action: "clear", code, categoryId }            -> retire un vote
 *
 * Chaque appel est indépendant : le vote est enregistré catégorie par catégorie,
 * donc rien n'est perdu si le votant ferme le site.
 *
 * Aucun console.log de cette fonction ne contient de code, d'identifiant de code
 * ni de contenu de vote.
 */

import type { Config } from '@netlify/functions';
import {
  ALL_CATEGORY_BY_ID,
  ARCHIVED_CATEGORY_MESSAGE,
  validateSelectionFor,
} from '../../shared/catalog.ts';
import {
  castVote,
  DossierUnreadableError,
  loadBallot,
  removeVote,
  WriteConflictError,
} from './lib/ballot.ts';
import { findCategory } from './lib/categories.ts';
import { isVotingOpen, readState, toPublicState } from './lib/election.ts';
import { errorResponse, jsonResponse, readJson, requireEnv } from './lib/http.ts';
import { openStore } from './lib/blobs.ts';
import { authenticateVoter } from './lib/voter.ts';

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return errorResponse('Méthode non autorisée.', 405, 'bad_method');

  let pepper: string;
  try {
    pepper = requireEnv('TOKEN_PEPPER');
  } catch {
    console.error('[ballot] TOKEN_PEPPER manquant');
    return errorResponse(
      "Le site n'est pas encore configuré. Préviens l'organisateur.",
      500,
      'misconfigured',
    );
  }

  const body = await readJson(req);
  if (!body) return errorResponse('Requête invalide.', 400, 'bad_request');

  const store = await openStore();

  try {
    const auth = await authenticateVoter(store, req, body.code, pepper);
    if (!auth.ok) return auth.response;

    const state = await readState(store);
    const publicState = toPublicState(state);
    const action = body.action;

    if (action === 'load') {
      return jsonResponse({ ballot: await loadBallot(store, auth.ctx), state: publicState });
    }

    if (!isVotingOpen(state)) {
      return errorResponse(
        'Les votes sont fermés : tes choix restent visibles mais ne peuvent plus changer.',
        409,
        'voting_closed',
      );
    }

    const categoryId = typeof body.categoryId === 'string' ? body.categoryId : '';
    const category = await findCategory(store, categoryId);
    if (!category) {
      // Catégorie masquée : ses votes sont conservés tels quels, ni modifiables
      // ni retirables, pour que son décompte ne bouge plus.
      if (ALL_CATEGORY_BY_ID.has(categoryId)) {
        return errorResponse(ARCHIVED_CATEGORY_MESSAGE, 409, 'category_archived');
      }
      return errorResponse('Cette catégorie n’existe pas.', 400, 'unknown_category');
    }

    if (action === 'cast') {
      const validation = validateSelectionFor(category, body.nomineeIds);
      if (!validation.ok) return errorResponse(validation.error, 400, validation.code);
      const ballot = await castVote(store, auth.ctx, categoryId, validation.value);
      return jsonResponse({ ballot, state: publicState });
    }

    if (action === 'clear') {
      const ballot = await removeVote(store, auth.ctx, categoryId);
      return jsonResponse({ ballot, state: publicState });
    }

    return errorResponse('Action inconnue.', 400, 'unknown_action');
  } catch (error) {
    if (error instanceof WriteConflictError || error instanceof DossierUnreadableError) {
      return errorResponse(error.message, 409, error.code);
    }
    // Volontairement sans le corps de la requête : il contient le code du votant.
    console.error('[ballot] erreur interne', error instanceof Error ? error.stack : 'inconnue');
    return errorResponse('Le vote n’a pas pu être enregistré. Réessaie.', 500, 'server_error');
  }
};

export const config: Config = { path: '/api/ballot' };
