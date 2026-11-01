import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CATEGORIES,
  CATEGORY_BY_ID,
  NOMINEES,
  nomineesForCategory,
  requiredChoices,
  THEMES,
  validateSelection,
  validateSelectionFor,
} from '../shared/catalog.ts';
import type { Category } from '../shared/types.ts';

describe('fichiers de données', () => {
  it('contient 58 catégories aux identifiants uniques', () => {
    assert.equal(CATEGORIES.length, 58);
    assert.equal(new Set(CATEGORIES.map((c) => c.id)).size, 58);
  });

  it('contient 26 nominés aux identifiants uniques', () => {
    assert.equal(NOMINEES.length, 26);
    assert.equal(new Set(NOMINEES.map((n) => n.id)).size, 26);
  });

  it('affiche les nominés par ordre alphabétique', () => {
    const noms = NOMINEES.map((n) => n.displayName);
    const tries = [...noms].sort((a, b) => a.localeCompare(b, 'fr'));
    assert.deepEqual(noms, tries);
  });

  it('répartit les catégories dans les cinq thèmes attendus', () => {
    const compte = new Map<string, number>();
    for (const category of CATEGORIES) {
      compte.set(category.theme, (compte.get(category.theme) ?? 0) + 1);
    }
    assert.deepEqual(Object.fromEntries(compte), {
      'Excellence académique': 17,
      'Vie de promo': 14,
      'Style et personnalité': 5,
      'Cœur et relations': 13,
      'Retards, absences et excuses': 9,
    });
    assert.equal(THEMES.length, 5);
  });

  it('ne déclare qu’une seule catégorie « duo »', () => {
    const duos = CATEGORIES.filter((c) => c.type === 'duo');
    assert.deepEqual(
      duos.map((c) => c.id),
      ['meilleur-binome'],
    );
    assert.equal(requiredChoices(duos[0]!), 2);
    assert.equal(requiredChoices(CATEGORY_BY_ID.get('major-de-la-classe')!), 1);
  });

  it('propose les 26 nominés dans chaque catégorie sans exclusion', () => {
    for (const category of CATEGORIES) {
      if ((category.excludedNominees ?? []).length === 0) {
        assert.equal(nomineesForCategory(category).length, 26, category.id);
      }
    }
  });
});

describe('validation d’un vote contre les fichiers de données', () => {
  it('accepte un choix unique valide', () => {
    const resultat = validateSelection('major-de-la-classe', ['n03']);
    assert.deepEqual(resultat, { ok: true, value: ['n03'] });
  });

  it('refuse une catégorie inconnue', () => {
    const resultat = validateSelection('categorie-inventee', ['n03']);
    assert.equal(resultat.ok, false);
    assert.equal(resultat.ok === false && resultat.code, 'unknown_category');
  });

  it('refuse un nominé inconnu', () => {
    const resultat = validateSelection('major-de-la-classe', ['n99']);
    assert.equal(resultat.ok === false && resultat.code, 'unknown_nominee');
  });

  it('refuse deux voix dans une catégorie à choix unique', () => {
    const resultat = validateSelection('major-de-la-classe', ['n03', 'n04']);
    assert.equal(resultat.ok === false && resultat.code, 'wrong_count');
  });

  it('refuse une sélection vide ou mal formée', () => {
    for (const mauvais of [[], null, 'n03', [42], [{ id: 'n03' }]]) {
      assert.equal(validateSelection('major-de-la-classe', mauvais).ok, false);
    }
  });

  it('exige exactement deux personnes différentes pour un duo', () => {
    assert.equal(validateSelection('meilleur-binome', ['n03']).ok, false);
    assert.equal(validateSelection('meilleur-binome', ['n03', 'n04', 'n05']).ok, false);
    const doublon = validateSelection('meilleur-binome', ['n03', 'n03']);
    assert.equal(doublon.ok === false && doublon.code, 'duplicate_choice');
    assert.equal(validateSelection('meilleur-binome', ['n03', 'n04']).ok, true);
  });

  it('trie la paire d’un duo, pour que l’ordre de sélection ne compte pas', () => {
    const premier = validateSelection('meilleur-binome', ['n11', 'n03']);
    const second = validateSelection('meilleur-binome', ['n03', 'n11']);
    assert.deepEqual(premier, second);
    assert.deepEqual(premier.ok === true && premier.value, ['n03', 'n11']);
  });

  it('refuse un nominé exclu de la catégorie', () => {
    const avecExclusion: Category = {
      id: 'categorie-de-test',
      title: 'Catégorie de test',
      theme: 'Test',
      description: '',
      type: 'single',
      excludedNominees: ['n16'],
    };
    const refuse = validateSelectionFor(avecExclusion, ['n16']);
    assert.equal(refuse.ok === false && refuse.code, 'excluded_nominee');
    assert.equal(validateSelectionFor(avecExclusion, ['n03']).ok, true);
    assert.equal(nomineesForCategory(avecExclusion).length, 25);
    assert.ok(!nomineesForCategory(avecExclusion).some((n) => n.id === 'n16'));
  });
});
