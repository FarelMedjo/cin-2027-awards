/**
 * Stockage sur disque conforme à l'interface StoreLike, pour le développement
 * local et le script de simulation.
 *
 * Il reproduit la sémantique de Netlify Blobs qui compte pour ce projet :
 * onlyIfNew, onlyIfMatch, le drapeau `modified`, les ETag, les métadonnées et
 * le listage par préfixe.
 *
 * Chaque entrée est un fichier JSON unique dont le nom est la clé encodée, ce
 * qui évite toute arborescence et rend le listage immédiat.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class FileStore {
  /** @param {string} repertoire */
  constructor(repertoire) {
    this.repertoire = repertoire;
    mkdirSync(repertoire, { recursive: true });
  }

  /** @param {string} key */
  #chemin(key) {
    return join(this.repertoire, `${encodeURIComponent(key)}.json`);
  }

  /** @param {string} key */
  #lire(key) {
    try {
      return JSON.parse(readFileSync(this.#chemin(key), 'utf8'));
    } catch {
      return null;
    }
  }

  /** @param {{value: string, metadata: object}} entree @param {{type?: string}} [options] */
  #decoder(entree, options) {
    const buffer = Buffer.from(entree.value, 'base64');
    switch (options?.type) {
      case 'json':
        return JSON.parse(buffer.toString('utf8'));
      case 'arrayBuffer':
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      default:
        return buffer.toString('utf8');
    }
  }

  async get(key, options) {
    const entree = this.#lire(key);
    return entree ? this.#decoder(entree, options) : null;
  }

  async getWithMetadata(key, options) {
    const entree = this.#lire(key);
    if (!entree) return null;
    return {
      data: this.#decoder(entree, options),
      etag: entree.etag,
      metadata: entree.metadata ?? {},
    };
  }

  async set(key, value, options) {
    const existante = this.#lire(key);
    if (options?.onlyIfNew && existante) return { modified: false };
    if (options?.onlyIfMatch !== undefined) {
      if (!existante || existante.etag !== options.onlyIfMatch) return { modified: false };
    }
    const buffer = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
    const etag = `"${createHash('sha256').update(buffer).digest('hex').slice(0, 24)}"`;
    // Le dossier peut avoir été supprimé entre-temps (remise à zéro manuelle).
    mkdirSync(this.repertoire, { recursive: true });
    writeFileSync(
      this.#chemin(key),
      JSON.stringify({ etag, metadata: options?.metadata ?? {}, value: buffer.toString('base64') }),
    );
    return { modified: true, etag };
  }

  async setJSON(key, value, options) {
    return this.set(key, JSON.stringify(value), options);
  }

  async delete(key) {
    try {
      unlinkSync(this.#chemin(key));
    } catch {
      // Déjà absent : rien à faire, comme chez Netlify.
    }
  }

  async list(options) {
    const prefixe = options?.prefix ?? '';
    let fichiers = [];
    try {
      fichiers = readdirSync(this.repertoire);
    } catch {
      return { blobs: [] };
    }
    const cles = fichiers
      .filter((nom) => nom.endsWith('.json'))
      .map((nom) => decodeURIComponent(nom.slice(0, -'.json'.length)))
      .filter((cle) => cle.startsWith(prefixe));

    if (!options?.directories) {
      return { blobs: cles.map((key) => ({ key, etag: this.#lire(key)?.etag })) };
    }
    const blobs = [];
    const repertoires = new Set();
    for (const cle of cles) {
      const reste = cle.slice(prefixe.length);
      const slash = reste.indexOf('/');
      if (slash === -1) blobs.push({ key: cle, etag: this.#lire(cle)?.etag });
      else repertoires.add(`${prefixe}${reste.slice(0, slash)}`);
    }
    return { blobs, directories: [...repertoires] };
  }

  /** Vide entièrement le stockage local (utilisé par la simulation). */
  vider() {
    rmSync(this.repertoire, { recursive: true, force: true });
    mkdirSync(this.repertoire, { recursive: true });
  }
}
