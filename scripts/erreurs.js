/**
 * Pages d'erreur du site.
 *
 * Une seule source (le tableau ERREURS ci-dessous), trois sorties, toutes
 * générées par scripts/build.js :
 *   - /erreur/<identifiant>/  une page par type d'erreur (aperçu pédagogique) ;
 *   - /erreur/                l'index qui les liste, groupées par famille ;
 *   - /404.html               la vraie page « introuvable » servie par Netlify
 *                             avec le statut 404 ;
 *   - /erreur/diagnostic/     le test de connexion, piloté par js/diagnostic.js.
 *
 * Le HTML est produit ici et non écrit à la main : une quinzaine de pages
 * identiques à la phrase près, c'est le meilleur moyen d'en oublier une. Et
 * comme la Content-Security-Policy interdit tout script ou style en ligne, les
 * pages n'embarquent que du HTML ; le comportement vit dans js/erreur.js.
 */

export const FAMILLES = {
  requete: {
    titre: 'Erreurs de requête (HTTP 4xx)',
    intro: 'Le serveur a bien répondu, mais il refuse ou ne comprend pas la demande.',
  },
  serveur: {
    titre: 'Erreurs de serveur (HTTP 5xx)',
    intro: 'La demande était correcte, mais le site n’a pas pu y répondre.',
  },
  reseau: {
    titre: 'Erreurs de connexion (navigateur)',
    intro:
      'Le navigateur n’a jamais obtenu de réponse du site. C’est lui qui affiche ces erreurs, pas le site : ici, ce ne sont que des explications.',
  },
  site: {
    titre: 'Erreurs propres au site',
    intro: 'Des cas que le site rencontre lui-même : réglages manquants, navigateur trop restrictif.',
  },
};

/**
 * `identifiant` sert d'adresse : /erreur/<identifiant>/.
 * `reseau: true` marque les erreurs que le site ne peut physiquement pas
 * afficher lui-même (la page n'arrive jamais jusqu'à l'écran).
 */
export const ERREURS = [
  // ---- 4xx ------------------------------------------------------------------
  {
    identifiant: '400',
    famille: 'requete',
    code: '400',
    technique: 'HTTP 400 Bad Request',
    titre: 'Requête invalide',
    resume: 'Le serveur n’a pas compris la demande envoyée.',
    signifie:
      'Les informations envoyées par ton navigateur sont incomplètes ou mal formées. Côté API, c’est la réponse aux codes « bad_request », « unknown_action » ou « unknown_category ».',
    causes: [
      'Une adresse recopiée à la main avec un caractère en trop.',
      'Une page restée ouverte très longtemps, dont les données sont périmées.',
      'Une extension du navigateur qui modifie les requêtes.',
    ],
    actions: [
      'Recharge la page, ou reviens à l’accueil et recommence.',
      'Si l’erreur revient, ouvre le site dans une fenêtre de navigation privée.',
    ],
  },
  {
    identifiant: '401',
    famille: 'requete',
    code: '401',
    technique: 'HTTP 401 Unauthorized',
    titre: 'Identification requise',
    resume: 'Le code de vote ou le mot de passe n’a pas été reconnu.',
    signifie:
      'Pour voter, il faut un code de vote valide ; pour l’administration, le mot de passe. Côté API : « invalid_code », « bad_password » ou « unauthenticated ».',
    causes: [
      'Une faute de frappe dans le code (0 et O, 1 et I se ressemblent).',
      'Un code déjà effacé de cet appareil par « Se déconnecter ».',
      'Une session d’administration expirée.',
    ],
    actions: [
      'Saisis à nouveau ton code, ou scanne de nouveau ton QR code.',
      'Vérifie que le code est celui de TON ticket, sans espace.',
    ],
  },
  {
    identifiant: '403',
    famille: 'requete',
    code: '403',
    technique: 'HTTP 403 Forbidden',
    titre: 'Accès interdit',
    resume: 'Tu n’as pas le droit d’ouvrir cette page.',
    signifie:
      'Le serveur a compris la demande mais la refuse. Le site n’affiche jamais de dossier ni de fichier interne : leur accès est fermé.',
    causes: [
      'Une adresse réservée à l’administration, ouverte sans y être connecté.',
      'Un fichier qui n’est pas public.',
    ],
    actions: ['Reviens à l’accueil.', 'Si tu es l’administrateur, connecte-toi sur la page d’administration.'],
  },
  {
    identifiant: '404',
    famille: 'requete',
    code: '404',
    technique: 'HTTP 404 Not Found',
    titre: 'Page introuvable',
    resume: 'Cette adresse ne correspond à rien sur le site.',
    signifie:
      'Le site fonctionne, mais la page demandée n’existe pas (ou plus). C’est l’erreur la plus fréquente : une adresse mal copiée suffit.',
    causes: [
      'Une faute dans l’adresse, ou un lien tronqué par une messagerie.',
      'Une page qui a changé de nom.',
      'Un nom de catégorie inexistant après /vote/.',
    ],
    actions: ['Vérifie l’adresse.', 'Retourne à l’accueil et navigue depuis les boutons.'],
  },
  {
    identifiant: '405',
    famille: 'requete',
    code: '405',
    technique: 'HTTP 405 Method Not Allowed',
    titre: 'Méthode non autorisée',
    resume: 'Cette adresse n’accepte pas ce type de demande.',
    signifie:
      'L’API n’accepte que certaines méthodes : /api/state se lit (GET), /api/ballot et /api/admin reçoivent des données (POST). Côté API : « bad_method ».',
    causes: [
      'Une adresse d’API ouverte directement dans le navigateur (qui fait un GET).',
      'Un outil de test mal configuré.',
    ],
    actions: ['Ne passe pas par l’API à la main : utilise les pages du site.'],
  },
  {
    identifiant: '408',
    famille: 'requete',
    code: '408',
    technique: 'HTTP 408 Request Timeout',
    titre: 'Demande trop lente',
    resume: 'Ta demande est arrivée trop lentement au serveur.',
    signifie:
      'Le serveur a attendu la fin de ta demande, puis a renoncé. C’est typique d’une connexion mobile très faible ou instable.',
    causes: [
      'Un signal 2G ou une zone de mauvaise couverture.',
      'Un réseau Wi-Fi saturé (salle pleine, tout le monde vote en même temps).',
    ],
    actions: [
      'Rapproche-toi d’un point d’accès ou change de réseau.',
      'Réessaie : un vote déjà enregistré ne sera pas compté deux fois.',
    ],
  },
  {
    identifiant: '429',
    famille: 'requete',
    code: '429',
    technique: 'HTTP 429 Too Many Requests',
    titre: 'Trop de tentatives',
    resume: 'Trop de demandes en peu de temps : patiente un instant.',
    signifie:
      'Le site limite le nombre d’essais pour empêcher qu’on devine un mot de passe en les testant un à un (côté API : « rate_limited », sur la connexion à l’administration). Le blocage est temporaire.',
    causes: [
      'Plusieurs mots de passe erronés à la suite sur la page d’administration.',
      'Plusieurs personnes derrière le même réseau qui se trompent en même temps.',
    ],
    actions: [
      'Attends quelques minutes sans rien envoyer, puis recommence.',
      'Vérifie le mot de passe avant de le soumettre à nouveau.',
    ],
  },

  // ---- 5xx ------------------------------------------------------------------
  {
    identifiant: '500',
    famille: 'serveur',
    code: '500',
    technique: 'HTTP 500 Internal Server Error',
    titre: 'Erreur du serveur',
    resume: 'Le site a rencontré un problème inattendu.',
    signifie:
      'Une des fonctions du site a planté. Côté API : « server_error ». Ce n’est pas de ta faute et ton vote déjà enregistré n’est pas perdu.',
    causes: [
      'Le stockage des votes (Netlify Blobs) a eu un incident passager.',
      'Un bogue dans une fonction : les détails sont dans les journaux Netlify.',
    ],
    actions: ['Réessaie dans une minute.', 'Si ça persiste, préviens l’organisateur avec l’heure exacte de l’erreur.'],
  },
  {
    identifiant: '502',
    famille: 'serveur',
    code: '502',
    technique: 'HTTP 502 Bad Gateway',
    titre: 'Mauvaise passerelle',
    resume: 'Un relais du site a reçu une réponse invalide.',
    signifie:
      'Entre ton navigateur et la fonction du site, un serveur intermédiaire a reçu une réponse incompréhensible.',
    causes: ['Un incident chez l’hébergeur.', 'Une fonction qui s’est arrêtée en pleine réponse.'],
    actions: ['Attends un instant, puis recharge la page.'],
  },
  {
    identifiant: '503',
    famille: 'serveur',
    code: '503',
    technique: 'HTTP 503 Service Unavailable',
    titre: 'Service indisponible',
    resume: 'Le site est momentanément hors service.',
    signifie:
      'Le serveur est trop sollicité ou en maintenance. Il peut aussi indiquer que le quota gratuit de l’hébergeur est dépassé.',
    causes: [
      'Beaucoup de votants en même temps.',
      'Un plafond du forfait Netlify atteint (bande passante ou appels de fonctions).',
      'Une maintenance de l’hébergeur.',
    ],
    actions: ['Réessaie dans quelques minutes.', 'Si le plafond est en cause, l’organisateur doit vérifier le tableau de bord Netlify.'],
  },
  {
    identifiant: '504',
    famille: 'serveur',
    code: '504',
    technique: 'HTTP 504 Gateway Timeout',
    titre: 'Le serveur met trop de temps',
    resume: 'Le site n’a pas répondu à temps.',
    signifie:
      'Une fonction du site a dépassé le temps qui lui est accordé et a été interrompue par la plateforme.',
    causes: ['Un stockage lent à répondre.', 'Une charge ponctuelle importante.'],
    actions: ['Réessaie : l’opération est le plus souvent sans effet partiel et peut être relancée.'],
  },

  // ---- Navigateur / réseau --------------------------------------------------
  {
    identifiant: 'hors-ligne',
    famille: 'reseau',
    reseau: true,
    code: 'Hors ligne',
    technique: 'ERR_INTERNET_DISCONNECTED',
    titre: 'Pas de connexion Internet',
    resume: 'Ton appareil n’est relié à aucun réseau qui fonctionne.',
    signifie:
      'Le navigateur sait qu’il n’y a pas d’Internet et n’a même pas essayé de joindre le site.',
    causes: [
      'Données mobiles coupées, forfait épuisé, mode avion.',
      'Wi-Fi connecté à un point d’accès sans accès à Internet.',
    ],
    actions: [
      'Active les données mobiles ou reconnecte-toi au Wi-Fi.',
      'Ouvre un autre site pour vérifier que la connexion marche vraiment.',
    ],
  },
  {
    identifiant: 'connexion-reinitialisee',
    famille: 'reseau',
    reseau: true,
    code: 'Connexion réinitialisée',
    technique: 'ERR_CONNECTION_RESET',
    titre: 'La connexion a été réinitialisée',
    resume: 'Quelque chose a coupé la connexion avant la réponse du site.',
    signifie:
      'Ton navigateur a commencé à joindre le site, puis la connexion a été brutalement fermée. Le site, lui, n’y est pour rien : il n’a pas pu répondre. C’est l’erreur affichée sur le téléphone qui a motivé ces pages.',
    causes: [
      'Un opérateur ou un réseau Wi-Fi qui filtre ou bloque certains domaines, dont *.netlify.app.',
      'Un antivirus, un pare-feu ou un contrôle parental qui inspecte le trafic HTTPS.',
      'Un signal mobile instable qui coupe la session en cours de route.',
      'Un VPN ou un proxy mal configuré.',
    ],
    actions: [
      'Change de réseau : passe du Wi-Fi aux données mobiles, ou l’inverse.',
      'Active un DNS privé (Paramètres, Réseau, DNS privé : dns.google).',
      'Teste avec un VPN, ou le partage de connexion d’un autre téléphone.',
      'Désactive l’économiseur de données de Chrome.',
    ],
    note:
      'Cette page ne peut pas s’afficher à ta place quand l’erreur survient : le navigateur n’arrive jamais jusqu’au site. Pour savoir où ça casse, lance le test de connexion depuis un réseau qui fonctionne, puis compare.',
  },
  {
    identifiant: 'connexion-refusee',
    famille: 'reseau',
    reseau: true,
    code: 'Connexion refusée',
    technique: 'ERR_CONNECTION_REFUSED',
    titre: 'Le serveur refuse la connexion',
    resume: 'Rien n’écoute à cette adresse.',
    signifie:
      'Le navigateur a joint la machine, mais aucun service n’y répond. En local, cela veut dire que le serveur de développement n’est pas démarré.',
    causes: [
      'En développement : « npm run serve » n’est pas lancé, ou un autre port est utilisé.',
      'Une mauvaise adresse ou un mauvais port.',
    ],
    actions: ['Lance « npm run serve », puis ouvre http://localhost:8888.', 'Vérifie l’adresse tapée.'],
  },
  {
    identifiant: 'delai-connexion',
    famille: 'reseau',
    reseau: true,
    code: 'Délai dépassé',
    technique: 'ERR_CONNECTION_TIMED_OUT',
    titre: 'Le site ne répond pas',
    resume: 'Le navigateur a attendu, en vain.',
    signifie:
      'La demande est partie mais aucune réponse n’est revenue dans le temps imparti. Le réseau est trop lent, ou une barrière laisse passer l’aller mais pas le retour.',
    causes: ['Signal très faible, réseau saturé.', 'Un pare-feu qui ignore la connexion sans la refuser.'],
    actions: ['Rapproche-toi du routeur ou change de réseau.', 'Réessaie un peu plus tard.'],
  },
  {
    identifiant: 'dns',
    famille: 'reseau',
    reseau: true,
    code: 'Adresse introuvable',
    technique: 'ERR_NAME_NOT_RESOLVED / DNS_PROBE_FINISHED_NXDOMAIN',
    titre: 'Adresse du site introuvable',
    resume: 'Le nom du site n’a pas pu être traduit en adresse.',
    signifie:
      'Avant de se connecter, un navigateur demande à un annuaire (le DNS) où se trouve « xxx.netlify.app ». Ici, l’annuaire n’a pas répondu ou ne connaît pas ce nom.',
    causes: [
      'Une faute dans le nom du site.',
      'Le DNS de l’opérateur ou du Wi-Fi est défaillant.',
      'Le site a été supprimé ou renommé sur Netlify.',
    ],
    actions: [
      'Recopie l’adresse exactement comme donnée.',
      'Passe à un DNS privé (dns.google) ou change de réseau.',
    ],
  },
  {
    identifiant: 'ssl',
    famille: 'reseau',
    reseau: true,
    code: 'Connexion non sécurisée',
    technique: 'ERR_SSL_PROTOCOL_ERROR / ERR_CERT_DATE_INVALID',
    titre: 'La connexion sécurisée a échoué',
    resume: 'Le navigateur n’a pas pu établir de connexion HTTPS fiable.',
    signifie:
      'Le chiffrement entre ton appareil et le site n’a pas pu être négocié, ou le certificat est refusé. Ne contourne jamais cet avertissement pour voter.',
    causes: [
      'La date ou l’heure de ton téléphone est fausse (cause n°1).',
      'Un réseau public qui intercepte le trafic.',
      'Un navigateur ou un système très ancien.',
    ],
    actions: [
      'Règle la date et l’heure en automatique dans les paramètres du téléphone.',
      'Mets à jour ton navigateur.',
      'Évite le Wi-Fi public : passe par tes données mobiles.',
    ],
  },
  {
    identifiant: 'bloque',
    famille: 'reseau',
    reseau: true,
    code: 'Accès bloqué',
    technique: 'ERR_BLOCKED_BY_ADMINISTRATOR / ERR_CONNECTION_CLOSED',
    titre: 'Le site est bloqué sur ce réseau',
    resume: 'Un filtre empêche d’atteindre le site depuis ici.',
    signifie:
      'Le réseau de l’école, du travail ou de l’opérateur peut interdire certaines catégories de sites, ou tous les domaines d’un hébergeur gratuit.',
    causes: ['Filtrage du Wi-Fi de l’établissement.', 'Contrôle parental ou profil professionnel sur l’appareil.'],
    actions: ['Vote depuis tes données mobiles.', 'Demande à l’organisateur s’il peut publier le site sur un domaine dédié.'],
  },

  // ---- Propres au site ------------------------------------------------------
  {
    identifiant: 'javascript-desactive',
    famille: 'site',
    code: 'JavaScript',
    technique: 'JavaScript désactivé',
    titre: 'JavaScript est désactivé',
    resume: 'Le site a besoin de JavaScript pour enregistrer les votes.',
    signifie:
      'Les pages de vote sont construites par du JavaScript. Sans lui, il ne reste que l’en-tête et un message d’avertissement.',
    causes: [
      'Un mode « léger » ou un économiseur de données qui coupe les scripts.',
      'Une extension de blocage, ou un réglage du navigateur.',
    ],
    actions: ['Active JavaScript dans les réglages du navigateur, puis recharge la page.'],
  },
  {
    identifiant: 'stockage-indisponible',
    famille: 'site',
    code: 'Stockage',
    technique: 'localStorage / sessionStorage inaccessible',
    titre: 'Le navigateur refuse de garder ton code',
    resume: 'Le site ne peut pas mémoriser ton code de vote sur cet appareil.',
    signifie:
      'Le site garde ton code dans le navigateur pour que tu n’aies pas à le ressaisir. Si le stockage est bloqué, il faudra le saisir à chaque page rechargée, mais le vote reste possible.',
    causes: ['Navigation privée dans certains navigateurs.', 'Un réglage qui bloque les données de sites.'],
    actions: ['Sors de la navigation privée.', 'Autorise les données de sites pour ce domaine.'],
  },
  {
    identifiant: 'configuration',
    famille: 'site',
    code: 'Configuration',
    technique: 'HTTP 500 · code « misconfigured »',
    titre: 'Le site est mal configuré',
    resume: 'Un réglage secret manque côté hébergeur.',
    signifie:
      'Les fonctions ont besoin de deux variables d’environnement : TOKEN_PEPPER (le « poivre » qui protège les codes) et ADMIN_PASSWORD. Sans elles, elles répondent « misconfigured » et refusent de fonctionner. Seul l’organisateur peut corriger cela.',
    causes: [
      'TOKEN_PEPPER ou ADMIN_PASSWORD n’a pas été défini dans Netlify.',
      'La variable a été ajoutée après le dernier déploiement et n’est pas encore prise en compte.',
    ],
    actions: [
      'Organisateur : Netlify, Site configuration, Environment variables, ajoute les deux variables.',
      'Puis relance un déploiement (Deploys, Trigger deploy).',
    ],
  },
];

// ---- Génération du HTML -------------------------------------------------------

const echapper = (texte) =>
  String(texte)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function enveloppe({ titre, description, contenu, scripts = [] }) {
  const modules = scripts.map((s) => `    <script type="module" src="${s}"></script>`).join('\n');
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <meta name="referrer" content="no-referrer" />
    <meta name="theme-color" content="#0b0d14" />
    <meta name="color-scheme" content="dark" />
    <title>${echapper(titre)} — CIN 2027 Awards</title>
    <meta name="description" content="${echapper(description)}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/erreur.css" />
  </head>
  <body>
    <header class="entete">
      <a class="marque" href="/">
        <svg class="marque-bouclier" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 2.5 4.5 5.2v6.1c0 4.6 3.1 8.8 7.5 10.2 4.4-1.4 7.5-5.6 7.5-10.2V5.2L12 2.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          <path d="m8.6 12.1 2.4 2.4 4.4-4.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="marque-texte">CIN<span class="marque-annee">2027</span> Awards</span>
      </a>
      <nav class="entete-nav" aria-label="Navigation principale">
        <a href="/erreur/">Toutes les erreurs</a>
        <a href="/erreur/diagnostic/">Tester ma connexion</a>
      </nav>
    </header>

    <main id="contenu" tabindex="-1">
${contenu}
    </main>

    <footer class="pied">
      <p>
        ING5 — Cybersécurité et Investigation Numérique · École Nationale Supérieure Polytechnique
        de Yaoundé
      </p>
    </footer>

${modules}
  </body>
</html>
`;
}

const liste = (elements) => `<ul>${elements.map((e) => `<li>${echapper(e)}</li>`).join('')}</ul>`;

function pageErreur(erreur, { apercu }) {
  const famille = FAMILLES[erreur.famille];
  const bandeau = apercu
    ? `<p class="erreur-apercu">Aperçu pédagogique : cette page montre à quoi ressemble l’erreur « ${echapper(erreur.technique)} ». Tu ne l’as pas rencontrée ici.</p>`
    : '';
  const note = erreur.note ? `<p class="message message-info">${echapper(erreur.note)}</p>` : '';
  const contenu = `      <article class="erreur">
        ${bandeau}
        <p class="erreur-famille">${echapper(famille.titre)}</p>
        <p class="erreur-code${/^\d+$/.test(erreur.code) ? '' : ' erreur-code-texte'}" aria-hidden="true">${echapper(erreur.code)}</p>
        <h1>${echapper(erreur.titre)}</h1>
        <p class="erreur-resume">${echapper(erreur.resume)}</p>

        <div class="erreur-actions">
          <button type="button" class="bouton" data-action="reessayer">Réessayer</button>
          <a class="bouton-secondaire" href="/">Retour à l’accueil</a>
          <a class="bouton-secondaire" href="/erreur/diagnostic/">Tester ma connexion</a>
        </div>

        <section class="contenu-texte">
          <h2>Ce que ça veut dire</h2>
          <p>${echapper(erreur.signifie)}</p>
          ${note}
          <h2>Causes possibles</h2>
          ${liste(erreur.causes)}
          <h2>Que faire</h2>
          ${liste(erreur.actions)}
        </section>

        <details class="erreur-technique">
          <summary>Détails à joindre si tu demandes de l’aide</summary>
          <dl>
            <dt>Erreur</dt><dd>${echapper(erreur.technique)}</dd>
            <dt>Adresse</dt><dd data-info="url">—</dd>
            <dt>Heure</dt><dd data-info="heure">—</dd>
            <dt>Réseau</dt><dd data-info="reseau">—</dd>
            <dt>Navigateur</dt><dd data-info="agent">—</dd>
          </dl>
        </details>
      </article>`;
  return enveloppe({
    titre: erreur.titre,
    description: erreur.resume,
    contenu,
    scripts: ['/js/erreur.js'],
  });
}

function pageIndex() {
  const groupes = Object.entries(FAMILLES)
    .map(([cle, famille]) => {
      const cartes = ERREURS.filter((e) => e.famille === cle)
        .map(
          (e) =>
            `<li><a class="erreur-carte" href="/erreur/${e.identifiant}/"><span class="erreur-carte-code">${echapper(e.code)}</span><span class="erreur-carte-titre">${echapper(e.titre)}</span><span class="erreur-carte-technique">${echapper(e.technique)}</span></a></li>`,
        )
        .join('\n            ');
      return `        <section>
          <h2>${echapper(famille.titre)}</h2>
          <p class="erreur-intro">${echapper(famille.intro)}</p>
          <ul class="erreur-grille">
            ${cartes}
          </ul>
        </section>`;
    })
    .join('\n');
  const contenu = `      <div class="erreur-index">
        <h1>Les pages d’erreur</h1>
        <p class="erreur-resume">
          Chaque type d’erreur que peut rencontrer un votant, expliqué en clair. Pour savoir
          lequel te concerne, lance le test de connexion.
        </p>
        <p><a class="bouton" href="/erreur/diagnostic/">Tester ma connexion</a></p>
${groupes}
      </div>`;
  return enveloppe({
    titre: 'Pages d’erreur',
    description: 'Liste des erreurs que peut rencontrer un votant, avec leurs causes et leurs solutions.',
    contenu,
  });
}

function pageDiagnostic() {
  const contenu = `      <div class="erreur-index">
        <h1>Test de connexion</h1>
        <p class="erreur-resume">
          Ce test vérifie, depuis cet appareil, chaque maillon entre toi et le site. Il montre
          où ça casse. Rien n’est envoyé ailleurs que vers ce site.
        </p>
        <p>
          <button type="button" class="bouton" id="diag-lancer">Relancer le test</button>
          <button type="button" class="bouton-secondaire" id="diag-copier" hidden>Copier le rapport</button>
        </p>
        <p class="message message-info" id="diag-verdict" role="status" aria-live="polite">Test en cours…</p>
        <ol class="diag-liste" id="diag-liste" aria-label="Résultats du test"></ol>
        <noscript><p class="message message-erreur">Ce test a besoin de JavaScript.</p></noscript>
      </div>`;
  return enveloppe({
    titre: 'Test de connexion',
    description: 'Vérifie la connexion entre cet appareil et le site.',
    contenu,
    scripts: ['/js/diagnostic.js'],
  });
}

/** Renvoie [{ chemin, html }] : chemins relatifs à dist/. */
export function pagesErreur() {
  const identifiants = ERREURS.map((e) => e.identifiant);
  if (new Set(identifiants).size !== identifiants.length) {
    throw new Error('scripts/erreurs.js : identifiants d’erreur en double');
  }

  const pages = ERREURS.map((e) => ({
    chemin: `erreur/${e.identifiant}/index.html`,
    html: pageErreur(e, { apercu: true }),
  }));
  pages.push({ chemin: 'erreur/index.html', html: pageIndex() });
  pages.push({ chemin: 'erreur/diagnostic/index.html', html: pageDiagnostic() });

  // La vraie page 404 : Netlify la sert avec le statut 404 pour toute adresse inconnue.
  const introuvable = ERREURS.find((e) => e.identifiant === '404');
  pages.push({ chemin: '404.html', html: pageErreur(introuvable, { apercu: false }) });
  return pages;
}
