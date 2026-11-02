/**
 * GET /api/state — état public de l'élection (ouvert/fermé, clôture, heure serveur)
 * et catégories ajoutées par l'administrateur, que le front ajoute à celles de
 * data/categories.json.
 */

import type { Config } from '@netlify/functions';
import { readCustomCategories } from './lib/categories.ts';
import { readState, toPublicState } from './lib/election.ts';
import { errorResponse, jsonResponse } from './lib/http.ts';
import { openStore } from './lib/blobs.ts';

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'GET') return errorResponse('Méthode non autorisée.', 405, 'bad_method');
  try {
    const store = await openStore();
    const [state, customCategories] = await Promise.all([
      readState(store),
      readCustomCategories(store),
    ]);
    return jsonResponse({ ...toPublicState(state), customCategories });
  } catch (error) {
    console.error('[state] erreur interne', error instanceof Error ? error.stack : 'inconnue');
    return errorResponse('Le serveur est momentanément indisponible.', 500, 'server_error');
  }
};

export const config: Config = { path: '/api/state' };
