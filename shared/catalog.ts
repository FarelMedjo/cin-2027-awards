/**
 * Catalogue des categories et des nomines.
 *
 * Les deux fichiers JSON de data/ sont la seule source de verite : ils sont
 * inlines dans le bundle du front comme dans celui des fonctions, ce qui evite
 * toute lecture de fichier a l'execution. Modifier data/*.json et redeployer
 * suffit donc a changer les categories ou les noms affiches.
 */

import categoriesJson from '../data/categories.json' with { type: 'json' };
import nomineesJson from '../data/nominees.json' with { type: 'json' };
import type { Category, Nominee } from './types.ts';

function buildNominees(): Nominee[] {
  const raw = nomineesJson as Array<{ id: string; fullName: string; displayName?: string }>;
  const seen = new Set<string>();
  const list = raw.map((n) => {
    if (!n.id || !n.fullName) {
      throw new Error(`data/nominees.json : entree incomplete (${JSON.stringify(n)})`);
    }
    if (seen.has(n.id)) {
      throw new Error(`data/nominees.json : identifiant en double "${n.id}"`);
    }
    seen.add(n.id);
    return {
      id: n.id,
      fullName: n.fullName,
      displayName: (n.displayName ?? n.fullName).trim() || n.fullName,
    };
  });
  // Tri alphabetique francais, utilise partout a l'affichage.
  return list.sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
}

function buildCategories(validIds: Set<string>): Category[] {
  const raw = categoriesJson as Category[];
  const seen = new Set<string>();
  return raw.map((c) => {
    if (!c.id || !c.title || !c.theme) {
      throw new Error(`data/categories.json : entree incomplete (${JSON.stringify(c.id ?? c)})`);
    }
    if (seen.has(c.id)) {
      throw new Error(`data/categories.json : identifiant en double "${c.id}"`);
    }
    seen.add(c.id);
    if (c.type !== 'single' && c.type !== 'duo') {
      throw new Error(`data/categories.json : "${c.id}" a un type invalide "${c.type}"`);
    }
    for (const excluded of c.excludedNominees ?? []) {
      if (!validIds.has(excluded)) {
        throw new Error(
          `data/categories.json : "${c.id}" exclut "${excluded}", qui n'existe pas dans data/nominees.json`,
        );
      }
    }
    return { ...c, description: c.description ?? '', excludedNominees: c.excludedNominees ?? [] };
  });
}

export const NOMINEES: readonly Nominee[] = buildNominees();
export const NOMINEE_BY_ID: ReadonlyMap<string, Nominee> = new Map(NOMINEES.map((n) => [n.id, n]));

export const CATEGORIES: readonly Category[] = buildCategories(new Set(NOMINEE_BY_ID.keys()));
export const CATEGORY_BY_ID: ReadonlyMap<string, Category> = new Map(
  CATEGORIES.map((c) => [c.id, c]),
);

/** Themes dans leur ordre d'apparition dans data/categories.json. */
export const THEMES: readonly string[] = CATEGORIES.reduce<string[]>((acc, c) => {
  if (!acc.includes(c.theme)) acc.push(c.theme);
  return acc;
}, []);

/** Nombre de personnes a choisir dans une categorie. */
export function requiredChoices(category: Category): number {
  return category.type === 'duo' ? 2 : 1;
}

/** Nomines selectionnables dans une categorie, deja tries. */
export function nomineesForCategory(category: Category): Nominee[] {
  const excluded = new Set(category.excludedNominees ?? []);
  return NOMINEES.filter((n) => !excluded.has(n.id));
}

export function displayName(nomineeId: string): string {
  return NOMINEE_BY_ID.get(nomineeId)?.displayName ?? nomineeId;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string; code: string };

/** Garde-fou : nombre maximal de catégories ajoutées par l'administrateur. */
export const MAX_CUSTOM_CATEGORIES = 40;

/** Identifiant sûr (a-z, 0-9, tirets) tiré d'un titre : il entre dans les clés de vote et dans l'URL. */
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

function normalizeTitle(title: string): string {
  return slugify(title);
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

/**
 * Valide une catégorie saisie par l'administrateur et lui attribue un identifiant
 * unique. `existing` est l'ensemble des catégories déjà connues (fichier + ajoutées).
 */
export function buildCustomCategory(
  input: unknown,
  existing: readonly Category[],
): Validation<Category> {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'Catégorie invalide.', code: 'invalid_category' };
  }
  const raw = input as Record<string, unknown>;

  const title = cleanText(raw.title, 80);
  if (!title || title.length < 3) {
    return {
      ok: false,
      error: 'Le titre doit faire entre 3 et 80 caractères.',
      code: 'invalid_title',
    };
  }
  const theme = cleanText(raw.theme, 60);
  if (!theme || theme.length < 2) {
    return {
      ok: false,
      error: 'Le thème doit faire entre 2 et 60 caractères.',
      code: 'invalid_theme',
    };
  }
  const description = raw.description === undefined ? '' : cleanText(raw.description, 200);
  if (description === null) {
    return {
      ok: false,
      error: 'La description ne peut pas dépasser 200 caractères.',
      code: 'invalid_description',
    };
  }
  if (raw.type !== 'single' && raw.type !== 'duo') {
    return { ok: false, error: 'Le type de catégorie est invalide.', code: 'invalid_type' };
  }

  const wanted = normalizeTitle(title);
  if (!wanted) {
    return {
      ok: false,
      error: 'Le titre doit contenir des lettres ou des chiffres.',
      code: 'invalid_title',
    };
  }
  if (existing.some((c) => normalizeTitle(c.title) === wanted)) {
    return { ok: false, error: 'Une catégorie porte déjà ce titre.', code: 'duplicate_title' };
  }

  const taken = new Set(existing.map((c) => c.id));
  let id = wanted;
  for (let suffix = 2; taken.has(id); suffix += 1) id = `${wanted}-${suffix}`;

  // Un thème déjà présent garde son orthographe exacte, pour ne pas en créer un double.
  const knownTheme = existing.find((c) => c.theme.toLowerCase() === theme.toLowerCase())?.theme;

  return {
    ok: true,
    value: { id, title, theme: knownTheme ?? theme, description, type: raw.type, excludedNominees: [] },
  };
}

/**
 * Valide une selection contre les fichiers de donnees.
 *
 * Renvoie les identifiants tries : pour une categorie "duo", cela rend le
 * comptage par paire independant de l'ordre de selection.
 */
export function validateSelection(categoryId: string, nomineeIds: unknown): Validation<string[]> {
  const category = CATEGORY_BY_ID.get(categoryId);
  if (!category) {
    return { ok: false, error: 'Cette catégorie n’existe pas.', code: 'unknown_category' };
  }
  return validateSelectionFor(category, nomineeIds);
}

/** Même validation, pour une catégorie déjà résolue. */
export function validateSelectionFor(
  category: Category,
  nomineeIds: unknown,
): Validation<string[]> {
  if (!Array.isArray(nomineeIds) || nomineeIds.some((id) => typeof id !== 'string')) {
    return { ok: false, error: 'Sélection invalide.', code: 'invalid_selection' };
  }
  const ids = nomineeIds as string[];
  const expected = requiredChoices(category);
  if (ids.length !== expected) {
    return {
      ok: false,
      error:
        expected === 2
          ? 'Cette catégorie demande exactement deux personnes différentes.'
          : 'Cette catégorie demande exactement une personne.',
      code: 'wrong_count',
    };
  }
  if (new Set(ids).size !== ids.length) {
    return {
      ok: false,
      error: 'Il faut choisir deux personnes différentes.',
      code: 'duplicate_choice',
    };
  }
  const excluded = new Set(category.excludedNominees ?? []);
  for (const id of ids) {
    if (!NOMINEE_BY_ID.has(id)) {
      return { ok: false, error: 'Cette personne n’existe pas.', code: 'unknown_nominee' };
    }
    if (excluded.has(id)) {
      return {
        ok: false,
        error: 'Cette personne ne figure pas dans cette catégorie.',
        code: 'excluded_nominee',
      };
    }
  }
  return { ok: true, value: [...ids].sort() };
}
