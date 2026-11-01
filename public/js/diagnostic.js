/**
 * Test de connexion : vérifie un à un les maillons entre l'appareil et le site,
 * et renvoie chaque échec vers la page d'erreur qui l'explique.
 *
 * Limite assumée : si le téléphone n'arrive pas du tout jusqu'au site (par
 * exemple ERR_CONNECTION_RESET), cette page ne s'ouvre pas non plus. Elle est
 * faite pour être lancée depuis un réseau qui marche, ou pour comprendre une
 * panne partielle (l'API qui échoue alors que les pages s'affichent).
 */

import { el, vider } from './dom.js';

const liste = document.getElementById('diag-liste');
const verdict = document.getElementById('diag-verdict');
const boutonLancer = document.getElementById('diag-lancer');
const boutonCopier = document.getElementById('diag-copier');

const PAGES_HTTP = new Set([400, 401, 403, 404, 405, 408, 429, 500, 502, 503, 504]);
const DELAI_MS = 10_000;

/** Page d'erreur qui explique un statut HTTP, à défaut la plus proche de sa famille. */
function pagePourStatut(statut) {
  if (PAGES_HTTP.has(statut)) return `/erreur/${statut}/`;
  return statut >= 500 ? '/erreur/500/' : '/erreur/400/';
}

const PAGE_RESEAU = '/erreur/connexion-reinitialisee/';

async function chercher(chemin) {
  const debut = performance.now();
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), DELAI_MS);
  try {
    const reponse = await fetch(`${chemin}${chemin.includes('?') ? '&' : '?'}diag=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controle.signal,
    });
    return { reponse, ms: Math.round(performance.now() - debut) };
  } catch (erreur) {
    return { erreur, delai: erreur?.name === 'AbortError', ms: Math.round(performance.now() - debut) };
  } finally {
    clearTimeout(minuteur);
  }
}

function resultatHttp(essai, { attendu = 200 } = {}) {
  if (essai.erreur) {
    return essai.delai
      ? { etat: 'ko', detail: `Aucune réponse en ${DELAI_MS / 1000} s.`, page: '/erreur/delai-connexion/' }
      : { etat: 'ko', detail: 'Connexion coupée avant la réponse du site.', page: PAGE_RESEAU };
  }
  const { reponse, ms } = essai;
  if (reponse.status === attendu) {
    return { etat: ms > 3000 ? 'avert' : 'ok', detail: `HTTP ${reponse.status} en ${ms} ms${ms > 3000 ? ' (lent)' : ''}.` };
  }
  return { etat: 'ko', detail: `Le serveur répond HTTP ${reponse.status}.`, page: pagePourStatut(reponse.status) };
}

// ---- Les vérifications --------------------------------------------------------

const VERIFICATIONS = [
  {
    nom: 'Appareil en ligne',
    async tester() {
      const connexion = navigator.connection;
      const infos = [connexion?.effectiveType, connexion?.saveData ? 'économiseur de données actif' : null]
        .filter(Boolean)
        .join(' · ');
      if (!navigator.onLine) {
        return { etat: 'ko', detail: 'Le navigateur se déclare hors ligne.', page: '/erreur/hors-ligne/' };
      }
      return {
        etat: connexion?.saveData ? 'avert' : 'ok',
        detail: infos ? `En ligne (${infos}).` : 'En ligne.',
      };
    },
  },
  {
    nom: 'Connexion sécurisée (HTTPS)',
    async tester() {
      if (location.protocol === 'https:') return { etat: 'ok', detail: 'Page chargée en HTTPS.' };
      if (location.hostname === 'localhost') return { etat: 'avert', detail: 'HTTP en local : normal en développement.' };
      return { etat: 'ko', detail: 'Page chargée sans chiffrement.', page: '/erreur/ssl/' };
    },
  },
  {
    nom: 'Page d’accueil',
    async tester() {
      return resultatHttp(await chercher('/favicon.svg'));
    },
  },
  {
    nom: 'Heure de l’appareil',
    async tester() {
      const essai = await chercher('/favicon.svg');
      const dateServeur = essai.reponse?.headers.get('date');
      if (!dateServeur) return { etat: 'avert', detail: 'Heure du serveur indisponible.' };
      const ecartMin = Math.round(Math.abs(Date.now() - new Date(dateServeur).getTime()) / 60000);
      return ecartMin > 5
        ? { etat: 'ko', detail: `L’heure de l’appareil est décalée de ${ecartMin} minutes : les connexions HTTPS peuvent être refusées.`, page: '/erreur/ssl/' }
        : { etat: 'ok', detail: ecartMin === 0 ? 'Synchronisée avec le serveur.' : `Écart de ${ecartMin} min avec le serveur.` };
    },
  },
  {
    nom: 'Liste des catégories',
    async tester() {
      return resultatHttp(await chercher('/data/categories.json'));
    },
  },
  {
    nom: 'Service de vote (API)',
    async tester() {
      const essai = await chercher('/api/state');
      const resultat = resultatHttp(essai);
      if (essai.reponse && !essai.reponse.ok) {
        try {
          const corps = await essai.reponse.json();
          if (corps?.code === 'misconfigured') {
            return { ...resultat, detail: `${resultat.detail} Code « misconfigured ».`, page: '/erreur/configuration/' };
          }
          if (corps?.code) resultat.detail += ` Code « ${corps.code} ».`;
        } catch {
          // Corps illisible : le statut suffit.
        }
      }
      return resultat;
    },
  },
  {
    nom: 'Polices Google Fonts',
    async tester() {
      return new Promise((resolve) => {
        const lien = document.createElement('link');
        lien.rel = 'stylesheet';
        lien.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&display=swap';
        const debut = performance.now();
        const fin = (resultat) => {
          clearTimeout(minuteur);
          lien.remove();
          resolve(resultat);
        };
        const minuteur = setTimeout(
          () => fin({ etat: 'avert', detail: 'Pas de réponse : le titre s’affichera avec une police de secours. Le vote reste possible.' }),
          DELAI_MS,
        );
        lien.onload = () => fin({ etat: 'ok', detail: `Chargées en ${Math.round(performance.now() - debut)} ms.` });
        lien.onerror = () =>
          fin({ etat: 'avert', detail: 'Bloquées sur ce réseau : police de secours utilisée. Le vote reste possible.' });
        document.head.appendChild(lien);
      });
    },
  },
  {
    nom: 'Mémoire du navigateur',
    async tester() {
      try {
        localStorage.setItem('diag', '1');
        localStorage.removeItem('diag');
        return { etat: 'ok', detail: 'Le code de vote pourra être mémorisé.' };
      } catch {
        return { etat: 'avert', detail: 'Stockage bloqué : le code sera à ressaisir.', page: '/erreur/stockage-indisponible/' };
      }
    },
  },
];

// ---- Affichage ----------------------------------------------------------------

const PASTILLE = { attente: '…', ok: '✓', avert: '!', ko: '✕' };

function ligne(nom) {
  const pastille = el('span', { class: 'diag-pastille', 'aria-hidden': 'true' }, PASTILLE.attente);
  const detail = el('span', { class: 'diag-detail' }, 'En cours…');
  const etatTexte = el('span', { class: 'hors-ecran' }, 'en cours');
  const noeud = el('li', { class: 'diag-ligne' }, pastille, el('span', { class: 'diag-nom' }, nom, ' ', etatTexte), detail);
  return {
    noeud,
    afficher({ etat, detail: texte, page }) {
      noeud.classList.remove('diag-ok', 'diag-ko', 'diag-avert');
      noeud.classList.add(`diag-${etat}`);
      pastille.textContent = PASTILLE[etat];
      etatTexte.textContent = { ok: 'réussi', avert: 'avertissement', ko: 'échec' }[etat];
      detail.textContent = texte;
      noeud.querySelector('a')?.remove();
      if (page) noeud.appendChild(el('a', { href: page, class: 'diag-lien' }, 'Comprendre cette erreur'));
    },
  };
}

let rapport = '';

async function lancer() {
  boutonLancer.disabled = true;
  boutonCopier.hidden = true;
  vider(liste);
  verdict.textContent = 'Test en cours…';
  verdict.className = 'message message-info';

  const lignes = VERIFICATIONS.map((v) => ({ v, ui: ligne(v.nom) }));
  for (const { ui } of lignes) liste.appendChild(ui.noeud);

  const resultats = await Promise.all(
    lignes.map(async ({ v, ui }) => {
      let resultat;
      try {
        resultat = await v.tester();
      } catch (erreur) {
        resultat = { etat: 'ko', detail: `Test impossible : ${erreur?.message ?? 'erreur inconnue'}.` };
      }
      ui.afficher(resultat);
      return { nom: v.nom, ...resultat };
    }),
  );

  const echecs = resultats.filter((r) => r.etat === 'ko');
  const avertissements = resultats.filter((r) => r.etat === 'avert');
  if (echecs.length) {
    verdict.textContent = `${echecs.length} problème(s) détecté(s) : « ${echecs[0].nom} ». Ouvre « Comprendre cette erreur » sous la ligne en échec.`;
    verdict.className = 'message message-erreur';
  } else if (avertissements.length) {
    verdict.textContent = 'Le vote devrait fonctionner, avec quelques réserves (voir les lignes marquées « ! »).';
    verdict.className = 'message message-info';
  } else {
    verdict.textContent = 'Tout fonctionne depuis cet appareil. Si une page d’erreur apparaît ailleurs, c’est ponctuel : réessaie.';
    verdict.className = 'message message-succes';
  }

  rapport = [
    `Test de connexion CIN 2027 Awards — ${new Date().toLocaleString('fr-FR')}`,
    `Adresse : ${location.origin}`,
    ...resultats.map((r) => `[${PASTILLE[r.etat]}] ${r.nom} : ${r.detail}`),
    `Navigateur : ${navigator.userAgent}`,
  ].join('\n');

  boutonCopier.hidden = false;
  boutonLancer.disabled = false;
}

boutonLancer.addEventListener('click', lancer);

boutonCopier.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(rapport);
    boutonCopier.textContent = 'Rapport copié';
  } catch {
    // Presse-papiers refusé (HTTP, ou navigateur strict) : on affiche le texte à copier à la main.
    verdict.textContent = rapport;
    verdict.className = 'message message-info';
    verdict.style.whiteSpace = 'pre-wrap';
  }
});

lancer();
