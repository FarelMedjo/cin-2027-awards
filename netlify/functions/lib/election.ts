/** État de l'élection : interrupteur manuel et clôture automatique. */

import type { ElectionState, PublicState } from '../../../shared/types.ts';
import { keys, type StoreLike } from './store.ts';

/** Par défaut, les votes sont fermés : c'est l'administrateur qui les ouvre. */
const DEFAULT_STATE: ElectionState = { isOpen: false, closesAt: null };

export async function readState(store: StoreLike): Promise<ElectionState> {
  const raw = (await store.get(keys.state, { type: 'json' })) as Partial<ElectionState> | null;
  if (!raw) return { ...DEFAULT_STATE };
  const closesAt =
    typeof raw.closesAt === 'string' && !Number.isNaN(Date.parse(raw.closesAt))
      ? new Date(raw.closesAt).toISOString()
      : null;
  return { isOpen: raw.isOpen === true, closesAt };
}

export async function writeState(store: StoreLike, state: ElectionState): Promise<void> {
  await store.setJSON(keys.state, state);
}

/**
 * Les votes sont ouverts si l'interrupteur est ouvert ET que la clôture
 * automatique n'est pas dépassée. Rien n'est ordonnancé : la règle est
 * recalculée à chaque requête, ce qui rend la clôture exacte à la seconde.
 */
export function isVotingOpen(state: ElectionState, now: Date = new Date()): boolean {
  if (!state.isOpen) return false;
  if (state.closesAt && now.getTime() >= Date.parse(state.closesAt)) return false;
  return true;
}

export function toPublicState(state: ElectionState, now: Date = new Date()): PublicState {
  return {
    isOpen: state.isOpen,
    closesAt: state.closesAt,
    votingOpen: isVotingOpen(state, now),
    now: now.toISOString(),
  };
}
