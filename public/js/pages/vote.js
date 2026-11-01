/**
 * Écran de vote d'une catégorie.
 *
 * Un seul appel réseau par validation, et le vote est enregistré aussitôt côté
 * serveur : il n'y a pas d'envoi global, et rien n'est perdu si le votant ferme
 * le site en cours de route.
 */

import { api } from '../api.js';
import { annoncer, bandeau, el, sansAccent, vider } from '../dom.js';
import {
  appliquerEtatElection,
  etat,
  nomAffiche,
  nombreDeChoix,
  nominesDeCategorie,
  oublierCode,
  votesOuverts,
} from '../etat.js';
import { formulaireCode } from './code.js';

function memeSelection(a, b) {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

export async function rendre(contexte) {
  const { naviguer, params } = contexte;
  if (!etat.code) return formulaireCode(contexte);

  const categorie = etat.catalogue.parId.get(params[0]);
  if (!categorie) {
    return el(
      'div',
      { class: 'contenu-texte' },
      el('h1', {}, 'Catégorie introuvable'),
      el('p', {}, 'Cette catégorie n’existe pas ou a été retirée.'),
      el('a', { class: 'bouton', href: '/vote', 'data-lien': '' }, 'Retour aux catégories'),
    );
  }

  const ouvert = votesOuverts();
  const aChoisir = nombreDeChoix(categorie);
  const nomines = nominesDeCategorie(categorie);
  const enregistre = etat.votes[categorie.id]?.nomineeIds ?? [];
  let selection = [...enregistre];

  // ---- Pied d'écran : validation, retrait, retour --------------------------
  const boutonValider = el('button', { class: 'bouton', type: 'submit' });
  const aide = el('p', { class: 'vote-consigne', style: 'margin:.5rem 0 0' });
  const boutonRetirer = el('button', {
    class: 'bouton-danger',
    type: 'button',
    hidden: enregistre.length === 0 || !ouvert,
    onclick: async () => {
      boutonRetirer.disabled = true;
      const reponse = await api.retirer(etat.code, categorie.id);
      boutonRetirer.disabled = false;
      if (!reponse.ok) {
        bandeau(reponse.erreur, 'erreur');
        return;
      }
      etat.votes = reponse.donnees.ballot ?? {};
      appliquerEtatElection(reponse.donnees.state);
      bandeau(`Vote retiré pour « ${categorie.title} ».`);
      naviguer('/vote');
    },
  }, 'Retirer mon vote');

  function majPied() {
    const complet = selection.length === aChoisir;
    const identique = complet && memeSelection(selection, enregistre);
    boutonValider.disabled = !ouvert || !complet || identique;
    boutonValider.textContent = enregistre.length ? 'Modifier mon vote' : 'Valider mon vote';
    if (!ouvert) {
      aide.textContent = 'Les votes sont fermés : ce choix ne peut plus être modifié.';
    } else if (identique) {
      aide.textContent = 'Ce choix est déjà enregistré.';
    } else if (!complet) {
      aide.textContent =
        aChoisir === 2
          ? `Choisis deux personnes différentes (${selection.length}/2 sélectionnée${selection.length > 1 ? 's' : ''}).`
          : 'Choisis une personne.';
    } else {
      aide.textContent = 'Ton vote sera enregistré immédiatement.';
    }
  }

  // ---- Liste des nominés ----------------------------------------------------
  const liste = el('ul', { class: 'liste-nomines' });

  /** Reflète la sélection courante sans reconstruire la liste. */
  function majClasses() {
    for (const entree of liste.querySelectorAll('input')) {
      const choisi = selection.includes(entree.value);
      entree.checked = choisi;
      entree.closest('label')?.classList.toggle('nomine-choisi', choisi);
    }
  }

  function majListe(recherche = '') {
    const filtre = sansAccent(recherche);
    const visibles = filtre
      ? nomines.filter((n) => sansAccent(`${n.displayName} ${n.fullName}`).includes(filtre))
      : nomines;

    vider(liste);
    if (visibles.length === 0) {
      liste.appendChild(el('li', { class: 'vide' }, 'Aucun nom ne correspond à cette recherche.'));
      return;
    }

    for (const nomine of visibles) {
      const choisi = selection.includes(nomine.id);
      const entree = el('input', {
        type: aChoisir === 2 ? 'checkbox' : 'radio',
        name: 'nomine',
        value: nomine.id,
        checked: choisi,
        disabled: !ouvert,
        onchange: (evenement) => {
          if (aChoisir === 1) {
            selection = [nomine.id];
          } else if (evenement.target.checked) {
            if (selection.length >= 2) {
              // On refuse la troisième sélection plutôt que d'en retirer une
              // au hasard : le votant garde la main.
              evenement.target.checked = false;
              bandeau('Décoche d’abord une des deux personnes déjà choisies.', 'erreur');
              return;
            }
            selection = [...selection, nomine.id];
          } else {
            selection = selection.filter((id) => id !== nomine.id);
          }
          // On met à jour les classes en place : reconstruire la liste ferait
          // perdre le focus du clavier.
          majClasses();
          majPied();
        },
      });

      liste.appendChild(
        el(
          'li',
          {},
          el(
            'label',
            { class: choisi ? 'nomine nomine-choisi' : 'nomine' },
            entree,
            el('span', { class: 'nomine-nom' }, nomine.displayName),
          ),
        ),
      );
    }
  }

  const champRecherche = el('input', {
    type: 'search',
    id: 'recherche-nomine',
    placeholder: 'Rechercher un camarade…',
    autocomplete: 'off',
    oninput: (evenement) => majListe(evenement.target.value),
  });

  majListe();
  majPied();

  const formulaire = el(
    'form',
    {
      onsubmit: async (evenement) => {
        evenement.preventDefault();
        if (selection.length !== aChoisir) return;
        boutonValider.disabled = true;
        const texteInitial = boutonValider.textContent;
        boutonValider.textContent = 'Enregistrement…';

        const reponse = await api.voter(etat.code, categorie.id, selection);

        boutonValider.textContent = texteInitial;
        if (!reponse.ok) {
          boutonValider.disabled = false;
          if (reponse.code === 'invalid_code') {
            oublierCode();
            bandeau('Ce code n’est plus reconnu. Saisis-le à nouveau.', 'erreur');
            naviguer('/vote');
            return;
          }
          if (reponse.code === 'voting_closed') {
            appliquerEtatElection({ ...etat.election, votingOpen: false });
            bandeau(reponse.erreur, 'erreur');
            naviguer('/vote');
            return;
          }
          bandeau(reponse.erreur, 'erreur');
          return;
        }

        etat.votes = reponse.donnees.ballot ?? {};
        appliquerEtatElection(reponse.donnees.state);
        const noms = selection.map(nomAffiche).join(' + ');
        bandeau(`« ${categorie.title} » : ${noms}.`);
        naviguer('/vote');
      },
    },
    el(
      'fieldset',
      { style: 'border:0;padding:0;margin:0' },
      el('legend', { class: 'hors-ecran' }, `Nominés pour ${categorie.title}`),
      el('label', { for: 'recherche-nomine', class: 'hors-ecran' }, 'Rechercher un camarade'),
      champRecherche,
      el('p', { class: 'vote-consigne', style: 'margin:.6rem 0 .8rem' },
        `${nomines.length} camarades, par ordre alphabétique.`),
      liste,
    ),
    el(
      'div',
      { class: 'vote-pied' },
      aide,
      el(
        'div',
        { class: 'barre-actions', style: 'margin-top:.7rem' },
        boutonValider,
        boutonRetirer,
        el('a', { class: 'bouton-secondaire', href: '/vote', 'data-lien': '' }, 'Retour aux catégories'),
      ),
    ),
  );

  if (enregistre.length) {
    annoncer(`Catégorie déjà votée : ${enregistre.map(nomAffiche).join(' et ')}.`);
  }

  return el(
    'div',
    {},
    el(
      'div',
      { class: 'vote-entete' },
      el('p', { class: 'vote-theme' }, categorie.theme),
      el('h1', { style: 'font-size:clamp(1.6rem,6.5vw,2.3rem)' }, categorie.title),
      categorie.description ? el('p', { class: 'vote-description' }, categorie.description) : null,
      categorie.type === 'duo'
        ? el(
            'div',
            { class: 'message message-info' },
            'Catégorie à deux : choisis exactement deux personnes différentes. L’ordre n’a pas d’importance.',
          )
        : null,
    ),
    formulaire,
  );
}
