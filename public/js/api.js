/**
 * Appels à l'API.
 *
 * Le code du votant part toujours dans le corps d'une requête POST, jamais dans
 * une URL : il ne doit apparaître ni dans les journaux d'accès, ni dans
 * l'historique du navigateur.
 */

const ERREUR_RESEAU =
  'Connexion impossible. Vérifie ton réseau, puis réessaie : rien n’est perdu.';

async function poster(chemin, corps) {
  let reponse;
  try {
    reponse = await fetch(chemin, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
      credentials: 'same-origin',
    });
  } catch {
    return { ok: false, erreur: ERREUR_RESEAU, code: 'reseau' };
  }

  let donnees = null;
  try {
    donnees = await reponse.json();
  } catch {
    donnees = null;
  }

  if (!reponse.ok) {
    return {
      ok: false,
      statut: reponse.status,
      erreur: donnees?.error ?? 'Le serveur a refusé la demande.',
      code: donnees?.code ?? 'inconnu',
    };
  }
  return { ok: true, donnees: donnees ?? {} };
}

export const api = {
  /** État public de l'élection. */
  async etat() {
    try {
      const reponse = await fetch('/api/state', { credentials: 'same-origin' });
      if (!reponse.ok) return { ok: false, erreur: 'État indisponible.' };
      return { ok: true, donnees: await reponse.json() };
    } catch {
      return { ok: false, erreur: ERREUR_RESEAU, code: 'reseau' };
    }
  },

  chargerVotes(code) {
    return poster('/api/ballot', { action: 'load', code });
  },

  voter(code, categoryId, nomineeIds) {
    return poster('/api/ballot', { action: 'cast', code, categoryId, nomineeIds });
  },

  retirer(code, categoryId) {
    return poster('/api/ballot', { action: 'clear', code, categoryId });
  },

  admin(action, extra = {}) {
    return poster('/api/admin', { action, ...extra });
  },
};
