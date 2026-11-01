/** « Comment ça marche ? » — l'anonymat expliqué simplement. */

import { el } from '../dom.js';

export async function rendre() {
  return el(
    'div',
    { class: 'contenu-texte' },
    el('h1', {}, 'Comment ça marche ?'),
    el(
      'p',
      {},
      'Ce site a un seul objectif : te laisser voter librement, sans que personne ne puisse savoir ce que tu as voté. Voici, sans jargon, comment c’est fait.',
    ),

    el('h2', {}, 'Ton code est tiré au hasard'),
    el(
      'p',
      {},
      'Les codes sont générés par le site, imprimés sur des petits tickets, mélangés dans une boîte, puis tirés au hasard dans la salle. Personne ne note qui prend quel ticket. Il n’existe donc, nulle part, de liste reliant un code à un nom — ni chez l’organisateur, ni sur le serveur.',
    ),
    el(
      'p',
      {},
      'Ce code est ta clé personnelle pendant toute la durée du vote : c’est lui qui te permet de revenir, de voir tes choix et de les modifier.',
    ),

    el('h2', {}, 'Le serveur ne connaît jamais ton code'),
    el(
      'p',
      {},
      'Quand tu saisis ton code, le serveur n’en garde pas une copie : il en calcule une empreinte, un peu comme une empreinte digitale. L’empreinte permet de reconnaître que le code est valide, mais il est impossible de remonter du code à l’empreinte — et impossible de deviner le code à partir d’elle.',
    ),

    el('h2', {}, 'Tes votes et ton code sont rangés séparément'),
    el(
      'p',
      {},
      'C’est le point le plus important. Chaque vote est enregistré dans une « ligne » qui ne contient que le nom choisi. Rien d’autre : ni ton code, ni son empreinte, ni ton adresse Internet, ni l’heure. Deux lignes de vote sont donc impossibles à rapprocher, même pour quelqu’un qui aurait accès à tout le stockage.',
    ),
    el(
      'p',
      {},
      'Pour que tu puisses revenir modifier un vote, le site garde à part un petit « dossier » qui dit quelle ligne t’appartient. Ce dossier est chiffré avec une clé fabriquée à partir de ton code, et cette clé n’est stockée nulle part. Sans ton ticket, le dossier est un bloc de caractères illisible — y compris pour l’organisateur.',
    ),
    el(
      'p',
      {},
      'Autrement dit : le site sait « quelqu’un a voté pour untel dans cette catégorie », et il sait « ce code a voté dans 12 catégories ». Mais il ne peut pas relier les deux.',
    ),

    el('h2', {}, 'Une seule voix par catégorie, et des changements d’avis permis'),
    el(
      'p',
      {},
      'Tu as une voix par catégorie. Tu choisis les catégories qui t’intéressent, dans l’ordre que tu veux, et tu n’es pas obligé de toutes les faire. Chaque vote est enregistré immédiatement : tu peux fermer le site et revenir plus tard, autant de fois que tu veux jusqu’à la clôture, pour voter ailleurs ou changer un choix après réflexion.',
    ),
    el(
      'p',
      {},
      'Quand tu modifies un vote, l’ancienne ligne est supprimée et une nouvelle est créée avec une identité différente. Le total reste juste, et l’historique de tes hésitations ne se conserve pas.',
    ),

    el('h2', {}, 'Les résultats restent cachés'),
    el(
      'p',
      {},
      'Pendant toute la durée du vote, personne — organisateur compris — ne peut consulter les résultats depuis le site : il n’affiche que le nombre de participants. Les classements ne deviennent consultables qu’une fois les votes fermés, et ils seront révélés pendant la cérémonie.',
    ),

    el(
      'div',
      { class: 'encadre' },
      el('h3', {}, 'À retenir, côté pratique'),
      el(
        'ul',
        {},
        el(
          'li',
          {},
          el('strong', {}, 'Garde ton ticket. '),
          'Si tu le perds, personne ne peut retrouver tes votes ni t’en redonner l’accès : c’est le prix de l’anonymat. Tes votes déjà enregistrés restent comptés, tu ne peux simplement plus les modifier.',
        ),
        el(
          'li',
          {},
          el('strong', {}, 'Ne montre ton code à personne. '),
          'Celui qui l’a peut voir et modifier tes votes.',
        ),
        el(
          'li',
          {},
          el('strong', {}, '« Se souvenir de mon code » '),
          'est pratique sur ton propre téléphone, à éviter sur un appareil partagé. Le bouton « Se déconnecter » efface le code de l’appareil.',
        ),
      ),
    ),

    el('h2', {}, 'Ce que ce site ne peut pas promettre'),
    el(
      'p',
      {},
      'Par honnêteté : le site est hébergé chez un prestataire (Netlify), et comme tout hébergeur, celui-ci conserve un temps des journaux techniques des requêtes reçues, avec adresse Internet et horodatage. Ces journaux ne contiennent pas tes votes, et rien dans les données enregistrées ne permet de les relier à un vote. Mais cette partie-là ne dépend pas de nous, et il faut le dire.',
    ),
    el(
      'p',
      {},
      'Le site ne collecte aucune donnée personnelle, n’utilise aucun outil de mesure d’audience ni de suivi, et n’est pas référencé par les moteurs de recherche.',
    ),

    el(
      'div',
      { class: 'barre-actions', style: 'margin-top:2rem' },
      el('a', { class: 'bouton', href: '/vote', 'data-lien': '' }, 'Aller voter'),
      el('a', { class: 'bouton-secondaire', href: '/', 'data-lien': '' }, 'Retour à l’accueil'),
    ),
  );
}
