import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CODE_CHECK_RULE,
  peekRateLimit,
  recordFailure,
  sweepRateLimits,
} from '../netlify/functions/lib/ratelimit.ts';
import { keys } from '../netlify/functions/lib/store.ts';
import { FakeStore } from './fake-store.ts';

const PEPPER = 'poivre-de-test-0123456789abcdef0123456789abcdef';
const IP = '41.202.0.1';

describe('limitation de débit', () => {
  it('laisse passer tant que la limite n’est pas atteinte', async () => {
    const store = new FakeStore();
    for (let i = 0; i < CODE_CHECK_RULE.max; i += 1) {
      assert.equal((await peekRateLimit(store, CODE_CHECK_RULE, IP, PEPPER)).allowed, true);
      await recordFailure(store, CODE_CHECK_RULE, IP, PEPPER);
    }
    const verdict = await peekRateLimit(store, CODE_CHECK_RULE, IP, PEPPER);
    assert.equal(verdict.allowed, false);
    assert.ok(verdict.retryAfterSeconds > 0);
  });

  it('ne compte que les échecs : un votant au code valide n’est jamais ralenti', async () => {
    const store = new FakeStore();
    for (let i = 0; i < 200; i += 1) {
      assert.equal((await peekRateLimit(store, CODE_CHECK_RULE, IP, PEPPER)).allowed, true);
    }
    assert.equal(store.keysWithPrefix(keys.rateLimit('')).length, 0, 'aucun compteur écrit');
  });

  it('repart de zéro quand la fenêtre est passée', async () => {
    const store = new FakeStore();
    const depart = Date.now();
    for (let i = 0; i < CODE_CHECK_RULE.max; i += 1) {
      await recordFailure(store, CODE_CHECK_RULE, IP, PEPPER, depart);
    }
    assert.equal((await peekRateLimit(store, CODE_CHECK_RULE, IP, PEPPER, depart)).allowed, false);

    const plusTard = depart + CODE_CHECK_RULE.windowMs + 1000;
    assert.equal(
      (await peekRateLimit(store, CODE_CHECK_RULE, IP, PEPPER, plusTard)).allowed,
      true,
    );
  });

  it('compte séparément deux appareils différents', async () => {
    const store = new FakeStore();
    for (let i = 0; i < CODE_CHECK_RULE.max; i += 1) {
      await recordFailure(store, CODE_CHECK_RULE, IP, PEPPER);
    }
    assert.equal((await peekRateLimit(store, CODE_CHECK_RULE, IP, PEPPER)).allowed, false);
    assert.equal(
      (await peekRateLimit(store, CODE_CHECK_RULE, '197.155.0.9', PEPPER)).allowed,
      true,
    );
  });

  it('ne stocke jamais l’adresse IP, seulement une empreinte', async () => {
    const store = new FakeStore();
    await recordFailure(store, CODE_CHECK_RULE, IP, PEPPER);
    const cles = store.keysWithPrefix(keys.rateLimit(''));
    assert.equal(cles.length, 1);
    assert.ok(!cles[0]!.includes(IP));
    assert.ok(!JSON.stringify(store.readJson(cles[0]!)).includes(IP));
    assert.match(cles[0]!, /^rl\/[0-9a-f]{32}$/);
  });

  it('change d’empreinte d’un jour à l’autre', async () => {
    const store = new FakeStore();
    const jour = Date.UTC(2027, 0, 15, 12);
    await recordFailure(store, CODE_CHECK_RULE, IP, PEPPER, jour);
    await recordFailure(store, CODE_CHECK_RULE, IP, PEPPER, jour + 86_400_000);
    assert.equal(store.keysWithPrefix(keys.rateLimit('')).length, 2);
  });

  it('balaie les compteurs périmés', async () => {
    const store = new FakeStore();
    const vieux = Date.now() - 3 * 86_400_000;
    await recordFailure(store, CODE_CHECK_RULE, IP, PEPPER, vieux);
    await recordFailure(store, CODE_CHECK_RULE, IP, PEPPER);
    assert.equal(store.keysWithPrefix(keys.rateLimit('')).length, 2);

    const supprimes = await sweepRateLimits(store);
    assert.equal(supprimes, 1);
    assert.equal(store.keysWithPrefix(keys.rateLimit('')).length, 1);
  });
});
