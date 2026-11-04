import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { castVote, type VoterContext } from '../netlify/functions/lib/ballot.ts';
import { codeId, deriveDossierKey, generateCodeBody } from '../netlify/functions/lib/crypto.ts';
import {
  computeParticipation,
  computeResults,
  rankSelections,
  resultsToCsv,
  tallyVotes,
} from '../netlify/functions/lib/results.ts';
import { keys } from '../netlify/functions/lib/store.ts';
import { FakeStore } from './fake-store.ts';

const PEPPER = 'poivre-de-test-0123456789abcdef0123456789abcdef';
const CATEGORIE = 'major-de-la-classe';

function ctxPour(): VoterContext {
  const code = generateCodeBody();
  return { codeId: codeId(code, PEPPER), dossierKey: deriveDossierKey(code, PEPPER) };
}

/** Fait voter n votants pour un même choix. */
async function voter(store: FakeStore, categoryId: string, choix: string[], fois: number) {
  for (let i = 0; i < fois; i += 1) {
    const ctx = ctxPour();
    await store.setJSON(keys.code(ctx.codeId), { v: 1 });
    await castVote(store, ctx, categoryId, choix);
  }
}

describe('comptage des voix', () => {
  it('compte les lignes de vote par choix', async () => {
    const store = new FakeStore();
    await voter(store, CATEGORIE, ['n03'], 5);
    await voter(store, CATEGORIE, ['n04'], 3);
    await voter(store, CATEGORIE, ['n07'], 1);

    const tally = await tallyVotes(store);
    assert.deepEqual(Object.fromEntries(tally.get(CATEGORIE)!), { n03: 5, n04: 3, n07: 1 });
  });

  it('ne compte pas deux fois un vote modifié', async () => {
    const store = new FakeStore();
    const ctx = ctxPour();
    await castVote(store, ctx, CATEGORIE, ['n03']);
    await castVote(store, ctx, CATEGORIE, ['n04']);
    await castVote(store, ctx, CATEGORIE, ['n04']);

    const resultats = await computeResults(store);
    const categorie = resultats.find((r) => r.categoryId === CATEGORIE)!;
    assert.equal(categorie.totalVotes, 1);
    assert.deepEqual(categorie.rows[0]!.nomineeIds, ['n04']);
  });

  it('compte les duos par paire, sans tenir compte de l’ordre de sélection', async () => {
    const store = new FakeStore();
    await voter(store, 'meilleur-binome', ['n03', 'n11'], 2);
    await voter(store, 'meilleur-binome', ['n11', 'n03'], 3); // même paire, ordre inverse
    await voter(store, 'meilleur-binome', ['n05', 'n21'], 1);

    const resultats = await computeResults(store);
    const duo = resultats.find((r) => r.categoryId === 'meilleur-binome')!;
    assert.equal(duo.rows.length, 2, 'la paire inversée ne doit pas créer une seconde entrée');
    assert.equal(duo.rows[0]!.votes, 5);
    assert.deepEqual(duo.rows[0]!.nomineeIds, ['n03', 'n11']);
    assert.equal(duo.rows[0]!.names.length, 2);
  });

  it('renvoie toutes les catégories, même celles sans aucun vote', async () => {
    const store = new FakeStore();
    await voter(store, CATEGORIE, ['n03'], 1);

    const resultats = await computeResults(store);
    assert.equal(resultats.length, 56);
    const vide = resultats.find((r) => r.categoryId === 'le-plus-timide')!;
    assert.equal(vide.totalVotes, 0);
    assert.deepEqual(vide.rows, []);
  });
});

describe('classement et ex aequo', () => {
  it('classe par nombre de voix décroissant', () => {
    const rows = rankSelections(new Map([['n03', 2], ['n04', 7], ['n07', 5]]));
    assert.deepEqual(
      rows.map((r) => [r.nomineeIds[0], r.votes, r.rank, r.tied]),
      [
        ['n04', 7, 1, false],
        ['n07', 5, 2, false],
        ['n03', 2, 3, false],
      ],
    );
  });

  it('donne le même rang aux ex aequo et les signale', () => {
    const rows = rankSelections(new Map([['n03', 4], ['n04', 4], ['n07', 1]]));
    assert.equal(rows[0]!.rank, 1);
    assert.equal(rows[1]!.rank, 1);
    assert.equal(rows[0]!.tied, true);
    assert.equal(rows[1]!.tied, true);
    // Le rang suivant tient compte des deux premiers.
    assert.equal(rows[2]!.rank, 3);
    assert.equal(rows[2]!.tied, false);
  });

  it('gère une égalité totale', () => {
    const rows = rankSelections(new Map([['n03', 2], ['n04', 2], ['n07', 2]]));
    assert.ok(rows.every((r) => r.rank === 1 && r.tied));
  });

  it('ordonne les ex aequo par ordre alphabétique, sans hiérarchie implicite', () => {
    const rows = rankSelections(new Map([['n26', 3], ['n03', 3]]));
    assert.deepEqual(
      rows.map((r) => r.names[0]),
      [...rows.map((r) => r.names[0]!)].sort((a, b) => a.localeCompare(b, 'fr')),
    );
  });
});

describe('participation', () => {
  it('compte les codes générés, les codes utilisés et les voix par catégorie', async () => {
    const store = new FakeStore();
    for (let i = 0; i < 10; i += 1) {
      await store.setJSON(keys.code(`code-${i}`), { v: 1 });
    }
    await voter(store, CATEGORIE, ['n03'], 4); // ces 4 ajoutent aussi 4 codes
    await voter(store, 'meilleur-ambianceur', ['n07'], 2);

    const participation = await computeParticipation(store);
    assert.equal(participation.codesGenerated, 16);
    assert.equal(participation.codesUsed, 6);
    assert.equal(participation.votesByCategory[CATEGORIE], 4);
    assert.equal(participation.votesByCategory['meilleur-ambianceur'], 2);
    assert.equal(participation.votesByCategory['le-plus-timide'], 0);
    assert.equal(participation.totalVotes, 6);
    assert.deepEqual(participation.warnings, []);
  });

  it('signale une incohérence si une catégorie a plus de lignes que de codes ayant voté', async () => {
    const store = new FakeStore();
    // Trois lignes fabriquées à la main, sans aucun dossier votant.
    for (const rowId of ['a', 'b', 'c']) {
      await store.setJSON(keys.voteRow(CATEGORIE, ['n03'], rowId), { n: ['n03'] });
    }

    const participation = await computeParticipation(store);
    assert.equal(participation.codesUsed, 0);
    assert.equal(participation.warnings.length, 1);
    assert.match(participation.warnings[0]!, /Major de la promo/);
  });

  it('conserve les voix des catégories masquées : comptées dans la participation, absentes des résultats', async () => {
    const store = new FakeStore();
    await voter(store, CATEGORIE, ['n03'], 3);
    // Voix enregistrées avant que ces catégories soient masquées.
    await voter(store, 'le-plus-fou', ['n04'], 2);
    await voter(store, 'champion-des-exposes-improvises', ['n05'], 1);

    const participation = await computeParticipation(store);
    assert.equal(participation.votesByCategory['le-plus-fou'], 2);
    assert.equal(participation.votesByCategory['champion-des-exposes-improvises'], 1);
    assert.equal(participation.archivedVotes, 3);
    assert.equal(participation.totalVotes, 6);

    const resultats = await computeResults(store);
    assert.ok(!resultats.some((r) => r.categoryId === 'le-plus-fou'));
    assert.ok(!resultats.some((r) => r.categoryId === 'champion-des-exposes-improvises'));
    // Les lignes de vote elles-mêmes sont intactes.
    assert.equal(store.keysWithPrefix(keys.votesPrefix('le-plus-fou')).length, 2);
  });
});

describe('export CSV', () => {
  it('produit un en-tête, une ligne par classement et marque les ex aequo', async () => {
    const store = new FakeStore();
    await voter(store, CATEGORIE, ['n03'], 2);
    await voter(store, CATEGORIE, ['n04'], 2);

    const csv = resultsToCsv(await computeResults(store));
    const lignes = csv.split('\r\n');

    assert.ok(csv.startsWith('﻿'), 'le BOM permet à Excel d’afficher les accents');
    assert.equal(lignes[0], '﻿categorie_id;categorie;theme;rang;ex_aequo;nomines;voix');
    const lignesMajor = lignes.filter((l) => l.startsWith(CATEGORIE));
    assert.equal(lignesMajor.length, 2);
    assert.ok(lignesMajor.every((l) => l.includes(';1;oui;')), 'les deux sont premiers ex aequo');
    assert.ok(lignes.some((l) => l.includes('(aucun vote)')));
  });

  it('échappe les points-virgules et les guillemets', () => {
    const csv = resultsToCsv([
      {
        categoryId: 'test',
        title: 'Un titre ; avec "guillemets"',
        theme: 'Thème',
        type: 'single',
        totalVotes: 1,
        rows: [{ nomineeIds: ['n03'], names: ['NOM ; PRENOM'], votes: 1, rank: 1, tied: false }],
      },
    ]);
    assert.ok(csv.includes('"Un titre ; avec ""guillemets"""'));
    assert.ok(csv.includes('"NOM ; PRENOM"'));
  });
});
