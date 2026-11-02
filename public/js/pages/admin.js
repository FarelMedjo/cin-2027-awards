/**
 * Espace administrateur.
 *
 * Tout passe par /api/admin, protégé par un mot de passe et une session courte.
 * Les résultats ne sont servis qu'une fois les votes fermés : la page ne peut
 * donc pas les afficher avant, même par erreur.
 */

import { api } from '../api.js';
import { bandeau, el, messageErreur, sansAccent, vider } from '../dom.js';
import { etat, integrerCategories } from '../etat.js';
import { enregistrerLot } from './lot.js';

/** Propose un fichier au téléchargement, sans quitter la page. */
function telecharger(nomFichier, contenu, type) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const lien = el('a', { href: url, download: nomFichier });
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formaterDouala(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'Africa/Douala',
    dateStyle: 'full',
    timeStyle: 'short',
  });
}

/** « 2027-01-15T18:00 » pour un champ datetime-local, en heure de Douala. */
function versChampLocal(iso) {
  if (!iso) return '';
  const parties = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Africa/Douala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const valeur = (type) => parties.find((p) => p.type === type)?.value ?? '';
  return `${valeur('year')}-${valeur('month')}-${valeur('day')}T${valeur('hour')}:${valeur('minute')}`;
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

function pageConnexion(recharger) {
  const champ = el('input', { type: 'password', id: 'mot-de-passe', autocomplete: 'current-password' });
  const zoneMessage = el('div', {});
  const bouton = el('button', { class: 'bouton', type: 'submit' }, 'Se connecter');

  return el(
    'div',
    { class: 'formulaire-code' },
    el('h1', {}, 'Administration'),
    el(
      'form',
      {
        onsubmit: async (evenement) => {
          evenement.preventDefault();
          bouton.disabled = true;
          const reponse = await api.admin('login', { password: champ.value });
          bouton.disabled = false;
          if (!reponse.ok) {
            vider(zoneMessage);
            zoneMessage.appendChild(el('div', { class: 'message message-erreur' }, reponse.erreur));
            champ.select();
            return;
          }
          recharger();
        },
      },
      el('label', { for: 'mot-de-passe' }, 'Mot de passe'),
      champ,
      zoneMessage,
      el('div', { class: 'barre-actions', style: 'margin-top:1rem' }, bouton),
    ),
  );
}

// ---------------------------------------------------------------------------
// Panneaux
// ---------------------------------------------------------------------------

/** Catégories masquées : leurs voix sont conservées, mais n'entrent dans aucun résultat. */
function detailArchivees(participation) {
  const archivees = etat.catalogue.archivees ?? [];
  if (archivees.length === 0) return null;
  const devenir = (categorie) => {
    if (!categorie.mergedInto) return 'supprimée';
    const cible = etat.catalogue.toutesParId.get(categorie.mergedInto);
    return `fusionnée dans « ${cible?.title ?? categorie.mergedInto} »`;
  };
  return el(
    'details',
    {},
    el(
      'summary',
      { style: 'cursor:pointer;min-height:44px;padding:.6rem 0' },
      `Catégories masquées : ${participation.archivedVotes ?? 0} voix conservées`,
    ),
    el(
      'p',
      { class: 'champ-aide' },
      'Retirées de l’affichage et du vote. Leurs voix restent enregistrées et comptées dans le total ci-dessus, mais n’entrent dans aucun résultat.',
    ),
    el(
      'table',
      { class: 'tableau' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', {}, 'Catégorie masquée'),
          el('th', {}, 'Devenue'),
          el('th', { class: 'nombre' }, 'Voix'),
        ),
      ),
      el(
        'tbody',
        {},
        archivees.map((categorie) =>
          el(
            'tr',
            {},
            el('td', {}, categorie.title),
            el('td', {}, devenir(categorie)),
            el('td', { class: 'nombre' }, String(participation.votesByCategory[categorie.id] ?? 0)),
          ),
        ),
      ),
    ),
  );
}

function panneauParticipation(donnees, surRafraichir) {
  const { participation, state } = donnees;
  const parCategorie = etat.catalogue.categories
    .map((categorie) => ({ categorie, voix: participation.votesByCategory[categorie.id] ?? 0 }))
    .sort((a, b) => b.voix - a.voix);

  return el(
    'section',
    { class: 'panneau' },
    el('h2', {}, 'Participation'),
    el(
      'ul',
      { class: 'statistiques' },
      el(
        'li',
        {},
        el('span', { class: 'statistique-valeur' }, String(participation.codesGenerated)),
        el('span', { class: 'statistique-nom' }, 'codes générés'),
      ),
      el(
        'li',
        {},
        el('span', { class: 'statistique-valeur' }, String(participation.codesUsed)),
        el('span', { class: 'statistique-nom' }, 'ont voté'),
      ),
      el(
        'li',
        {},
        el('span', { class: 'statistique-valeur' }, String(participation.totalVotes)),
        el('span', { class: 'statistique-nom' }, 'voix au total'),
      ),
    ),
    participation.warnings.length
      ? el(
          'div',
          { class: 'message message-erreur' },
          el('strong', {}, 'Contrôle de cohérence : '),
          el('ul', {}, participation.warnings.map((avertissement) => el('li', {}, avertissement))),
        )
      : el(
          'p',
          { class: 'champ-aide' },
          'Contrôle de cohérence : aucune catégorie n’a plus de voix que de codes ayant voté.',
        ),
    el(
      'details',
      {},
      el('summary', { style: 'cursor:pointer;min-height:44px;padding:.6rem 0' }, 'Voir le détail par catégorie'),
      el(
        'table',
        { class: 'tableau' },
        el(
          'thead',
          {},
          el('tr', {}, el('th', {}, 'Catégorie'), el('th', { class: 'nombre' }, 'Voix')),
        ),
        el(
          'tbody',
          {},
          parCategorie.map(({ categorie, voix }) =>
            el('tr', {}, el('td', {}, categorie.title), el('td', { class: 'nombre' }, String(voix))),
          ),
        ),
      ),
    ),
    detailArchivees(participation),
    el(
      'p',
      { class: 'champ-aide' },
      state.votingOpen
        ? 'Les résultats ne sont pas consultables tant que les votes sont ouverts.'
        : 'Les votes sont fermés : les résultats sont consultables plus bas.',
    ),
    el(
      'div',
      { class: 'barre-actions' },
      el('button', { class: 'bouton-secondaire', onclick: surRafraichir }, 'Rafraîchir'),
    ),
  );
}

function panneauOuverture(donnees, recharger) {
  const { state } = donnees;
  const champDate = el('input', {
    type: 'datetime-local',
    id: 'cloture',
    value: versChampLocal(state.closesAt),
  });

  const basculer = async (action) => {
    const reponse = await api.admin(action);
    if (!reponse.ok) return bandeau(reponse.erreur, 'erreur');
    bandeau(action === 'open' ? 'Votes ouverts.' : 'Votes fermés.');
    recharger();
  };

  return el(
    'section',
    { class: 'panneau' },
    el('h2', {}, 'Ouverture des votes'),
    el(
      'p',
      {},
      'État actuel : ',
      el(
        'strong',
        { style: `color:${state.votingOpen ? 'var(--vote)' : 'var(--alerte)'}` },
        state.votingOpen ? 'ouverts' : 'fermés',
      ),
      state.closesAt
        ? el('span', {}, ` — clôture automatique le ${formaterDouala(state.closesAt)} (heure de Douala).`)
        : el('span', {}, ' — aucune clôture automatique programmée.'),
    ),
    el(
      'div',
      { class: 'barre-actions' },
      el(
        'button',
        { class: 'bouton', disabled: state.isOpen, onclick: () => basculer('open') },
        'Ouvrir les votes',
      ),
      el(
        'button',
        { class: 'bouton-danger', disabled: !state.isOpen, onclick: () => basculer('close') },
        'Fermer les votes',
      ),
    ),
    el('hr', { style: 'border:0;border-top:1px solid var(--bordure);margin:1.2rem 0' }),
    el('label', { for: 'cloture' }, 'Clôture automatique (heure de Douala)'),
    champDate,
    el(
      'p',
      { class: 'champ-aide' },
      'À l’heure indiquée, les votes se ferment d’eux-mêmes, à la seconde près. Laisse vide pour ne pas programmer de clôture.',
    ),
    el(
      'div',
      { class: 'barre-actions', style: 'margin-top:.8rem' },
      el(
        'button',
        {
          class: 'bouton-secondaire',
          onclick: async () => {
            const reponse = await api.admin('schedule', { closesAt: champDate.value || null });
            if (!reponse.ok) return bandeau(reponse.erreur, 'erreur');
            bandeau('Date de clôture enregistrée.');
            recharger();
          },
        },
        'Enregistrer la date',
      ),
      state.closesAt
        ? el(
            'button',
            {
              class: 'bouton-secondaire',
              onclick: async () => {
                const reponse = await api.admin('schedule', { closesAt: null });
                if (!reponse.ok) return bandeau(reponse.erreur, 'erreur');
                bandeau('Clôture automatique retirée.');
                recharger();
              },
            },
            'Retirer la clôture',
          )
        : null,
    ),
  );
}

function panneauCodes(naviguer, recharger) {
  const champNombre = el('input', { type: 'number', id: 'nombre-codes', value: '45', min: '1', max: '200' });
  const zoneResultat = el('div', {});

  return el(
    'section',
    { class: 'panneau' },
    el('h2', {}, 'Codes et tickets'),
    el(
      'p',
      { class: 'champ-aide' },
      'Les codes ne sont affichés qu’une seule fois : le serveur n’en garde qu’une empreinte. Imprime les tickets ou enregistre le CSV avant de quitter cette page.',
    ),
    el('label', { for: 'nombre-codes' }, 'Nombre de codes à générer'),
    champNombre,
    el(
      'div',
      { class: 'barre-actions', style: 'margin-top:.8rem' },
      el(
        'button',
        {
          class: 'bouton',
          onclick: async (evenement) => {
            const bouton = evenement.currentTarget;
            bouton.disabled = true;
            const reponse = await api.admin('generate-codes', { count: Number(champNombre.value) });
            bouton.disabled = false;
            if (!reponse.ok) return bandeau(reponse.erreur, 'erreur');

            enregistrerLot(reponse.donnees.codes);
            vider(zoneResultat);
            zoneResultat.appendChild(
              el(
                'div',
                { class: 'message message-succes' },
                el(
                  'p',
                  { style: 'margin:0 0 .6em' },
                  `${reponse.donnees.codes.length} codes générés (${reponse.donnees.total} au total sur le site).`,
                ),
                el(
                  'div',
                  { class: 'barre-actions' },
                  el(
                    'button',
                    { class: 'bouton', onclick: () => naviguer('/admin/tickets') },
                    'Voir les tickets à imprimer',
                  ),
                  el(
                    'button',
                    {
                      class: 'bouton-secondaire',
                      onclick: () => {
                        const lignes = ['code', ...reponse.donnees.codes].join('\r\n');
                        telecharger(
                          `tickets-cin2027-${new Date().toISOString().slice(0, 10)}.csv`,
                          `﻿${lignes}\r\n`,
                          'text/csv;charset=utf-8',
                        );
                      },
                    },
                    'Télécharger le CSV',
                  ),
                ),
              ),
            );
          },
        },
        'Générer un lot de codes',
      ),
    ),
    zoneResultat,
  );
}

const NOUVEAU_THEME = '__nouveau__';

function panneauCategories(personnalisees, recharger) {
  const champTitre = el('input', {
    type: 'text',
    id: 'categorie-titre',
    maxlength: '80',
    autocomplete: 'off',
    placeholder: 'Ex. : Le plus ponctuel',
  });
  const choixTheme = el(
    'select',
    {
      id: 'categorie-theme',
      onchange: () => {
        champNouveauTheme.hidden = choixTheme.value !== NOUVEAU_THEME;
        if (!champNouveauTheme.hidden) champNouveauTheme.focus();
      },
    },
    etat.catalogue.themes.map((theme) => el('option', { value: theme }, theme)),
    el('option', { value: NOUVEAU_THEME }, 'Nouveau thème…'),
  );
  const champNouveauTheme = el('input', {
    type: 'text',
    id: 'categorie-nouveau-theme',
    maxlength: '60',
    autocomplete: 'off',
    placeholder: 'Nom du nouveau thème',
    'aria-label': 'Nom du nouveau thème',
    hidden: true,
  });
  const champDescription = el('input', {
    type: 'text',
    id: 'categorie-description',
    maxlength: '200',
    autocomplete: 'off',
    placeholder: 'Une phrase pour présenter la catégorie (facultatif)',
  });
  const choixType = el(
    'select',
    { id: 'categorie-type' },
    el('option', { value: 'single' }, 'Une personne'),
    el('option', { value: 'duo' }, 'Deux personnes (binôme)'),
  );
  const bouton = el('button', { class: 'bouton', type: 'submit' }, 'Créer la catégorie');

  return el(
    'section',
    { class: 'panneau' },
    el('h2', {}, 'Créer une catégorie'),
    el(
      'p',
      { class: 'champ-aide' },
      'La catégorie apparaît tout de suite pour les votants, qui la verront à leur prochain chargement du site. Elle est ajoutée à la fin de la liste et reste en place après une réinitialisation de l’élection.',
    ),
    el(
      'form',
      {
        onsubmit: async (evenement) => {
          evenement.preventDefault();
          const theme =
            choixTheme.value === NOUVEAU_THEME ? champNouveauTheme.value : choixTheme.value;
          bouton.disabled = true;
          const reponse = await api.admin('category-add', {
            category: {
              title: champTitre.value,
              theme,
              description: champDescription.value,
              type: choixType.value,
            },
          });
          bouton.disabled = false;
          if (!reponse.ok) return bandeau(reponse.erreur, 'erreur');
          bandeau(`Catégorie « ${reponse.donnees.category.title} » créée.`);
          recharger();
        },
      },
      el('label', { for: 'categorie-titre' }, 'Titre'),
      champTitre,
      el('label', { for: 'categorie-theme' }, 'Thème'),
      choixTheme,
      champNouveauTheme,
      el('label', { for: 'categorie-description' }, 'Description'),
      champDescription,
      el('label', { for: 'categorie-type' }, 'Nombre de personnes à choisir'),
      choixType,
      el('div', { class: 'barre-actions', style: 'margin-top:1rem' }, bouton),
    ),
    personnalisees.length
      ? el(
          'div',
          { style: 'margin-top:1.2rem' },
          el('h3', {}, `Catégories ajoutées (${personnalisees.length})`),
          el(
            'ul',
            {},
            personnalisees.map((categorie) =>
              el(
                'li',
                {},
                `${categorie.title} — ${categorie.theme}${categorie.type === 'duo' ? ' (binôme)' : ''}`,
              ),
            ),
          ),
        )
      : null,
  );
}

function panneauCeremonie(ordreInitial, naviguer) {
  let ordre = [...ordreInitial];
  const liste = el('ul', { class: 'liste-ordre' });
  const disponibles = el('div', {});
  const champRecherche = el('input', {
    type: 'search',
    placeholder: 'Rechercher une catégorie à ajouter…',
    oninput: () => majDisponibles(),
  });

  function deplacer(index, delta) {
    const cible = index + delta;
    if (cible < 0 || cible >= ordre.length) return;
    [ordre[index], ordre[cible]] = [ordre[cible], ordre[index]];
    majTout();
  }

  function majListe() {
    vider(liste);
    if (ordre.length === 0) {
      liste.appendChild(
        el('p', { class: 'champ-aide' }, 'Aucune catégorie sélectionnée : la cérémonie serait vide.'),
      );
      return;
    }
    ordre.forEach((id, index) => {
      const categorie = etat.catalogue.parId.get(id);
      if (!categorie) return;
      const element = el(
        'li',
        {
          class: 'ordre-element',
          draggable: 'true',
          ondragstart: (evenement) => evenement.dataTransfer.setData('text/plain', String(index)),
          ondragover: (evenement) => {
            evenement.preventDefault();
            element.classList.add('survol');
          },
          ondragleave: () => element.classList.remove('survol'),
          ondrop: (evenement) => {
            evenement.preventDefault();
            element.classList.remove('survol');
            const depart = Number(evenement.dataTransfer.getData('text/plain'));
            if (Number.isNaN(depart) || depart === index) return;
            const [deplace] = ordre.splice(depart, 1);
            ordre.splice(index, 0, deplace);
            majTout();
          },
        },
        el('span', { class: 'ordre-rang' }, String(index + 1)),
        el('span', { class: 'ordre-titre' }, categorie.title),
        el(
          'span',
          { class: 'ordre-boutons' },
          el(
            'button',
            { type: 'button', 'aria-label': `Monter ${categorie.title}`, onclick: () => deplacer(index, -1) },
            '↑',
          ),
          el(
            'button',
            { type: 'button', 'aria-label': `Descendre ${categorie.title}`, onclick: () => deplacer(index, 1) },
            '↓',
          ),
          el(
            'button',
            {
              type: 'button',
              'aria-label': `Retirer ${categorie.title}`,
              onclick: () => {
                ordre = ordre.filter((autre) => autre !== id);
                majTout();
              },
            },
            '✕',
          ),
        ),
      );
      liste.appendChild(element);
    });
  }

  function majDisponibles() {
    const recherche = sansAccent(champRecherche.value.trim());
    const restantes = etat.catalogue.categories
      .filter((categorie) => !ordre.includes(categorie.id))
      .filter((categorie) => !recherche || sansAccent(categorie.title).includes(recherche));

    vider(disponibles);
    disponibles.appendChild(
      el(
        'div',
        { class: 'filtres-themes', style: 'flex-wrap:wrap;max-height:9rem;overflow:auto' },
        restantes.slice(0, 60).map((categorie) =>
          el(
            'button',
            {
              type: 'button',
              class: 'puce',
              onclick: () => {
                ordre = [...ordre, categorie.id];
                majTout();
              },
            },
            `+ ${categorie.title}`,
          ),
        ),
      ),
    );
  }

  function majTout() {
    majListe();
    majDisponibles();
  }

  majTout();

  return el(
    'section',
    { class: 'panneau' },
    el('h2', {}, 'Mode cérémonie'),
    el(
      'p',
      { class: 'champ-aide' },
      'Choisis les catégories à révéler sur grand écran, et leur ordre. Les autres restent consultables dans les résultats et dans l’export.',
    ),
    el(
      'div',
      { class: 'barre-actions', style: 'margin-bottom:.8rem' },
      el(
        'button',
        {
          class: 'bouton-secondaire',
          onclick: () => {
            ordre = etat.catalogue.categories.map((categorie) => categorie.id);
            majTout();
          },
        },
        'Tout sélectionner',
      ),
      el(
        'button',
        {
          class: 'bouton-secondaire',
          onclick: () => {
            ordre = [];
            majTout();
          },
        },
        'Tout retirer',
      ),
    ),
    liste,
    el('h3', { style: 'margin-top:1.2rem' }, 'Ajouter une catégorie'),
    champRecherche,
    disponibles,
    el(
      'div',
      { class: 'barre-actions', style: 'margin-top:1rem' },
      el(
        'button',
        {
          class: 'bouton',
          onclick: async () => {
            const reponse = await api.admin('ceremony-set', { order: ordre });
            if (!reponse.ok) return bandeau(reponse.erreur, 'erreur');
            bandeau(`Ordre enregistré : ${reponse.donnees.order.length} catégories.`);
          },
        },
        'Enregistrer l’ordre',
      ),
      el(
        'button',
        { class: 'bouton-secondaire', onclick: () => naviguer('/ceremonie') },
        'Ouvrir le mode cérémonie',
      ),
    ),
  );
}

function panneauResultats(state) {
  const zone = el('div', {});

  if (state.votingOpen) {
    return el(
      'section',
      { class: 'panneau' },
      el('h2', {}, 'Résultats'),
      el(
        'div',
        { class: 'message message-info' },
        'Les résultats ne seront consultables qu’après la clôture des votes. Le serveur refuse de les calculer avant.',
      ),
    );
  }

  const afficher = async () => {
    const reponse = await api.admin('results');
    if (!reponse.ok) return bandeau(reponse.erreur, 'erreur');
    vider(zone);
    for (const resultat of reponse.donnees.results) {
      zone.appendChild(
        el(
          'details',
          { style: 'margin-bottom:.4rem' },
          el(
            'summary',
            { style: 'cursor:pointer;min-height:44px;padding:.6rem 0' },
            `${resultat.title} — ${resultat.totalVotes} voix`,
          ),
          resultat.rows.length === 0
            ? el('p', { class: 'champ-aide' }, 'Aucun vote dans cette catégorie.')
            : el(
                'table',
                { class: 'tableau' },
                el(
                  'thead',
                  {},
                  el(
                    'tr',
                    {},
                    el('th', { class: 'nombre' }, 'Rang'),
                    el('th', {}, 'Nominé(s)'),
                    el('th', { class: 'nombre' }, 'Voix'),
                  ),
                ),
                el(
                  'tbody',
                  {},
                  resultat.rows.map((ligne) =>
                    el(
                      'tr',
                      {},
                      el('td', { class: 'nombre' }, `${ligne.rank}${ligne.tied ? ' ex æquo' : ''}`),
                      el('td', {}, ligne.names.join(' + ')),
                      el('td', { class: 'nombre' }, String(ligne.votes)),
                    ),
                  ),
                ),
              ),
        ),
      );
    }
  };

  return el(
    'section',
    { class: 'panneau' },
    el('h2', {}, 'Résultats'),
    el(
      'div',
      { class: 'barre-actions' },
      el('button', { class: 'bouton', onclick: afficher }, 'Afficher les résultats'),
      el(
        'button',
        {
          class: 'bouton-secondaire',
          onclick: async () => {
            const reponse = await api.admin('results-csv');
            if (!reponse.ok) return bandeau(reponse.erreur, 'erreur');
            telecharger(
              `resultats-cin2027-${new Date().toISOString().slice(0, 10)}.csv`,
              reponse.donnees.csv,
              'text/csv;charset=utf-8',
            );
          },
        },
        'Exporter en CSV',
      ),
    ),
    zone,
  );
}

function panneauReinitialisation(recharger) {
  const caseConfirmation = el('input', { type: 'checkbox' });
  const champMot = el('input', { type: 'text', id: 'mot-confirmation', placeholder: 'REINITIALISER', autocomplete: 'off' });

  return el(
    'section',
    { class: 'panneau', style: 'border-color:var(--alerte)' },
    el('h2', { style: 'color:var(--alerte)' }, 'Réinitialiser l’élection'),
    el(
      'p',
      {},
      'Supprime définitivement tous les votes, tous les dossiers votants et tous les codes. À utiliser pour un essai avant le vrai vote.',
    ),
    el('label', { class: 'case' }, caseConfirmation, 'Je comprends que tout sera effacé, sans retour possible'),
    el('label', { for: 'mot-confirmation' }, 'Tape REINITIALISER pour confirmer'),
    champMot,
    el(
      'div',
      { class: 'barre-actions', style: 'margin-top:.8rem' },
      el(
        'button',
        {
          class: 'bouton-danger',
          onclick: async () => {
            const reponse = await api.admin('reset', {
              confirm: champMot.value.trim().toUpperCase(),
              confirmTwice: caseConfirmation.checked,
            });
            if (!reponse.ok) return bandeau(reponse.erreur, 'erreur');
            const { removed } = reponse.donnees;
            bandeau(
              `Élection réinitialisée : ${removed.votes} votes, ${removed.voters} dossiers, ${removed.codes} codes supprimés.`,
            );
            champMot.value = '';
            caseConfirmation.checked = false;
            recharger();
          },
        },
        'Tout effacer',
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export async function rendre(contexte) {
  const { naviguer, recharger } = contexte;

  const statut = await api.admin('status');
  if (!statut.ok) {
    return messageErreur(statut.erreur, recharger);
  }
  if (!statut.donnees.authenticated) {
    return pageConnexion(recharger);
  }

  const donnees = statut.donnees;
  // Le catalogue du navigateur doit contenir les catégories ajoutées depuis le dernier chargement.
  integrerCategories(donnees.customCategories);

  return el(
    'div',
    {},
    el(
      'div',
      { class: 'barre-actions', style: 'justify-content:space-between;margin-bottom:1rem' },
      el('h1', { style: 'margin:0;font-size:clamp(1.7rem,6vw,2.3rem)' }, 'Administration'),
      el(
        'button',
        {
          class: 'bouton-secondaire',
          onclick: async () => {
            await api.admin('logout');
            bandeau('Déconnecté.');
            recharger();
          },
        },
        'Se déconnecter',
      ),
    ),
    el(
      'div',
      { class: 'admin-grille' },
      panneauParticipation(donnees, recharger),
      panneauOuverture(donnees, recharger),
      panneauCodes(naviguer, recharger),
      panneauCategories(donnees.customCategories ?? [], recharger),
      panneauCeremonie(donnees.ceremonyOrder ?? [], naviguer),
      panneauResultats(donnees.state),
      panneauReinitialisation(recharger),
    ),
  );
}
