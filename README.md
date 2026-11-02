# CIN 2027 Awards

Site de vote anonyme pour les awards de la promotion **CIN 2027** — 5ᵉ année Cybersécurité et
Investigation Numérique, École Nationale Supérieure Polytechnique de Yaoundé.

63 catégories, 26 nominés, un vote par catégorie et par personne, modifiable jusqu'à la clôture,
et des résultats révélés pendant la cérémonie.

---

## Sommaire

1. [Comment l'anonymat est obtenu](#comment-lanonymat-est-obtenu)
2. [Installation](#installation)
3. [Variables d'environnement](#variables-denvironnement)
4. [Lancer le site en local](#lancer-le-site-en-local)
5. [Tests et simulation](#tests-et-simulation)
6. [Modifier les catégories et les nominés](#modifier-les-catégories-et-les-nominés)
7. [Générer et imprimer les tickets](#générer-et-imprimer-les-tickets)
8. [Déroulé conseillé le jour J](#déroulé-conseillé-le-jour-j)
9. [Déploiement sur Netlify](#déploiement-sur-netlify)
10. [Structure du projet](#structure-du-projet)
11. [Limites connues](#limites-connues)

---

## Comment l'anonymat est obtenu

Chaque votant reçoit un **ticket tiré au hasard** portant un code de la forme `CIN-XXXX-XXXX-XX`.
Aucune liste ne relie un code à une personne : c'est le tirage dans la boîte qui garantit
l'anonymat, pas le logiciel.

Côté serveur, trois précautions :

| Ce qui est stocké | Sous quelle forme |
| --- | --- |
| `codes/<empreinte>` | `HMAC-SHA256(TOKEN_PEPPER, code)`. Le code en clair n'est jamais écrit. |
| `votes/<catégorie>/<choix>/<uuid v4>` | **uniquement** les nominés choisis. Pas de code, pas d'empreinte, pas d'IP, pas d'horodatage. |
| `voters/<empreinte>` | le lien entre les catégories votées et les lignes de vote, **chiffré en AES-256-GCM** avec une clé dérivée du code (HKDF-SHA256). La clé n'est stockée nulle part. |

Conséquences concrètes :

- deux lignes de vote sont **impossibles à rapprocher**, même en lisant tout le stockage ;
- sans le ticket, le dossier d'un votant est **illisible**, y compris pour l'administrateur ;
- les résultats se calculent en **comptant les lignes**, sans compteur partagé, donc sans conflit
  d'écriture ;
- l'uuid d'une ligne est de **version 4** (purement aléatoire) : trier les clés ne révèle pas
  l'ordre d'arrivée des votes. Un uuid v7 encoderait l'heure de création et serait ici une faute.

La page **« Comment ça marche ? »** du site explique tout cela en langage simple aux votants.

---

## Installation

Il faut **Node.js 22 ou plus récent** (le projet utilise l'exécution native de TypeScript et le
lanceur de tests intégré). Vérifier :

```bash
node --version
```

Puis, dans le dossier du projet :

```bash
npm install
```

Une seule dépendance est installée (`@netlify/blobs`, plus `@netlify/functions` pour les types) :
le front n'utilise **aucune bibliothèque**, et il n'y a ni transpilation ni empaquetage.

---

## Variables d'environnement

Copier `.env.example` en `.env` pour le développement local :

```bash
cp .env.example .env
```

| Variable | Rôle |
| --- | --- |
| `ADMIN_PASSWORD` | Mot de passe de `/admin`. Choisir une phrase longue et unique. |
| `TOKEN_PEPPER` | Secret serveur : clé HMAC des codes **et** sel de dérivation du chiffrement. |

Générer un poivre solide :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Important.** `TOKEN_PEPPER` ne doit **jamais** être modifié une fois les tickets distribués :
> tous les codes deviendraient invalides et tous les dossiers votants illisibles. Les votes déjà
> déposés, eux, resteraient comptés — mais plus personne ne pourrait les modifier.

En production, ces deux variables se définissent dans le tableau de bord Netlify
(**Project configuration → Environment variables**), jamais dans le dépôt.

---

## Lancer le site en local

Deux façons, au choix.

### Sans la CLI Netlify (recommandé, aucune installation)

```bash
npm run serve
```

Cette commande construit `dist/` puis démarre le serveur. Le site est sur **http://localhost:8888**, l'administration sur **http://localhost:8888/admin**.

`npm run serve` lance un petit serveur écrit pour ce projet : il sert `dist/`, exécute les vraies
fonctions Netlify et les branche sur un stockage de fichiers posé dans `.local-store/`. Les
en-têtes de sécurité sont relus dans `netlify.toml`, donc ce qui est testé en local est bien ce qui
sera servi en production.

Sans fichier `.env`, le serveur fournit des valeurs de développement et le dit (mot de passe
administrateur : `admin`). Pour repartir de zéro, supprimer `.local-store/`.

### Avec la CLI Netlify

```bash
npm install -g netlify-cli
```

```bash
npm run build && netlify dev
```

`netlify dev` utilise le vrai Netlify Blobs et se rapproche davantage de la production. C'est la
façon de vérifier le stockage réel avant le jour J.

---

## Tests et simulation

```bash
npm test
```

98 tests, sans aucune dépendance (lanceur intégré de Node). Ils couvrent :

- génération, format et normalisation des codes, et absence de biais du tirage ;
- empreinte HMAC, dérivation de clé, chiffrement et déchiffrement du dossier votant, détection
  d'altération ;
- vote, modification, retrait, catégorie `duo` ;
- **absence de double vote**, y compris deux requêtes simultanées avec le même code ;
- validation des votes contre `data/categories.json` et `data/nominees.json` ;
- agrégation des résultats, ex æquo, export CSV ;
- ouverture et clôture automatique des votes ;
- limitation de débit ;
- générateur de QR codes (arithmétique de Galois, Reed-Solomon, relecture complète du contenu).

```bash
npm run simulate
```

Génère 10 codes, les fait voter dans un sous-ensemble aléatoire de catégories, modifie et retire
quelques votes, vérifie la cohérence du stockage, puis affiche les résultats. Options :
`--codes 20` pour changer le nombre de votants, `--garder` pour conserver le stockage de
simulation.

---

## Modifier les catégories et les nominés

Tout est dans `data/`, et rien d'autre n'est à toucher.

**`data/nominees.json`**

```json
{ "id": "n16", "fullName": "MVONGO MEDJO ORDI FAREL", "displayName": "Farel" }
```

`displayName` est le nom affiché partout sur le site : y mettre un prénom ou un surnom si besoin.
Les identifiants (`n01`…`n26`) ne doivent jamais changer une fois le vote commencé — ce sont eux
qui sont enregistrés dans les votes.

**`data/categories.json`**

```json
{
  "id": "meilleur-sapeur",
  "title": "Meilleur sapeur",
  "theme": "Style et personnalité",
  "description": "",
  "type": "single",
  "excludedNominees": []
}
```

- `description` : courte, drôle et bienveillante. **Cinq sont volontairement vides**, en attente de
  ta définition : `meilleur-sapeur`, `le-creve-de-secours`, `meilleur-mougou-officiel`,
  `fbi-des-relations`, `meilleur-dossier`. Le site les affiche simplement sans description.
- `type` : `"single"` (une personne) ou `"duo"` (exactement deux personnes différentes, comptées
  par paire, l'ordre de sélection n'ayant pas d'importance).
- `excludedNominees` : identifiants à retirer de **cette** catégorie, pour un camarade qui ne
  souhaite pas y figurer. Exemple : `"excludedNominees": ["n16"]`.

`npm run build` vérifie ces fichiers et refuse de construire le site si un identifiant est en
double, si un type est invalide ou si une exclusion désigne un nominé inexistant.

### Ajouter une catégorie depuis l'espace administrateur

Sans toucher aux fichiers ni redéployer : dans `/admin`, le panneau **Créer une catégorie** demande
un titre, un thème (existant ou nouveau), une description facultative et le nombre de personnes à
choisir (une, ou deux pour un binôme).

- Les catégories créées ainsi sont stockées sur le site (clé `election/categories`) et **s'ajoutent**
  à celles de `data/categories.json`, à la fin de la liste. Les votants les voient au prochain
  chargement du site ; les résultats, la participation, l'export CSV et le mode cérémonie les
  prennent en compte comme les autres.
- Elles survivent à la réinitialisation de l'élection, qui n'efface que les votes, les dossiers et
  les codes.
- L'identifiant est tiré du titre (`Le plus ponctuel` → `le-plus-ponctuel`). Deux catégories ne
  peuvent pas porter le même titre, et 40 catégories ajoutées au maximum.
- Il n'y a pas de bouton pour en supprimer une : pour une erreur de saisie, le plus simple est de
  garder la catégorie sans la révéler à la cérémonie.
- Les exclusions de nominés ne se règlent que dans `data/categories.json`.

---

## Générer et imprimer les tickets

1. Aller sur `/admin`, se connecter.
2. Panneau **Codes et tickets** : choisir le nombre (45 par défaut), cliquer sur
   **Générer un lot de codes**.
3. Cliquer sur **Voir les tickets à imprimer**, puis **Imprimer** (3 tickets par ligne sur papier).
   Télécharger aussi le **CSV** comme filet de sécurité.
4. Découper, plier, mélanger dans une boîte. Chacun tire un ticket au hasard.

> Les codes en clair ne sont affichés **qu'une seule fois** : le serveur n'en garde qu'une
> empreinte. Quitter ou recharger la page avant d'imprimer oblige à générer un nouveau lot (les
> anciens codes restent valides mais deviennent inutilisables, puisque plus personne ne les
> connaît).

Chaque ticket porte le code en clair et un QR code qui ouvre le site avec le code **dans le
fragment d'URL** (`/#code=...`), jamais dans la query string : un fragment n'est pas envoyé au
serveur et n'apparaît donc dans aucun journal. Le site le lit, le retire aussitôt de la barre
d'adresse, puis connecte le votant.

> **À faire une fois avant d'imprimer les 45 tickets** : générer un lot de 1 ou 2, et scanner le QR
> avec un téléphone pour vérifier qu'il ouvre bien le site. Le générateur de QR codes est écrit à
> la main et vérifié par des tests (y compris la relecture complète du contenu encodé), mais un
> essai réel avec un appareil photo coûte une minute.

---

## Déroulé conseillé le jour J

**Quelques jours avant**

1. Définir `ADMIN_PASSWORD` et `TOKEN_PEPPER` sur Netlify, puis déployer.
2. Faire un **essai complet** : générer 3 codes, voter, modifier, consulter la participation.
3. **Réinitialiser l'élection** (panneau rouge, double confirmation) pour effacer l'essai.
4. Générer le vrai lot de codes, imprimer les tickets, ne pas les regarder.

**Le jour du vote**

5. Faire tirer un ticket au hasard à chacun, dans une boîte.
6. Dans `/admin` : **Ouvrir les votes**, et programmer la **clôture automatique** (heure de Douala).
7. Montrer la page « Comment ça marche ? » et rappeler les deux règles : garder son ticket, ne le
   montrer à personne.
8. Suivre la participation pendant la semaine (jamais les résultats : le serveur refuse de les
   calculer tant que les votes sont ouverts).

**Juste avant la cérémonie**

9. Vérifier que les votes sont **fermés** (ou laisser la clôture automatique faire son travail).
10. Dans le panneau **Mode cérémonie**, choisir les catégories à révéler et leur ordre — 63 d'un
    coup, c'est trop long. Enregistrer l'ordre.
11. Exporter les résultats en CSV et les garder au cas où.

**Pendant la cérémonie**

12. Ouvrir `/ceremonie` sur l'ordinateur relié au vidéoprojecteur, puis **Plein écran** (ou `F`).
13. Espace (ou →) révèle la 3ᵉ place, la 2ᵉ, puis le vainqueur, avec confettis. ← revient en
    arrière. **Révélation rapide** affiche directement le vainqueur pour accélérer.

---

## Déploiement sur Netlify

### Par la CLI

```bash
npm install -g netlify-cli
```

```bash
netlify login
```

```bash
netlify init
```

```bash
netlify env:set TOKEN_PEPPER "<le poivre généré plus haut>"
```

```bash
netlify env:set ADMIN_PASSWORD "<ta phrase de passe>"
```

```bash
netlify deploy --build --prod
```

### Par le dépôt GitHub

1. Pousser le projet sur GitHub.
2. Sur Netlify : **Add new project → Import an existing project**, choisir le dépôt.
3. Netlify lit `netlify.toml` : commande `node scripts/build.js`, dossier publié `dist`, fonctions
   dans `netlify/functions`. Il n'y a rien à saisir.
4. **Project configuration → Environment variables** : ajouter `ADMIN_PASSWORD` et `TOKEN_PEPPER`.
5. Déployer. Netlify Blobs s'active tout seul, sans configuration.

Variables à définir dans le tableau de bord Netlify :

| Variable | Valeur |
| --- | --- |
| `ADMIN_PASSWORD` | phrase de passe de l'administrateur |
| `TOKEN_PEPPER` | 64 caractères hexadécimaux aléatoires |

Après le premier déploiement, vérifier que `/api/state` répond
`{"isOpen":false,"closesAt":null,...}` : c'est le signe que les fonctions et le stockage
fonctionnent.

---

## Structure du projet

```
data/                     catégories et nominés — la seule chose à modifier au quotidien
  categories.json
  nominees.json
shared/                   code partagé entre le front et les fonctions
  catalog.ts              chargement et validation des données
  types.ts
netlify/functions/
  state.mts               GET  /api/state   — ouvert/fermé, clôture, heure serveur
  ballot.mts              POST /api/ballot  — charger, voter, modifier, retirer
  admin.mts               POST /api/admin   — codes, participation, résultats, cérémonie
  lib/
    crypto.ts             codes, HMAC, HKDF, AES-256-GCM, comparaison en temps constant
    ballot.ts             vote, modification, retrait, écritures conditionnelles
    results.ts            dépouillement, ex æquo, export CSV
    election.ts           ouverture et clôture
    session.ts            session administrateur
    ratelimit.ts          limitation de débit sans stockage d'IP
    store.ts              clés et interface de stockage
    blobs.ts              le seul point de contact avec Netlify Blobs
public/                   le site, servi tel quel (ni build ni dépendance)
  index.html  styles.css  favicon.svg  robots.txt
  js/
    main.js               routage et amorçage
    api.js  etat.js  dom.js  qr.js  confetti.js
    pages/                accueil, code, tableau, vote, fonctionnement, admin, tickets, cérémonie
scripts/
  build.js                vérifie les données et construit dist/
  serve.js                serveur de développement local, sans dépendance
  file-store.js           stockage de fichiers conforme à l'interface de Netlify Blobs
  simulate.js             simulation d'une élection complète
tests/                    98 tests (lanceur intégré de Node)
netlify.toml              build, redirections, en-têtes de sécurité
```

---

## Limites connues

- **Le ticket perdu est perdu.** C'est le prix de l'anonymat : sans le code, le dossier chiffré est
  illisible. Les votes déjà déposés restent comptés, mais ne peuvent plus être modifiés. Prévoir
  quelques tickets de rechange, en sachant qu'un nouveau ticket repart d'un bulletin vide.
- **Les journaux de l'hébergeur.** Netlify conserve un temps des journaux techniques (adresse IP,
  horodatage) des requêtes reçues. Ils ne contiennent aucun vote, et rien dans les données
  enregistrées ne permet de les relier à un vote — mais cette partie ne dépend pas de ce projet.
  C'est dit explicitement sur la page « Comment ça marche ? ».
- **Cohérence du listage.** Netlify Blobs sert les lectures en cohérence forte ici, mais l'opération
  de listage (`list`) n'accepte pas cette option : un comptage fait dans les 60 secondes suivant un
  vote pourrait, en théorie, l'ignorer. Sans effet pratique, puisque le dépouillement a lieu après
  la clôture.
- **Pas de transactions.** Les écritures conditionnelles (`onlyIfMatch`) empêchent le double vote,
  mais ne remplacent pas une base de données transactionnelle. Si la fonction est interrompue entre
  l'enregistrement d'un vote modifié et la suppression de l'ancienne ligne, celle-ci est rattrapée
  à l'opération suivante du même votant. Le panneau d'administration affiche un contrôle de
  cohérence (lignes de vote ≤ codes ayant voté).
- **Le site n'est pas référencé** (`robots.txt`, en-tête `X-Robots-Tag`, balise `noindex`), mais il
  reste accessible à qui connaît l'adresse. Seul le code permet de voter.
