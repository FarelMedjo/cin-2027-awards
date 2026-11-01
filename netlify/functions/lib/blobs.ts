/**
 * Le seul endroit du projet qui parle à Netlify Blobs.
 *
 * Tout le reste du code ne connaît que l'interface StoreLike de store.ts. Deux
 * conséquences utiles : les tests fournissent un stockage en mémoire fidèle
 * (écritures conditionnelles comprises), et le serveur de développement local
 * fournit un stockage sur disque — sans que les fonctions aient à le savoir.
 *
 * L'import de la bibliothèque est dynamique et paresseux : en local, elle n'est
 * jamais chargée.
 */

import { STORE_NAME, type StoreLike } from './store.ts';

type StoreFactory = () => StoreLike;

let override: StoreFactory | null = null;

/** Remplace le stockage (serveur local, simulation, tests). */
export function setStoreFactory(factory: StoreFactory | null): void {
  override = factory;
}

let cached: StoreLike | null = null;

export async function openStore(): Promise<StoreLike> {
  if (override) return override();
  if (cached) return cached;
  const { getStore } = await import('@netlify/blobs');
  // Cohérence forte : indispensable pour relire un dossier votant que l'on
  // vient de modifier. En cohérence par défaut (« eventual »), une mise à jour
  // peut mettre jusqu'à 60 secondes à se propager.
  cached = getStore({ name: STORE_NAME, consistency: 'strong' }) as unknown as StoreLike;
  return cached;
}
