import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALL_CATEGORIES,
  ALL_CATEGORY_BY_ID,
  ARCHIVED_CATEGORIES,
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

/** Les 63 identifiants du lancement du vote : des votes y sont rattachés. */
const IDS_D_ORIGINE = [
  'major-de-la-classe', 'excellence-travaux-pratiques', 'cerveau-de-la-salle', 'roi-des-exposes',
  'champion-des-exposes-improvises', 'meilleur-orateur', 'le-plus-assidu', 'chouchou-des-enseignants',
  'specialiste-des-questions-pieges', 'monsieur-je-nai-pas-compris', 'maitre-du-dernier-moment',
  'specialiste-du-copier-coller', 'le-plus-debrouillard', 'pilier-du-groupe', 'revelation-de-lannee',
  'le-plus-polyvalent', 'distributeur-de-cours', 'leader-naturel', 'delegue-exemplaire',
  'bon-samaritain', 'le-plus-serviable', 'le-plus-solidaire', 'camarade-de-lannee',
  'le-plus-populaire', 'le-plus-charismatique', 'le-plus-sociable', 'meilleur-ambianceur',
  'le-plus-timide', 'futur-milliardaire', 'meilleur-binome', 'beau-parleur', 'le-plus-riche',
  'le-plus-chipeur', 'meilleur-sapeur', 'meilleur-danseur', 'le-plus-sauvage', 'le-plus-fou',
  'limprevisible', 'le-plus-beau', 'meilleur-dragueur', 'crush-de-la-promo', 'le-fuckboy',
  'collectionneur-des-coeurs', 'celibataire-le-plus-convoite', 'coeur-brise-de-la-promo',
  'le-creve-de-secours', 'meilleur-mougou-officiel', 'fbi-des-relations', 'le-ou-la-plus-commere',
  'meilleur-dossier', 'le-plus-jaloux', 'le-plus-hypocrite', 'roi-des-retards', 'labsenteiste',
  'le-jarrive-qui-narrive-jamais', 'champion-des-excuses', 'fantome-whatsapp',
  'le-plus-difficile-a-joindre', 'le-plus-connecte', 'specialiste-des-interventions-inutiles',
  'le-plus-endette', 'le-plus-gros-foire', 'le-mythomane',
];

/** Ordre d'affichage final demandé (49 catégories). */
const ORDRE_ATTENDU = [
  'Major de la promo',
  "Prix de l'excellence en travaux pratiques",
  'Le cerveau de la salle',
  'Le roi des exposés',
  'Meilleur orateur',
  'Le plus assidu',
  'Le chouchou des enseignants',
  'Spécialiste des questions pièges',
  "Le spécialiste du « Monsieur, je n'ai pas compris »",
  'Le maître du dernier moment',
  'Le plus grand faxeur',
  'Le plus débrouillard',
  'Le pilier de la classe',
  "La révélation de l'année",
  'Le plus polyvalent',
  'Distributeur de cours',
  'Le leader naturel',
  'Le plus solidaire',
  "Le camarade de l'année",
  'Le plus sociable',
  'Meilleur ambianceur',
  'Le plus timide',
  'Futur milliardaire',
  'Meilleur binôme',
  "Le duo de l'année",
  'Beau parleur',
  'Le plus riche',
  'Le plus chipeur',
  'Le plus chiche',
  'Meilleur sapeur',
  'Meilleur danseur',
  'Le plus sauvage',
  "L'imprévisible",
  'Le plus beau',
  'Meilleur dragueur',
  'La crush de la promo',
  'Le couple que la promo attend',
  'Le fuckboy / La fuckgirl',
  'Cœur brisé de la promo',
  'Meilleur mougou officiel',
  'Le ou la plus commère',
  'Meilleur dossier',
  'Le plus jaloux / La plus jalouse',
  'Le plus hypocrite',
  'Le roi ou la reine des retards',
  "L'absentéiste",
  'Champion des excuses',
  'Le plus endetté',
  'Le mythomane',
];

describe('fichiers de données', () => {
  it('propose 49 catégories au vote, aux identifiants uniques', () => {
    assert.equal(CATEGORIES.length, 49);
    assert.equal(new Set(ALL_CATEGORIES.map((c) => c.id)).size, ALL_CATEGORIES.length);
  });

  it('garde les 63 identifiants d’origine, auxquels les votes enregistrés sont rattachés', () => {
    for (const id of IDS_D_ORIGINE) assert.ok(ALL_CATEGORY_BY_ID.has(id), id);
    assert.equal(ALL_CATEGORIES.length, 66);
    assert.equal(ARCHIVED_CATEGORIES.length, 17);
  });

  it('affiche les catégories dans l’ordre demandé', () => {
    assert.deepEqual(
      CATEGORIES.map((c) => c.title),
      ORDRE_ATTENDU,
    );
  });

  it('fusionne chaque catégorie masquée dans une catégorie encore proposée', () => {
    const fusionnees = ARCHIVED_CATEGORIES.filter((c) => c.mergedInto);
    assert.equal(fusionnees.length, 8);
    for (const category of fusionnees) {
      assert.ok(CATEGORY_BY_ID.has(category.mergedInto!), category.id);
    }
    assert.equal(CATEGORY_BY_ID.get('le-plus-gros-foire'), undefined);
    assert.equal(ALL_CATEGORY_BY_ID.get('le-plus-gros-foire')!.mergedInto, 'le-plus-endette');
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
      'Excellence académique': 16,
      'Vie de promo': 13,
      'Style et personnalité': 5,
      'Cœur et relations': 10,
      'Retards, absences et excuses': 5,
    });
    assert.equal(THEMES.length, 5);
  });

  it('déclare trois catégories « duo »', () => {
    const duos = CATEGORIES.filter((c) => c.type === 'duo');
    assert.deepEqual(
      duos.map((c) => c.id),
      ['meilleur-binome', 'duo-de-lannee', 'couple-que-la-promo-attend'],
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

  it('refuse un vote dans une catégorie masquée', () => {
    const resultat = validateSelection('le-plus-fou', ['n03']);
    assert.equal(resultat.ok === false && resultat.code, 'category_archived');
  });

  it('exige deux personnes différentes pour les nouvelles catégories duo', () => {
    for (const id of ['duo-de-lannee', 'couple-que-la-promo-attend']) {
      assert.equal(validateSelection(id, ['n03']).ok, false, id);
      const doublon = validateSelection(id, ['n03', 'n03']);
      assert.equal(doublon.ok === false && doublon.code, 'duplicate_choice', id);
      assert.deepEqual(validateSelection(id, ['n11', 'n03']), validateSelection(id, ['n03', 'n11']), id);
    }
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
