/**
 * Confettis dorés, volontairement sobres : quelques rectangles qui tombent,
 * sur un canvas plein écran, puis le canvas se retire tout seul.
 *
 * Rien n'est lancé si la personne a demandé à réduire les animations.
 */

const COULEURS = ['#e3c16f', '#f2dca6', '#8a6f2e', '#ffffff'];

export function mouvementReduit() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function lancerConfettis(duree = 2600) {
  if (mouvementReduit()) return () => {};

  const canvas = document.createElement('canvas');
  canvas.id = 'confettis';
  canvas.setAttribute('aria-hidden', 'true');
  const contexte = canvas.getContext('2d');
  if (!contexte) return () => {};

  const redimensionner = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  redimensionner();
  window.addEventListener('resize', redimensionner);
  document.body.appendChild(canvas);

  const piece = () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.4,
    largeur: 5 + Math.random() * 6,
    hauteur: 8 + Math.random() * 10,
    vitesse: 1.6 + Math.random() * 2.6,
    derive: (Math.random() - 0.5) * 1.1,
    angle: Math.random() * Math.PI,
    rotation: (Math.random() - 0.5) * 0.14,
    couleur: COULEURS[Math.floor(Math.random() * COULEURS.length)],
  });

  const pieces = Array.from({ length: 90 }, piece);
  const debut = performance.now();
  let animation = 0;

  const arreter = () => {
    cancelAnimationFrame(animation);
    window.removeEventListener('resize', redimensionner);
    canvas.remove();
  };

  const dessiner = (instant) => {
    const ecoule = instant - debut;
    contexte.clearRect(0, 0, canvas.width, canvas.height);
    // Disparition progressive sur le dernier tiers.
    const opacite = ecoule > duree * 0.7 ? Math.max(0, 1 - (ecoule - duree * 0.7) / (duree * 0.3)) : 1;
    contexte.globalAlpha = opacite;

    for (const confetti of pieces) {
      confetti.y += confetti.vitesse;
      confetti.x += confetti.derive;
      confetti.angle += confetti.rotation;
      if (confetti.y > canvas.height + 20) {
        confetti.y = -20;
        confetti.x = Math.random() * canvas.width;
      }
      contexte.save();
      contexte.translate(confetti.x, confetti.y);
      contexte.rotate(confetti.angle);
      contexte.fillStyle = confetti.couleur;
      contexte.fillRect(-confetti.largeur / 2, -confetti.hauteur / 2, confetti.largeur, confetti.hauteur);
      contexte.restore();
    }

    if (ecoule < duree) animation = requestAnimationFrame(dessiner);
    else arreter();
  };

  animation = requestAnimationFrame(dessiner);
  return arreter;
}
