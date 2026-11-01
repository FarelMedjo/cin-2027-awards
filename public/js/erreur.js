/**
 * Comportement commun des pages d'erreur : le bouton « Réessayer » et le bloc
 * de détails, que la Content-Security-Policy interdit d'écrire en ligne.
 */

function renseigner(cle, texte) {
  const noeud = document.querySelector(`[data-info="${cle}"]`);
  if (noeud) noeud.textContent = texte;
}

document.querySelector('[data-action="reessayer"]')?.addEventListener('click', () => {
  // Sur la vraie page 404, recharger ne sert à rien : on revient en arrière,
  // ou à l'accueil quand il n'y a pas d'historique.
  const introuvable = !location.pathname.startsWith('/erreur/');
  if (introuvable) {
    if (history.length > 1) history.back();
    else location.assign('/');
  } else {
    location.reload();
  }
});

// Le chemin seul : jamais de fragment ni de paramètres, qui pourraient contenir un code de vote.
renseigner('url', location.origin + location.pathname);
renseigner('heure', new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }));

const connexion = navigator.connection;
renseigner(
  'reseau',
  [
    navigator.onLine ? 'en ligne' : 'hors ligne',
    connexion?.effectiveType,
    connexion?.saveData ? 'économiseur de données actif' : null,
  ]
    .filter(Boolean)
    .join(' · '),
);
renseigner('agent', navigator.userAgent);
