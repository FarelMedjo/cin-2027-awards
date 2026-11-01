/**
 * Dépouillement.
 *
 * Tout se déduit du listage des clés `votes/<catégorie>/<choix>/<uuid>` : aucun
 * compteur partagé, donc aucune écriture concurrente à arbitrer, et le résultat
 * est toujours exactement le nombre de lignes présentes.
 */

import { CATEGORIES, CATEGORY_BY_ID, displayName } from '../../../shared/catalog.ts';
import type { CategoryResult, Participation, ResultRow } from '../../../shared/types.ts';
import { countByPrefix, keys, parseVoteKey, type StoreLike } from './store.ts';

/** categorie -> (choix trié « n03 » ou « n03+n11 ») -> nombre de voix. */
export type Tally = Map<string, Map<string, number>>;

export async function tallyVotes(store: StoreLike): Promise<Tally> {
  const { blobs } = await store.list({ prefix: keys.votesPrefix() });
  const tally: Tally = new Map();
  for (const blob of blobs) {
    const parsed = parseVoteKey(blob.key);
    if (!parsed) continue;
    // Une catégorie retirée de data/categories.json après un vote ne doit pas
    // faire échouer le dépouillement : ses lignes sont simplement ignorées.
    if (!CATEGORY_BY_ID.has(parsed.categoryId)) continue;
    const selection = [...parsed.nomineeIds].sort().join('+');
    const perCategory = tally.get(parsed.categoryId) ?? new Map<string, number>();
    perCategory.set(selection, (perCategory.get(selection) ?? 0) + 1);
    tally.set(parsed.categoryId, perCategory);
  }
  return tally;
}

/**
 * Classe les choix d'une catégorie.
 *
 * Les ex aequo partagent le même rang et sont marqués comme tels ; à nombre de
 * voix égal, l'ordre d'affichage est alphabétique, pour qu'il ne suggère aucune
 * hiérarchie entre eux.
 */
export function rankSelections(selections: Map<string, number>): ResultRow[] {
  const entries = [...selections.entries()].map(([selection, votes]) => {
    const nomineeIds = selection.split('+');
    return { nomineeIds, names: nomineeIds.map(displayName), votes };
  });

  entries.sort((a, b) => b.votes - a.votes || a.names.join(' ').localeCompare(b.names.join(' '), 'fr'));

  const countsByVotes = new Map<number, number>();
  for (const entry of entries) {
    countsByVotes.set(entry.votes, (countsByVotes.get(entry.votes) ?? 0) + 1);
  }

  const rows: ResultRow[] = [];
  let rank = 0;
  let previousVotes: number | null = null;
  entries.forEach((entry, index) => {
    if (previousVotes === null || entry.votes !== previousVotes) {
      rank = index + 1;
      previousVotes = entry.votes;
    }
    rows.push({
      nomineeIds: entry.nomineeIds,
      names: entry.names,
      votes: entry.votes,
      rank,
      tied: (countsByVotes.get(entry.votes) ?? 0) > 1,
    });
  });
  return rows;
}

/** Résultats complets, dans l'ordre de data/categories.json. */
export async function computeResults(store: StoreLike): Promise<CategoryResult[]> {
  const tally = await tallyVotes(store);
  return CATEGORIES.map((category) => {
    const rows = rankSelections(tally.get(category.id) ?? new Map());
    return {
      categoryId: category.id,
      title: category.title,
      theme: category.theme,
      type: category.type,
      totalVotes: rows.reduce((sum, row) => sum + row.votes, 0),
      rows,
    };
  });
}

/** Participation : combien de codes, combien ont voté, combien de voix par catégorie. */
export async function computeParticipation(store: StoreLike): Promise<Participation> {
  const [codesGenerated, codesUsed, tally] = await Promise.all([
    countByPrefix(store, keys.codesPrefix),
    countByPrefix(store, keys.votersPrefix),
    tallyVotes(store),
  ]);

  const votesByCategory: Record<string, number> = {};
  let totalVotes = 0;
  const warnings: string[] = [];

  for (const category of CATEGORIES) {
    const perCategory = tally.get(category.id);
    const count = perCategory ? [...perCategory.values()].reduce((a, b) => a + b, 0) : 0;
    votesByCategory[category.id] = count;
    totalVotes += count;
    // Contrôle de cohérence : une catégorie ne peut pas avoir plus de lignes de
    // vote que de codes ayant voté au moins une fois.
    if (count > codesUsed) {
      warnings.push(
        `« ${category.title} » compte ${count} lignes de vote pour seulement ${codesUsed} code(s) ayant voté.`,
      );
    }
  }

  return { codesGenerated, codesUsed, votesByCategory, totalVotes, warnings };
}

/** Export CSV des résultats agrégés. Point-virgule : Excel en français l'ouvre directement. */
export function resultsToCsv(results: CategoryResult[]): string {
  const escape = (value: string | number): string => {
    const text = String(value);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    ['categorie_id', 'categorie', 'theme', 'rang', 'ex_aequo', 'nomines', 'voix']
      .map(escape)
      .join(';'),
  ];
  for (const result of results) {
    if (result.rows.length === 0) {
      lines.push([result.categoryId, result.title, result.theme, '', '', '(aucun vote)', 0].map(escape).join(';'));
      continue;
    }
    for (const row of result.rows) {
      lines.push(
        [
          result.categoryId,
          result.title,
          result.theme,
          row.rank,
          row.tied ? 'oui' : 'non',
          row.names.join(' + '),
          row.votes,
        ]
          .map(escape)
          .join(';'),
      );
    }
  }
  // BOM : sans lui, Excel sous Windows affiche mal les accents.
  return `﻿${lines.join('\r\n')}\r\n`;
}
