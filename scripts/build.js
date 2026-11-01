/**
 * « Build » du site : une copie de fichiers, rien de plus.
 *
 * Le front est écrit en HTML, CSS et modules JavaScript standards : il n'y a ni
 * transpilation, ni empaquetage, ni dépendance. Ce script recopie public/ dans
 * dist/ et y ajoute les deux fichiers de données, pour que data/categories.json
 * et data/nominees.json restent la seule source de vérité du projet.
 *
 * Usage : node scripts/build.js
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(racine, 'dist');

/** Vérifie que les données sont lisibles et cohérentes avant de publier. */
async function verifierDonnees() {
  const categories = JSON.parse(await readFile(join(racine, 'data/categories.json'), 'utf8'));
  const nominees = JSON.parse(await readFile(join(racine, 'data/nominees.json'), 'utf8'));

  const problemes = [];
  const idsNomines = new Set(nominees.map((n) => n.id));
  if (idsNomines.size !== nominees.length) problemes.push('data/nominees.json : identifiants en double');

  const idsCategories = new Set();
  for (const categorie of categories) {
    if (!categorie.id || !categorie.title || !categorie.theme) {
      problemes.push(`data/categories.json : entrée incomplète (${categorie.id ?? '?'})`);
    }
    if (idsCategories.has(categorie.id)) {
      problemes.push(`data/categories.json : identifiant en double « ${categorie.id} »`);
    }
    idsCategories.add(categorie.id);
    if (categorie.type !== 'single' && categorie.type !== 'duo') {
      problemes.push(`data/categories.json : « ${categorie.id} » a le type invalide « ${categorie.type} »`);
    }
    for (const exclu of categorie.excludedNominees ?? []) {
      if (!idsNomines.has(exclu)) {
        problemes.push(`data/categories.json : « ${categorie.id} » exclut « ${exclu} », inconnu dans data/nominees.json`);
      }
    }
  }

  if (problemes.length) {
    console.error('\nLes fichiers de données comportent des erreurs :');
    for (const probleme of problemes) console.error(`  - ${probleme}`);
    process.exit(1);
  }
  return { categories: categories.length, nominees: nominees.length };
}

const compte = await verifierDonnees();

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'data'), { recursive: true });
await cp(join(racine, 'public'), dist, { recursive: true });

for (const fichier of ['categories.json', 'nominees.json']) {
  const contenu = await readFile(join(racine, 'data', fichier), 'utf8');
  // Reécrit compacté : quelques kilo-octets de moins à télécharger en 3G.
  await writeFile(join(dist, 'data', fichier), JSON.stringify(JSON.parse(contenu)));
}

console.log(`dist/ construit : ${compte.categories} catégories, ${compte.nominees} nominés.`);
