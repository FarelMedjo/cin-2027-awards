/**
 * Crée des codes de vote de test dans le stockage LOCAL (.local-store/).
 *
 * Utilise le même poivre que `npm run serve` (fichier .env, sinon valeur de
 * développement), donc les codes affichés sont immédiatement acceptés par le
 * site local. Ne touche jamais à la production.
 *
 * Usage :  npm run code-test            (1 code)
 *          npm run code-test -- 5       (5 codes)
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeId, formatCode, generateCodeBody } from '../netlify/functions/lib/crypto.ts';
import { keys } from '../netlify/functions/lib/store.ts';
import { FileStore } from './file-store.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(join(racine, '.env'));
} catch {
  // Pas de .env : même repli que scripts/serve.js.
}
const poivre = process.env.TOKEN_PEPPER || 'poivre-de-developpement-local-a-ne-jamais-deployer';

const nombre = Math.min(Math.max(Number(process.argv[2]) || 1, 1), 100);
const store = new FileStore(join(racine, '.local-store'));

console.log('');
for (let i = 0; i < nombre; i += 1) {
  const corps = generateCodeBody();
  await store.setJSON(keys.code(codeId(corps, poivre)), { v: 1 }, { onlyIfNew: true });
  console.log(`  ${formatCode(corps)}`);
}
console.log(`\n  ${nombre} code(s) valable(s) sur http://localhost:8888 (npm run serve).\n`);
