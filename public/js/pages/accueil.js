/** Accueil : titre, promotion, compte à rebours, bouton « Voter ». */

import { el } from '../dom.js';
import { etat, maintenantServeur, votesOuverts } from '../etat.js';

const UNITES = [
  ['jours', 86_400_000],
  ['heures', 3_600_000],
  ['minutes', 60_000],
  ['secondes', 1000],
];

function compteARebours(cloture) {
  const blocs = UNITES.map(([unite]) =>
    el(
      'div',
      { class: 'rebours-bloc' },
      el('span', { class: 'rebours-valeur', 'data-unite': unite }, '--'),
      el('span', { class: 'rebours-unite' }, unite),
    ),
  );
  const conteneur = el(
    'div',
    { class: 'compte-rebours', role: 'timer', 'aria-label': 'Temps restant avant la clôture des votes' },
    blocs,
  );

  const afficher = () => {
    let restant = Math.max(0, Date.parse(cloture) - maintenantServeur());
    UNITES.forEach(([unite, duree], index) => {
      const valeur = Math.floor(restant / duree);
      restant -= valeur * duree;
      const cible = blocs[index].querySelector('[data-unite]');
      cible.textContent = String(valeur).padStart(2, '0');
    });
  };
  // Premier affichage avant l'insertion dans la page : le conteneur n'y est pas
  // encore, d'où l'absence de contrôle ici.
  afficher();
  const minuteur = setInterval(() => {
    // L'intervalle s'arrête de lui-même dès que la page a changé.
    if (!document.body.contains(conteneur)) {
      clearInterval(minuteur);
      return;
    }
    afficher();
  }, 1000);
  return conteneur;
}

export async function rendre({ naviguer }) {
  const election = etat.election;
  const ouvert = votesOuverts();
  const nombreCategories = etat.catalogue?.categories.length ?? 0;

  const etatTexte = ouvert
    ? el(
        'p',
        { class: 'accueil-etat' },
        'Les votes sont ',
        el('strong', { style: 'color:var(--vote)' }, 'ouverts'),
        '. Tu peux voter catégorie par catégorie, dans l’ordre que tu veux, et revenir plus tard.',
      )
    : el(
        'p',
        { class: 'accueil-etat' },
        'Les votes sont ',
        el('strong', { style: 'color:var(--alerte)' }, 'fermés'),
        election?.closesAt && Date.parse(election.closesAt) <= maintenantServeur()
          ? '. Les résultats seront révélés pendant la cérémonie.'
          : ' pour le moment. Reviens quand l’organisateur les aura ouverts.',
      );

  return el(
    'div',
    { class: 'accueil' },
    el('p', { class: 'accueil-sur-titre' }, 'École Nationale Supérieure Polytechnique de Yaoundé'),
    el('h1', {}, 'CIN 2027 Awards'),
    el(
      'p',
      { class: 'accueil-promo' },
      '5ᵉ année Cybersécurité et Investigation Numérique — promotion CIN 2027. ',
      `${nombreCategories} catégories, 26 camarades, un vote strictement anonyme.`,
    ),
    election?.closesAt && ouvert ? compteARebours(election.closesAt) : null,
    etatTexte,
    el(
      'div',
      { class: 'barre-actions', style: 'justify-content:center' },
      el(
        'button',
        { class: 'bouton', onclick: () => naviguer('/vote') },
        ouvert ? 'Voter' : 'Voir mes votes',
      ),
      el(
        'a',
        { class: 'bouton-secondaire', href: '/fonctionnement', 'data-lien': '' },
        'Comment ça marche ?',
      ),
    ),
    el(
      'p',
      { class: 'champ-aide', style: 'margin-top:2rem' },
      'Garde ton ticket : c’est lui, et lui seul, qui te permet de revenir modifier tes votes.',
    ),
  );
}
