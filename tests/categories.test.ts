import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCustomCategory,
  CATEGORIES,
  MAX_CUSTOM_CATEGORIES,
  validateSelectionFor,
} from '../shared/catalog.ts';
import { castVote, type VoterContext } from '../netlify/functions/lib/ballot.ts';
import {
  addCustomCategory,
  findCategory,
  listCategories,
  readCustomCategories,
} from '../netlify/functions/lib/categories.ts';
import { codeId, deriveDossierKey, generateCodeBody } from '../netlify/functions/lib/crypto.ts';
import { computeParticipation, computeResults } from '../netlify/functions/lib/results.ts';
import { keys } from '../netlify/functions/lib/store.ts';
import { FakeStore } from './fake-store.ts';

const PEPPER = 'poivre-de-test-0123456789abcdef0123456789abcdef';

const saisie = {
  title: 'Le plus ponctuel',
  theme: 'Vie de promo',
  description: 'Arrive avant le professeur.',
  type: 'single',
};

function ctxPour(): VoterContext {
  const code = generateCodeBody();
  return { codeId: codeId(code, PEPPER), dossierKey: deriveDossierKey(code, PEPPER) };
}

describe('buildCustomCategory', () => {
  it('construit une catégorie valide avec un identifiant tiré du titre', () => {
    const resultat = buildCustomCategory(saisie, CATEGORIES);
    assert.ok(resultat.ok);
    assert.equal(resultat.value.id, 'le-plus-ponctuel');
    assert.equal(resultat.value.title, 'Le plus ponctuel');
    assert.equal(resultat.value.type, 'single');
    assert.deepEqual(resultat.value.excludedNominees, []);
  });

  it('retire accents et ponctuation de l’identifiant, qui ne contient jamais « / » ni « + »', () => {
    const resultat = buildCustomCategory(
      { ...saisie, title: 'L’œuvre d’été / « Spécial » + bonus' },
      CATEGORIES,
    );
    assert.ok(resultat.ok);
    assert.match(resultat.value.id, /^[a-z0-9-]+$/);
  });

  it('rejette un titre qui existe déjà, même écrit autrement', () => {
    const resultat = buildCustomCategory({ ...saisie, title: 'LE PLUS  BEAU' }, CATEGORIES);
    assert.equal(resultat.ok, false);
    assert.equal(!resultat.ok && resultat.code, 'duplicate_title');
  });

  it('numérote l’identifiant quand deux titres différents donnent le même', () => {
    const premiere = buildCustomCategory({ ...saisie, title: 'Roi du « stand-up »' }, CATEGORIES);
    assert.ok(premiere.ok);
    // Titre distinct après normalisation impossible : on simule un identifiant déjà pris.
    const occupee = { ...premiere.value, title: 'Autre titre', id: premiere.value.id };
    const seconde = buildCustomCategory({ ...saisie, title: 'Roi du stand up !' }, [
      ...CATEGORIES,
      occupee,
    ]);
    assert.ok(seconde.ok);
    assert.equal(seconde.value.id, `${premiere.value.id}-2`);
  });

  it('réutilise l’orthographe d’un thème existant', () => {
    const resultat = buildCustomCategory({ ...saisie, theme: 'vie de PROMO' }, CATEGORIES);
    assert.ok(resultat.ok);
    assert.equal(resultat.value.theme, 'Vie de promo');
  });

  it('rejette titre trop court ou trop long, thème vide, type inconnu, caractères de contrôle', () => {
    const mauvais = [
      { ...saisie, title: 'ab' },
      { ...saisie, title: 'x'.repeat(81) },
      { ...saisie, title: '   ' },
      { ...saisie, title: '!!!' },
      { ...saisie, theme: '' },
      { ...saisie, description: 'y'.repeat(201) },
      { ...saisie, type: 'trio' },
      { ...saisie, title: 'Titre\u0000piégé' },
      null,
      'texte',
    ];
    for (const entree of mauvais) {
      assert.equal(buildCustomCategory(entree, CATEGORIES).ok, false, JSON.stringify(entree));
    }
  });

  it('accepte une description absente', () => {
    const { description: _omis, ...sansDescription } = saisie;
    const resultat = buildCustomCategory(sansDescription, CATEGORIES);
    assert.ok(resultat.ok);
    assert.equal(resultat.value.description, '');
  });
});

describe('catégories ajoutées dans le store', () => {
  it('s’ajoutent à celles du fichier, dans l’ordre de création', async () => {
    const store = new FakeStore();
    assert.deepEqual(await readCustomCategories(store), []);

    const premiere = await addCustomCategory(store, saisie);
    const seconde = await addCustomCategory(store, { ...saisie, title: 'Le plus bruyant', type: 'duo' });
    assert.ok(premiere.ok && seconde.ok);

    const toutes = await listCategories(store);
    assert.equal(toutes.length, CATEGORIES.length + 2);
    assert.deepEqual(
      toutes.slice(-2).map((c) => c.id),
      ['le-plus-ponctuel', 'le-plus-bruyant'],
    );
    assert.equal(toutes.at(-1)?.type, 'duo');
  });

  it('refuse un doublon avec une catégorie déjà ajoutée', async () => {
    const store = new FakeStore();
    await addCustomCategory(store, saisie);
    const doublon = await addCustomCategory(store, { ...saisie, title: 'le plus ponctuel' });
    assert.equal(doublon.ok, false);
    assert.equal(!doublon.ok && doublon.code, 'duplicate_title');
    assert.equal((await readCustomCategories(store)).length, 1);
  });

  it('retrouve une catégorie du fichier sans lire le store', async () => {
    const store = new FakeStore();
    const trouvee = await findCategory(store, 'major-de-la-classe');
    assert.equal(trouvee?.id, 'major-de-la-classe');
    assert.equal(store.calls.get, 0);
  });

  it('retrouve une catégorie ajoutée et ignore un identifiant inconnu', async () => {
    const store = new FakeStore();
    await addCustomCategory(store, saisie);
    assert.equal((await findCategory(store, 'le-plus-ponctuel'))?.title, 'Le plus ponctuel');
    assert.equal(await findCategory(store, 'categorie-inventee'), undefined);
  });

  it('ne dépasse pas la limite de catégories ajoutées', async () => {
    const store = new FakeStore();
    for (let i = 0; i < MAX_CUSTOM_CATEGORIES; i += 1) {
      const ajout = await addCustomCategory(store, { ...saisie, title: `Catégorie numéro ${i}` });
      assert.ok(ajout.ok, `ajout ${i}`);
    }
    const trop = await addCustomCategory(store, { ...saisie, title: 'Une de trop' });
    assert.equal(trop.ok, false);
    assert.equal(!trop.ok && trop.code, 'too_many_categories');
  });

  it('ne perd aucun ajout quand deux administrateurs écrivent en même temps', async () => {
    const store = new FakeStore();
    let interrompu = false;
    store.beforeSet = async (key) => {
      if (key !== keys.customCategories || interrompu) return;
      interrompu = true;
      // Un autre onglet ajoute sa catégorie juste avant notre écriture.
      store.beforeSet = undefined;
      await addCustomCategory(store, { ...saisie, title: 'Ajout de l’autre onglet' });
    };
    const mien = await addCustomCategory(store, saisie);
    assert.ok(mien.ok);
    const ids = (await readCustomCategories(store)).map((c) => c.id);
    assert.deepEqual(ids.sort(), ['ajout-de-l-autre-onglet', 'le-plus-ponctuel']);
  });

  it('écarte les entrées abîmées ou qui reprennent un identifiant du fichier', async () => {
    const store = new FakeStore();
    await store.setJSON(keys.customCategories, [
      { id: 'major-de-la-classe', title: 'Usurpateur', theme: 'X', type: 'single' },
      { id: 'a/b', title: 'Mauvais id', theme: 'X', type: 'single' },
      { id: 'sans-type', title: 'Sans type', theme: 'X' },
      { id: 'valide', title: 'Valide', theme: 'X', type: 'duo' },
    ]);
    assert.deepEqual(
      (await readCustomCategories(store)).map((c) => c.id),
      ['valide'],
    );
  });
});

describe('vote et dépouillement d’une catégorie ajoutée', () => {
  it('valide une sélection selon le type de la catégorie ajoutée', async () => {
    const store = new FakeStore();
    const ajout = await addCustomCategory(store, { ...saisie, title: 'Meilleur duo comique', type: 'duo' });
    assert.ok(ajout.ok);
    assert.equal(validateSelectionFor(ajout.value, ['n03']).ok, false);
    assert.equal(validateSelectionFor(ajout.value, ['n03', 'n04']).ok, true);
  });

  it('compte les voix et les affiche dans les résultats et la participation', async () => {
    const store = new FakeStore();
    await addCustomCategory(store, saisie);

    for (const choix of [['n03'], ['n03'], ['n04']]) {
      const ctx = ctxPour();
      await store.setJSON(keys.code(ctx.codeId), { v: 1 });
      await castVote(store, ctx, 'le-plus-ponctuel', choix);
    }

    const resultats = await computeResults(store);
    assert.equal(resultats.length, CATEGORIES.length + 1);
    const ajoutee = resultats.find((r) => r.categoryId === 'le-plus-ponctuel')!;
    assert.equal(ajoutee.totalVotes, 3);
    assert.equal(ajoutee.rows[0]?.votes, 2);
    assert.deepEqual(ajoutee.rows[0]?.nomineeIds, ['n03']);

    const participation = await computeParticipation(store);
    assert.equal(participation.votesByCategory['le-plus-ponctuel'], 3);
    assert.equal(participation.totalVotes, 3);
  });

  it('ignore toujours les voix d’une catégorie inconnue', async () => {
    const store = new FakeStore();
    const ctx = ctxPour();
    await store.setJSON(keys.code(ctx.codeId), { v: 1 });
    await castVote(store, ctx, 'categorie-inventee', ['n03']);
    const participation = await computeParticipation(store);
    assert.equal(participation.totalVotes, 0);
  });
});
