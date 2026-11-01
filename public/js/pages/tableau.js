/**
 * Tableau de bord des catégories — le cœur du site.
 *
 * 58 cartes compactes, regroupées par thème, avec filtre par thème, recherche,
 * filtre « non votées » et une barre de progression qui n'oblige à rien.
 */

import { el, sansAccent, vider } from '../dom.js';
import { etat, nomAffiche, votesOuverts } from '../etat.js';
import { formulaireCode } from './code.js';

function aVote(categorieId) {
  return Boolean(etat.votes[categorieId]);
}

function choixAffiche(categorieId) {
  const entree = etat.votes[categorieId];
  if (!entree) return null;
  return entree.nomineeIds.map(nomAffiche).join(' + ');
}

/** Première catégorie non encore votée, dans l'ordre du fichier de données. */
function prochaineNonVotee() {
  return etat.catalogue.categories.find((categorie) => !aVote(categorie.id)) ?? null;
}

function carte(categorie, naviguer) {
  const votee = aVote(categorie.id);
  return el(
    'li',
    {},
    el(
      'button',
      {
        class: votee ? 'carte carte-votee' : 'carte',
        type: 'button',
        onclick: () => naviguer(`/vote/${categorie.id}`),
      },
      el('span', { class: 'carte-titre' }, categorie.title),
      votee
        ? el(
            'span',
            { class: 'carte-etat carte-etat-votee' },
            el('span', { class: 'pastille' }),
            'Voté',
            el('span', { class: 'carte-choix' }, ` — ${choixAffiche(categorie.id)}`),
          )
        : el(
            'span',
            { class: 'carte-etat' },
            el('span', { class: 'pastille' }),
            'À voter',
            categorie.type === 'duo' ? el('span', { class: 'carte-choix' }, ' — deux personnes') : null,
          ),
    ),
  );
}

export async function rendre(contexte) {
  const { naviguer } = contexte;
  if (!etat.code) return formulaireCode(contexte);

  const categories = etat.catalogue.categories;
  const total = categories.length;

  const filtres = { recherche: '', theme: null, seulementNonVotees: false };

  // ---- Progression ----------------------------------------------------------
  const progressionTexte = el('span', {});
  const progressionRemplissage = el('div', { class: 'progression-remplissage' });
  const progression = el(
    'div',
    { class: 'progression' },
    el(
      'div',
      { class: 'progression-texte' },
      progressionTexte,
      el('span', {}, 'aucune obligation de tout voter'),
    ),
    el(
      'div',
      {
        class: 'progression-barre',
        role: 'progressbar',
        'aria-valuemin': '0',
        'aria-valuemax': String(total),
        'aria-label': 'Catégories votées',
      },
      progressionRemplissage,
    ),
  );

  function majProgression() {
    const votees = categories.filter((c) => aVote(c.id)).length;
    progressionTexte.textContent = `${votees} catégorie${votees > 1 ? 's' : ''} votée${votees > 1 ? 's' : ''} sur ${total}`;
    progressionRemplissage.style.width = `${Math.round((votees / total) * 100)}%`;
    progression.querySelector('[role=progressbar]')?.setAttribute('aria-valuenow', String(votees));
  }

  // ---- Bouton « catégorie suivante non votée » ------------------------------
  const boutonSuivante = el('button', {
    class: 'bouton',
    type: 'button',
    onclick: () => {
      const suivante = prochaineNonVotee();
      if (suivante) naviguer(`/vote/${suivante.id}`);
    },
  });

  function majBoutonSuivante() {
    const suivante = prochaineNonVotee();
    boutonSuivante.hidden = !suivante || !votesOuverts();
    boutonSuivante.textContent = suivante ? 'Catégorie suivante non votée' : '';
  }

  // ---- Filtres --------------------------------------------------------------
  const champRecherche = el('input', {
    type: 'search',
    id: 'champ-recherche',
    placeholder: 'Rechercher une catégorie…',
    autocomplete: 'off',
    oninput: (evenement) => {
      filtres.recherche = sansAccent(evenement.target.value.trim());
      majListe();
    },
  });

  const puces = [];
  function puce(libelle, valeur) {
    const bouton = el(
      'button',
      {
        class: 'puce',
        type: 'button',
        'aria-pressed': String(filtres.theme === valeur),
        onclick: () => {
          filtres.theme = valeur;
          for (const autre of puces) {
            autre.setAttribute('aria-pressed', String(autre.dataset.theme === String(valeur)));
          }
          majListe();
        },
        dataset: { theme: String(valeur) },
      },
      libelle,
    );
    puces.push(bouton);
    return bouton;
  }

  const caseNonVotees = el('input', {
    type: 'checkbox',
    onchange: (evenement) => {
      filtres.seulementNonVotees = evenement.target.checked;
      majListe();
    },
  });

  const barreFiltres = el(
    'div',
    { class: 'filtres' },
    el('label', { for: 'champ-recherche', class: 'hors-ecran' }, 'Rechercher une catégorie'),
    champRecherche,
    el(
      'div',
      { class: 'filtres-themes', role: 'group', 'aria-label': 'Filtrer par thème' },
      puce('Tous les thèmes', null),
      etat.catalogue.themes.map((theme) => puce(theme, theme)),
    ),
    el('label', { class: 'case' }, caseNonVotees, 'Afficher seulement les catégories non votées'),
  );

  // ---- Liste ----------------------------------------------------------------
  const liste = el('div', {});

  function majListe() {
    const visibles = categories.filter((categorie) => {
      if (filtres.theme && categorie.theme !== filtres.theme) return false;
      if (filtres.seulementNonVotees && aVote(categorie.id)) return false;
      if (filtres.recherche) {
        const cible = sansAccent(`${categorie.title} ${categorie.theme} ${categorie.description}`);
        if (!cible.includes(filtres.recherche)) return false;
      }
      return true;
    });

    vider(liste);

    if (visibles.length === 0) {
      liste.appendChild(
        el(
          'p',
          { class: 'vide' },
          filtres.seulementNonVotees && !filtres.recherche
            ? 'Toutes les catégories affichées ont été votées. Merci !'
            : 'Aucune catégorie ne correspond à cette recherche.',
        ),
      );
      return;
    }

    for (const theme of etat.catalogue.themes) {
      const duTheme = visibles.filter((categorie) => categorie.theme === theme);
      if (duTheme.length === 0) continue;
      const votees = duTheme.filter((categorie) => aVote(categorie.id)).length;
      liste.appendChild(
        el(
          'h2',
          { class: 'theme-titre' },
          theme,
          el('span', { class: 'theme-compte' }, `${votees}/${duTheme.length}`),
        ),
      );
      liste.appendChild(
        el(
          'ul',
          { class: 'grille-categories' },
          duTheme.map((categorie) => carte(categorie, naviguer)),
        ),
      );
    }
  }

  majProgression();
  majBoutonSuivante();
  majListe();

  return el(
    'div',
    {},
    el(
      'div',
      { class: 'tableau-entete' },
      el('h1', { style: 'font-size:clamp(1.7rem,7vw,2.4rem)' }, 'Tes catégories'),
      votesOuverts()
        ? el(
            'p',
            { style: 'color:var(--texte-doux)' },
            'Touche une catégorie pour voter. Tu peux t’arrêter, revenir et changer d’avis jusqu’à la clôture.',
          )
        : el(
            'div',
            { class: 'message message-info' },
            'Les votes sont fermés. Tu peux encore consulter tes choix, mais plus les modifier.',
          ),
    ),
    progression,
    el('div', { class: 'barre-actions', style: 'margin-bottom:.5rem' }, boutonSuivante),
    barreFiltres,
    liste,
  );
}
