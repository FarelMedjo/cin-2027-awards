/**
 * Types partages entre le front (src/) et les fonctions Netlify (netlify/functions/).
 */

export type CategoryType = 'single' | 'duo';

export interface Category {
  id: string;
  title: string;
  theme: string;
  description: string;
  type: CategoryType;
  excludedNominees?: string[];
  /**
   * Categorie masquee : retiree de l'affichage, du vote et des resultats. Ses
   * votes deja enregistres restent dans le stockage et dans la participation.
   * Ne jamais supprimer l'entree ni changer son id : les votes y sont rattaches.
   */
  archived?: boolean;
  /** Categorie masquee par fusion : id de la categorie qui la remplace. */
  mergedInto?: string;
}

export interface Nominee {
  id: string;
  fullName: string;
  displayName: string;
}

/** Etat de l'election, lisible publiquement. */
export interface ElectionState {
  /** Interrupteur manuel de l'administrateur. */
  isOpen: boolean;
  /** Instant de cloture automatique (ISO 8601, UTC), ou null. */
  closesAt: string | null;
}

/** Etat renvoye par GET /api/state. */
export interface PublicState extends ElectionState {
  /** true si l'on peut voter maintenant (interrupteur ouvert ET cloture non atteinte). */
  votingOpen: boolean;
  /** Heure du serveur, pour que le compte a rebours ne depende pas de l'horloge du telephone. */
  now: string;
}

/** Un vote du votant, tel qu'il lui est renvoye. */
export interface BallotEntry {
  /** Identifiants des nomines choisis (1 pour "single", 2 pour "duo"). */
  nomineeIds: string[];
}

/** L'ensemble des votes d'un votant, indexe par identifiant de categorie. */
export type Ballot = Record<string, BallotEntry>;

export interface BallotResponse {
  ballot: Ballot;
  state: PublicState;
}

/** Resultat d'une categorie, calcule apres la cloture. */
export interface CategoryResult {
  categoryId: string;
  title: string;
  theme: string;
  type: CategoryType;
  totalVotes: number;
  rows: ResultRow[];
}

export interface ResultRow {
  /** 1 nomine pour "single", 2 pour "duo". */
  nomineeIds: string[];
  /** Noms affiches, dans le meme ordre. */
  names: string[];
  votes: number;
  /** Rang, les ex aequo partagent le meme rang. */
  rank: number;
  /** true si au moins un autre nomine a le meme nombre de voix. */
  tied: boolean;
}

export interface Participation {
  codesGenerated: number;
  codesUsed: number;
  /**
   * Nombre de lignes de vote par categorie (participation, jamais les resultats),
   * categories masquees comprises.
   */
  votesByCategory: Record<string, number>;
  /** Toutes les lignes de vote, categories masquees comprises. */
  totalVotes: number;
  /** Dont lignes de vote conservees dans des categories masquees. */
  archivedVotes: number;
  /** Incoherences detectees : lignes de vote > codes ayant vote. */
  warnings: string[];
}

export interface ApiError {
  error: string;
  /** Code machine, pour que le front puisse reagir sans analyser le texte. */
  code?: string;
}
