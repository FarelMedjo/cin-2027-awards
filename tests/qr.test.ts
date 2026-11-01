/**
 * Vérification du générateur de QR codes écrit à la main.
 *
 * Trois niveaux de contrôle, du plus élémentaire au plus global :
 *   1. l'arithmétique du corps de Galois, par ses invariants ;
 *   2. la correction d'erreurs, par la propriété qui la définit (le mot de code
 *      complet est divisible par le polynôme générateur) ;
 *   3. la matrice entière, relue et décodée pour retrouver le texte de départ.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bitsDeFormat,
  gfMultiplier,
  MASQUES,
  qrMatrice,
  qrSvg,
  resteReedSolomon,
  zonesReservees,
} from '../public/js/qr.js';

const BLOCS_M: Record<number, [number, number, number, number, number]> = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
};

/** Nombre total de mots de code par version (table de la norme). */
const TOTAL_MOTS: Record<number, number> = {
  1: 26, 2: 44, 3: 70, 4: 100, 5: 134, 6: 172, 7: 196, 8: 242, 9: 292, 10: 346,
};

/**
 * Relit une matrice de QR code et retrouve le texte encodé.
 * Démasquage, parcours en zigzag, désentrelacement, puis lecture de l'en-tête.
 */
function decoder(resultat: ReturnType<typeof qrMatrice>): string {
  const { modules, taille, version, masque } = resultat;
  const reserve = zonesReservees(version);

  // 1. Retirer le masque.
  const demasque = modules.map((ligne: boolean[], l: number) =>
    ligne.map((valeur: boolean, c: number) =>
      reserve[l][c] ? valeur : MASQUES[masque](l, c) ? !valeur : valeur,
    ),
  );

  // 2. Relire les bits dans l'ordre de placement.
  const bits: number[] = [];
  let versLeHaut = true;
  for (let colonne = taille - 1; colonne > 0; colonne -= 2) {
    if (colonne === 6) colonne -= 1;
    for (let pas = 0; pas < taille; pas += 1) {
      const ligne = versLeHaut ? taille - 1 - pas : pas;
      for (let decalage = 0; decalage < 2; decalage += 1) {
        const c = colonne - decalage;
        if (reserve[ligne][c]) continue;
        bits.push(demasque[ligne][c] ? 1 : 0);
      }
    }
    versLeHaut = !versLeHaut;
  }

  const octets: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let octet = 0;
    for (let j = 0; j < 8; j += 1) octet = (octet << 1) | bits[i + j]!;
    octets.push(octet);
  }

  // 3. Désentrelacer : reconstruire les blocs de données.
  const [nbCorrection, blocs1, taille1, blocs2, taille2] = BLOCS_M[version]!;
  const taillesBlocs = [
    ...Array.from({ length: blocs1 }, () => taille1),
    ...Array.from({ length: blocs2 }, () => taille2),
  ];
  const blocs: number[][] = taillesBlocs.map(() => []);
  let index = 0;
  const maxDonnees = Math.max(...taillesBlocs);
  for (let i = 0; i < maxDonnees; i += 1) {
    for (let b = 0; b < blocs.length; b += 1) {
      if (i < taillesBlocs[b]!) blocs[b]!.push(octets[index++]!);
    }
  }

  // 4. Vérifier que chaque bloc, suivi de sa correction, est un mot de code valide.
  const corrections: number[][] = blocs.map(() => []);
  for (let i = 0; i < nbCorrection; i += 1) {
    for (let b = 0; b < blocs.length; b += 1) corrections[b]!.push(octets[index++]!);
  }
  for (let b = 0; b < blocs.length; b += 1) {
    const reste = resteReedSolomon([...blocs[b]!, ...corrections[b]!], nbCorrection);
    assert.ok(
      reste.every((valeur: number) => valeur === 0),
      `le bloc ${b} n'est pas un mot de code Reed-Solomon valide`,
    );
  }

  // 5. Lire l'en-tête : mode octet, longueur, données.
  const donnees = blocs.flat();
  const fluxBits: number[] = [];
  for (const octet of donnees) {
    for (let i = 7; i >= 0; i -= 1) fluxBits.push((octet >> i) & 1);
  }
  const lire = (debut: number, longueur: number) =>
    fluxBits.slice(debut, debut + longueur).reduce((acc, bit) => (acc << 1) | bit, 0);

  assert.equal(lire(0, 4), 0b0100, 'le mode doit être « octet »');
  const longueur = lire(4, 8);
  const contenu: number[] = [];
  for (let i = 0; i < longueur; i += 1) contenu.push(lire(12 + i * 8, 8));
  return new TextDecoder().decode(Uint8Array.from(contenu));
}

describe('corps de Galois', () => {
  it('a une table exponentielle et logarithmique inverses l’une de l’autre', () => {
    for (let valeur = 1; valeur < 256; valeur += 1) {
      assert.equal(gfMultiplier(valeur, 1), valeur);
    }
  });

  it('vérifie la valeur connue a^8 = 0x1D', () => {
    // a^8 = x^8 mod (x^8 + x^4 + x^3 + x^2 + 1) = 0x1D
    let valeur = 1;
    for (let i = 0; i < 8; i += 1) valeur = gfMultiplier(valeur, 2);
    assert.equal(valeur, 0x1d);
  });

  it('annule toute multiplication par zéro', () => {
    for (const valeur of [0, 1, 42, 255]) {
      assert.equal(gfMultiplier(0, valeur), 0);
      assert.equal(gfMultiplier(valeur, 0), 0);
    }
  });

  it('est commutatif, associatif et distributif', () => {
    const echantillon = [1, 2, 3, 17, 99, 128, 200, 255];
    for (const a of echantillon) {
      for (const b of echantillon) {
        assert.equal(gfMultiplier(a, b), gfMultiplier(b, a));
        for (const c of echantillon) {
          assert.equal(
            gfMultiplier(gfMultiplier(a, b), c),
            gfMultiplier(a, gfMultiplier(b, c)),
          );
          assert.equal(gfMultiplier(a, b ^ c), gfMultiplier(a, b) ^ gfMultiplier(a, c));
        }
      }
    }
  });
});

describe('correction d’erreurs Reed-Solomon', () => {
  it('produit un mot de code divisible par le polynôme générateur', () => {
    const donnees = Array.from({ length: 16 }, (_, i) => (i * 37 + 11) % 256);
    const correction = resteReedSolomon(donnees, 10);
    assert.equal(correction.length, 10);
    const reste = resteReedSolomon([...donnees, ...correction], 10);
    assert.deepEqual(reste, new Array(10).fill(0));
  });

  it('change dès qu’un seul octet de données change', () => {
    const donnees = new Array(16).fill(0);
    const autre = [...donnees];
    autre[7] = 1;
    assert.notDeepEqual(resteReedSolomon(donnees, 10), resteReedSolomon(autre, 10));
  });
});

describe('information de format', () => {
  it('se relit correctement pour les huit masques', () => {
    for (let masque = 0; masque < 8; masque += 1) {
      const bits = bitsDeFormat(masque);
      // On retire le masque fixe de la norme, puis on relit les 5 bits utiles.
      const brut = (bits ^ 0x5412) >> 10;
      assert.equal(brut >> 3, 0b00, 'le niveau de correction doit être M');
      assert.equal(brut & 0b111, masque);
    }
  });
});

describe('matrice du QR code', () => {
  const texte = 'https://cin-2027-awards.netlify.app/#code=CIN-7MWK-3PQR-4X';
  const resultat = qrMatrice(texte);

  it('choisit une version cohérente avec la taille', () => {
    assert.ok(resultat.version >= 1 && resultat.version <= 10);
    assert.equal(resultat.taille, 17 + 4 * resultat.version);
    assert.equal(resultat.modules.length, resultat.taille);
  });

  it('place les trois motifs de détection', () => {
    const { modules, taille } = resultat;
    for (const [ligne, colonne] of [
      [0, 0],
      [0, taille - 7],
      [taille - 7, 0],
    ]) {
      // Cadre extérieur sombre, anneau clair, centre sombre 3x3.
      assert.equal(modules[ligne][colonne], true);
      assert.equal(modules[ligne + 1][colonne + 1], false);
      assert.equal(modules[ligne + 3][colonne + 3], true);
    }
  });

  it('place les motifs de synchronisation en alternance', () => {
    const { modules, taille } = resultat;
    for (let i = 8; i < taille - 8; i += 1) {
      assert.equal(modules[6][i], i % 2 === 0, `synchronisation horizontale en ${i}`);
      assert.equal(modules[i][6], i % 2 === 0, `synchronisation verticale en ${i}`);
    }
  });

  it('pose le module toujours sombre', () => {
    assert.equal(resultat.modules[resultat.taille - 8][8], true);
  });

  it('remplit toute la zone de données', () => {
    const reserve = zonesReservees(resultat.version);
    let libres = 0;
    for (let l = 0; l < resultat.taille; l += 1) {
      for (let c = 0; c < resultat.taille; c += 1) {
        if (!reserve[l][c]) libres += 1;
        assert.notEqual(resultat.modules[l][c], null, `module vide en ${l},${c}`);
      }
    }
    // Les modules libres valent les mots de code plus les bits restants.
    assert.ok(libres >= TOTAL_MOTS[resultat.version]! * 8);
    assert.ok(libres < TOTAL_MOTS[resultat.version]! * 8 + 8);
  });
});

describe('relecture complète', () => {
  it('retrouve le texte encodé', () => {
    const texte = 'https://cin-2027-awards.netlify.app/#code=CIN-7MWK-3PQR-4X';
    assert.equal(decoder(qrMatrice(texte)), texte);
  });

  it('fonctionne pour toutes les tailles de contenu utiles', () => {
    for (const longueur of [1, 10, 16, 30, 44, 60, 80, 100, 140, 180, 210]) {
      const texte = 'A'.repeat(longueur);
      assert.equal(decoder(qrMatrice(texte)), texte, `longueur ${longueur}`);
    }
  });

  it('gère les caractères accentués (UTF-8)', () => {
    const texte = 'Cérémonie CIN 2027 — révélation';
    assert.equal(decoder(qrMatrice(texte)), texte);
  });

  it('produit un QR différent pour chaque code de ticket', () => {
    const premier = qrMatrice('https://exemple.test/#code=CIN-AAAA-BBBB-CC');
    const second = qrMatrice('https://exemple.test/#code=CIN-AAAA-BBBB-CD');
    assert.notDeepEqual(premier.modules, second.modules);
  });

  it('refuse un texte trop long', () => {
    assert.throws(() => qrMatrice('x'.repeat(300)), /trop long/);
  });
});

describe('sortie SVG', () => {
  const svg = qrSvg('https://exemple.test/#code=CIN-AAAA-BBBB-CC');

  it('est un SVG autonome, en noir et blanc', () => {
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /viewBox="0 0 \d+ \d+"/);
    assert.ok(svg.includes('fill="#ffffff"'));
    assert.ok(svg.includes('fill="#000000"'));
    assert.ok(svg.endsWith('</svg>'));
  });

  it('garde la marge blanche exigée par les lecteurs', () => {
    const correspondance = svg.match(/viewBox="0 0 (\d+) /);
    const total = Number(correspondance![1]);
    const { taille } = qrMatrice('https://exemple.test/#code=CIN-AAAA-BBBB-CC');
    assert.equal(total, taille + 4);
  });
});
