/**
 * Portfolio CLI — Bastien BONORA
 * ----------------------------------------------------------------
 * Orchestrateur du shell : fabrique les fenêtres de terminal et
 * les assemble avec les modules dédiés.
 *   - theme.js : palette de couleurs (commande set theme)
 *   - filesystem.js : navigation dans l'arborescence JSON
 *   - boot.js : log de démarrage systemd et effet machine à écrire
 *   - neofetch.js : rendu du neofetch
 *   - commands.js : handlers de commandes et registre
 *
 * Ici restent : le chargement des données (elements.json), la
 * fabrique de fenêtres (multi-shells), le curseur, l'historique,
 * la complétion Tab, la recherche Ctrl+R, le viewer de CV, le menu
 * hamburger latéral et l'easter egg "42"
 */

(() => {
  'use strict';

  // ──────────────────────────────────────────────────────────────
  // Références DOM globales : le menu hamburger, unique, est partagé
  // par toutes les fenêtres de shell
  // ──────────────────────────────────────────────────────────────
  const HAMBURGER           = document.getElementById('hamburgerMenu');
  const MENU_CONTENT        = document.getElementById('menuContent');
  const ACCORDIONS          = document.querySelectorAll('.accordion');
  const PANEL_BUTTONS       = document.querySelectorAll('.panelButton');

  let menuSetupDone = false;
  let portfolioData = null;

  // Échappement HTML (XSS) — partagé par toutes les fenêtres de shell
  const escapeHTML = window.PORTFOLIO_HTML.escapeHTML;

  // Easter egg 42 : un seul écouteur document, branché sur la fenêtre
  // qui vient de démarrer
  let eggListenerBound = false;
  let bootedShellApi = null;

  // Gestion des fenêtres de shell (commande bash)
  let shellCount = 0;
  let topZ = 20;

  function bringToFront(rootEl) {
    topZ += 1;
    rootEl.style.zIndex = topZ;
  }

  /**
   * Ouvre une nouvelle fenêtre de shell : clone de la fenêtre
   * principale (sans les id, dupliqués), position en cascade,
   * démarrage instantané sans log de boot. `options.viewer` (nœud
   * JSON avec un champ `viewer`) ouvre directement le viewer
   * interactif correspondant.
   */
  function spawnShell(options = {}) {
    const primary = document.getElementById('shellContainer');
    if (!primary || !portfolioData) {
      return 'bash : impossible d\'ouvrir une nouvelle fenêtre (données indisponibles)';
    }

    const clone = primary.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    clone.classList.remove('minimized', 'maximized');
    clone.querySelectorAll('.shell__resize').forEach((el) => el.remove());
    // La factory instancie ses propres éléments de mesure/curseur
    clone.querySelectorAll('.cursorMeasure').forEach((el) => el.remove());
    const clonedCursor = clone.querySelector('.cursor');
    if (clonedCursor) clonedCursor.style.transform = '';

    // Sortie vierge : le clone a capturé l'état de la fenêtre source
    const output = clone.querySelector('.shellOutput');
    output.classList.add('booting');
    output.innerHTML = '<p class="defaultText"></p>';
    const input = clone.querySelector('.commandInput');
    input.value = '';
    input.style.width = '0ch';

    // Position en cascade, décalée à chaque nouvelle fenêtre
    shellCount += 1;
    const offset = shellCount * 36;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(vw * 0.8, 1100);
    const height = Math.min(vh * 0.8, 800);
    Object.assign(clone.style, {
      transform: 'none',
      left: `${Math.max(0, (vw - width) / 2 + offset)}px`,
      top: `${Math.max(0, vh * 0.08 + offset)}px`,
      width: `${width}px`,
      height: `${height}px`
    });

    document.body.appendChild(clone);
    bringToFront(clone);

    // Le window manager est branché par createShell (une seule
    // instance par fenêtre, sinon poignées et listeners dupliqués)
    createShell(clone, {
      boot: false,
      viewer: options.viewer,
      seedHistory: options.seedHistory
    });
    return null;
  }

  // ──────────────────────────────────────────────────────────────
  // Fabrique de shell : chaque fenêtre du terminal instancie son
  // propre état, son prompt et ses écouteurs d'événements
  // ──────────────────────────────────────────────────────────────
  async function createShell(root, options = {}) {
  // ──────────────────────────────────────────────────────────────
  // Références DOM de cette instance
  // ──────────────────────────────────────────────────────────────
  const COMMAND_INPUT       = root.querySelector('.commandInput');
  const CURSOR              = root.querySelector('.cursor');
  const DEFAULT_BEGIN_SHELL = root.querySelector('.defaultBeginShellLine');
  const SEARCH_LABEL         = root.querySelector('.searchLabel');
  const SHELL_CHROME        = root.querySelector('.shell__chrome');
  const SHELL_OUTPUT        = root.querySelector('.shellOutput');
  const CURRENT_SHELL_LINE  = root.querySelector('.currentShellLine');
  const DEFAULT_TEXT        = root.querySelector('.defaultText');

  // Span fantôme : mesure la largeur du texte avant le caret pour
  // positionner le curseur clignotant au bon endroit de la ligne
  const MEASURE = document.createElement('span');
  MEASURE.className = 'cursorMeasure';
  {
    const cs = getComputedStyle(COMMAND_INPUT);
    MEASURE.style.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  }
  CURRENT_SHELL_LINE.appendChild(MEASURE);

  // ──────────────────────────────────────────────────────────────
  // État global
  // ──────────────────────────────────────────────────────────────
  const state = {
    portfolioData: null,
    commands: null,
    manCommands: null,
    tree: null,
    currentDir: '/root',
    bootInterrupted: false,
    shaCache: new Map(),
    history: [],
    historyIndex: -1,
    sessionStart: Date.now(),
    viewer: null
  };

  // État de la recherche inversée (Ctrl+R)
  const search = {
    active: false,
    query: '',
    matches: [],
    cursor: 0
  };

  // ──────────────────────────────────────────────────────────────
  // Séquence de boot : les données et le rendu des lignes vivent
  // dans boot.js ; ces alias y injectent l'état de cette fenêtre
  // ──────────────────────────────────────────────────────────────
  const BOOT_SEQUENCE     = window.PORTFOLIO_BOOT.lines;
  const BOOT_LINES_NORMAL = window.PORTFOLIO_BOOT.welcome;
  const bootLineHTML      = window.PORTFOLIO_BOOT.lineHTML;
  const delay             = window.PORTFOLIO_BOOT.delay;
  const typewrite = (element, text, speed, ignoreInterrupt = false) =>
    window.PORTFOLIO_BOOT.typewrite(element, text, speed,
      ignoreInterrupt ? null : () => state.bootInterrupted);

  const startPortfolio = async () => {
    // Log de services : rapide, avec un temps aléatoire entre chaque
    // ligne pour un défilement non linéaire, comme un vrai boot
    for (const line of BOOT_SEQUENCE) {
      if (state.bootInterrupted) break;
      DEFAULT_TEXT.innerHTML += `${bootLineHTML(line)}\n`;
      await delay(30 + Math.random() * 90);
    }

    // Pause, puis l'écran est nettoyé d'un coup comme en fin de boot
    // Debian : seul le message de bienvenue reste, écran net
    if (!state.bootInterrupted) {
      await delay(1200);
      if (state.bootInterrupted) return;
      DEFAULT_TEXT.innerHTML = '';
      await delay(300);
    }

    // Message d'accueil : effet machine à écrire rapide
    for (const line of BOOT_LINES_NORMAL) {
      if (state.bootInterrupted) break;
      await typewrite(DEFAULT_TEXT, line, 8);
      await delay(150);
    }

    // Comme un shell fraîchement ouvert : neofetch au-dessus du prompt
    if (!state.bootInterrupted) {
      printOutput(cmdNeofetch());
    }

    showPrompt();
    COMMAND_INPUT.focus();
    scrollToBottom();
  };

  // ──────────────────────────────────────────────────────────────
  // Affichage et état de la ligne courante
  // ──────────────────────────────────────────────────────────────
  const scrollToBottom = () => {
    SHELL_OUTPUT.scrollTop = SHELL_OUTPUT.scrollHeight;
  };

  /**
   * Affiche la ligne de prompt et bascule la sortie en mode
   * "ancrée en bas" (la classe .booting garde le texte en haut
   * pendant la séquence d'initialisation).
   */
  const showPrompt = () => {
    SHELL_OUTPUT.classList.remove('booting');
    CURRENT_SHELL_LINE.style.display = 'flex';
  };

  const resizeInput = () => {
    // Largeur en `ch` (caractère monospace).
    const len = COMMAND_INPUT.value.length;
    COMMAND_INPUT.style.width = `${Math.max(0, len)}ch`;
    updateCursor();
  };

  /**
   * Place le curseur clignotant sur la position réelle du caret :
   * on mesure la largeur du texte situé avant le caret et on
   * translate le curseur d'autant. Gère les déplacements au milieu
   * de la ligne (Home, flèches, clic). Le calage vertical se fait
   * sur la boîte de l'input — pas du conteneur, qui a du padding.
   */
  const updateCursor = () => {
    const caret = COMMAND_INPUT.selectionStart ?? COMMAND_INPUT.value.length;
    MEASURE.textContent = COMMAND_INPUT.value.slice(0, caret);
    const x = COMMAND_INPUT.offsetLeft + MEASURE.offsetWidth;
    const y = COMMAND_INPUT.offsetTop
            + (COMMAND_INPUT.offsetHeight - CURSOR.offsetHeight) / 2;
    CURSOR.style.transform = `translate(${x}px, ${y}px)`;
    wakeCursor();
  };

  /**
   * Comme dans un vrai shell : tant que le curseur bouge (saisie,
   * flèches, clic), il reste "allumé" sans clignoter. Le
   * clignotement ne reprend qu'après une demi-seconde d'inactivité.
   */
  let cursorIdleTimer = null;
  const wakeCursor = () => {
    // animation: none fige le curseur en position "pleine"
    CURSOR.style.animation = 'none';
    clearTimeout(cursorIdleTimer);
    cursorIdleTimer = setTimeout(() => {
      CURSOR.style.animation = '';
    }, 500);
  };

  const printOutput = (html) => {
    const line = document.createElement('div');
    line.innerHTML = html;
    SHELL_OUTPUT.appendChild(line);
  };

  /**
   * Impression sûre : échappe le texte avant insertion. À préférer
   * à printOutput pour tout contenu qui n'est pas du HTML construit
   * par le code — c'est le garde-fou anti-XSS par défaut.
   */
  const printText = (text) => printOutput(window.PORTFOLIO_HTML.escapeHTML(text));

  // ──────────────────────────────────────────────────────────────
  // Viewer interactif : fenêtre ouverte via `open <fichier>`. Le
  // rendu dépend du champ `viewer` du fichier (registre
  // viewerData.js) : CV, présentation, compétences… Cette instance
  // ne gère que l'état et le clavier (flèches, Entrée, Échap, q,
  // chiffres, Ctrl+C).
  // ──────────────────────────────────────────────────────────────
  /** Ouvre un lien du viewer : onglet pour le web, client natif pour mailto/tel. */
  const openViewerLink = (href) => {
    // Liste blanche de schémas : un javascript: ou data: dans les
    // données ne doit jamais devenir cliquable
    if (!window.PORTFOLIO_HTML.isSafeHref(href)) return;
    if (/^https?:/.test(href)) {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      // mailto:, tel: ou fichier local : on laisse naviguer l'ancre.
      // Elle doit être dans le document pour que le clic se propage
      // et que la navigation s'ouvre comme un vrai clic de l'utilisateur.
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  /** Redessine l'écran courant du viewer (menu ou rubrique). */
  const renderViewer = () => {
    const api = state.viewer?.api;
    let view = SHELL_OUTPUT.querySelector('.cvViewer');
    if (!view) {
      view = document.createElement('div');
      view.className = 'cvViewer';
      SHELL_OUTPUT.appendChild(view);
      view.innerHTML = api.render(state.viewer);
    } else {
      // Seule la colonne principale change : le panneau latéral garde
      // ses éléments DOM, sinon le spinner repart de zéro, le texte
      // tapé se vide et le logo en cours d'effacement se redessine.
      const main = view.querySelector('.cvViewerMain');
      if (main) {
        main.innerHTML = api.renderMain(state.viewer);
      } else {
        view.innerHTML = api.render(state.viewer);
      }
      // Panneau latéral remplacé uniquement quand sa nature change
      // (frise chronologique des rubriques « ères » ↔ logos/ticker)
      if (typeof api.renderSide === 'function'
          && typeof api.sideNature === 'function') {
        const side = view.querySelector('.cvViewerSide');
        if (side) {
          const nature = api.sideNature(state.viewer);
          // Marqueur data-side dédié : la comparaison ne dépend plus
          // du contenu rendu
          if (side.dataset.side !== nature) {
            side.dataset.side = nature;
            side.innerHTML = api.renderSide(state.viewer, view);
          }
        }
      }
    }
    // Panneau de logos seulement sur les fenêtres assez larges
    view.classList.toggle('cvViewerWide', SHELL_OUTPUT.clientWidth >= 760);
    // Barre de raccourcis façon nano, collée en bas de la fenêtre
    let bar = root.querySelector('.cvViewerBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'cvViewerBar';
      root.appendChild(bar);
    }
    bar.innerHTML = api.bar(state.viewer);
  };

  /** API de rendu du viewer demandé par un nœud, ou null. */
  const viewerApiFor = (node) => window.PORTFOLIO_VIEWERS?.[node?.viewer] ?? null;

  /**
   * Entre dans le viewer : masque le prompt, affiche le menu.
   * Retourne un message d'erreur si aucun viewer n'existe pour ce
   * fichier.
   */
  const enterViewer = (node) => {
    const api = viewerApiFor(node);
    if (!api) {
      return `open : viewer « ${escapeHTML(node?.viewer ?? '')} » inconnu`;
    }
    state.viewer = { node, api, index: 0, section: null };
    root.classList.add('viewerMode');
    // Sortie ancrée en haut, comme pendant le boot
    SHELL_OUTPUT.classList.add('booting');
    DEFAULT_TEXT.innerHTML = '';
    // Le prompt reste affiché (masqué par opacity:0 en mode
    // viewer) : sinon l'input perd le focus clavier
    CURRENT_SHELL_LINE.style.display = 'flex';
    COMMAND_INPUT.value = '';
    resizeInput();
    renderViewer();
    if (typeof api.startAnimations === 'function') {
      api.startAnimations(root);
    }
    COMMAND_INPUT.focus();
    return null;
  };

  /** Quitte le viewer et rend la main sur le prompt. */
  const quitViewer = (message) => {
    const api = state.viewer?.api;
    state.viewer = null;
    root.classList.remove('viewerMode');
    if (typeof api?.stopAnimations === 'function') {
      api.stopAnimations();
    }
    const bar = root.querySelector('.cvViewerBar');
    if (bar) bar.remove();
    // La factory garde une référence sur defaultText : on le
    // réinsère comme le fait cmdClear après un vidage complet.
    SHELL_OUTPUT.innerHTML = '';
    SHELL_OUTPUT.appendChild(DEFAULT_TEXT);
    DEFAULT_TEXT.innerHTML = '';
    showPrompt();
    if (message) printOutput(message);
    scrollToBottom();
  };

  /** Clavier du viewer : flèches, Entrée, Échap, q, Ctrl+C. */
  const handleViewerKey = (event) => {
    const viewer = state.viewer;
    if (!viewer) return;

    // Ctrl+C : ouvre le lien associé au fichier dans le navigateur
    // puis quitte (le CV pour CV.pdf, la page à propos pour
    // qui_suis_je.html, la doc pour les compétences…)
    if (event.ctrlKey && event.key.toLowerCase() === 'c') {
      if (viewer.node?.url && window.PORTFOLIO_HTML.isSafeHref(viewer.node.url)) {
        window.open(viewer.node.url, '_blank', 'noopener,noreferrer');
        quitViewer('ouverture du lien dans un nouvel onglet...');
      } else {
        quitViewer();
      }
      return;
    }

    const sections = viewer.api.sections();

    if (viewer.section === null) {
      // Menu : ↑↓ déplacent la sélection, Entrée ouvre une rubrique
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        viewer.index = (viewer.index + delta + sections.length) % sections.length;
        renderViewer();
        return;
      }
      if (event.key === 'Enter') {
        viewer.section = sections[viewer.index].id;
        renderViewer();
        return;
      }
      if (event.key === 'Escape' || event.key === 'q') {
        quitViewer();
        return;
      }
    } else {
      // Rubrique : ↑↓ défilent — sauf rubrique « ères », où elles
      // naviguent entre les étapes. Entrée/Échap retournent au
      // menu, un chiffre ouvre le lien correspondant.
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const view = SHELL_OUTPUT.querySelector('.cvViewer');
        if (viewer.api.navEra && viewer.api.navEra(
          view, viewer.section, event.key === 'ArrowDown' ? 1 : -1)) {
          return;
        }
        SHELL_OUTPUT.scrollTop += event.key === 'ArrowDown' ? 40 : -40;
        return;
      }
      if (event.key === 'Enter' || event.key === 'Escape') {
        viewer.section = null;
        renderViewer();
        return;
      }
      if (event.key === 'q') {
        quitViewer();
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        const link = viewer.api.links(viewer.section)[Number(event.key) - 1];
        if (link) openViewerLink(link.href);
        return;
      }
    }
  };

  // ──────────────────────────────────────────────────────────────
  // Persistance de l'historique (localStorage)
  //
  // Chaque fenêtre de shell est une instance indépendante : la
  // fenêtre principale persiste dans la clé canonique (elle survit
  // aux rechargements de page), chaque fenêtre ouverte par `bash`
  // ou `open` persiste dans sa propre clé d'instance — deux
  // fenêtres ne s'écrasent plus mutuellement leur historique. Les
  // clés d'instance portent un horodatage et sont purgées après
  // une semaine d'inactivité.
  // ──────────────────────────────────────────────────────────────
  const HISTORY_KEY          = 'portfolioShellHistory';
  const HISTORY_INSTANCE_KEY = 'portfolioShellHistory:instance:';
  const HISTORY_INSTANCE_TTL = 7 * 24 * 60 * 60 * 1000;
  const HISTORY_LIMIT        = 100;

  // Clé de persistance de cette fenêtre : null pour la fenêtre
  // principale (clé canonique), sinon une clé d'instance unique
  const instanceKey = options.boot === false
    ? `${HISTORY_INSTANCE_KEY}${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
    : null;

  function persistHistory() {
    try {
      const payload = state.history.slice(-HISTORY_LIMIT);
      if (instanceKey) {
        localStorage.setItem(instanceKey, JSON.stringify({
          updatedAt: Date.now(),
          history: payload
        }));
      } else {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(payload));
      }
    } catch {
      // Stockage indisponible (mode privé, etc.) : l'historique
      // reste en mémoire pour la session en cours.
    }
  }

  function loadHistory(seed = null) {
    // Héritage : une fenêtre ouverte par `bash` part de l'historique
    // de la fenêtre qui l'a lancée, comme un terminal neuf qui lit
    // le .bash_history au démarrage
    if (Array.isArray(seed)) {
      state.history = seed.filter((cmd) => typeof cmd === 'string').slice(-HISTORY_LIMIT);
      state.historyIndex = state.history.length;
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
      if (Array.isArray(saved)) {
        state.history = saved.filter((cmd) => typeof cmd === 'string');
        state.historyIndex = state.history.length;
      }
    } catch {
      // Données corrompues ou stockage indisponible : on repart à zéro
    }
    pruneInstanceHistory();
  }

  /** Supprime les clés d'instance inutilisées depuis plus d'une semaine. */
  function pruneInstanceHistory() {
    try {
      const now = Date.now();
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key?.startsWith(HISTORY_INSTANCE_KEY)) continue;
        try {
          const entry = JSON.parse(localStorage.getItem(key));
          if (!entry?.updatedAt || now - entry.updatedAt > HISTORY_INSTANCE_TTL) {
            localStorage.removeItem(key);
          }
        } catch {
          localStorage.removeItem(key); // entrée illisible : on purge
        }
      }
    } catch {
      // Stockage indisponible : rien à purger
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Dispatcher de commandes : les handlers vivent dans commands.js
  // et reçoivent l'état de cette fenêtre via le contexte
  // ──────────────────────────────────────────────────────────────
  const commandsApi = window.PORTFOLIO_COMMANDS.create({
    state,
    prompt: DEFAULT_BEGIN_SHELL,
    defaultText: DEFAULT_TEXT,
    output: SHELL_OUTPUT,
    root,
    typewrite,
    delay,
    updatePrompt,
    updateCursor,
    spawnShell
  }, { neofetch: cmdNeofetch });
  const handlers            = commandsApi.handlers;
  const unknownCommandMessage = commandsApi.unknown;

  /**
   * Découpe la commande en `[name, ...args]`
   * et délègue au handler approprié.
   */
  const executeCommand = async (rawCommand) => {
    const trimmed = rawCommand.trim();
    if (!trimmed) {
      printText(DEFAULT_BEGIN_SHELL.textContent);
      return;
    }

    state.history.push(trimmed);
    state.historyIndex = state.history.length;
    persistHistory();

    const [name, ...args] = trimmed.split(/\s+/);
    const handler = handlers[name.toLowerCase()];

    // Le prompt doit être capturé AVANT l'exécution : une commande
    // comme cd le modifie, et l'écho doit montrer la ligne telle
    // qu'elle était au moment de la saisie (comportement bash).
    const promptBefore = DEFAULT_BEGIN_SHELL.textContent;

    let output;
    try {
      output = handler ? await handler(args) : unknownCommandMessage(name);
    } catch (err) {
      console.error(err);
      output = `<span style="color:#f87171;">Une erreur est survenue lors de l'exécution.</span>`;
    }

    const promptHTML = `${escapeHTML(promptBefore)}${escapeHTML(trimmed)}`;
    printOutput(output ? `${promptHTML}<br>${output}` : promptHTML);
  };

  // ──────────────────────────────────────────────────────────────
  // neofetch : le rendu vit dans neofetch.js
  // ──────────────────────────────────────────────────────────────
  function cmdNeofetch() {
    const username = DEFAULT_BEGIN_SHELL.textContent.split('@')[0];
    return window.PORTFOLIO_NEOFETCH.render(username, state.sessionStart);
  }

  // ──────────────────────────────────────────────────────────────
  // Navigation arborescence : les fonctions pures vivent dans
  // filesystem.js ; ces alias y injectent l'état de cette fenêtre
  // ──────────────────────────────────────────────────────────────
  const navigateTree = (path) => window.PORTFOLIO_FS.navigate(state.tree, path);
  const resolvePath  = (path) => window.PORTFOLIO_FS.resolve(state.currentDir, path);
  const lookUpTree   = (target) =>
    window.PORTFOLIO_FS.lookUp(state.tree, state.currentDir, target);
  const isDirectory  = window.PORTFOLIO_FS.isDirectory;
  const isOpenable   = window.PORTFOLIO_FS.isOpenable;

  /**
   * Reconstruit la ligne de prompt avec le dossier courant.
   */
  function updatePrompt() {
    const username = DEFAULT_BEGIN_SHELL.textContent.split('@')[0];
    DEFAULT_BEGIN_SHELL.textContent = `${username}@portfolio:${state.currentDir}> `;
    // La largeur du prompt vient de changer : le curseur clignotant
    // doit suivre le décalage de l'input, sinon il reste à sa
    // dernière position tant qu'on ne tape pas
    updateCursor();
  }

  // ──────────────────────────────────────────────────────────────
  // Menu hamburger
  // ──────────────────────────────────────────────────────────────
  function toggleMenu(forceClose = false) {
    const isOpen = MENU_CONTENT.classList.contains('open');
    const willOpen = !forceClose && !isOpen;

    HAMBURGER.classList.toggle('change', willOpen);
    MENU_CONTENT.classList.toggle('open', willOpen);
    HAMBURGER.setAttribute('aria-expanded', String(willOpen));

    if (willOpen) {
      MENU_CONTENT.removeAttribute('hidden');
    } else {
      // Délai pour laisser l'animation se terminer
      setTimeout(() => {
        if (!MENU_CONTENT.classList.contains('open')) {
          MENU_CONTENT.setAttribute('hidden', '');
        }
      }, 400);
    }
  }

  function setupMenu() {
    // Le menu est global : ne le brancher qu'une fois, même si
    // plusieurs fenêtres de shell existent
    if (menuSetupDone) return;
    menuSetupDone = true;

    HAMBURGER.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    for (const accordion of ACCORDIONS) {
      accordion.addEventListener('click', () => {
        const isActive = accordion.classList.toggle('active');
        accordion.setAttribute('aria-expanded', String(isActive));

        const panel = accordion.nextElementSibling;
        if (!panel) return;

        if (isActive) {
          panel.style.maxHeight = `${panel.scrollHeight + 24}px`;
        } else {
          panel.style.maxHeight = null;
        }
      });
    }

    for (const button of PANEL_BUTTONS) {
      button.addEventListener('click', () => {
        const url = button.dataset.url;
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      });
    }

    document.addEventListener('click', (event) => {
      if (!MENU_CONTENT.classList.contains('open')) return;
      if (MENU_CONTENT.contains(event.target)) return;
      if (HAMBURGER.contains(event.target)) return;
      toggleMenu(true);
    });

    // Échappement clavier pour fermer
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && MENU_CONTENT.classList.contains('open')) {
        toggleMenu(true);
      }
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Easter egg "42" (Hitchhiker)
  // Déclenché uniquement quand l'input est vide pour ne pas
  // interférer avec une commande contenant "42".
  // ──────────────────────────────────────────────────────────────
  function setupEasterEgg() {
    // L'écouteur est unique et global : il se déclenche pendant le
    // boot, quand l'input n'a pas encore le focus
    if (eggListenerBound) return;
    eggListenerBound = true;

    let sequence = '';
    document.addEventListener('keydown', (event) => {
      const api = bootedShellApi;
      if (!api || api.input.value !== '') {
        sequence = '';
        return;
      }
      // Frappe dans une autre fenêtre de shell : on ignore
      const shellOfEvent = event.target?.closest?.('.shellContainer');
      if (shellOfEvent && shellOfEvent !== api.root) {
        sequence = '';
        return;
      }
      if (event.key !== '4' && event.key !== '2') {
        sequence = '';
        return;
      }
      sequence += event.key;
      if (sequence === '42') {
        sequence = '';
        api.triggerEasterEgg();
      }
    });
  }

  async function triggerEasterEgg() {
    state.bootInterrupted = true;
    handlers.clear();
    await delay(400);
    await typewrite(DEFAULT_TEXT, 'THE HOLY VALUE OF 42', 70, true);
    await typewrite(DEFAULT_TEXT, '_The answer to life, the universe and everything.', 35, true);
    showPrompt();
    COMMAND_INPUT.focus();
  }

  // ──────────────────────────────────────────────────────────────
  // Complétion automatique (Tab)
  // ──────────────────────────────────────────────────────────────
  /**
   * Complète `lastWord` parmi `candidates` ; `before` est le texte à
   * conserver devant le mot complété. Comportement bash :
   *   - une seule correspondance : complète (+ espace)
   *   - plusieurs : étend au préfixe commun et affiche la liste
   */
  function applyCompletion(candidates, lastWord, before, dirNode = null, dirPart = '') {
    if (candidates.length === 0) return;

    if (candidates.length === 1) {
      // Un dossier complété reçoit « / » pour poursuivre la
      // navigation dans l'arborescence, un fichier une espace
      const suffix = dirNode && isDirectory(dirNode[candidates[0]]) ? '/' : ' ';
      COMMAND_INPUT.value = `${before}${dirPart}${candidates[0]}${suffix}`;
    } else {
      let prefix = candidates[0];
      for (const name of candidates) {
        while (!name.startsWith(prefix)) prefix = prefix.slice(0, -1);
      }
      // Le dossier de base fait partie du mot complété : il doit
      // être réécrit devant le préfixe commun (ex. « presentation/ »)
      const full = `${dirPart}${prefix}`;
      COMMAND_INPUT.value = `${before}${full.length > lastWord.length ? full : lastWord}`;
      printOutput(candidates
        .map((name) => `<span class="helpCommand">${escapeHTML(name)}</span>`)
        .join('&nbsp;&nbsp;'));
      scrollToBottom();
    }
    resizeInput();
  }

  /**
   * Candidats de complétion pour le dernier argument d'une commande.
   * Renvoie { candidates, dirNode, dirPart } : dirNode est le dossier
   * dans lequel on complète (null pour les pools statiques), pour
   * qu'applyCompletion sache si un candidat est un dossier ; dirPart
   * est le début du mot déjà saisi (« presentation/ ») à réécrire
   * devant le candidat choisi.
   *
   * Le dernier mot peut être un chemin : on sépare le dossier de
   * base (« presentation/ », « ../ », « /root/ »…) du préfixe à
   * compléter, pour que la Tabulation traverse l'arborescence.
   */
  function argumentCandidates(command, lastWord) {
    const slash = lastWord.lastIndexOf('/');
    const dirPart = slash === -1 ? '' : lastWord.slice(0, slash + 1);
    const prefix = slash === -1 ? lastWord : lastWord.slice(slash + 1);

    let pool = [];
    let dirNode = null;
    switch (command) {
      case 'open':
      case 'cd':
      case 'cat': {
        const dir = navigateTree(dirPart
          ? window.PORTFOLIO_FS.resolve(state.currentDir, dirPart)
          : state.currentDir);
        if (!isDirectory(dir)) break;

        // Les dossiers sont complétés aussi : étapes du chemin,
        // même quand la commande les refuserait en argument final
        const wanted = command === 'cd'
          ? isDirectory
          : command === 'cat'
            ? (node) => isDirectory(node)
              || typeof node === 'string'
              || (node?.viewer && window.PORTFOLIO_VIEWERS?.[node.viewer]?.toText)
            : (node) => isDirectory(node) || isOpenable(node);

        dirNode = dir;
        pool = Object.keys(dir)
          .filter((key) => key !== 'type')
          .filter((key) => wanted(dir[key]));
        break;
      }
      case 'man':  pool = Object.keys(state.manCommands ?? {}); break;
      case 'set':  pool = ['username']; break;
      case 'get':  pool = ['sha']; break;
      case 'ls':   pool = ['-a', '-l', '-la']; break;
      case 'rm':   pool = ['*']; break;
      default: break;
    }
    return {
      candidates: pool.filter((name) => name.startsWith(prefix)),
      dirNode,
      dirPart
    };
  }

  /**
   * Complétion au Tab : le nom de commande s'il n'y a pas encore
   * d'argument, sinon le dernier argument de la commande.
   */
  function tabComplete() {
    const value = COMMAND_INPUT.value;

    // Premier mot : complétion du nom de commande
    if (!/\s/.test(value)) {
      const candidates = Object.keys(handlers)
        .filter((name) => name.startsWith(value.toLowerCase()));
      applyCompletion(candidates, value, '');
      return;
    }

    // Sinon : complétion du dernier argument
    const [command, ...rest] = value.split(/\s+/);
    const lastWord = rest[rest.length - 1] ?? '';
    const before = value.slice(0, value.length - lastWord.length);
    const { candidates, dirNode, dirPart } = argumentCandidates(command.toLowerCase(), lastWord);
    applyCompletion(candidates, lastWord, before, dirNode, dirPart);
  }

  // ──────────────────────────────────────────────────────────────
  // Recherche inversée dans l'historique (Ctrl+R)
  // ──────────────────────────────────────────────────────────────
  /** Recalcule les correspondances (plus récentes d'abord). */
  function refreshSearchMatches() {
    const needle = search.query.toLowerCase();
    search.matches = [...state.history]
      .reverse()
      .filter((cmd) => cmd.toLowerCase().includes(needle));
    search.cursor = 0;
  }

  /** Met à jour l'étiquette et la commande affichée dans l'input. */
  function updateSearchDisplay() {
    SEARCH_LABEL.textContent = `(reverse-i-search)${search.query}: `;
    COMMAND_INPUT.value = search.matches[search.cursor] ?? '';
    resizeInput();
  }

  function enterSearchMode(initialQuery = '') {
    search.active = true;
    search.query = initialQuery;
    refreshSearchMatches();
    DEFAULT_BEGIN_SHELL.hidden = true;
    SEARCH_LABEL.hidden = false;
    updateSearchDisplay();
  }

  /** Passe à la correspondance suivante (Ctrl+R répété). */
  function cycleSearch() {
    if (search.matches.length === 0) return;
    search.cursor = (search.cursor + 1) % search.matches.length;
    updateSearchDisplay();
  }

  /** Quitte le mode recherche et restaure le prompt. */
  function exitSearchMode() {
    search.active = false;
    SEARCH_LABEL.hidden = true;
    DEFAULT_BEGIN_SHELL.hidden = false;
  }

  // ──────────────────────────────────────────────────────────────
  // Saisie clavier dans l'input
  // ──────────────────────────────────────────────────────────────
  function setupInput() {
    COMMAND_INPUT.focus();
    // Un clic dans cette fenêtre rend le focus à son input ; les
    // autres fenêtres gardent le leur (multi-shells)
    root.addEventListener('click', (e) => {
      // Ne pas voler le focus si on clique sur un bouton ou lien
      if (e.target.closest('button, a, .menuContent')) return;
      COMMAND_INPUT.focus();
    });

    COMMAND_INPUT.addEventListener('input', resizeInput);

    // Déplacements du caret sans changement de texte (flèches, Home,
    // End, clic) : le curseur clignotant doit suivre. Le keydown est
    // différé d'un tick pour laisser le caret bouger d'abord.
    for (const key of ['keydown', 'keyup']) {
      COMMAND_INPUT.addEventListener(key, (event) => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          setTimeout(updateCursor, 0);
        }
      });
    }
    COMMAND_INPUT.addEventListener('mouseup', updateCursor);
    COMMAND_INPUT.addEventListener('focus', updateCursor);

    COMMAND_INPUT.addEventListener('keydown', async (event) => {
      // Viewer de CV actif : toutes les touches lui sont capturées
      if (state.viewer) {
        event.preventDefault();
        handleViewerKey(event);
        return;
      }

      // Ctrl+R : entre en recherche inversée, ou passe à la correspondance suivante
      if (event.ctrlKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        if (search.active) cycleSearch();
        else enterSearchMode(COMMAND_INPUT.value);
        return;
      }

      // Touches capturées par le mode recherche
      if (search.active) {
        if (['Enter', 'Escape', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          // Quitte le mode, puis laisse la touche suivre son traitement normal
          exitSearchMode();
        } else if (event.ctrlKey && event.key.toLowerCase() === 'c') {
          // Interruption : abandonne la recherche et la ligne
          event.preventDefault();
          exitSearchMode();
          COMMAND_INPUT.value = '';
          resizeInput();
          return;
        } else if (event.key === 'Backspace') {
          event.preventDefault();
          search.query = search.query.slice(0, -1);
          refreshSearchMatches();
          updateSearchDisplay();
          return;
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          search.query += event.key;
          refreshSearchMatches();
          updateSearchDisplay();
          return;
        } else {
          event.preventDefault();
          return;
        }
      }

      // Ctrl+L : efface l'écran, sans passer par l'historique
      if (event.ctrlKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        handlers.clear();
        return;
      }

      // Ctrl+C : annule la ligne en cours, affiche ^C comme bash
      if (event.ctrlKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        printText(`${DEFAULT_BEGIN_SHELL.textContent}${COMMAND_INPUT.value}^C`);
        COMMAND_INPUT.value = '';
        resizeInput();
        scrollToBottom();
        return;
      }

      // Ctrl+U : vide la ligne en cours
      if (event.ctrlKey && event.key.toLowerCase() === 'u') {
        event.preventDefault();
        COMMAND_INPUT.value = '';
        resizeInput();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const command = COMMAND_INPUT.value;
        COMMAND_INPUT.value = '';
        resizeInput();
        await executeCommand(command);
        scrollToBottom();
        return;
      }

      // Complétion automatique des commandes
      if (event.key === 'Tab') {
        event.preventDefault();
        tabComplete();
        return;
      }

      // Historique : flèche haut / bas
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (state.history.length === 0) return;
        state.historyIndex = Math.max(0, state.historyIndex - 1);
        COMMAND_INPUT.value = state.history[state.historyIndex] ?? '';
        resizeInput();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (state.history.length === 0) return;
        state.historyIndex = Math.min(state.history.length, state.historyIndex + 1);
        COMMAND_INPUT.value = state.history[state.historyIndex] ?? '';
        resizeInput();
        return;
      }
    });

    // État initial
    resizeInput();
    CURRENT_SHELL_LINE.style.display = 'none';
  }

  // ──────────────────────────────────────────────────────────────
  // Contrôles de fenêtre (pastilles rouge / jaune / verte)
  // ──────────────────────────────────────────────────────────────
  function setupWindowControls() {
    const closeBtn    = root.querySelector('.shell__chrome__dot--red');
    const minimizeBtn = root.querySelector('.shell__chrome__dot--yellow');
    const maximizeBtn = root.querySelector('.shell__chrome__dot--green');

    // Jaune : replie la fenêtre sur sa barre de titre. La taille est
    // mémorisée car le drag d'une fenêtre réduite fige sa hauteur
    // (39px) en style inline via le window manager.
    let savedSize = null;
    minimizeBtn.addEventListener('click', () => {
      if (root.classList.contains('minimized')) {
        root.classList.remove('minimized');
        // Si la fenêtre a été déplacée pendant la réduction, le style
        // inline contient height:39px : on rend sa vraie taille
        // (position conservée).
        if (savedSize && root.style.height) {
          root.style.height = `${savedSize.height}px`;
        }
        savedSize = null;
        // Le focus de l'input est perdu à la réduction (la ligne est
        // masquée) : on le rend pour pouvoir taper / naviguer aussitôt
        root.scrollTop = 0;
        COMMAND_INPUT.focus();
        return;
      }
      const rect = root.getBoundingClientRect();
      savedSize = { height: rect.height };
      root.classList.add('minimized');
      root.scrollTop = 0;
    });

    // Vert : bascule plein écran, en mémorisant la géométrie
    let savedGeometry = null;
    maximizeBtn.addEventListener('click', () => {
      if (root.classList.contains('maximized')) {
        root.classList.remove('maximized');
        Object.assign(root.style, savedGeometry ?? {});
        savedGeometry = null;
        return;
      }
      savedGeometry = {
        left: root.style.left, top: root.style.top,
        width: root.style.width, height: root.style.height,
        transform: root.style.transform
      };
      root.classList.add('maximized');
      Object.assign(root.style, {
        left: '0px', top: '0px',
        width: '100vw', height: '100vh',
        transform: 'none'
      });
    });

    // Rouge : ferme la fenêtre
    closeBtn.addEventListener('click', () => {
      if (root.id === 'shellContainer') {
        // Fenêtre principale : masquée, le bouton d'allumage
        // permet de la rallumer (reboot complet)
        root.style.display = 'none';
        const powerBtn = document.getElementById('powerButton');
        if (powerBtn) powerBtn.hidden = false;
        return;
      }
      root.remove();
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Initialisation de cette instance de shell
  // ──────────────────────────────────────────────────────────────
  setupInput();
  setupEasterEgg();
  setupWindowControls();
  loadHistory(options.seedHistory);
  setupMenu(); // garde interne : branché une seule fois

  // Cliquer une fenêtre la ramène au premier plan (multi-fenêtres)
  root.addEventListener('pointerdown', () => bringToFront(root));

  bootedShellApi = { root, input: COMMAND_INPUT, triggerEasterEgg };
  if (options.boot === false) bootedShellApi = null;

  // Drag/resize de la fenêtre (si le module est chargé)
  if (typeof window.initWindowManager === 'function' && SHELL_CHROME) {
    window.initWindowManager({
      target: root,
      handle: SHELL_CHROME
    });
  }

  if (!portfolioData) {
    DEFAULT_TEXT.innerHTML = '<span style="color:#f87171;">Erreur : impossible de charger les données du portfolio.</span>';
    showPrompt();
    COMMAND_INPUT.focus();
    return;
  }

  state.portfolioData = portfolioData;
  state.commands      = portfolioData.commands;
  state.manCommands   = portfolioData.manCommands;
  state.tree          = portfolioData.tree.tree;
  state.currentDir    = portfolioData.tree.currentDir;

  if (options.boot === false) {
    // Fenêtre ouverte via bash : pas de redémarrage complet, on
    // arrive directement sur un prompt avec le neofetch, comme un
    // shell fraîchement ouvert — sauf si un viewer est demandé
    if (options.viewer) {
      const error = enterViewer(options.viewer);
      if (error) {
        printOutput(error);
        showPrompt();
        COMMAND_INPUT.focus();
      }
      return;
    }
    printOutput(cmdNeofetch());
    showPrompt();
    COMMAND_INPUT.focus();
    scrollToBottom();
    return;
  }

  await startPortfolio();
  }

  // ──────────────────────────────────────────────────────────────
  // Chargement des données puis création du shell principal
  // ──────────────────────────────────────────────────────────────
  async function init() {
    // Thème sauvegardé via `set theme` : appliqué avant le boot
    window.PORTFOLIO_THEME.restore();

    try {
      const response = await fetch('./src/JSON/elements.json?v=20261002.6');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      portfolioData = await response.json();
    } catch (err) {
      console.error('Échec du chargement des données :', err);
    }

    await createShell(document.getElementById('shellContainer'));

    // Bouton d'allumage : rallume le terminal après une fermeture
    const powerBtn = document.getElementById('powerButton');
    if (powerBtn) {
      powerBtn.addEventListener('click', () => window.location.reload());
    }
  }

  // Lancement quand le DOM est prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
