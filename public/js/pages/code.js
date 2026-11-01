/**
 * Saisie du code personnel.
 *
 * La casse, les tirets et les espaces n'ont pas d'importance : le serveur
 * normalise. La case « se souvenir » est décochée par défaut.
 */

import { api } from '../api.js';
import { annoncer, el } from '../dom.js';
import { appliquerEtatElection, enregistrerCode, etat, retenirMemorise } from '../etat.js';

export function formulaireCode({ naviguer }) {
  const champ = el('input', {
    type: 'text',
    id: 'champ-code',
    class: 'code-saisie',
    placeholder: 'CIN-XXXX-XXXX-XX',
    autocomplete: 'off',
    autocapitalize: 'characters',
    autocorrect: 'off',
    spellcheck: 'false',
    inputmode: 'text',
    maxlength: '24',
    'aria-describedby': 'aide-code',
  });

  const caseRetenir = el('input', { type: 'checkbox', checked: retenirMemorise() });
  const zoneMessage = el('div', { 'aria-live': 'polite' });
  const bouton = el('button', { class: 'bouton', type: 'submit' }, 'Accéder à mes catégories');

  const formulaire = el(
    'form',
    {
      class: 'formulaire-code',
      onsubmit: async (evenement) => {
        evenement.preventDefault();
        const saisie = champ.value.trim();
        if (!saisie) {
          zoneMessage.textContent = '';
          zoneMessage.appendChild(
            el('div', { class: 'message message-erreur' }, 'Saisis le code inscrit sur ton ticket.'),
          );
          champ.focus();
          return;
        }

        bouton.disabled = true;
        bouton.textContent = 'Vérification…';
        const reponse = await api.chargerVotes(saisie);
        bouton.disabled = false;
        bouton.textContent = 'Accéder à mes catégories';

        if (!reponse.ok) {
          zoneMessage.textContent = '';
          zoneMessage.appendChild(el('div', { class: 'message message-erreur' }, reponse.erreur));
          champ.select();
          return;
        }

        etat.votes = reponse.donnees.ballot ?? {};
        appliquerEtatElection(reponse.donnees.state);
        enregistrerCode(saisie, caseRetenir.checked);
        annoncer('Code reconnu.');
        naviguer('/vote');
      },
    },
    el('label', { for: 'champ-code' }, 'Ton code personnel'),
    champ,
    el(
      'p',
      { class: 'champ-aide', id: 'aide-code' },
      'Il est imprimé sur le ticket que tu as tiré au hasard. Les majuscules et les tirets sont facultatifs.',
    ),
    el('label', { class: 'case' }, caseRetenir, 'Se souvenir de mon code sur cet appareil'),
    el(
      'p',
      { class: 'champ-aide' },
      'À ne cocher que si ce téléphone est bien le tien : n’importe qui pourrait sinon modifier tes votes.',
    ),
    zoneMessage,
    el('div', { class: 'barre-actions', style: 'margin-top:1rem' }, bouton),
  );

  return el(
    'div',
    {},
    el('h1', {}, 'Entre ton code'),
    el(
      'p',
      { style: 'max-width:26rem;margin-inline:auto;text-align:center;color:var(--texte-doux)' },
      'Ce code est ta clé personnelle, et il est anonyme : personne — pas même l’organisateur — ne sait à qui il appartient.',
    ),
    formulaire,
    el(
      'p',
      { style: 'text-align:center;margin-top:1.5rem' },
      el('a', { href: '/fonctionnement', 'data-lien': '' }, 'Pourquoi un code ? Comment l’anonymat est garanti'),
    ),
  );
}
