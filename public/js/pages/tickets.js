/**
 * Page des tickets à imprimer.
 *
 * Une grille de petits tickets à découper, chacun avec son code en clair et un
 * QR code qui ouvre le site avec le code dans le fragment d'URL (/#code=...),
 * jamais dans la query string : un fragment n'est pas envoyé au serveur et
 * n'apparaît donc dans aucun journal.
 */

import { el } from '../dom.js';
import { qrSvg } from '../qr.js';
import { lotCourant } from './lot.js';

function ticket(code) {
  const qr = el('div', { class: 'ticket-qr' });
  // Le SVG est fabriqué ici même, sans passer par le réseau.
  qr.innerHTML = qrSvg(`${location.origin}/#code=${code}`);

  return el(
    'div',
    { class: 'ticket' },
    qr,
    el(
      'div',
      {},
      el('p', { class: 'ticket-titre' }, 'CIN 2027 Awards'),
      el('p', { class: 'ticket-code' }, code),
      el(
        'p',
        { class: 'ticket-note' },
        'Garde ce ticket jusqu’à la cérémonie : il te permet de revenir modifier tes votes. Ne le montre à personne.',
      ),
    ),
  );
}

export async function rendre({ naviguer }) {
  const codes = lotCourant();

  if (codes.length === 0) {
    return el(
      'div',
      { class: 'contenu-texte' },
      el('h1', {}, 'Aucun lot en mémoire'),
      el(
        'p',
        {},
        'Les codes ne sont affichés qu’une seule fois et ne sont jamais enregistrés : recharger la page les perd. Génère un nouveau lot depuis l’administration.',
      ),
      el('button', { class: 'bouton', onclick: () => naviguer('/admin') }, 'Retour à l’administration'),
    );
  }

  return el(
    'div',
    {},
    el(
      'div',
      { class: 'sans-impression' },
      el('h1', {}, `${codes.length} tickets à imprimer`),
      el(
        'div',
        { class: 'message message-info' },
        el(
          'p',
          { style: 'margin:0 0 .5em' },
          el('strong', {}, 'À faire maintenant : '),
          'imprimer cette page, découper les tickets, les plier et les mélanger dans une boîte. Chacun en tire un au hasard — c’est ce tirage qui garantit l’anonymat.',
        ),
        el(
          'p',
          { style: 'margin:0' },
          'Ces codes ne seront plus jamais affichés. Si tu quittes la page sans imprimer, il faudra générer un nouveau lot.',
        ),
      ),
      el(
        'div',
        { class: 'barre-actions', style: 'margin-bottom:1.2rem' },
        el('button', { class: 'bouton', onclick: () => window.print() }, 'Imprimer'),
        el(
          'button',
          { class: 'bouton-secondaire', onclick: () => naviguer('/admin') },
          'Retour à l’administration',
        ),
      ),
    ),
    el('div', { class: 'tickets-grille' }, codes.map(ticket)),
  );
}
