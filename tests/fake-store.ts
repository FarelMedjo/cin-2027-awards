/**
 * Stockage en mémoire conforme à l'interface StoreLike.
 *
 * Il reproduit fidèlement la sémantique des écritures conditionnelles de Netlify
 * Blobs (onlyIfNew, onlyIfMatch, et le drapeau `modified` renvoyé), ce qui permet
 * de tester le cas réellement délicat : le même code utilisé dans deux onglets
 * au même moment.
 */

import type {
  ListResult,
  ReadOptions,
  StoreLike,
  WithMetadata,
  WriteOptions,
  WriteResult,
} from '../netlify/functions/lib/store.ts';

interface Entry {
  value: Buffer;
  etag: string;
  metadata: Record<string, unknown>;
}

export class FakeStore implements StoreLike {
  readonly entries = new Map<string, Entry>();
  private etagCounter = 0;

  /** Compteurs d'appels, pour vérifier qu'aucune lecture inutile n'est faite. */
  readonly calls = { get: 0, set: 0, delete: 0, list: 0 };

  /**
   * Point d'interception appelé avant chaque écriture. Les tests de concurrence
   * s'en servent pour glisser une écriture d'un « autre onglet » au pire moment.
   */
  beforeSet?: (key: string) => Promise<void> | void;

  private nextEtag(): string {
    this.etagCounter += 1;
    return `"etag-${this.etagCounter}"`;
  }

  private decode(entry: Entry, options?: ReadOptions): unknown {
    switch (options?.type) {
      case 'json':
        return JSON.parse(entry.value.toString('utf8'));
      case 'arrayBuffer':
        return entry.value.buffer.slice(
          entry.value.byteOffset,
          entry.value.byteOffset + entry.value.byteLength,
        );
      default:
        return entry.value.toString('utf8');
    }
  }

  async get(key: string, options?: ReadOptions): Promise<unknown> {
    this.calls.get += 1;
    const entry = this.entries.get(key);
    return entry ? this.decode(entry, options) : null;
  }

  async getWithMetadata(key: string, options?: ReadOptions): Promise<WithMetadata | null> {
    this.calls.get += 1;
    const entry = this.entries.get(key);
    if (!entry) return null;
    return { data: this.decode(entry, options), etag: entry.etag, metadata: entry.metadata };
  }

  async set(
    key: string,
    value: string | ArrayBuffer,
    options?: WriteOptions,
  ): Promise<WriteResult> {
    if (this.beforeSet) await this.beforeSet(key);
    this.calls.set += 1;
    const existing = this.entries.get(key);

    if (options?.onlyIfNew && existing) return { modified: false };
    if (options?.onlyIfMatch !== undefined) {
      if (!existing || existing.etag !== options.onlyIfMatch) return { modified: false };
    }

    const buffer = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
    const etag = this.nextEtag();
    this.entries.set(key, { value: buffer, etag, metadata: options?.metadata ?? {} });
    return { modified: true, etag };
  }

  async setJSON(key: string, value: unknown, options?: WriteOptions): Promise<WriteResult> {
    return this.set(key, JSON.stringify(value), options);
  }

  async delete(key: string): Promise<void> {
    this.calls.delete += 1;
    this.entries.delete(key);
  }

  async list(options?: { prefix?: string; directories?: boolean }): Promise<ListResult> {
    this.calls.list += 1;
    const prefix = options?.prefix ?? '';
    const keys = [...this.entries.keys()].filter((key) => key.startsWith(prefix));
    if (!options?.directories) {
      return { blobs: keys.map((key) => ({ key, etag: this.entries.get(key)!.etag })) };
    }
    const blobs: Array<{ key: string; etag?: string }> = [];
    const directories = new Set<string>();
    for (const key of keys) {
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash === -1) blobs.push({ key, etag: this.entries.get(key)!.etag });
      else directories.add(`${prefix}${rest.slice(0, slash)}`);
    }
    return { blobs, directories: [...directories] };
  }

  /** Lit une entrée en JSON, pour les assertions des tests. */
  readJson<T>(key: string): T | null {
    const entry = this.entries.get(key);
    return entry ? (JSON.parse(entry.value.toString('utf8')) as T) : null;
  }

  keysWithPrefix(prefix: string): string[] {
    return [...this.entries.keys()].filter((key) => key.startsWith(prefix)).sort();
  }
}
