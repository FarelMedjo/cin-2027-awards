import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  codeId,
  constantTimeEqual,
  decryptDossier,
  deriveDossierKey,
  encryptDossier,
  formatCode,
  generateCode,
  generateCodeBody,
  normalizeCode,
} from '../netlify/functions/lib/crypto.ts';

const PEPPER = 'poivre-de-test-0123456789abcdef0123456789abcdef';
const AUTRE_PEPPER = 'un-autre-poivre-fedcba9876543210fedcba9876543210';

describe('génération des codes', () => {
  it('produit le format CIN-XXXX-XXXX-XX', () => {
    for (let i = 0; i < 50; i += 1) {
      assert.match(generateCode(), /^CIN-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{2}$/);
    }
  });

  it("n'utilise que l'alphabet sans caractères ambigus", () => {
    const tirage = Array.from({ length: 200 }, () => generateCodeBody()).join('');
    for (const char of tirage) {
      assert.ok(CODE_ALPHABET.includes(char), `caractère inattendu : ${char}`);
    }
    for (const ambigu of ['0', 'O', '1', 'I', 'L']) {
      assert.ok(!tirage.includes(ambigu), `le caractère ambigu ${ambigu} ne doit jamais sortir`);
    }
  });

  it('ne répète pas deux fois le même code sur un lot réaliste', () => {
    const lot = new Set(Array.from({ length: 500 }, () => generateCodeBody()));
    assert.equal(lot.size, 500);
  });

  it('tire les caractères sans biais notable', () => {
    // Tirage par rejet : chacun des 31 caractères doit sortir à peu près
    // autant que les autres. Un simple modulo favoriserait les 8 premiers.
    const occurrences = new Map<string, number>();
    const total = 31_000;
    for (let i = 0; i < total / CODE_LENGTH; i += 1) {
      for (const char of generateCodeBody()) {
        occurrences.set(char, (occurrences.get(char) ?? 0) + 1);
      }
    }
    const attendu = total / CODE_ALPHABET.length;
    for (const char of CODE_ALPHABET) {
      const vu = occurrences.get(char) ?? 0;
      assert.ok(
        Math.abs(vu - attendu) < attendu * 0.35,
        `${char} est sorti ${vu} fois au lieu d'environ ${attendu}`,
      );
    }
  });
});

describe('normalisation des codes saisis', () => {
  const body = generateCodeBody();
  const formate = formatCode(body);

  it('accepte le code imprimé tel quel', () => {
    assert.equal(normalizeCode(formate), body);
  });

  it('est insensible à la casse, aux tirets, aux espaces et au préfixe', () => {
    const variantes = [
      formate.toLowerCase(),
      body,
      body.toLowerCase(),
      `cin${body}`,
      `  ${formate}  `.replace(/-/g, ' '),
      formate.replace(/-/g, ''),
      `CIN_${body}`,
    ];
    for (const variante of variantes) {
      assert.equal(normalizeCode(variante), body, `variante refusée : « ${variante} »`);
    }
  });

  it('refuse ce qui ne peut pas être un code', () => {
    const invalides = [
      '',
      'CIN',
      body.slice(0, 9),
      `${body}X`,
      `${body.slice(0, 9)}0`, // 0 n'est pas dans l'alphabet
      `${body.slice(0, 9)}O`,
      'CIN-AAAA-AAAA-A!',
      null,
      undefined,
      42,
      'x'.repeat(200),
    ];
    for (const invalide of invalides) {
      assert.equal(normalizeCode(invalide), null, `aurait dû être refusé : ${String(invalide)}`);
    }
  });
});

describe('identifiant du code (HMAC)', () => {
  const body = generateCodeBody();

  it('est stable et long de 64 caractères hexadécimaux', () => {
    const id = codeId(body, PEPPER);
    assert.match(id, /^[0-9a-f]{64}$/);
    assert.equal(id, codeId(body, PEPPER));
  });

  it('ne contient aucune trace du code lui-même', () => {
    assert.ok(!codeId(body, PEPPER).includes(body.toLowerCase()));
  });

  it('change entièrement avec le poivre', () => {
    assert.notEqual(codeId(body, PEPPER), codeId(body, AUTRE_PEPPER));
  });

  it('distingue deux codes différents', () => {
    assert.notEqual(codeId(body, PEPPER), codeId(generateCodeBody(), PEPPER));
  });

  it('exige un poivre non vide', () => {
    assert.throws(() => codeId(body, ''), /TOKEN_PEPPER/);
    assert.throws(() => codeId(body, 'trop-court'), /TOKEN_PEPPER/);
  });
});

describe('dossier votant chiffré', () => {
  const body = generateCodeBody();
  const dossier = { v: { 'major-de-la-classe': { id: 'abc', n: ['n03'] } }, gc: [] };

  it('se déchiffre avec le même code', () => {
    const key = deriveDossierKey(body, PEPPER);
    const blob = encryptDossier(dossier, key);
    assert.deepEqual(decryptDossier(blob, key), dossier);
  });

  it('dérive toujours la même clé pour un code donné', () => {
    assert.deepEqual(deriveDossierKey(body, PEPPER), deriveDossierKey(body, PEPPER));
    assert.equal(deriveDossierKey(body, PEPPER).length, 32);
  });

  it('reste illisible avec un autre code', () => {
    const blob = encryptDossier(dossier, deriveDossierKey(body, PEPPER));
    const autre = deriveDossierKey(generateCodeBody(), PEPPER);
    assert.equal(decryptDossier(blob, autre), null);
  });

  it('reste illisible avec un autre poivre', () => {
    const blob = encryptDossier(dossier, deriveDossierKey(body, PEPPER));
    assert.equal(decryptDossier(blob, deriveDossierKey(body, AUTRE_PEPPER)), null);
  });

  it('détecte une altération, même d’un seul bit', () => {
    const key = deriveDossierKey(body, PEPPER);
    const blob = encryptDossier(dossier, key);
    for (const position of [0, 12, Math.floor(blob.length / 2), blob.length - 1]) {
      const altere = Buffer.from(blob);
      altere[position] ^= 0x01;
      assert.equal(decryptDossier(altere, key), null, `altération en ${position} non détectée`);
    }
  });

  it('refuse un bloc tronqué sans lever d’exception', () => {
    const key = deriveDossierKey(body, PEPPER);
    assert.equal(decryptDossier(Buffer.alloc(0), key), null);
    assert.equal(decryptDossier(Buffer.alloc(27), key), null);
  });

  it('ne produit jamais deux fois le même chiffré (vecteur d’initialisation aléatoire)', () => {
    const key = deriveDossierKey(body, PEPPER);
    const premier = encryptDossier(dossier, key).toString('base64');
    const second = encryptDossier(dossier, key).toString('base64');
    assert.notEqual(premier, second);
  });
});

describe('comparaison en temps constant', () => {
  it('reconnaît deux chaînes identiques', () => {
    assert.equal(constantTimeEqual('mot-de-passe-du-gala', 'mot-de-passe-du-gala'), true);
  });

  it('refuse des chaînes différentes, y compris de longueurs différentes', () => {
    assert.equal(constantTimeEqual('mot-de-passe', 'mot-de-passX'), false);
    assert.equal(constantTimeEqual('mot-de-passe', 'mot-de-passe-plus-long'), false);
    assert.equal(constantTimeEqual('', 'a'), false);
  });
});
