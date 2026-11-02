/**
 * Sauvegarde en LECTURE SEULE du stockage Netlify Blobs de production.
 *
 * Rien n'est écrit sur Netlify : le script n'utilise que « blobs:list » et
 * « blobs:get » de la CLI Netlify. Le résultat est un fichier JSON posé dans
 * sauvegardes/ (dossier ignoré par git).
 *
 * Prérequis, une seule fois sur ce poste :
 *   npx netlify login     (connexion au compte Netlify, dans le navigateur)
 *   npx netlify link      (relier ce dossier au site déployé)
 *
 * Usage : npm run sauvegarde
 *
 * Contenu du fichier :
 *   - toutes les clés du store, avec leur ETag ;
 *   - le contenu des dossiers votants (chiffrés, en base64) et de l'état de
 *     l'élection. Les lignes de vote (votes/…) et les codes (codes/…) ne sont
 *     pas relus un par un : leur contenu, { n: [...] } et { v: 1 }, se déduit
 *     entièrement de leur clé ;
 *   - le nombre de votes par catégorie et le total.
 *
 * Attention : ce fichier contient les dossiers votants chiffrés et les
 * empreintes des codes. Il ne dit pas qui a voté quoi, mais il ne doit être ni
 * versionné ni partagé.
 */

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(racine, 'node_modules', 'netlify-cli', 'bin', 'run.js');
const STORE = 'cin2027';

/** Préfixes dont on relit le contenu. Les autres se déduisent de la clé. */
const A_RELIRE = ['voters/', 'election/'];

function netlify(args) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd: racine,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

console.log(`Lecture de la liste des clés du store « ${STORE} »…`);
const sortie = netlify(['blobs:list', STORE, '--json']);
const liste = JSON.parse(sortie);
const blobs = Array.isArray(liste) ? liste : (liste.blobs ?? []);
if (!Array.isArray(blobs)) throw new Error('Réponse inattendue de « netlify blobs:list ».');

const cles = blobs.map((b) => ({ key: b.key, etag: b.etag ?? null }));
const aRelire = cles.filter((c) => A_RELIRE.some((prefixe) => c.key.startsWith(prefixe)));
console.log(`${cles.length} clés trouvées, ${aRelire.length} contenus à relire.`);

const temporaire = await mkdtemp(join(tmpdir(), 'cin2027-sauvegarde-'));
const contenus = {};
try {
  for (const [index, { key }] of aRelire.entries()) {
    const fichier = join(temporaire, 'blob');
    netlify(['blobs:get', STORE, key, '--output', fichier]);
    contenus[key] = { base64: (await readFile(fichier)).toString('base64') };
    process.stdout.write(`\r  ${index + 1}/${aRelire.length}`);
  }
  if (aRelire.length) process.stdout.write('\n');
} finally {
  await rm(temporaire, { recursive: true, force: true });
}

// Décompte des votes, par catégorie, à partir des clés votes/<categorie>/<choix>/<uuid>.
const votesParCategorie = {};
for (const { key } of cles) {
  const parties = key.split('/');
  if (parties.length !== 4 || parties[0] !== 'votes') continue;
  votesParCategorie[parties[1]] = (votesParCategorie[parties[1]] ?? 0) + 1;
}
const totalVotes = Object.values(votesParCategorie).reduce((a, b) => a + b, 0);
const compter = (prefixe) => cles.filter((c) => c.key.startsWith(prefixe)).length;

const creeLe = new Date().toISOString();
const sauvegarde = {
  creeLe,
  store: STORE,
  resume: {
    totalVotes,
    codes: compter('codes/'),
    dossiersVotants: compter('voters/'),
    votesParCategorie,
  },
  contenuDeduitDeLaCle: {
    'votes/<categorie>/<choix>/<uuid>': '{ "n": <choix découpé sur « + »> }',
    'codes/<id>': '{ "v": 1 }',
  },
  cles,
  contenus,
};

await mkdir(join(racine, 'sauvegardes'), { recursive: true });
const destination = join(racine, 'sauvegardes', `sauvegarde-${creeLe.replace(/[:.]/g, '-')}.json`);
await writeFile(destination, `${JSON.stringify(sauvegarde, null, 2)}\n`);

// Résumé lisible, catégories masquées comprises.
const categories = JSON.parse(await readFile(join(racine, 'data/categories.json'), 'utf8'));
const titres = new Map(categories.map((c) => [c.id, c.title]));
console.log(`\nSauvegarde écrite : ${destination}`);
console.log(`Total des votes enregistrés : ${totalVotes}`);
console.log(`Codes : ${sauvegarde.resume.codes} — codes ayant voté : ${sauvegarde.resume.dossiersVotants}`);
const masquees = categories.filter((c) => c.archived);
if (masquees.length) {
  console.log('\nVotes des catégories masquées :');
  for (const c of masquees) {
    const devenir = c.mergedInto ? `fusionnée dans « ${titres.get(c.mergedInto) ?? c.mergedInto} »` : 'supprimée';
    console.log(`  ${String(votesParCategorie[c.id] ?? 0).padStart(4)}  ${c.title} (${devenir})`);
  }
}
const inconnues = Object.keys(votesParCategorie).filter((id) => !titres.has(id));
if (inconnues.length) {
  console.log(`\nAttention : votes dans des catégories absentes du fichier : ${inconnues.join(', ')}`);
}
