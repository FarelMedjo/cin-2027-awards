import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  castVote,
  loadBallot,
  removeVote,
  type Dossier,
  type VoterContext,
} from '../netlify/functions/lib/ballot.ts';
import {
  codeId,
  deriveDossierKey,
  encryptDossier,
  generateCodeBody,
} from '../netlify/functions/lib/crypto.ts';
import { keys, parseVoteKey, toArrayBuffer } from '../netlify/functions/lib/store.ts';
import { FakeStore } from './fake-store.ts';

const PEPPER = 'poivre-de-test-0123456789abcdef0123456789abcdef';
const CATEGORIE = 'major-de-la-classe';
const AUTRE_CATEGORIE = 'meilleur-ambianceur';

function nouveauVotant(): { code: string; ctx: VoterContext } {
  const code = generateCodeBody();
  return {
    code,
    ctx: { codeId: codeId(code, PEPPER), dossierKey: deriveDossierKey(code, PEPPER) },
  };
}

function lignesDe(store: FakeStore, categoryId?: string): string[] {
  return store.keysWithPrefix(keys.votesPrefix(categoryId));
}

describe('enregistrement d’un vote', () => {
  it('crée exactement une ligne de vote et la retrouve dans le dossier', async () => {
    const store = new FakeStore();
    const { ctx } = nouveauVotant();

    const ballot = await castVote(store, ctx, CATEGORIE, ['n03']);

    assert.deepEqual(ballot, { [CATEGORIE]: { nomineeIds: ['n03'] } });
    const lignes = lignesDe(store, CATEGORIE);
    assert.equal(lignes.length, 1);
    assert.deepEqual(store.readJson(lignes[0]!), { n: ['n03'] });
  });

  it('se relit à l’identique après un retour sur le site', async () => {
    const store = new FakeStore();
    const { ctx } = nouveauVotant();
    await castVote(store, ctx, CATEGORIE, ['n03']);
    await castVote(store, ctx, AUTRE_CATEGORIE, ['n07']);

    assert.deepEqual(await loadBallot(store, ctx), {
      [CATEGORIE]: { nomineeIds: ['n03'] },
      [AUTRE_CATEGORIE]: { nomineeIds: ['n07'] },
    });
  });

  it('ne laisse dans une ligne de vote QUE les nominés choisis', async () => {
    const store = new FakeStore();
    const { code, ctx } = nouveauVotant();
    await castVote(store, ctx, CATEGORIE, ['n03']);

    for (const cle of lignesDe(store)) {
      // Le contenu ne porte qu'un seul champ.
      const contenu = store.readJson<Record<string, unknown>>(cle);
      assert.deepEqual(Object.keys(contenu!), ['n']);

      // Ni la clé ni le contenu ne portent le code, son identifiant, une IP ou une heure.
      const brut = `${cle} ${JSON.stringify(contenu)}`;
      assert.ok(!brut.includes(code), 'le code ne doit jamais apparaître');
      assert.ok(!brut.includes(ctx.codeId), 'l’identifiant du code ne doit jamais apparaître');
      assert.ok(!/\d{4}-\d{2}-\d{2}/.test(brut), 'aucune date ne doit apparaître');
      assert.ok(!/\b\d{10,13}\b/.test(brut), 'aucun horodatage ne doit apparaître');
    }
  });

  it('stocke le dossier votant sous forme chiffrée, illisible en clair', async () => {
    const store = new FakeStore();
    const { ctx } = nouveauVotant();
    await castVote(store, ctx, CATEGORIE, ['n03']);

    const entree = store.entries.get(keys.voter(ctx.codeId));
    assert.ok(entree, 'le dossier votant doit exister');
    const texte = entree!.value.toString('utf8');
    assert.ok(!texte.includes('n03'));
    assert.ok(!texte.includes(CATEGORIE));
    assert.throws(() => JSON.parse(texte));
    // Aucune métadonnée, en particulier rien de temporel.
    assert.deepEqual(entree!.metadata, {});
  });
});

describe('modification et retrait d’un vote', () => {
  it('remplace la ligne de vote et supprime l’ancienne', async () => {
    const store = new FakeStore();
    const { ctx } = nouveauVotant();

    await castVote(store, ctx, CATEGORIE, ['n03']);
    const premiere = lignesDe(store, CATEGORIE)[0]!;
    const ballot = await castVote(store, ctx, CATEGORIE, ['n04']);

    const lignes = lignesDe(store, CATEGORIE);
    assert.equal(lignes.length, 1, 'une seule voix par catégorie et par code');
    assert.notEqual(lignes[0], premiere, 'la nouvelle ligne a un nouvel uuid');
    assert.deepEqual(store.readJson(lignes[0]!), { n: ['n04'] });
    assert.deepEqual(ballot[CATEGORIE], { nomineeIds: ['n04'] });
  });

  it('supporte plusieurs changements d’avis de suite', async () => {
    const store = new FakeStore();
    const { ctx } = nouveauVotant();

    for (const choix of ['n03', 'n04', 'n05', 'n04', 'n21']) {
      await castVote(store, ctx, CATEGORIE, [choix]);
      assert.equal(lignesDe(store, CATEGORIE).length, 1, `après le choix ${choix}`);
    }
    assert.deepEqual(store.readJson(lignesDe(store, CATEGORIE)[0]!), { n: ['n21'] });
  });

  it('retire un vote : la ligne disparaît et le dossier l’oublie', async () => {
    const store = new FakeStore();
    const { ctx } = nouveauVotant();
    await castVote(store, ctx, CATEGORIE, ['n03']);
    await castVote(store, ctx, AUTRE_CATEGORIE, ['n07']);

    const ballot = await removeVote(store, ctx, CATEGORIE);

    assert.equal(lignesDe(store, CATEGORIE).length, 0);
    assert.equal(lignesDe(store, AUTRE_CATEGORIE).length, 1, 'les autres votes sont intacts');
    assert.deepEqual(ballot, { [AUTRE_CATEGORIE]: { nomineeIds: ['n07'] } });
    assert.deepEqual(await loadBallot(store, ctx), ballot);
  });

  it('retirer un vote inexistant ne change rien', async () => {
    const store = new FakeStore();
    const { ctx } = nouveauVotant();
    await castVote(store, ctx, CATEGORIE, ['n03']);

    const ballot = await removeVote(store, ctx, AUTRE_CATEGORIE);

    assert.deepEqual(ballot, { [CATEGORIE]: { nomineeIds: ['n03'] } });
    assert.equal(lignesDe(store).length, 1);
  });

  it('permet de voter à nouveau après un retrait', async () => {
    const store = new FakeStore();
    const { ctx } = nouveauVotant();
    await castVote(store, ctx, CATEGORIE, ['n03']);
    await removeVote(store, ctx, CATEGORIE);
    await castVote(store, ctx, CATEGORIE, ['n09']);

    assert.equal(lignesDe(store, CATEGORIE).length, 1);
    assert.deepEqual(store.readJson(lignesDe(store, CATEGORIE)[0]!), { n: ['n09'] });
  });
});

describe('absence de double vote', () => {
  it('deux requêtes simultanées avec le même code ne laissent qu’une ligne', async () => {
    const store = new FakeStore();
    const { ctx } = nouveauVotant();

    // Les deux appels s'entrelacent : ils lisent le même dossier vide, puis
    // tentent tous les deux de l'écrire. L'écriture conditionnelle en refuse un,
    // qui nettoie sa ligne et recommence.
    const [premier, second] = await Promise.all([
      castVote(store, ctx, CATEGORIE, ['n03']),
      castVote(store, ctx, CATEGORIE, ['n04']),
    ]);

    const lignes = lignesDe(store, CATEGORIE);
    assert.equal(lignes.length, 1, 'une seule voix, même avec deux onglets');

    // Le dossier et la ligne restante disent la même chose.
    const final = await loadBallot(store, ctx);
    const contenu = store.readJson<{ n: string[] }>(lignes[0]!);
    assert.deepEqual(final[CATEGORIE]!.nomineeIds, contenu!.n);
    assert.ok([premier, second].some((b) => b[CATEGORIE]!.nomineeIds[0] === contenu!.n[0]));
  });

  it('résiste à cinq requêtes simultanées du même code', async () => {
    const store = new FakeStore();
    const { ctx } = nouveauVotant();

    await Promise.all(
      ['n03', 'n04', 'n05', 'n07', 'n09'].map((choix) =>
        castVote(store, ctx, CATEGORIE, [choix]),
      ),
    );

    assert.equal(lignesDe(store, CATEGORIE).length, 1);
    const final = await loadBallot(store, ctx);
    assert.deepEqual(
      final[CATEGORIE]!.nomineeIds,
      store.readJson<{ n: string[] }>(lignesDe(store, CATEGORIE)[0]!)!.n,
    );
  });

  it('un vote et un retrait simultanés laissent un état cohérent', async () => {
    const store = new FakeStore();
    const { ctx } = nouveauVotant();
    await castVote(store, ctx, CATEGORIE, ['n03']);

    await Promise.all([
      castVote(store, ctx, CATEGORIE, ['n04']).catch(() => undefined),
      removeVote(store, ctx, CATEGORIE).catch(() => undefined),
    ]);

    const lignes = lignesDe(store, CATEGORIE);
    const final = await loadBallot(store, ctx);
    assert.ok(lignes.length <= 1, 'jamais deux lignes');
    assert.equal(lignes.length, final[CATEGORIE] ? 1 : 0, 'dossier et lignes concordent');
  });

  it('deux codes différents comptent pour deux voix', async () => {
    const store = new FakeStore();
    const premier = nouveauVotant();
    const second = nouveauVotant();

    await castVote(store, premier.ctx, CATEGORIE, ['n03']);
    await castVote(store, second.ctx, CATEGORIE, ['n03']);

    assert.equal(lignesDe(store, CATEGORIE).length, 2);
    assert.equal(store.keysWithPrefix(keys.votersPrefix).length, 2);
  });
});

describe('catégorie « duo »', () => {
  it('enregistre la paire triée dans la clé comme dans le contenu', async () => {
    const store = new FakeStore();
    const { ctx } = nouveauVotant();

    await castVote(store, ctx, 'meilleur-binome', ['n03', 'n11']);

    const ligne = lignesDe(store, 'meilleur-binome')[0]!;
    const parsed = parseVoteKey(ligne);
    assert.deepEqual(parsed?.nomineeIds, ['n03', 'n11']);
    assert.deepEqual(store.readJson(ligne), { n: ['n03', 'n11'] });
  });

  it('se modifie comme une catégorie normale', async () => {
    const store = new FakeStore();
    const { ctx } = nouveauVotant();
    await castVote(store, ctx, 'meilleur-binome', ['n03', 'n11']);
    await castVote(store, ctx, 'meilleur-binome', ['n05', 'n21']);

    const lignes = lignesDe(store, 'meilleur-binome');
    assert.equal(lignes.length, 1);
    assert.deepEqual(parseVoteKey(lignes[0]!)?.nomineeIds, ['n05', 'n21']);
  });
});

describe('rattrapage des lignes orphelines', () => {
  it('supprime une ligne restée en attente dans le dossier', async () => {
    const store = new FakeStore();
    const { ctx } = nouveauVotant();
    await castVote(store, ctx, CATEGORIE, ['n03']);

    // On simule une suppression qui n'a pas abouti : une ligne existe encore et
    // le dossier la note comme « à supprimer ».
    const orpheline = keys.voteRow(CATEGORIE, ['n19'], 'ligne-orpheline');
    await store.setJSON(orpheline, { n: ['n19'] });
    const dossier: Dossier = {
      v: { [CATEGORIE]: { id: 'peu-importe', n: ['n03'] } },
      gc: [orpheline],
    };
    await store.set(keys.voter(ctx.codeId), toArrayBuffer(encryptDossier(dossier, ctx.dossierKey)));

    await loadBallot(store, ctx);

    assert.ok(!store.entries.has(orpheline), 'la ligne orpheline doit être supprimée');
  });

  it('ignore une référence qui n’est pas une ligne de vote', async () => {
    const store = new FakeStore();
    const { ctx } = nouveauVotant();
    await store.setJSON(keys.state, { isOpen: true, closesAt: null });

    const dossier: Dossier = { v: {}, gc: [keys.state, 'nawak', '', 'votes/'] };
    await store.set(keys.voter(ctx.codeId), toArrayBuffer(encryptDossier(dossier, ctx.dossierKey)));

    await loadBallot(store, ctx);

    assert.ok(store.entries.has(keys.state), 'l’état de l’élection ne doit pas être touché');
  });
});
