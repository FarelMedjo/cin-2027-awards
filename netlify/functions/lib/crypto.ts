/**
 * Cryptographie des codes votants.
 *
 * Trois opérations, et une règle : le code en clair ne quitte jamais la mémoire
 * de la fonction. Il n'est ni stocké, ni journalisé, ni renvoyé.
 *
 *  1. identifiant du code  : HMAC-SHA256(clé = TOKEN_PEPPER, message = code)
 *     C'est la seule chose que le serveur conserve pour reconnaître un code.
 *     Irréversible sans le code, et inattaquable par dictionnaire sans le poivre.
 *
 *  2. clé du dossier votant : HKDF-SHA256(ikm = code, sel = TOKEN_PEPPER)
 *     Dérivée du code lui-même, jamais stockée. Sans le ticket, le dossier
 *     chiffré est un bloc d'octets inutilisable, y compris pour l'administrateur.
 *
 *  3. chiffrement du dossier : AES-256-GCM (confidentialité + authenticité).
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

/** Alphabet sans caractères ambigus : ni 0/O, ni 1/I/L. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
/** Nombre de caractères aléatoires d'un code : 31^10 ≈ 8 x 10^14 possibilités. */
export const CODE_LENGTH = 10;
export const CODE_PREFIX = 'CIN';

const HKDF_INFO = 'cin2027-dossier-votant-v1';
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

/**
 * Tire un code aléatoire avec un générateur cryptographique.
 *
 * Le tirage par rejet (octets >= 248) garantit une distribution uniforme sur
 * les 31 caractères de l'alphabet : un simple modulo biaiserait les premiers.
 */
export function generateCodeBody(): string {
  const max = 256 - (256 % CODE_ALPHABET.length); // 248
  let out = '';
  while (out.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH * 2)) {
      if (byte >= max) continue;
      out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}

/** Met un code en forme pour l'affichage et l'impression : CIN-XXXX-XXXX-XX. */
export function formatCode(body: string): string {
  return `${CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 10)}`;
}

/** Génère un code prêt à imprimer. */
export function generateCode(): string {
  return formatCode(generateCodeBody());
}

/**
 * Normalise un code saisi à la main : casse indifférente, tirets, espaces et
 * préfixe « CIN » facultatifs.
 *
 * Renvoie les 10 caractères canoniques, ou null si la saisie ne peut pas être
 * un code (c'est cette forme canonique qui est passée au HMAC et au HKDF, pour
 * que « cin-abcd-efgh-ij » et « ABCDEFGHIJ » désignent le même votant).
 */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 64) return null;
  let body = raw.toUpperCase().replace(/[\s\-_.]/g, '');
  if (body.startsWith(CODE_PREFIX)) body = body.slice(CODE_PREFIX.length);
  if (body.length !== CODE_LENGTH) return null;
  for (const char of body) {
    if (!CODE_ALPHABET.includes(char)) return null;
  }
  return body;
}

function requirePepper(pepper: string): string {
  if (!pepper || pepper.length < 16) {
    throw new Error('TOKEN_PEPPER est absent ou trop court (32 octets hexadécimaux attendus).');
  }
  return pepper;
}

/** Identifiant stocké d'un code : HMAC-SHA256(TOKEN_PEPPER, code normalisé). */
export function codeId(normalizedCode: string, pepper: string): string {
  return createHmac('sha256', requirePepper(pepper)).update(normalizedCode).digest('hex');
}

/** Clé AES-256 du dossier votant, dérivée du code. Jamais stockée. */
export function deriveDossierKey(normalizedCode: string, pepper: string): Buffer {
  const derived = hkdfSync('sha256', normalizedCode, requirePepper(pepper), HKDF_INFO, 32);
  return Buffer.from(derived);
}

/** Chiffre le dossier votant : iv (12 o) || texte chiffré || tag GCM (16 o). */
export function encryptDossier(plain: unknown, key: Buffer): Buffer {
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(plain), 'utf8')),
    cipher.final(),
  ]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]);
}

/**
 * Déchiffre un dossier votant.
 *
 * Renvoie null si le bloc est tronqué, altéré, ou si la clé ne correspond pas :
 * aucune distinction n'est faite entre ces cas, et aucune exception ne fuit.
 */
export function decryptDossier<T>(blob: Uint8Array, key: Buffer): T | null {
  if (blob.byteLength <= GCM_IV_BYTES + GCM_TAG_BYTES) return null;
  try {
    const buf = Buffer.from(blob);
    const iv = buf.subarray(0, GCM_IV_BYTES);
    const tag = buf.subarray(buf.length - GCM_TAG_BYTES);
    const body = buf.subarray(GCM_IV_BYTES, buf.length - GCM_TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(body), decipher.final()]);
    return JSON.parse(plain.toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** Comparaison de secrets en temps constant (mots de passe, jetons de session). */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual exige des longueurs égales : on compare des empreintes de
  // taille fixe pour ne pas révéler la longueur du secret attendu.
  const hashA = createHmac('sha256', 'longueur-constante').update(bufA).digest();
  const hashB = createHmac('sha256', 'longueur-constante').update(bufB).digest();
  return timingSafeEqual(hashA, hashB) && bufA.length === bufB.length;
}

/** Identifiant aléatoire d'une ligne de vote (UUID v4). */
export function newRowId(): string {
  return randomUUID();
}

/** Empreinte courte et salée, pour la limitation de débit et les jetons. */
export function shortFingerprint(value: string, pepper: string): string {
  return createHmac('sha256', requirePepper(pepper)).update(value).digest('hex').slice(0, 32);
}
