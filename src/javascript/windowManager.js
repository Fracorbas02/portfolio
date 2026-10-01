/**
 * Window Manager
 * --------------------------------------------------
 * Rend un élément déplaçable (drag) et redimensionnable (resize)
 * comme une fenêtre de bureau classique.
 *
 * Utilisation :
 *   initWindowManager({
 *     target: document.getElementById('myWindow'),
 *     handle: document.getElementById('myHandle'),  // zone de drag
 *     minWidth: 420,
 *     minHeight: 300
 *   });
 *
 * Le module injecte lui-même les 8 poignées de resize
 * (4 bords + 4 coins) à l'intérieur de `target`.
 */

(() => {
  'use strict';

  const DIRECTIONS = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];

  function initWindowManager({
    target,
    handle,
    minWidth     = 420,
    minHeight    = 300,
    disableUnder = 768
  }) {
    if (!target || !handle) {
      console.warn('[windowManager] target ou handle manquant');
      return;
    }

    // Pas de drag/resize sur les petits écrans : la fenêtre y prend
    // déjà toute la place et le geste serait pénible au doigt.
    if (window.innerWidth < disableUnder) return;

    // ── 1. Injection des poignées de resize ─────────────────────
    const handles = {};
    for (const dir of DIRECTIONS) {
      const el = document.createElement('div');
      el.className = `shell__resize shell__resize--${dir}`;
      el.dataset.dir = dir;
      target.appendChild(el);
      handles[dir] = el;
    }

    // ── 2. État de l'interaction ────────────────────────────────
    let action = null;          // 'move' | 'resize'
    let resizeDir = null;       // 'n' | 'ne' | 'e' | ...
    const start = {
      pointerX: 0, pointerY: 0,
      left: 0, top: 0,
      width: 0, height: 0
    };

    // Au premier geste, on convertit la position CSS centrée
    // (top/left + transform) en valeurs explicites en pixels.
    let hasTakenControl = false;
    function takeControl() {
      if (hasTakenControl) return;
      const rect = target.getBoundingClientRect();
      target.style.transform = 'none';
      target.style.left   = `${rect.left}px`;
      target.style.top    = `${rect.top}px`;
      target.style.width  = `${rect.width}px`;
      target.style.height = `${rect.height}px`;
      hasTakenControl = true;
    }

    // ── 3. Démarrage d'un drag ou d'un resize ───────────────────
    function onPointerDown(event, mode, direction = null) {
      // Ignorer le clic droit / molette
      if (event.button !== 0) return;

      // Ne pas démarrer un drag depuis un élément interactif imbriqué
      if (mode === 'move' && event.target.closest('button, a, input, select, textarea')) {
        return;
      }

      event.preventDefault();
      takeControl();

      action     = mode;
      resizeDir  = direction;

      const rect = target.getBoundingClientRect();
      start.pointerX = event.clientX;
      start.pointerY = event.clientY;
      start.left     = rect.left;
      start.top      = rect.top;
      start.width    = rect.width;
      start.height   = rect.height;

      document.body.classList.add(
        mode === 'move' ? 'is-window-dragging' : 'is-window-resizing'
      );

      // Capture du pointeur : on continue à recevoir les events
      // même si le curseur sort de la fenêtre du navigateur.
      const captureEl = event.currentTarget;
      captureEl.setPointerCapture(event.pointerId);
      captureEl.addEventListener('pointermove', onPointerMove);
      captureEl.addEventListener('pointerup', onPointerUp, { once: true });
      captureEl.addEventListener('pointercancel', onPointerUp, { once: true });
    }

    // ── 4. Déplacement / redimensionnement en temps réel ────────
    function onPointerMove(event) {
      if (!action) return;

      const dx = event.clientX - start.pointerX;
      const dy = event.clientY - start.pointerY;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (action === 'move') {
        // Clamp pour ne pas sortir du viewport
        const newLeft = clamp(start.left + dx, 0, vw - start.width);
        const newTop  = clamp(start.top  + dy, 0, vh - start.height);
        target.style.left = `${newLeft}px`;
        target.style.top  = `${newTop}px`;
        return;
      }

      // mode 'resize' : selon la direction, on ajuste left/top
      // ET width/height. La direction est une combinaison de n/s/e/w.
      let { left, top, width, height } = start;

      if (resizeDir.includes('e')) {
        // bord Est : largeur grandit avec dx, gauche reste fixe
        width = clamp(start.width + dx, minWidth, vw - start.left);
      }
      if (resizeDir.includes('s')) {
        // bord Sud : hauteur grandit avec dy, haut reste fixe
        height = clamp(start.height + dy, minHeight, vh - start.top);
      }
      if (resizeDir.includes('w')) {
        // bord Ouest : la largeur croît quand on tire à gauche (dx<0)
        // mais il faut aussi déplacer left pour que le bord droit reste fixe
        const requested = start.width - dx;
        width = clamp(requested, minWidth, start.left + start.width);
        left  = start.left + (start.width - width);
      }
      if (resizeDir.includes('n')) {
        // bord Nord : symétrique de l'Ouest, mais vertical
        const requested = start.height - dy;
        height = clamp(requested, minHeight, start.top + start.height);
        top    = start.top + (start.height - height);
      }

      target.style.left   = `${left}px`;
      target.style.top    = `${top}px`;
      target.style.width  = `${width}px`;
      target.style.height = `${height}px`;
    }

    // ── 5. Fin de l'interaction ─────────────────────────────────
    function onPointerUp(event) {
      action    = null;
      resizeDir = null;
      document.body.classList.remove(
        'is-window-dragging',
        'is-window-resizing'
      );
      event.currentTarget.removeEventListener('pointermove', onPointerMove);
    }

    // ── 6. Branchement des handlers ─────────────────────────────
    handle.addEventListener('pointerdown', (e) => onPointerDown(e, 'move'));
    for (const dir of DIRECTIONS) {
      handles[dir].addEventListener('pointerdown', (e) => {
        onPointerDown(e, 'resize', dir);
      });
    }

    // ── 7. Si l'utilisateur redimensionne la fenêtre du navigateur,
    //       on garde la fenêtre interne dans le viewport ───────────
    // La fenêtre peut être fermée (exit, pastille rouge) : au
    // prochain resize, l'écouteur se retire seul au lieu de garder
    // une référence sur un élément détaché.
    const onWindowResize = () => {
      if (!target.isConnected) {
        window.removeEventListener('resize', onWindowResize);
        return;
      }
      if (!hasTakenControl) return;
      const rect = target.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Si on est passé sous le seuil mobile, on rend la main au CSS
      if (vw < disableUnder) {
        target.style.left      = '';
        target.style.top       = '';
        target.style.width     = '';
        target.style.height    = '';
        target.style.transform = '';
        hasTakenControl = false;
        return;
      }

      const clampedLeft = clamp(rect.left, 0, Math.max(0, vw - rect.width));
      const clampedTop  = clamp(rect.top,  0, Math.max(0, vh - rect.height));
      if (clampedLeft !== rect.left) target.style.left = `${clampedLeft}px`;
      if (clampedTop  !== rect.top)  target.style.top  = `${clampedTop}px`;
    };
    window.addEventListener('resize', onWindowResize);
  }

  // Petit utilitaire de clamping (borne une valeur entre min et max)
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  // Exposition globale (pas de système de modules ici)
  window.initWindowManager = initWindowManager;
})();