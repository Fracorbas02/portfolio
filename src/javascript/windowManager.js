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
 *
 * Snapping : pendant un drag, un bord du viewport met en
 * surbrillance la zone d'atterrissage (moitié ou quart de
 * l'écran, à la GNOME/Windows) ; au relâcher, la fenêtre
 * s'y glisse avec une courte animation.
 */

(() => {
  'use strict';

  const DIRECTIONS = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];

  // Distance (px) au bord du viewport au-delà de laquelle le
  // snapping se déclenche pendant un drag.
  const SNAP_ZONE = 24;
  // Durée (ms) de l'animation d'atterrissage (classe .is-snapping).
  const SNAP_ANIM_MS = 260;

  /**
   * Zone d'atterrissage selon la position du pointeur :
   *   - un bord           → moitié de l'écran ancrée à ce bord
   *   - deux bords (coin) → quart de l'écran ancré à ce coin
   * Retourne null si le pointeur est loin des bords.
   */
  function snapRectFor(x, y, vw, vh) {
    const nearL = x <= SNAP_ZONE;
    const nearR = x >= vw - SNAP_ZONE;
    const nearT = y <= SNAP_ZONE;
    const nearB = y >= vh - SNAP_ZONE;

    if (nearT && nearL) return { left: 0,            top: 0,           width: vw / 2, height: vh / 2 };
    if (nearT && nearR) return { left: vw / 2,       top: 0,           width: vw / 2, height: vh / 2 };
    if (nearB && nearL) return { left: 0,            top: vh / 2,      width: vw / 2, height: vh / 2 };
    if (nearB && nearR) return { left: vw / 2,       top: vh / 2,      width: vw / 2, height: vh / 2 };
    if (nearL)           return { left: 0,            top: 0,           width: vw / 2, height: vh };
    if (nearR)           return { left: vw / 2,       top: 0,           width: vw / 2, height: vh };
    if (nearT)           return { left: 0,            top: 0,           width: vw,     height: vh / 2 };
    if (nearB)           return { left: 0,            top: vh / 2,      width: vw,     height: vh / 2 };
    return null;
  }

  /**
   * Aperçu partagé (un seul pour tout le document) : le rectangle
   * translucide qui montre où la fenêtre atterrira si on relâche.
   */
  function snapPreviewEl() {
    let el = document.querySelector('.shellSnapPreview');
    if (!el) {
      el = document.createElement('div');
      el.className = 'shellSnapPreview';
      document.body.appendChild(el);
    }
    return el;
  }

  function showSnapPreview(rect) {
    const el = snapPreviewEl();
    el.style.left   = `${rect.left}px`;
    el.style.top    = `${rect.top}px`;
    el.style.width  = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
    el.classList.add('shellSnapPreview--visible');
  }

  function hideSnapPreview() {
    document.querySelector('.shellSnapPreview')
      ?.classList.remove('shellSnapPreview--visible');
  }

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
    let snapRect = null;        // zone d'atterrissage si on relâche
    let snapAnimTimer = null;   // retire .is-snapping après l'animation
    let snapped = false;        // fenêtre posée par un snap ?
    let preSnap = null;         // taille d'avant snap, rendue au prochain drag
    let unsnapPending = false;  // clic sur fenêtre snappée : unsnap au 1er déplacement
    let maximized = false;      // plein écran via double-clic sur la barre ?
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

    /**
     * Unsnap : rendre la taille d'avant atterrissage à une fenêtre
     * snappée qu'on attrape. Le coin haut-gauche est ajusté pour
     * que la fenêtre retaillée reste dans le viewport.
     */
    function unsnap() {
      if (!snapped) return;
      snapped = false;
      maximized = false;
      // Retour au CSS centré (passage sous le seuil mobile) :
      // il n'y a rien à retailler.
      if (!hasTakenControl) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      target.style.width  = `${preSnap.width}px`;
      target.style.height = `${preSnap.height}px`;
      target.style.left = `${clamp(parseFloat(target.style.left), 0, Math.max(0, vw - preSnap.width))}px`;
      target.style.top  = `${clamp(parseFloat(target.style.top), 0, Math.max(0, vh - preSnap.height))}px`;
      snapped = false;
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

      // Un nouveau geste interrompt un atterrissage en cours :
      // la fenêtre doit suivre le pointeur sans transition.
      target.classList.remove('is-snapping');
      clearTimeout(snapAnimTimer);

      // Un clic sur la barre d'une fenêtre snappée ne doit pas la
      // dé-snapper : la taille d'avant atterrissage ne lui est
      // rendue qu'au premier vrai déplacement (voir onPointerMove).
      if (mode === 'move') unsnapPending = snapped;
      else { // un resize manuel remplace la taille du snap/plein écran
        snapped = false;
        maximized = false;
      }

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
        // Clic sans déplacement (ou micro-tremblement < 3px) : la
        // fenêtre snappée reste snappée, on ne bouge rien.
        if (unsnapPending && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return;
        if (unsnapPending) {
          // Premier vrai déplacement : on rend sa taille à la
          // fenêtre (comme GNOME/Windows) et on repart de la
          // géométrie restaurée pour un drag cohérent.
          unsnap();
          unsnapPending = false;
          const rect = target.getBoundingClientRect();
          start.pointerX = event.clientX;
          start.pointerY = event.clientY;
          start.left     = rect.left;
          start.top      = rect.top;
          start.width    = rect.width;
          start.height   = rect.height;
        }

        // Clamp pour ne pas sortir du viewport
        const newLeft = clamp(start.left + dx, 0, vw - start.width);
        const newTop  = clamp(start.top  + dy, 0, vh - start.height);
        target.style.left = `${newLeft}px`;
        target.style.top  = `${newTop}px`;

        // Snapping : une fenêtre réduite reste une fenêtre
        // réduite — pas de moitié d'écran sur un pli de 39px.
        snapRect = target.classList.contains('minimized')
          ? null
          : snapRectFor(event.clientX, event.clientY, vw, vh);
        if (snapRect) showSnapPreview(snapRect);
        else hideSnapPreview();
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
    /**
     * Atterrissage : la fenêtre glisse vers sa zone avec une
     * courte transition (classe .is-snapping), puis rend la
     * main pour drag/resize normaux.
     */
    function applySnap(rect) {
      const before = target.getBoundingClientRect();
      preSnap = { width: before.width, height: before.height };
      snapped = true;
      maximized = false; // un atterrissage draggé n'est pas un plein écran
      target.classList.add('is-snapping');
      target.style.left   = `${rect.left}px`;
      target.style.top    = `${rect.top}px`;
      target.style.width  = `${rect.width}px`;
      target.style.height = `${rect.height}px`;
      clearTimeout(snapAnimTimer);
      snapAnimTimer = setTimeout(
        () => target.classList.remove('is-snapping'),
        SNAP_ANIM_MS
      );
    }

    function onPointerUp(event) {
      if (action === 'move' && snapRect) applySnap(snapRect);
      snapRect = null;
      unsnapPending = false;
      hideSnapPreview();
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

    // Double-clic sur la barre : plein écran / retour, comme un
    // gestionnaire classique. Un drag qui suit un plein écran lui
    // rend sa taille d'avant (unsnap, même chaîne que le snapping).
    handle.addEventListener('dblclick', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('button, a, input, select, textarea')) return;
      if (target.classList.contains('minimized')) return;
      takeControl();
      if (maximized) {
        unsnap();
      } else {
        applySnap({
          left: 0, top: 0,
          width: window.innerWidth,
          height: window.innerHeight
        });
        maximized = true;
      }
    });

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