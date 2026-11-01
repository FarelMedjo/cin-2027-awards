/**
 * Dernier lot de codes généré, gardé en mémoire vive le temps de l'imprimer.
 *
 * Les codes en clair ne sont écrits nulle part : ni dans le stockage du
 * navigateur, ni sur le serveur. Fermer ou recharger l'onglet les perd
 * définitivement — c'est voulu, et c'est pourquoi l'administrateur doit
 * imprimer ou enregistrer le CSV avant de quitter la page.
 */

let lot = [];

export function enregistrerLot(codes) {
  lot = Array.isArray(codes) ? [...codes] : [];
}

export function lotCourant() {
  return [...lot];
}

export function viderLot() {
  lot = [];
}
