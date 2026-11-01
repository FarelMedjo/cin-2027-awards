/**
 * Serveur de développement local, sans aucune dépendance.
 *
 * Il sert dist/ et fait tourner les vraies fonctions Netlify (importées
 * directement, Node exécutant TypeScript nativement) sur un stockage posé dans
 * .local-store/. Le parcours complet — code, vote, modification, admin,
 * cérémonie — est donc testable hors ligne, sans la CLI Netlify.
 *
 * Les en-têtes de sécurité sont relus dans netlify.toml, pour que ce qui est
 * testé en local soit exactement ce qui sera servi en production.
 *
 * Usage : npm run serve     (puis http://localhost:8888)
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileStore } from './file-store.js';
import { setStoreFactory } from '../netlify/functions/lib/blobs.ts';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(racine, 'dist');
const PORT = Number(process.env.PORT ?? 8888);

// ---- Variables d'environnement ---------------------------------------------
try {
  process.loadEnvFile(join(racine, '.env'));
} catch {
  // Pas de .env : on fournit des valeurs de développement, en le disant.
}
if (!process.env.TOKEN_PEPPER) {
  process.env.TOKEN_PEPPER = 'poivre-de-developpement-local-a-ne-jamais-deployer';
  console.warn('⚠  TOKEN_PEPPER absent : valeur de développement utilisée (voir .env.example).');
}
if (!process.env.ADMIN_PASSWORD) {
  process.env.ADMIN_PASSWORD = 'admin';
  console.warn('⚠  ADMIN_PASSWORD absent : mot de passe de développement « admin ».');
}

// ---- Stockage local ---------------------------------------------------------
const store = new FileStore(join(racine, '.local-store'));
setStoreFactory(() => store);

// ---- Fonctions --------------------------------------------------------------
const routes = new Map([
  ['/api/state', (await import('../netlify/functions/state.mts')).default],
  ['/api/ballot', (await import('../netlify/functions/ballot.mts')).default],
  ['/api/admin', (await import('../netlify/functions/admin.mts')).default],
]);

// ---- En-têtes de sécurité, relus dans netlify.toml --------------------------
async function enTetesDeSecurite() {
  const toml = await readFile(join(racine, 'netlify.toml'), 'utf8');
  const bloc = toml.split('for = "/*"')[1]?.split('[[headers]]')[0] ?? '';
  const entetes = {};
  for (const ligne of bloc.split('\n')) {
    const correspondance = ligne.match(/^\s*([A-Za-z-]+)\s*=\s*"(.*)"\s*$/);
    if (correspondance) entetes[correspondance[1].toLowerCase()] = correspondance[2];
  }
  return entetes;
}
const SECURITE = await enTetesDeSecurite();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function lireCorps(req) {
  return new Promise((resolve, reject) => {
    const morceaux = [];
    req.on('data', (morceau) => morceaux.push(morceau));
    req.on('end', () => resolve(Buffer.concat(morceaux)));
    req.on('error', reject);
  });
}

/** Les adresses gérées par le routeur côté client (voir netlify.toml et public/js/main.js). */
const ROUTES_APPLICATION = /^\/(vote(\/.*)?|fonctionnement|admin(\/tickets)?|ceremonie)\/?$/;

async function servirFichier(res, chemin, statut = 200) {
  const contenu = await readFile(chemin);
  res.writeHead(statut, {
    ...SECURITE,
    'content-type': TYPES[extname(chemin)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(contenu);
}

const serveur = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    // ---- API ----
    const handler = routes.get(url.pathname);
    if (handler) {
      const corps = ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : await lireCorps(req);
      const requete = new Request(`http://localhost:${PORT}${req.url}`, {
        method: req.method,
        headers: Object.entries(req.headers).flatMap(([cle, valeur]) =>
          valeur === undefined ? [] : [[cle, Array.isArray(valeur) ? valeur.join(', ') : valeur]],
        ),
        body: corps && corps.length ? corps : undefined,
      });
      const reponse = await handler(requete, {});
      const entetes = Object.fromEntries(reponse.headers);
      // Les cookies doivent être posés avant l'envoi des en-têtes, et peuvent
      // être multiples : writeHead accepte un tableau.
      delete entetes['set-cookie'];
      const cookies = reponse.headers.getSetCookie?.() ?? [];
      if (cookies.length) entetes['set-cookie'] = cookies;
      res.writeHead(reponse.status, entetes);
      res.end(Buffer.from(await reponse.arrayBuffer()));
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Route inconnue.' }));
      return;
    }

    // ---- Fichiers statiques, avec repli sur index.html (routage côté client) ----
    const demande = normalize(join(dist, decodeURIComponent(url.pathname)));
    if (!demande.startsWith(dist)) {
      res.writeHead(403).end('Interdit');
      return;
    }
    try {
      const infos = await stat(demande);
      await servirFichier(res, infos.isDirectory() ? join(demande, 'index.html') : demande);
    } catch {
      if (ROUTES_APPLICATION.test(url.pathname)) {
        await servirFichier(res, join(dist, 'index.html'));
      } else {
        // Comme Netlify : dist/404.html, avec un vrai statut 404.
        await servirFichier(res, join(dist, '404.html'), 404);
      }
    }
  } catch (erreur) {
    console.error('[serve] erreur', erreur);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Erreur serveur');
  }
});

try {
  await stat(join(dist, 'index.html'));
} catch {
  console.error('dist/ est absent. Lance d’abord : npm run build');
  process.exit(1);
}

serveur.listen(PORT, () => {
  console.log(`\n  CIN 2027 Awards — développement local`);
  console.log(`  Site      : http://localhost:${PORT}`);
  console.log(`  Admin     : http://localhost:${PORT}/admin`);
  console.log(`  Stockage  : .local-store/  (supprime ce dossier pour repartir de zéro)\n`);
});
