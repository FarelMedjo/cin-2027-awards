/** Fabrique de noeuds et petites aides d'interface. Aucune dépendance. */

/**
 * Crée un élément.
 *
 *   el('p', { class: 'vide' }, 'Rien ici')
 *   el('button', { class: 'bouton', onclick: f, 'aria-pressed': 'true' }, 'Voter')
 *
 * Les clés commençant par « on » attachent un écouteur, « class » et « for »
 * sont acceptés telles quelles, le reste devient un attribut.
 */
export function el(balise, proprietes = {}, ...enfants) {
  const noeud = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(proprietes)) {
    if (valeur === null || valeur === undefined || valeur === false) continue;
    if (cle.startsWith('on') && typeof valeur === 'function') {
      noeud.addEventListener(cle.slice(2), valeur);
    } else if (cle === 'class') {
      noeud.className = valeur;
    } else if (cle === 'for') {
      noeud.htmlFor = valeur;
    } else if (cle === 'style') {
      // Jamais setAttribute('style', ...) : la Content-Security-Policy interdit
      // les styles en ligne. Passer par le CSSOM (setProperty) n'est pas
      // concerné par cette interdiction.
      for (const regle of String(valeur).split(';')) {
        const separateur = regle.indexOf(':');
        if (separateur === -1) continue;
        noeud.style.setProperty(regle.slice(0, separateur).trim(), regle.slice(separateur + 1).trim());
      }
    } else if (cle === 'value') {
      noeud.value = valeur;
    } else if (cle === 'checked' || cle === 'disabled' || cle === 'hidden') {
      noeud[cle] = Boolean(valeur);
    } else if (cle === 'dataset') {
      Object.assign(noeud.dataset, valeur);
    } else {
      noeud.setAttribute(cle, String(valeur));
    }
  }
  ajouter(noeud, enfants);
  return noeud;
}

function ajouter(parent, enfants) {
  for (const enfant of enfants) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    if (Array.isArray(enfant)) ajouter(parent, enfant);
    else if (enfant instanceof Node) parent.appendChild(enfant);
    else parent.appendChild(document.createTextNode(String(enfant)));
  }
}

export function vider(noeud) {
  while (noeud.firstChild) noeud.removeChild(noeud.firstChild);
}

/** Annonce un message aux lecteurs d'écran, sans le montrer à l'écran. */
export function annoncer(texte) {
  const zone = document.getElementById('annonces');
  if (zone) zone.textContent = texte;
}

let bandeauActuel = null;
let bandeauMinuteur = null;

/** Confirmation discrète en bas de l'écran, qui s'effacera d'elle-même. */
export function bandeau(texte, type = 'succes') {
  if (bandeauActuel) bandeauActuel.remove();
  if (bandeauMinuteur) clearTimeout(bandeauMinuteur);
  bandeauActuel = el(
    'div',
    { class: type === 'erreur' ? 'bandeau bandeau-erreur' : 'bandeau' },
    texte,
  );
  document.body.appendChild(bandeauActuel);
  annoncer(texte);
  bandeauMinuteur = setTimeout(() => {
    bandeauActuel?.remove();
    bandeauActuel = null;
  }, 3600);
}

/** Message d'erreur en bloc, avec un éventuel bouton de reprise. */
export function messageErreur(texte, surReprise) {
  return el(
    'div',
    { class: 'message message-erreur', role: 'alert' },
    el('p', { style: 'margin:0 0 .6em' }, texte),
    surReprise ? el('button', { class: 'bouton-secondaire', onclick: surReprise }, 'Réessayer') : null,
  );
}

/** Retire les accents, pour que « révélation » se trouve en tapant « revelation ». */
export function sansAccent(texte) {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
