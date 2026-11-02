/**
 * Amorçage et routage.
 *
 * Routage côté client sur les chemins réels (/, /vote, /vote/<categorie>,
 * /fonctionnement, /admin, /ceremonie). Les pages d'administration et de
 * cérémonie sont chargées à la demande : le votant ne télécharge jamais leur
 * code.
 */

import { api } from './api.js';
import { annoncer, el, messageErreur, vider } from './dom.js';
import {
  appliquerEtatElection,
  chargerCatalogue,
  codeMemorise,
  enregistrerCode,
  etat,
  oublierCode,
  integrerCategories,
  retenirMemorise,
} from './etat.js';

const app = document.getElementById('app');
const boutonDeconnexion = document.getElementById('bouton-deconnexion');

const ROUTES = [
  { motif: /^\/?$/, titre: 'CIN 2027 Awards', module: () => import('./pages/accueil.js') },
  { motif: /^\/vote\/?$/, titre: 'Catégories — CIN 2027 Awards', module: () => import('./pages/tableau.js') },
  {
    motif: /^\/vote\/([a-z0-9-]+)\/?$/,
    titre: 'Vote — CIN 2027 Awards',
    module: () => import('./pages/vote.js'),
  },
  {
    motif: /^\/fonctionnement\/?$/,
    titre: 'Comment ça marche ? — CIN 2027 Awards',
    module: () => import('./pages/fonctionnement.js'),
  },
  { motif: /^\/admin\/?$/, titre: 'Administration — CIN 2027', module: () => import('./pages/admin.js') },
  {
    motif: /^\/admin\/tickets\/?$/,
    titre: 'Tickets à imprimer — CIN 2027',
    module: () => import('./pages/tickets.js'),
  },
  { motif: /^\/ceremonie\/?$/, titre: 'Cérémonie — CIN 2027', module: () => import('./pages/ceremonie.js') },
];

function majEntete() {
  // Ce bouton efface le code du VOTANT : il n'a rien à faire dans les pages
  // d'administration, qui ont leur propre déconnexion.
  const pageAdministration = /^\/(admin|ceremonie)/.test(location.pathname);
  boutonDeconnexion.hidden = !etat.code || pageAdministration;
}

export function naviguer(chemin, { remplacer = false } = {}) {
  if (chemin === location.pathname) return rendre(chemin);
  if (remplacer) history.replaceState(null, '', chemin);
  else history.pushState(null, '', chemin);
  return rendre(chemin);
}

const contexte = {
  naviguer,
  recharger: () => rendre(location.pathname),
  majEntete,
};

let compteurRendu = 0;

async function rendre(chemin) {
  const jeton = ++compteurRendu;
  const route = ROUTES.find((r) => r.motif.test(chemin));

  if (!route) {
    vider(app);
    app.appendChild(
      el(
        'div',
        { class: 'contenu-texte' },
        el('h1', {}, 'Page introuvable'),
        el('p', {}, 'Cette adresse ne correspond à rien sur ce site.'),
        el('a', { class: 'bouton', href: '/', 'data-lien': '' }, 'Retour à l’accueil'),
      ),
    );
    return;
  }

  vider(app);
  app.appendChild(el('p', { class: 'chargement' }, 'Chargement…'));

  try {
    const module = await route.module();
    const params = chemin.match(route.motif)?.slice(1) ?? [];
    const noeud = await module.rendre({ ...contexte, params });
    // Une navigation plus récente a eu lieu pendant le chargement : on abandonne.
    if (jeton !== compteurRendu) return;
    vider(app);
    app.appendChild(noeud);
    document.title = route.titre;
    majEntete();
    // Le lecteur d'écran et le clavier repartent du début du contenu.
    document.getElementById('contenu')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (erreur) {
    if (jeton !== compteurRendu) return;
    console.error('[routeur]', erreur);
    vider(app);
    app.appendChild(
      messageErreur('Cette page n’a pas pu être affichée.', () => rendre(chemin)),
    );
  }
}

/** Interception des liens internes, pour éviter un rechargement complet. */
document.addEventListener('click', (evenement) => {
  const lien = evenement.target.closest('a[data-lien]');
  if (!lien) return;
  if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.button !== 0) return;
  const cible = new URL(lien.href, location.origin);
  if (cible.origin !== location.origin) return;
  evenement.preventDefault();
  naviguer(cible.pathname);
});

window.addEventListener('popstate', () => rendre(location.pathname));

boutonDeconnexion.addEventListener('click', () => {
  oublierCode();
  majEntete();
  annoncer('Code effacé de cet appareil.');
  naviguer('/');
});

/**
 * Récupère un code arrivé par QR code dans le fragment d'URL (/#code=...), puis
 * le retire aussitôt de la barre d'adresse. Le fragment n'est jamais envoyé au
 * serveur : il n'apparaît donc dans aucun journal.
 */
function codeDuFragment() {
  const correspondance = location.hash.match(/^#code=([^&]+)$/i);
  if (!correspondance) return null;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    return decodeURIComponent(correspondance[1]);
  } catch {
    return correspondance[1];
  }
}

async function demarrer() {
  const codeQr = codeDuFragment();

  try {
    await chargerCatalogue();
  } catch {
    vider(app);
    app.appendChild(
      messageErreur('Les catégories n’ont pas pu être chargées.', () => location.reload()),
    );
    return;
  }

  const reponseEtat = await api.etat();
  if (reponseEtat.ok) {
    appliquerEtatElection(reponseEtat.donnees);
    integrerCategories(reponseEtat.donnees.customCategories);
  }

  etat.retenir = retenirMemorise();
  const codeConnu = codeQr ?? codeMemorise();

  if (codeConnu) {
    const reponse = await api.chargerVotes(codeConnu);
    if (reponse.ok) {
      etat.votes = reponse.donnees.ballot ?? {};
      appliquerEtatElection(reponse.donnees.state);
      // Un code lu dans un QR code n'est mémorisé que pour l'onglet : c'est à
      // la page de saisie, et à sa case à cocher, d'en décider autrement.
      enregistrerCode(codeConnu, codeQr ? etat.retenir : retenirMemorise());
      majEntete();
      if (codeQr) {
        await naviguer('/vote', { remplacer: true });
        return;
      }
    } else if (reponse.code === 'invalid_code') {
      oublierCode();
    }
  }

  majEntete();
  await rendre(location.pathname);
}

demarrer();
