import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isVotingOpen,
  readState,
  toPublicState,
  writeState,
} from '../netlify/functions/lib/election.ts';
import { keys } from '../netlify/functions/lib/store.ts';
import { FakeStore } from './fake-store.ts';

describe('état de l’élection', () => {
  it('est fermé par défaut, avant toute intervention de l’administrateur', async () => {
    const store = new FakeStore();
    const state = await readState(store);
    assert.deepEqual(state, { isOpen: false, closesAt: null });
    assert.equal(isVotingOpen(state), false);
  });

  it('se relit après écriture', async () => {
    const store = new FakeStore();
    await writeState(store, { isOpen: true, closesAt: '2027-01-15T17:00:00.000Z' });
    assert.deepEqual(await readState(store), {
      isOpen: true,
      closesAt: '2027-01-15T17:00:00.000Z',
    });
  });

  it('ignore une date de clôture illisible', async () => {
    const store = new FakeStore();
    await store.setJSON(keys.state, { isOpen: true, closesAt: 'bientôt' });
    const state = await readState(store);
    assert.equal(state.closesAt, null);
    assert.equal(isVotingOpen(state), true);
  });
});

describe('ouverture des votes', () => {
  const cloture = '2027-01-15T17:00:00.000Z';
  const avant = new Date('2027-01-15T16:59:59.000Z');
  const apres = new Date('2027-01-15T17:00:01.000Z');

  it('exige l’interrupteur ouvert', () => {
    assert.equal(isVotingOpen({ isOpen: false, closesAt: null }, avant), false);
    assert.equal(isVotingOpen({ isOpen: false, closesAt: cloture }, avant), false);
  });

  it('reste ouvert avant la clôture et se ferme après', () => {
    assert.equal(isVotingOpen({ isOpen: true, closesAt: cloture }, avant), true);
    assert.equal(isVotingOpen({ isOpen: true, closesAt: cloture }, apres), false);
  });

  it('se ferme à la seconde exacte de la clôture', () => {
    assert.equal(isVotingOpen({ isOpen: true, closesAt: cloture }, new Date(cloture)), false);
  });

  it('reste ouvert indéfiniment sans date de clôture', () => {
    assert.equal(isVotingOpen({ isOpen: true, closesAt: null }, apres), true);
  });

  it('expose un état public complet', () => {
    const maintenant = new Date('2027-01-15T12:00:00.000Z');
    assert.deepEqual(toPublicState({ isOpen: true, closesAt: cloture }, maintenant), {
      isOpen: true,
      closesAt: cloture,
      votingOpen: true,
      now: '2027-01-15T12:00:00.000Z',
    });
  });
});
