/**
 * Catégories ajoutées par l'administrateur.
 *
 * data/categories.json reste la base, inlinée dans le bundle. Les catégories
 * créées depuis l'espace administrateur vivent dans le store, sous une seule clé,
 * et s'y ajoutent : chaque requête qui a besoin de la liste complète passe par
 * ce module plutôt que par CATEGORIES.
 */

import {
  buildCustomCategory,
  CATEGORIES,
  CATEGORY_BY_ID,
  MAX_CUSTOM_CATEGORIES,
  type Validation,
} from '../../../shared/catalog.ts';
import type { Category } from '../../../shared/types.ts';
import { keys, type StoreLike } from './store.ts';

/** Tentatives d'écriture conditionnelle avant d'abandonner. */
const MAX_WRITE_ATTEMPTS = 4;

/** Relit une entrée du store sans lui faire confiance : tout ce qui est douteux est écarté. */
function parseStored(raw: unknown): Category[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(CATEGORIES.map((c) => c.id));
  const result: Category[] = [];
  for (const item of raw) {
    const c = item as Partial<Category> | null;
    if (
      !c ||
      typeof c.id !== 'string' ||
      !/^[a-z0-9-]+$/.test(c.id) ||
      seen.has(c.id) ||
      typeof c.title !== 'string' ||
      !c.title ||
      typeof c.theme !== 'string' ||
      !c.theme ||
      (c.type !== 'single' && c.type !== 'duo')
    ) {
      continue;
    }
    seen.add(c.id);
    result.push({
      id: c.id,
      title: c.title,
      theme: c.theme,
      description: typeof c.description === 'string' ? c.description : '',
      type: c.type,
      excludedNominees: [],
    });
  }
  return result;
}

export async function readCustomCategories(store: StoreLike): Promise<Category[]> {
  return parseStored(await store.get(keys.customCategories, { type: 'json' }));
}

/** Catégories du fichier, puis celles ajoutées, dans l'ordre de création. */
export async function listCategories(store: StoreLike): Promise<Category[]> {
  return [...CATEGORIES, ...(await readCustomCategories(store))];
}

/** Cherche une catégorie ; le store n'est lu que si l'identifiant n'est pas dans le fichier. */
export async function findCategory(store: StoreLike, id: string): Promise<Category | undefined> {
  const fromFile = CATEGORY_BY_ID.get(id);
  if (fromFile) return fromFile;
  return (await readCustomCategories(store)).find((c) => c.id === id);
}

/**
 * Ajoute une catégorie. L'écriture est conditionnelle (ETag) : deux ajouts
 * simultanés ne s'écrasent pas, le second relit la liste et réessaie.
 */
export async function addCustomCategory(
  store: StoreLike,
  input: unknown,
): Promise<Validation<Category>> {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const current = await store.getWithMetadata(keys.customCategories, { type: 'json' });
    const custom = parseStored(current?.data ?? null);

    if (custom.length >= MAX_CUSTOM_CATEGORIES) {
      return {
        ok: false,
        error: `Tu as atteint la limite de ${MAX_CUSTOM_CATEGORIES} catégories ajoutées.`,
        code: 'too_many_categories',
      };
    }

    const built = buildCustomCategory(input, [...CATEGORIES, ...custom]);
    if (!built.ok) return built;

    const written = await store.setJSON(
      keys.customCategories,
      [...custom, built.value],
      current ? { onlyIfMatch: current.etag } : { onlyIfNew: true },
    );
    if (written.modified) return built;
  }
  return {
    ok: false,
    error: 'Une autre modification est en cours. Réessaie dans un instant.',
    code: 'write_conflict',
  };
}
