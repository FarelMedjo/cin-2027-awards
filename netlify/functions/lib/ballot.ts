/**
 * Vote, modification et retrait — le cœur du site.
 *
 * Deux objets, délibérément séparés :
 *
 *   votes/<catégorie>/<uuid>  ne contient QUE les nominés choisis. Pas de code,
 *                             pas d'identifiant de code, pas d'IP, pas d'heure.
 *                             Deux lignes d'un même votant sont donc impossibles
 *                             à rapprocher, même en lisant tout le stockage.
 *
 *   voters/<id du code>       dit quelle ligne appartient à ce code, et ce qui y
 *                             a été choisi (pour le réafficher au retour). Chiffré
 *                             avec une clé dérivée du code : sans le ticket, ce
 *                             bloc est illisible.
 *
 * Les résultats se calculent en comptant les lignes, jamais via un compteur
 * partagé : aucune écriture concurrente n'entre donc en collision.
 */

import type { Ballot } from '../../../shared/types.ts';
import { decryptDossier, encryptDossier, newRowId } from './crypto.ts';
import { keys, parseVoteKey, toArrayBuffer, type StoreLike } from './store.ts';

/** Contenu déchiffré d'un dossier votant. */
export interface Dossier {
  /** Par catégorie : l'uuid de la ligne de vote et le choix fait. */
  v: Record<string, { id: string; n: string[] }>;
  /**
   * Clés complètes des lignes de vote à supprimer.
   *
   * Une modification de vote crée la nouvelle ligne, engage le dossier, puis
   * supprime l'ancienne. Si cette dernière suppression échoue (fonction coupée,
   * réseau), la référence reste ici et la prochaine opération du même votant la
   * rattrape. Les suppressions sont idempotentes.
   */
  gc: string[];
}

/** Identifiants du votant pour la durée d'une requête. Jamais persistés. */
export interface VoterContext {
  /** HMAC du code : c'est la clé du dossier. */
  codeId: string;
  /** Clé AES-256 dérivée du code. */
  dossierKey: Buffer;
}

export class DossierUnreadableError extends Error {
  code = 'dossier_unreadable';
  constructor() {
    super('Le dossier de ce code est illisible.');
  }
}

export class WriteConflictError extends Error {
  code = 'write_conflict';
  constructor() {
    super('Vote non enregistré : trop de modifications simultanées. Réessaie.');
  }
}

/** Nombre de reprises en cas de conflit d'écriture (deux onglets, même code). */
const MAX_ATTEMPTS = 5;

function emptyDossier(): Dossier {
  return { v: {}, gc: [] };
}

async function loadDossier(
  store: StoreLike,
  ctx: VoterContext,
): Promise<{ dossier: Dossier; etag: string | null }> {
  const found = await store.getWithMetadata(keys.voter(ctx.codeId), { type: 'arrayBuffer' });
  if (!found || !found.data) return { dossier: emptyDossier(), etag: null };
  const decrypted = decryptDossier<Partial<Dossier>>(
    new Uint8Array(found.data as ArrayBuffer),
    ctx.dossierKey,
  );
  if (!decrypted || typeof decrypted !== 'object') throw new DossierUnreadableError();
  return {
    dossier: {
      v: decrypted.v && typeof decrypted.v === 'object' ? decrypted.v : {},
      gc: Array.isArray(decrypted.gc) ? decrypted.gc : [],
    },
    etag: found.etag,
  };
}

/** Écrit le dossier. Renvoie false si l'écriture conditionnelle a été refusée. */
async function commitDossier(
  store: StoreLike,
  ctx: VoterContext,
  dossier: Dossier,
  etag: string | null,
): Promise<boolean> {
  const payload = toArrayBuffer(encryptDossier(dossier, ctx.dossierKey));
  // Aucune métadonnée : rien de temporel ne doit accompagner un dossier votant.
  const result = await store.set(
    keys.voter(ctx.codeId),
    payload,
    etag ? { onlyIfMatch: etag } : { onlyIfNew: true },
  );
  return result.modified;
}

/**
 * Supprime les lignes en attente. Idempotent : les références restent dans le
 * dossier et seront vidées lors de la prochaine écriture de celui-ci.
 */
async function deletePendingRows(store: StoreLike, rowKeys: string[]): Promise<void> {
  for (const rowKey of rowKeys) {
    // Le dossier est chiffré et authentifié, mais on ne supprime quand même
    // qu'une clé de la forme attendue : une entrée abîmée ne doit pas pouvoir
    // faire effacer l'état de l'élection.
    if (!parseVoteKey(rowKey)) continue;
    try {
      await store.delete(rowKey);
    } catch {
      // Sans conséquence : on retentera à la prochaine opération du votant.
    }
  }
}

export function toBallot(dossier: Dossier): Ballot {
  const ballot: Ballot = {};
  for (const [categoryId, entry] of Object.entries(dossier.v)) {
    ballot[categoryId] = { nomineeIds: entry.n };
  }
  return ballot;
}

/** Lit les votes d'un code. Répare au passage les lignes restées en attente. */
export async function loadBallot(store: StoreLike, ctx: VoterContext): Promise<Ballot> {
  const { dossier } = await loadDossier(store, ctx);
  if (dossier.gc.length) await deletePendingRows(store, dossier.gc);
  return toBallot(dossier);
}

/**
 * Enregistre ou modifie le vote d'un code dans une catégorie.
 *
 * Ordre des opérations, choisi pour qu'aucune défaillance ne fasse perdre ni
 * compter deux fois une voix :
 *   1. créer la nouvelle ligne de vote (nouvel uuid) ;
 *   2. engager le dossier en écriture conditionnelle ;
 *   3. seulement ensuite, supprimer l'ancienne ligne.
 *
 * Si l'étape 2 est refusée (un autre onglet a écrit entre-temps), la ligne
 * créée à l'étape 1 est supprimée avant de recommencer : une catégorie ne peut
 * donc jamais contenir deux lignes pour le même code.
 */
export async function castVote(
  store: StoreLike,
  ctx: VoterContext,
  categoryId: string,
  nomineeIds: string[],
): Promise<Ballot> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { dossier, etag } = await loadDossier(store, ctx);
    if (dossier.gc.length) {
      await deletePendingRows(store, dossier.gc);
      dossier.gc = [];
    }

    const previous = dossier.v[categoryId];
    const rowId = newRowId();
    const rowKey = keys.voteRow(categoryId, nomineeIds, rowId);
    await store.setJSON(rowKey, { n: nomineeIds });

    dossier.v[categoryId] = { id: rowId, n: nomineeIds };
    if (previous) dossier.gc.push(keys.voteRow(categoryId, previous.n, previous.id));

    if (await commitDossier(store, ctx, dossier, etag)) {
      await deletePendingRows(store, dossier.gc);
      return toBallot(dossier);
    }

    // Conflit : la ligne tout juste créée n'est référencée par personne.
    await store.delete(rowKey);
  }
  throw new WriteConflictError();
}

/** Retire le vote d'un code dans une catégorie. */
export async function removeVote(
  store: StoreLike,
  ctx: VoterContext,
  categoryId: string,
): Promise<Ballot> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { dossier, etag } = await loadDossier(store, ctx);
    if (dossier.gc.length) {
      await deletePendingRows(store, dossier.gc);
      dossier.gc = [];
    }

    const current = dossier.v[categoryId];
    if (!current) return toBallot(dossier);

    delete dossier.v[categoryId];
    dossier.gc.push(keys.voteRow(categoryId, current.n, current.id));

    if (await commitDossier(store, ctx, dossier, etag)) {
      await deletePendingRows(store, dossier.gc);
      return toBallot(dossier);
    }
  }
  throw new WriteConflictError();
}
