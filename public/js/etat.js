/**
 * État de l'application dans le navigateur.
 *
 * Le code du votant n'est gardé que dans l'onglet (sessionStorage), sauf si la
 * case « Se souvenir de mon code sur cet appareil » est cochée : il passe alors
 * dans localStorage. « Se déconnecter » efface les deux.
 */

const CLE_CODE = 'cin2027.code';
const CLE_RETENIR = 'cin2027.retenir';

export const etat = {
  /** Code en clair, uniquement en mémoire du navigateur. */
  code: null,
  retenir: false,
  /** { categories, nominees, themes, parId, nominesParId } */
  catalogue: null,
  /** { <categoryId>: { nomineeIds: [...] } } */
  votes: {},
  /** État public de l'élection, tel que renvoyé par /api/state. */
  election: null,
  /** Décalage entre l'horloge du serveur et celle du téléphone (ms). */
  decalageHorloge: 0,
};

function lireStockage(stockage, cle) {
  try {
    return stockage.getItem(cle);
  } catch {
    // Navigation privée ou stockage refusé : on continue sans mémoriser.
    return null;
  }
}

function ecrireStockage(stockage, cle, valeur) {
  try {
    if (valeur === null) stockage.removeItem(cle);
    else stockage.setItem(cle, valeur);
  } catch {
    // Sans conséquence : le vote fonctionne, il faudra simplement retaper le code.
  }
}

/** Code retrouvé au chargement de la page, s'il y en a un. */
export function codeMemorise() {
  return lireStockage(sessionStorage, CLE_CODE) ?? lireStockage(localStorage, CLE_CODE);
}

export function retenirMemorise() {
  return lireStockage(localStorage, CLE_RETENIR) === '1';
}

export function enregistrerCode(code, retenir) {
  etat.code = code;
  etat.retenir = Boolean(retenir);
  ecrireStockage(sessionStorage, CLE_CODE, code);
  if (retenir) {
    ecrireStockage(localStorage, CLE_CODE, code);
    ecrireStockage(localStorage, CLE_RETENIR, '1');
  } else {
    ecrireStockage(localStorage, CLE_CODE, null);
    ecrireStockage(localStorage, CLE_RETENIR, null);
  }
}

export function oublierCode() {
  etat.code = null;
  etat.votes = {};
  etat.retenir = false;
  ecrireStockage(sessionStorage, CLE_CODE, null);
  ecrireStockage(localStorage, CLE_CODE, null);
  ecrireStockage(localStorage, CLE_RETENIR, null);
}

/** Charge categories.json et nominees.json une seule fois. */
export async function chargerCatalogue() {
  if (etat.catalogue) return etat.catalogue;
  const [categories, nominees] = await Promise.all([
    fetch('/data/categories.json').then((r) => {
      if (!r.ok) throw new Error('categories');
      return r.json();
    }),
    fetch('/data/nominees.json').then((r) => {
      if (!r.ok) throw new Error('nominees');
      return r.json();
    }),
  ]);

  const nominesTries = nominees
    .map((n) => ({ ...n, displayName: n.displayName || n.fullName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));

  const themes = [];
  for (const categorie of categories) {
    if (!themes.includes(categorie.theme)) themes.push(categorie.theme);
  }

  etat.catalogue = {
    categories,
    nominees: nominesTries,
    themes,
    parId: new Map(categories.map((c) => [c.id, c])),
    nominesParId: new Map(nominesTries.map((n) => [n.id, n])),
  };
  return etat.catalogue;
}

/** Nom affiché d'un nominé. */
export function nomAffiche(id) {
  return etat.catalogue?.nominesParId.get(id)?.displayName ?? id;
}

/** Nominés sélectionnables dans une catégorie (hors exclusions). */
export function nominesDeCategorie(categorie) {
  const exclus = new Set(categorie.excludedNominees ?? []);
  return etat.catalogue.nominees.filter((n) => !exclus.has(n.id));
}

export function nombreDeChoix(categorie) {
  return categorie.type === 'duo' ? 2 : 1;
}

export function votesOuverts() {
  return etat.election?.votingOpen === true;
}

/** Heure du serveur estimée, pour que le compte à rebours ne dépende pas du téléphone. */
export function maintenantServeur() {
  return Date.now() + etat.decalageHorloge;
}

export function appliquerEtatElection(election) {
  etat.election = election;
  if (election?.now) {
    etat.decalageHorloge = Date.parse(election.now) - Date.now();
  }
}
