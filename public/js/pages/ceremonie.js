/**
 * Mode cérémonie — pour le vidéoprojecteur.
 *
 * Réservé à l'administrateur connecté, et refusé par le serveur tant que les
 * votes ne sont pas fermés. Les catégories révélées, et leur ordre, sont ceux
 * choisis dans l'espace d'administration.
 *
 * Clavier : Espace ou → révèle la suite, ← revient en arrière, F plein écran.
 */

import { api } from '../api.js';
import { el, vider } from '../dom.js';
import { lancerConfettis, mouvementReduit } from '../confetti.js';
import { etat } from '../etat.js';

/** Libellé de la place qui va être révélée. */
function libellePlace(position) {
  if (position === 0) return 'le vainqueur';
  if (position === 1) return 'la 2ᵉ place';
  return `la ${position + 1}ᵉ place`;
}

/** Rang affiché devant un nom. */
function libelleRang(rang) {
  return rang === 1 ? '1ᵉʳ' : `${rang}ᵉ`;
}

export async function rendre({ naviguer }) {
  const statut = await api.admin('status');
  if (!statut.ok || !statut.donnees.authenticated) {
    return el(
      'div',
      { class: 'contenu-texte' },
      el('h1', {}, 'Mode cérémonie'),
      el('p', {}, 'Cette page est réservée à l’organisateur connecté.'),
      el('button', { class: 'bouton', onclick: () => naviguer('/admin') }, 'Se connecter'),
    );
  }

  if (statut.donnees.state.votingOpen) {
    return el(
      'div',
      { class: 'contenu-texte' },
      el('h1', {}, 'Les votes sont encore ouverts'),
      el(
        'p',
        {},
        'Ferme les votes dans l’administration : tant qu’ils sont ouverts, le serveur refuse de calculer les résultats.',
      ),
      el('button', { class: 'bouton', onclick: () => naviguer('/admin') }, 'Aller à l’administration'),
    );
  }

  const [reponseResultats, reponseOrdre] = await Promise.all([
    api.admin('results'),
    api.admin('ceremony-get'),
  ]);
  if (!reponseResultats.ok) {
    return el('div', { class: 'message message-erreur' }, reponseResultats.erreur);
  }

  const parId = new Map(reponseResultats.donnees.results.map((r) => [r.categoryId, r]));
  const ordre = reponseOrdre.ok && reponseOrdre.donnees.order.length
    ? reponseOrdre.donnees.order
    : etat.catalogue.categories.map((categorie) => categorie.id);

  const selection = ordre.map((id) => parId.get(id)).filter(Boolean);
  if (selection.length === 0) {
    return el('div', { class: 'message message-info' }, 'Aucune catégorie à révéler.');
  }

  let index = 0;
  /** 0 = titre seul, puis 1, 2, 3 pour les trois places. */
  let etape = 0;
  let rapide = false;
  let arreterConfettis = null;

  const scene = el('div', { class: 'ceremonie' });
  const progression = el('p', { class: 'ceremonie-progression' });

  function placesAReveler(resultat) {
    // Les trois premières lignes du classement, dans l'ordre d'affichage.
    return resultat.rows.slice(0, 3);
  }

  function dessiner() {
    const resultat = selection[index];
    const lignes = placesAReveler(resultat);
    const visibles = rapide ? lignes.length : Math.min(etape, lignes.length);

    vider(scene);
    scene.appendChild(el('p', { class: 'ceremonie-theme' }, resultat.theme));
    scene.appendChild(el('h1', { class: 'ceremonie-titre' }, resultat.title));

    if (resultat.rows.length === 0) {
      scene.appendChild(el('p', { class: 'ceremonie-aide' }, 'Aucun vote dans cette catégorie.'));
    } else {
      const liste = el('ul', { class: 'ceremonie-places' });
      // On révèle de la dernière place vers la première.
      for (let rang = lignes.length - 1; rang >= 0; rang -= 1) {
        const dejaVisible = lignes.length - rang <= visibles;
        if (!dejaVisible) continue;
        const ligne = lignes[rang];
        liste.appendChild(
          el(
            'li',
            { class: rang === 0 ? 'ceremonie-place ceremonie-place-1' : 'ceremonie-place' },
            el('span', { class: 'ceremonie-rang' }, libelleRang(ligne.rank)),
            el('span', {}, ligne.names.join('  &  ')),
            ligne.tied ? el('span', { class: 'ceremonie-exaequo' }, 'ex æquo') : null,
            el('span', { class: 'ceremonie-voix' }, `${ligne.votes} voix`),
          ),
        );
      }
      scene.appendChild(liste);

      if (visibles < lignes.length) {
        // La prochaine place révélée est la plus basse encore cachée.
        const prochaine = lignes.length - visibles - 1;
        scene.appendChild(
          el(
            'p',
            { class: 'ceremonie-aide' },
            `Espace ou clic pour révéler ${libellePlace(prochaine)}…`,
          ),
        );
      }
    }

    progression.textContent = `Catégorie ${index + 1} / ${selection.length}${rapide ? ' · révélation rapide' : ''}`;
    scene.appendChild(progression);

    // Confettis au moment où le vainqueur apparaît.
    const vainqueurRevele = visibles >= lignes.length && lignes.length > 0;
    if (vainqueurRevele && !mouvementReduit()) {
      arreterConfettis?.();
      arreterConfettis = lancerConfettis();
    }
  }

  function suivant() {
    const resultat = selection[index];
    const total = placesAReveler(resultat).length;
    if (!rapide && etape < total) {
      etape += 1;
    } else if (index < selection.length - 1) {
      index += 1;
      etape = 0;
    } else {
      return;
    }
    dessiner();
  }

  function precedent() {
    if (!rapide && etape > 0) {
      etape -= 1;
    } else if (index > 0) {
      index -= 1;
      etape = rapide ? 0 : placesAReveler(selection[index]).length;
    } else {
      return;
    }
    dessiner();
  }

  function auClavier(evenement) {
    if (!document.body.contains(scene)) {
      document.removeEventListener('keydown', auClavier);
      arreterConfettis?.();
      return;
    }
    switch (evenement.key) {
      case ' ':
      case 'Enter':
      case 'ArrowRight':
      case 'ArrowDown':
        evenement.preventDefault();
        suivant();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        evenement.preventDefault();
        precedent();
        break;
      case 'f':
      case 'F':
        basculerPleinEcran();
        break;
      default:
        break;
    }
  }

  function basculerPleinEcran() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  document.addEventListener('keydown', auClavier);
  scene.addEventListener('click', suivant);

  dessiner();

  const commandes = el(
    'div',
    { class: 'barre-actions sans-impression', style: 'justify-content:center;margin-top:1.5rem' },
    el('button', { class: 'bouton', onclick: suivant }, 'Révéler'),
    el('button', { class: 'bouton-secondaire', onclick: precedent }, 'Précédent'),
    el(
      'button',
      {
        class: 'bouton-secondaire',
        onclick: (evenement) => {
          rapide = !rapide;
          evenement.currentTarget.textContent = rapide
            ? 'Révélation pas à pas'
            : 'Révélation rapide';
          dessiner();
        },
      },
      'Révélation rapide',
    ),
    el('button', { class: 'bouton-secondaire', onclick: basculerPleinEcran }, 'Plein écran'),
    el('button', { class: 'bouton-secondaire', onclick: () => naviguer('/admin') }, 'Quitter'),
  );

  return el(
    'div',
    {},
    scene,
    commandes,
    el(
      'p',
      { class: 'ceremonie-aide sans-impression', style: 'text-align:center' },
      'Clavier : Espace ou → pour révéler, ← pour revenir, F pour le plein écran.',
    ),
  );
}
