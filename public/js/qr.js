/**
 * Générateur de QR codes — mode octet, correction d'erreurs niveau M,
 * versions 1 à 10, conforme à la norme ISO/IEC 18004.
 *
 * Écrit à la main parce que le projet n'embarque aucune dépendance. Il ne sert
 * qu'à la page des tickets, chargée uniquement par l'administrateur : le votant
 * ne télécharge jamais ce fichier.
 *
 * Les tables sont vérifiées par les tests (tests/qr.test.js) : arithmétique du
 * corps de Galois, nullité du reste de division du mot de code complet,
 * structure de la matrice, et relecture complète du contenu encodé.
 */

// ---------------------------------------------------------------------------
// Corps de Galois GF(256), polynôme primitif 0x11D.
// ---------------------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(function construireTables() {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

export function gfMultiplier(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Polynôme générateur de Reed-Solomon : (x - a^0)(x - a^1)...(x - a^(n-1)). */
function polynomeGenerateur(nombreCodes) {
  let generateur = [1];
  for (let i = 0; i < nombreCodes; i += 1) {
    const suivant = new Array(generateur.length + 1).fill(0);
    for (let j = 0; j < generateur.length; j += 1) {
      suivant[j] ^= generateur[j];
      suivant[j + 1] ^= gfMultiplier(generateur[j], EXP[i]);
    }
    generateur = suivant;
  }
  return generateur;
}

/** Reste de la division du message par le polynôme générateur. */
export function resteReedSolomon(donnees, nombreCodes) {
  const generateur = polynomeGenerateur(nombreCodes);
  const reste = new Array(nombreCodes).fill(0);
  for (const octet of donnees) {
    const facteur = octet ^ reste[0];
    reste.shift();
    reste.push(0);
    if (facteur !== 0) {
      for (let i = 0; i < nombreCodes; i += 1) {
        reste[i] ^= gfMultiplier(generateur[i + 1], facteur);
      }
    }
  }
  return reste;
}

// ---------------------------------------------------------------------------
// Tables de structure, niveau de correction M.
// [codes de correction par bloc, blocs du groupe 1, données par bloc du groupe 1,
//  blocs du groupe 2, données par bloc du groupe 2]
// ---------------------------------------------------------------------------

const BLOCS_M = {
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

/** Centres des motifs d'alignement, par version. */
const ALIGNEMENTS = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

/** Bits de bourrage en fin de zone de données. */
const BITS_RESTANTS = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 0, 8: 0, 9: 0, 10: 0 };

function capaciteDonnees(version) {
  const [, blocs1, taille1, blocs2, taille2] = BLOCS_M[version];
  return blocs1 * taille1 + blocs2 * taille2;
}

// ---------------------------------------------------------------------------
// Encodage des données
// ---------------------------------------------------------------------------

class FluxDeBits {
  constructor() {
    this.bits = [];
  }
  ajouter(valeur, longueur) {
    for (let i = longueur - 1; i >= 0; i -= 1) this.bits.push((valeur >> i) & 1);
  }
  get longueur() {
    return this.bits.length;
  }
  versOctets() {
    const octets = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let octet = 0;
      for (let j = 0; j < 8; j += 1) octet = (octet << 1) | (this.bits[i + j] ?? 0);
      octets.push(octet);
    }
    return octets;
  }
}

function choisirVersion(nombreOctets) {
  for (let version = 1; version <= 10; version += 1) {
    // 4 bits de mode + 8 bits de longueur + les données.
    if (nombreOctets + 2 <= capaciteDonnees(version)) return version;
  }
  throw new Error('Texte trop long pour un QR code de version 10.');
}

function encoderDonnees(octets, version) {
  const flux = new FluxDeBits();
  flux.ajouter(0b0100, 4); // mode octet
  flux.ajouter(octets.length, 8); // longueur (versions 1 à 9 : 8 bits)
  for (const octet of octets) flux.ajouter(octet, 8);

  const capacite = capaciteDonnees(version) * 8;
  // Terminateur, puis alignement sur l'octet.
  flux.ajouter(0, Math.min(4, capacite - flux.longueur));
  if (flux.longueur % 8 !== 0) flux.ajouter(0, 8 - (flux.longueur % 8));

  const mots = flux.versOctets();
  const bourrage = [0xec, 0x11];
  let index = 0;
  while (mots.length < capaciteDonnees(version)) {
    mots.push(bourrage[index % 2]);
    index += 1;
  }
  return mots;
}

/** Découpe en blocs, calcule la correction d'erreurs, puis entrelace. */
function motsDeCode(donnees, version) {
  const [nbCorrection, blocs1, taille1, blocs2, taille2] = BLOCS_M[version];
  const blocs = [];
  let position = 0;
  for (let i = 0; i < blocs1; i += 1) {
    blocs.push(donnees.slice(position, position + taille1));
    position += taille1;
  }
  for (let i = 0; i < blocs2; i += 1) {
    blocs.push(donnees.slice(position, position + taille2));
    position += taille2;
  }
  const corrections = blocs.map((bloc) => resteReedSolomon(bloc, nbCorrection));

  const resultat = [];
  const maxDonnees = Math.max(...blocs.map((b) => b.length));
  for (let i = 0; i < maxDonnees; i += 1) {
    for (const bloc of blocs) if (i < bloc.length) resultat.push(bloc[i]);
  }
  for (let i = 0; i < nbCorrection; i += 1) {
    for (const correction of corrections) resultat.push(correction[i]);
  }
  return resultat;
}

// ---------------------------------------------------------------------------
// Construction de la matrice
// ---------------------------------------------------------------------------

function matriceVide(taille) {
  return {
    modules: Array.from({ length: taille }, () => new Array(taille).fill(null)),
    taille,
  };
}

function poserMotifDetection(grille, ligne, colonne) {
  for (let dl = -1; dl <= 7; dl += 1) {
    for (let dc = -1; dc <= 7; dc += 1) {
      const l = ligne + dl;
      const c = colonne + dc;
      if (l < 0 || l >= grille.taille || c < 0 || c >= grille.taille) continue;
      const dansCadre = dl >= 0 && dl <= 6 && (dc === 0 || dc === 6);
      const dansCadre2 = dc >= 0 && dc <= 6 && (dl === 0 || dl === 6);
      const dansCentre = dl >= 2 && dl <= 4 && dc >= 2 && dc <= 4;
      grille.modules[l][c] = dansCadre || dansCadre2 || dansCentre;
    }
  }
}

function poserAlignements(grille, version) {
  const centres = ALIGNEMENTS[version];
  for (const ligne of centres) {
    for (const colonne of centres) {
      // Pas de motif d'alignement sur les motifs de détection.
      if (grille.modules[ligne][colonne] !== null) continue;
      for (let dl = -2; dl <= 2; dl += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          grille.modules[ligne + dl][colonne + dc] =
            Math.max(Math.abs(dl), Math.abs(dc)) !== 1;
        }
      }
    }
  }
}

function poserMotifsFixes(grille, version) {
  const taille = grille.taille;
  poserMotifDetection(grille, 0, 0);
  poserMotifDetection(grille, 0, taille - 7);
  poserMotifDetection(grille, taille - 7, 0);

  // Motifs de synchronisation.
  for (let i = 8; i < taille - 8; i += 1) {
    const valeur = i % 2 === 0;
    grille.modules[6][i] = valeur;
    grille.modules[i][6] = valeur;
  }

  poserAlignements(grille, version);

  // Module toujours sombre.
  grille.modules[taille - 8][8] = true;
}

/** Réserve les zones d'information de format et de version. */
function reserverZones(grille, version) {
  const taille = grille.taille;
  for (let i = 0; i < 9; i += 1) {
    if (grille.modules[8][i] === null) grille.modules[8][i] = false;
    if (grille.modules[i][8] === null) grille.modules[i][8] = false;
  }
  for (let i = 0; i < 8; i += 1) {
    if (grille.modules[8][taille - 1 - i] === null) grille.modules[8][taille - 1 - i] = false;
    if (grille.modules[taille - 1 - i][8] === null) grille.modules[taille - 1 - i][8] = false;
  }
  if (version >= 7) {
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        grille.modules[taille - 11 + j][i] = false;
        grille.modules[i][taille - 11 + j] = false;
      }
    }
  }
}

/** Parcours en zigzag depuis le coin inférieur droit. */
function placerDonnees(grille, mots) {
  const taille = grille.taille;
  let bitIndex = 0;
  let versLeHaut = true;

  for (let colonne = taille - 1; colonne > 0; colonne -= 2) {
    // La colonne 6 est entièrement occupée par le motif de synchronisation.
    if (colonne === 6) colonne -= 1;
    for (let pas = 0; pas < taille; pas += 1) {
      const ligne = versLeHaut ? taille - 1 - pas : pas;
      for (let decalage = 0; decalage < 2; decalage += 1) {
        const c = colonne - decalage;
        if (grille.modules[ligne][c] !== null) continue;
        const octet = mots[bitIndex >> 3];
        const bit = octet === undefined ? 0 : (octet >> (7 - (bitIndex & 7))) & 1;
        grille.modules[ligne][c] = bit === 1;
        bitIndex += 1;
      }
    }
    versLeHaut = !versLeHaut;
  }
}

export const MASQUES = [
  (l, c) => (l + c) % 2 === 0,
  (l) => l % 2 === 0,
  (_l, c) => c % 3 === 0,
  (l, c) => (l + c) % 3 === 0,
  (l, c) => (Math.floor(l / 2) + Math.floor(c / 3)) % 2 === 0,
  (l, c) => ((l * c) % 2) + ((l * c) % 3) === 0,
  (l, c) => (((l * c) % 2) + ((l * c) % 3)) % 2 === 0,
  (l, c) => (((l + c) % 2) + ((l * c) % 3)) % 2 === 0,
];

/**
 * Grille des zones réservées (motifs fixes, format, version) : true = module
 * qui ne porte pas de données et qui n'est jamais masqué.
 */
export function zonesReservees(version) {
  const taille = 17 + 4 * version;
  const reserve = matriceVide(taille);
  poserMotifsFixes(reserve, version);
  reserverZones(reserve, version);
  return reserve.modules.map((ligne) => ligne.map((valeur) => valeur !== null));
}

function appliquerMasque(grille, version, numero) {
  const taille = grille.taille;
  const reserve = matriceVide(taille);
  poserMotifsFixes(reserve, version);
  reserverZones(reserve, version);
  const masque = MASQUES[numero];
  const copie = grille.modules.map((ligne) => [...ligne]);
  for (let l = 0; l < taille; l += 1) {
    for (let c = 0; c < taille; c += 1) {
      if (reserve.modules[l][c] !== null) continue;
      if (masque(l, c)) copie[l][c] = !copie[l][c];
    }
  }
  return { modules: copie, taille };
}

/** Pénalités de la norme : plus le score est bas, meilleur est le masque. */
function penalite(grille) {
  const taille = grille.taille;
  const m = grille.modules;
  let score = 0;

  // Règle 1 : suites de cinq modules de même couleur ou plus.
  for (let i = 0; i < taille; i += 1) {
    for (const horizontal of [true, false]) {
      let suite = 1;
      for (let j = 1; j < taille; j += 1) {
        const courant = horizontal ? m[i][j] : m[j][i];
        const precedent = horizontal ? m[i][j - 1] : m[j - 1][i];
        if (courant === precedent) {
          suite += 1;
        } else {
          if (suite >= 5) score += 3 + (suite - 5);
          suite = 1;
        }
      }
      if (suite >= 5) score += 3 + (suite - 5);
    }
  }

  // Règle 2 : blocs 2x2 de même couleur.
  for (let l = 0; l < taille - 1; l += 1) {
    for (let c = 0; c < taille - 1; c += 1) {
      const v = m[l][c];
      if (v === m[l][c + 1] && v === m[l + 1][c] && v === m[l + 1][c + 1]) score += 3;
    }
  }

  // Règle 3 : motifs ressemblant à un motif de détection.
  const motifA = [true, false, true, true, true, false, true, false, false, false, false];
  const motifB = [false, false, false, false, true, false, true, true, true, false, true];
  for (let i = 0; i < taille; i += 1) {
    for (let j = 0; j <= taille - 11; j += 1) {
      for (const horizontal of [true, false]) {
        let correspondA = true;
        let correspondB = true;
        for (let k = 0; k < 11; k += 1) {
          const valeur = horizontal ? m[i][j + k] : m[j + k][i];
          if (valeur !== motifA[k]) correspondA = false;
          if (valeur !== motifB[k]) correspondB = false;
        }
        if (correspondA) score += 40;
        if (correspondB) score += 40;
      }
    }
  }

  // Règle 4 : déséquilibre entre modules sombres et clairs.
  let sombres = 0;
  for (let l = 0; l < taille; l += 1) {
    for (let c = 0; c < taille; c += 1) if (m[l][c]) sombres += 1;
  }
  const pourcentage = (sombres * 100) / (taille * taille);
  score += Math.floor(Math.abs(pourcentage - 50) / 5) * 10;

  return score;
}

/** Information de format : niveau M (0b00) + masque, protégés par un code BCH. */
export function bitsDeFormat(numeroMasque) {
  const donnees = (0b00 << 3) | numeroMasque;
  let bch = donnees << 10;
  for (let i = 4; i >= 0; i -= 1) {
    if (bch & (1 << (i + 10))) bch ^= 0x537 << i;
  }
  return ((donnees << 10) | bch) ^ 0x5412;
}

function bitsDeVersion(version) {
  let bch = version << 12;
  for (let i = 5; i >= 0; i -= 1) {
    if (bch & (1 << (i + 12))) bch ^= 0x1f25 << i;
  }
  return (version << 12) | bch;
}

function poserFormatEtVersion(grille, version, numeroMasque) {
  const taille = grille.taille;
  const format = bitsDeFormat(numeroMasque);

  for (let i = 0; i < 15; i += 1) {
    const bit = ((format >> i) & 1) === 1;
    // Première copie, autour du motif de détection supérieur gauche.
    if (i < 6) grille.modules[8][i] = bit;
    else if (i === 6) grille.modules[8][7] = bit;
    else if (i === 7) grille.modules[8][8] = bit;
    else if (i === 8) grille.modules[7][8] = bit;
    else grille.modules[14 - i][8] = bit;

    // Seconde copie, répartie sur les deux autres motifs.
    if (i < 8) grille.modules[8][taille - 1 - i] = bit;
    else grille.modules[taille - 15 + i][8] = bit;
  }

  if (version >= 7) {
    const bits = bitsDeVersion(version);
    for (let i = 0; i < 18; i += 1) {
      const bit = ((bits >> i) & 1) === 1;
      const ligne = Math.floor(i / 3);
      const colonne = taille - 11 + (i % 3);
      grille.modules[ligne][colonne] = bit;
      grille.modules[colonne][ligne] = bit;
    }
  }
}

/**
 * Construit la matrice du QR code.
 * @returns {{modules: boolean[][], taille: number, version: number, masque: number}}
 */
export function qrMatrice(texte) {
  const octets = [...new TextEncoder().encode(texte)];
  const version = choisirVersion(octets.length);
  const taille = 17 + 4 * version;

  const mots = motsDeCode(encoderDonnees(octets, version), version);

  const base = matriceVide(taille);
  poserMotifsFixes(base, version);
  reserverZones(base, version);
  // Les bits restants (BITS_RESTANTS) sont lus comme des zéros par placerDonnees.
  placerDonnees(base, mots);

  let meilleur = null;
  for (let numero = 0; numero < 8; numero += 1) {
    const candidat = appliquerMasque(base, version, numero);
    poserFormatEtVersion(candidat, version, numero);
    const score = penalite(candidat);
    if (!meilleur || score < meilleur.score) meilleur = { ...candidat, score, masque: numero };
  }

  return { modules: meilleur.modules, taille, version, masque: meilleur.masque };
}

/**
 * QR code en SVG, prêt à être inséré dans la page des tickets.
 * @param {string} texte
 * @param {{marge?: number}} [options]
 */
export function qrSvg(texte, options = {}) {
  const { modules, taille } = qrMatrice(texte);
  const marge = options.marge ?? 2;
  const total = taille + marge * 2;

  // Un seul chemin pour toute la matrice : le SVG reste léger, même à 45 tickets.
  let chemin = '';
  for (let l = 0; l < taille; l += 1) {
    for (let c = 0; c < taille; c += 1) {
      if (modules[l][c]) chemin += `M${c + marge} ${l + marge}h1v1h-1z`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR code du ticket">` +
    `<rect width="${total}" height="${total}" fill="#ffffff"/>` +
    `<path d="${chemin}" fill="#000000"/>` +
    `</svg>`
  );
}
