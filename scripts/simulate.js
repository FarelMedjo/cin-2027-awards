/**
 * Simulation d'une élection complète, en local et hors ligne.
 *
 * Génère 10 codes, les fait voter dans un sous-ensemble aléatoire de
 * catégories, modifie et retire quelques votes, vérifie la cohérence du
 * stockage, puis affiche les résultats.
 *
 * Elle utilise le vrai code des fonctions (ballot.ts, results.ts) sur un
 * stockage de fichiers isolé : ce qui est vérifié ici est bien ce qui tournera
 * en production.
 *
 * Usage :  node scripts/simulate.js [--codes 10] [--garder]
 */

import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { castVote, loadBallot, removeVote } from '../netlify/functions/lib/ballot.ts';
import { codeId, deriveDossierKey, formatCode, generateCodeBody } from '../netlify/functions/lib/crypto.ts';
import { computeParticipation, computeResults } from '../netlify/functions/lib/results.ts';
import { keys, parseVoteKey } from '../netlify/functions/lib/store.ts';
import { CATEGORIES, nomineesForCategory, requiredChoices } from '../shared/catalog.ts';
import { FileStore } from './file-store.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const repertoire = join(racine, '.local-simulation');

const arguments_ = process.argv.slice(2);
const nombreCodes = Number(arguments_[arguments_.indexOf('--codes') + 1]) || 10;
const garder = arguments_.includes('--garder');

const POIVRE = 'poivre-de-simulation-0123456789abcdef0123456789abcdef';

function hasard(max) {
  return Math.floor(Math.random() * max);
}

function piocher(liste, nombre) {
  const copie = [...liste];
  const choisis = [];
  for (let i = 0; i < nombre && copie.length; i += 1) {
    choisis.push(copie.splice(hasard(copie.length), 1)[0]);
  }
  return choisis;
}

function choixPour(categorie) {
  const candidats = nomineesForCategory(categorie);
  return piocher(candidats, requiredChoices(categorie))
    .map((nomine) => nomine.id)
    .sort();
}

console.log('\n===  Simulation CIN 2027 Awards  ===\n');

rmSync(repertoire, { recursive: true, force: true });
const store = new FileStore(repertoire);

// ---- 1. Les codes ----------------------------------------------------------
const votants = [];
for (let i = 0; i < nombreCodes; i += 1) {
  const corps = generateCodeBody();
  const identifiant = codeId(corps, POIVRE);
  await store.setJSON(keys.code(identifiant), { v: 1 }, { onlyIfNew: true });
  votants.push({
    code: formatCode(corps),
    ctx: { codeId: identifiant, dossierKey: deriveDossierKey(corps, POIVRE) },
  });
}
console.log(`${votants.length} codes générés, par exemple ${votants[0].code}`);

// ---- 2. Chacun vote dans un sous-ensemble aléatoire -------------------------
let votesPoses = 0;
for (const votant of votants) {
  const combien = 5 + hasard(CATEGORIES.length - 5);
  for (const categorie of piocher([...CATEGORIES], combien)) {
    await castVote(store, votant.ctx, categorie.id, choixPour(categorie));
    votesPoses += 1;
  }
}
console.log(`${votesPoses} votes enregistrés (chaque code a voté dans un nombre aléatoire de catégories)`);

// ---- 3. Quelques changements d'avis ----------------------------------------
let modifications = 0;
for (const votant of piocher(votants, Math.max(2, Math.floor(votants.length / 2)))) {
  const bulletin = await loadBallot(store, votant.ctx);
  for (const categorieId of piocher(Object.keys(bulletin), 3)) {
    const categorie = CATEGORIES.find((c) => c.id === categorieId);
    await castVote(store, votant.ctx, categorieId, choixPour(categorie));
    modifications += 1;
  }
}
console.log(`${modifications} votes modifiés après réflexion`);

// ---- 4. Quelques retraits ---------------------------------------------------
let retraits = 0;
for (const votant of piocher(votants, 3)) {
  const bulletin = await loadBallot(store, votant.ctx);
  for (const categorieId of piocher(Object.keys(bulletin), 1)) {
    await removeVote(store, votant.ctx, categorieId);
    retraits += 1;
  }
}
console.log(`${retraits} votes retirés`);

// ---- 5. Vérifications de cohérence -----------------------------------------
console.log('\n--- Vérifications ---');
const participation = await computeParticipation(store);
const { blobs } = await store.list({ prefix: keys.votesPrefix() });

const attendu = votesPoses - retraits;
const lignes = blobs.length;
console.log(
  `Lignes de vote : ${lignes} (attendu ${attendu}) ${lignes === attendu ? 'OK' : 'ÉCART'}`,
);

// Aucune catégorie ne peut avoir plus de lignes que de codes ayant voté.
const trop = Object.entries(participation.votesByCategory).filter(
  ([, voix]) => voix > participation.codesUsed,
);
console.log(`Catégories incohérentes : ${trop.length} ${trop.length === 0 ? 'OK' : 'PROBLÈME'}`);

// Le dossier de chaque votant doit correspondre exactement à ses lignes.
let dossiersCoherents = 0;
const vuesParCategorie = new Map();
for (const votant of votants) {
  const bulletin = await loadBallot(store, votant.ctx);
  dossiersCoherents += 1;
  for (const [categorieId, entree] of Object.entries(bulletin)) {
    const cle = `${categorieId}|${entree.nomineeIds.join('+')}`;
    vuesParCategorie.set(cle, (vuesParCategorie.get(cle) ?? 0) + 1);
  }
}
console.log(`Dossiers votants relus sans erreur : ${dossiersCoherents}/${votants.length}`);

// Les lignes de vote ne doivent contenir aucun identifiant de code.
const identifiants = new Set(votants.map((v) => v.ctx.codeId));
let fuite = 0;
for (const blob of blobs) {
  const parsed = parseVoteKey(blob.key);
  if (!parsed) continue;
  const contenu = JSON.stringify(await store.get(blob.key, { type: 'json' }));
  if ([...identifiants].some((id) => blob.key.includes(id) || contenu.includes(id))) fuite += 1;
}
console.log(`Lignes de vote contenant un identifiant de code : ${fuite} ${fuite === 0 ? 'OK' : 'PROBLÈME'}`);

// Le comptage par listage doit retrouver ce que disent les dossiers.
const resultats = await computeResults(store);
let ecarts = 0;
for (const resultat of resultats) {
  for (const ligne of resultat.rows) {
    const cle = `${resultat.categoryId}|${ligne.nomineeIds.join('+')}`;
    if ((vuesParCategorie.get(cle) ?? 0) !== ligne.votes) ecarts += 1;
  }
}
console.log(`Écarts entre dossiers et dépouillement : ${ecarts} ${ecarts === 0 ? 'OK' : 'PROBLÈME'}`);

// ---- 6. Résultats -----------------------------------------------------------
console.log('\n--- Résultats (10 premières catégories) ---\n');
for (const resultat of resultats.slice(0, 10)) {
  console.log(`${resultat.title}  (${resultat.totalVotes} voix)`);
  if (resultat.rows.length === 0) {
    console.log('   aucun vote');
    continue;
  }
  for (const ligne of resultat.rows.slice(0, 3)) {
    const exaequo = ligne.tied ? ' (ex æquo)' : '';
    console.log(`   ${ligne.rank}. ${ligne.names.join(' + ')} — ${ligne.votes} voix${exaequo}`);
  }
}

console.log(
  `\nParticipation : ${participation.codesUsed}/${participation.codesGenerated} codes ont voté, ${participation.totalVotes} voix au total.`,
);

const exaequoTotal = resultats.filter((r) => r.rows.some((ligne) => ligne.tied && ligne.rank === 1)).length;
console.log(`Catégories avec une première place ex æquo : ${exaequoTotal}`);

if (garder) {
  console.log(`\nStockage conservé dans ${repertoire}`);
} else {
  rmSync(repertoire, { recursive: true, force: true });
  console.log('\nStockage de simulation supprimé (--garder pour le conserver).');
}
