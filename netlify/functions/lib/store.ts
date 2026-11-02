/**
 * Accès au stockage Netlify Blobs.
 *
 * Un seul store, segmenté par préfixes de clés :
 *
 *   codes/<id>                   existence = code valide. Aucun lien avec une personne.
 *   voters/<id>                  dossier votant chiffré (AES-256-GCM). Illisible sans le code.
 *   votes/<categorie>/<choix>/<uuid v4>
 *                                une ligne de vote. <choix> est la liste triée des
 *                                nominés choisis (« n03 », ou « n03+n11 » pour un duo).
 *   election/state               ouvert/fermé + date de clôture automatique.
 *   election/ceremony            ordre de révélation choisi pour la cérémonie.
 *   election/categories          catégories ajoutées par l'administrateur, en plus de
 *                                celles de data/categories.json.
 *   rl/<empreinte>               limitation de débit, durée de vie courte.
 *   admin/sessions/<empreinte>   sessions administrateur.
 *
 * La dernière partie de la clé d'une ligne de vote est un UUID v4, donc purement
 * aléatoire : trier les clés d'une catégorie ne révèle pas l'ordre dans lequel
 * les votes sont arrivés. (Un UUID v7, lui, encode l'heure de création : il est
 * ici à proscrire.)
 *
 * Le choix figure dans la clé, et pas seulement dans le contenu de la ligne :
 * le dépouillement se fait alors par un simple listage par préfixe, sans lire
 * les milliers de lignes une par une. L'anonymat est inchangé — une ligne ne
 * contient toujours rien qui désigne un votant — et le comptage tient dans le
 * temps d'exécution d'une fonction.
 */

export const STORE_NAME = 'cin2027';

export type BlobType = 'text' | 'json' | 'arrayBuffer';

export interface ReadOptions {
  type?: BlobType;
}

export interface WriteOptions {
  /** N'écrit que si la clé n'existe pas encore. */
  onlyIfNew?: boolean;
  /** N'écrit que si la clé existe et que son ETag correspond. */
  onlyIfMatch?: string;
  metadata?: Record<string, unknown>;
}

export interface WriteResult {
  modified: boolean;
  etag?: string;
}

export interface WithMetadata<T = unknown> {
  data: T;
  etag: string;
  metadata: Record<string, unknown>;
}

export interface ListResult {
  blobs: Array<{ key: string; etag?: string }>;
  directories?: string[];
}

/**
 * Sous-ensemble de l'API Netlify Blobs réellement utilisé.
 *
 * Les tests fournissent une implémentation en mémoire conforme à ce contrat,
 * y compris la sémantique de onlyIfNew / onlyIfMatch.
 */
export interface StoreLike {
  get(key: string, options?: ReadOptions): Promise<unknown>;
  getWithMetadata(key: string, options?: ReadOptions): Promise<WithMetadata | null>;
  set(key: string, value: string | ArrayBuffer, options?: WriteOptions): Promise<WriteResult>;
  setJSON(key: string, value: unknown, options?: WriteOptions): Promise<WriteResult>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; directories?: boolean }): Promise<ListResult>;
}

export const keys = {
  code: (id: string) => `codes/${id}`,
  codesPrefix: 'codes/',
  voter: (id: string) => `voters/${id}`,
  votersPrefix: 'voters/',
  voteRow: (categoryId: string, nomineeIds: readonly string[], rowId: string) =>
    `votes/${categoryId}/${[...nomineeIds].sort().join('+')}/${rowId}`,
  votesPrefix: (categoryId?: string) => (categoryId ? `votes/${categoryId}/` : 'votes/'),
  state: 'election/state',
  ceremony: 'election/ceremony',
  customCategories: 'election/categories',
  rateLimit: (fingerprint: string) => `rl/${fingerprint}`,
  adminSession: (fingerprint: string) => `admin/sessions/${fingerprint}`,
  adminSessionsPrefix: 'admin/sessions/',
} as const;

/** Décompose la clé d'une ligne de vote. Renvoie null si la clé est inattendue. */
export function parseVoteKey(
  key: string,
): { categoryId: string; nomineeIds: string[]; rowId: string } | null {
  const parts = key.split('/');
  if (parts.length !== 4 || parts[0] !== 'votes') return null;
  const [, categoryId, selection, rowId] = parts;
  if (!categoryId || !selection || !rowId) return null;
  return { categoryId, nomineeIds: selection.split('+'), rowId };
}

/** Netlify Blobs accepte une chaîne ou un ArrayBuffer, pas un Buffer Node. */
export function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/** Compte les clés portant un préfixe donné. */
export async function countByPrefix(store: StoreLike, prefix: string): Promise<number> {
  const { blobs } = await store.list({ prefix });
  return blobs.length;
}

/** Supprime toutes les clés portant un préfixe donné. Renvoie le nombre supprimé. */
export async function deleteByPrefix(store: StoreLike, prefix: string): Promise<number> {
  const { blobs } = await store.list({ prefix });
  let deleted = 0;
  // En série : un lot de suppressions simultanées sur Blobs se fait étrangler,
  // et il n'y a ici que quelques centaines de clés au maximum.
  for (const blob of blobs) {
    await store.delete(blob.key);
    deleted += 1;
  }
  return deleted;
}
