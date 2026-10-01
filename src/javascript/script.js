/**
 * Portfolio CLI — Bastien BONORA
 * ----------------------------------------------------------------
 * Ce script gère :
 *   - Le chargement asynchrone des données (elements.json)
 *   - La séquence d'introduction (effet machine à écrire)
 *   - L'analyse et l'exécution des commandes
 *   - Le menu hamburger latéral
 *   - L'easter egg "42"
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
  const escapeHTML = (str) =>
    String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);

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
   * démarrage instantané sans log de boot.
   */
  function spawnShell() {
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

    if (typeof window.initWindowManager === 'function') {
      window.initWindowManager({
        target: clone,
        handle: clone.querySelector('.shell__chrome')
      });
    }

    createShell(clone, { boot: false });
    return null;
  }

  // ──────────────────────────────────────────────────────────────
  // Thème : `set theme <couleur>` recolore tout le portfolio à
  // partir d'une couleur de base (préréglage nommé ou hexadécimal).
  // Les teintes claires/sombres sont déduites automatiquement.
  // ──────────────────────────────────────────────────────────────
  const THEME_KEY = 'portfolioShellTheme';

  const THEME_PRESETS = {
    cyan:   '#22d3ee',
    vert:   '#22c55e',
    rouge:  '#ef4444',
    violet: '#a855f7',
    jaune:  '#eab308',
    orange: '#f97316',
    bleu:   '#3b82f6',
    rose:   '#ec4899',
    blanc:  '#e2e8f0'
  };
  // Alias anglais pour les francophones pressés
  const THEME_ALIASES = {
    green: 'vert', red: 'rouge', purple: 'violet', yellow: 'jaune',
    blue: 'bleu', pink: 'rose', white: 'blanc', magenta: 'rose'
  };

  const clampNumber = (v, min, max) => Math.min(Math.max(v, min), max);

  function hexToRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  function rgbToHsl({ r, g, b }) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rn)      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
      else if (max === gn) h = ((bn - rn) / d + 2) * 60;
      else                 h = ((rn - gn) / d + 4) * 60;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  function hslToHex(h, s, l) {
    s = clampNumber(s, 0, 100) / 100;
    l = clampNumber(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let [rn, gn, bn] = h < 60  ? [c, x, 0]
                     : h < 120 ? [x, c, 0]
                     : h < 180 ? [0, c, x]
                     : h < 240 ? [0, x, c]
                     : h < 300 ? [x, 0, c]
                               : [c, 0, x];
    const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(rn)}${toHex(gn)}${toHex(bn)}`;
  }

  /**
   * Applique une palette complète dérivée d'une couleur de base :
   * accents clairs/foncés, fonds sombres teintés, bordures.
   */
  function applyTheme(hex) {
    const { h, s } = rgbToHsl(hexToRgb(hex));
    const accentL = clampNumber(rgbToHsl(hexToRgb(hex)).l, 45, 85);

    // Accents : clair pour les mises en avant, sombre pour le texte
    // secondaire ; la luminosité de base est bornée pour rester lisible
    const accent       = hslToHex(h, s, accentL);
    const accentStrong = hslToHex(h, s, Math.min(accentL + 12, 92));
    const accentDim    = hslToHex(h, s, Math.max(accentL - 28, 18));

    const { r, g, b } = hexToRgb(accent);

    // Fonds : sombres, faiblement teintés de la couleur de base
    const bgSat = Math.min(s, 32);
    const styles = {
      '--accent':        accent,
      '--accent-strong': accentStrong,
      '--accent-dim':    accentDim,
      '--accent-glow':   `rgba(${r}, ${g}, ${b}, 0.45)`,
      '--bg-base':       hslToHex(h, bgSat, 7),
      '--bg-surface':    hslToHex(h, bgSat, 12),
      '--bg-chrome':     hslToHex(h, bgSat, 5),
      '--bg-hover':      hslToHex(h, bgSat, 20),
      '--border':        `rgba(${r}, ${g}, ${b}, 0.15)`,
      '--border-strong': `rgba(${r}, ${g}, ${b}, 0.30)`,
      '--overlay':       `hsla(${h.toFixed(0)}, ${bgSat}%, 7%, 0.92)`
    };
    for (const [prop, value] of Object.entries(styles)) {
      document.documentElement.style.setProperty(prop, value);
    }
  }

  function resetTheme() {
    for (const prop of [
      '--accent', '--accent-strong', '--accent-dim', '--accent-glow',
      '--bg-base', '--bg-surface', '--bg-chrome', '--bg-hover',
      '--border', '--border-strong', '--overlay'
    ]) {
      document.documentElement.style.removeProperty(prop);
    }
    try { localStorage.removeItem(THEME_KEY); } catch { /* stockage indisponible */ }
  }

  /** Résout une saisie utilisateur (nom ou hexa) en code couleur. */
  function resolveThemeColor(raw) {
    const input = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/^#?[0-9a-f]{6}$/.test(input)) {
      return `#${input.replace('#', '')}`;
    }
    if (/^#?[0-9a-f]{3}$/.test(input)) {
      return `#${[...input.replace('#', '')].map((c) => c + c).join('')}`;
    }
    const name = THEME_ALIASES[input] ?? input;
    return THEME_PRESETS[name] ?? null;
  }

  /** Commande `set theme` : applique, réinitialise ou explique. */
  function setTheme(raw) {
    const input = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (['default', 'defaut', 'reset'].includes(input)) {
      resetTheme();
      return 'thème réinitialisé : cyan (couleur par défaut)';
    }
    const hex = resolveThemeColor(raw);
    if (!hex) {
      const names = Object.keys(THEME_PRESETS).join(', ');
      return `set : couleur inconnue « ${escapeHTML(raw)} »`
           + `<br>Couleurs disponibles : ${names}`
           + '<br>Ou une couleur manuelle en hexadécimal : set theme #ec34f3';
    }
    applyTheme(hex);
    try { localStorage.setItem(THEME_KEY, hex); } catch { /* stockage indisponible */ }
    return `thème appliqué : ${escapeHTML(raw.toLowerCase())} (${hex})`;
  }

  /** Réapplique le thème sauvegardé au chargement de la page. */
  function restoreTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch { /* stockage indisponible */ }
    if (saved && /^#[0-9a-f]{6}$/i.test(saved)) {
      applyTheme(saved);
    }
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
    sessionStart: Date.now()
  };

  // État de la recherche inversée (Ctrl+R)
  const search = {
    active: false,
    query: '',
    matches: [],
    cursor: 0
  };

  // Log de démarrage façon systemd/Debian : les lignes défilent
  // entières et à toute vitesse, comme un vrai boot.
  const BOOT_SEQUENCE = [
    { kind: 'kernel', t: 0.000000, msg: 'Linux portfolio-os 6.1.0-web (bastien@bastienbonora.fr)' },
    { kind: 'kernel', t: 0.042317, msg: 'Command line: init=/bin/portfolio ro quiet splash' },
    { kind: 'kernel', t: 0.139820, msg: 'Initializing cgroup subsys: competences' },
    { kind: 'kernel', t: 0.310475, msg: 'Memory: JS heap calibrated for visitors' },
    { kind: 'ok',     msg: 'Mounted /root filesystem.' },
    { kind: 'ok',     msg: 'Started Shell Emulation Service.' },
    { kind: 'ok',     msg: 'Started Tab-Completion Service.' },
    { kind: 'ok',     msg: 'Started Command History Service.' },
    { kind: 'ok',     msg: 'Started Levenshtein Suggestion Engine.' },
    { kind: 'ok',     msg: 'Mounted /root/certifications.' },
    { kind: 'ok',     msg: 'Mounted /root/competences.' },
    { kind: 'ok',     msg: 'Started TryHackMe Write-up Archive.' },
    { kind: 'ok',     msg: 'Started Neofetch Display Service.' },
    { kind: 'ok',     msg: 'Started Easter Egg Detection Daemon.' },
    { kind: 'fail',   msg: 'Failed to start Coffee.service.' },
    { kind: 'fail',   msg: "See 'systemctl status coffee' for details.", indent: true },
    { kind: 'ok',     msg: 'Reached target Portfolio Shell.' }
  ];

  const BOOT_LINES_NORMAL = [
    'Bienvenue sur le portfolio de BONORA Bastien$',
    'Vous trouverez dans ce terminal toutes les informations me concernant$',
    "tapez 'help' pour afficher les commandes utilisables"
  ];

  // ──────────────────────────────────────────────────────────────
  // Utilitaires d'échappement (XSS) : voir escapeHTML au niveau module
  // ──────────────────────────────────────────────────────────────

  // ──────────────────────────────────────────────────────────────
  // Effet machine à écrire
  // ──────────────────────────────────────────────────────────────
  /**
   * Écrit du texte caractère par caractère dans un élément.
   * Caractères spéciaux : `$` = double saut de ligne, `_` = simple.
   * `ignoreInterrupt` : l'écriture continue même si le boot est
   * interrompu (utilisé par l'easter egg 42, qui interrompt le boot
   * avant d'afficher son propre message).
   */
  const typewrite = (element, text, speed, ignoreInterrupt = false) =>
    new Promise((resolve) => {
      let index = 0;
      const tick = () => {
        if ((state.bootInterrupted && !ignoreInterrupt) || index >= text.length) {
          return resolve();
        }
        const char = text.charAt(index);
        if (char === '$') {
          element.innerHTML += '<br><br>';
        } else if (char === '_') {
          element.innerHTML += '<br>';
        } else {
          element.innerHTML += escapeHTML(char);
        }
        index += 1;
        setTimeout(tick, speed);
      };
      tick();
    });

  // ──────────────────────────────────────────────────────────────
  // Séquence de boot
  // ──────────────────────────────────────────────────────────────
  /**
   * Rend une ligne du log de boot à la manière de systemd :
   * horodatage gris pour le noyau, [ OK ] vert, [FAILED] rouge.
   */
  const bootLineHTML = (line) => {
    if (line.kind === 'kernel') {
      const ts = line.t.toFixed(6).padStart(11, ' ');
      return `<span class="bootTime">[${ts}]</span> ${escapeHTML(line.msg)}`;
    }
    if (line.kind === 'fail') {
      const pad = line.indent ? '         ' : '';
      return `${pad}<span class="bootFail">[FAILED]</span> ${escapeHTML(line.msg)}`;
    }
    return `<span class="bootOk">[  OK  ]</span> ${escapeHTML(line.msg)}`;
  };

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

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

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
   * clignotement ne reprend qu'après une seconde d'inactivité.
   */
  let cursorIdleTimer = null;
  const wakeCursor = () => {
    // animation: none fige le curseur en position "pleine"
    CURSOR.style.animation = 'none';
    clearTimeout(cursorIdleTimer);
    cursorIdleTimer = setTimeout(() => {
      CURSOR.style.animation = '';
    }, 1000);
  };

  const printOutput = (html) => {
    const line = document.createElement('div');
    line.innerHTML = html;
    SHELL_OUTPUT.appendChild(line);
  };

  // ──────────────────────────────────────────────────────────────
  // Persistance de l'historique (localStorage)
  // ──────────────────────────────────────────────────────────────
  const HISTORY_KEY   = 'portfolioShellHistory';
  const HISTORY_LIMIT = 100;

  function persistHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(-HISTORY_LIMIT)));
    } catch {
      // Stockage indisponible (mode privé, etc.) : l'historique
      // reste en mémoire pour la session en cours.
    }
  }

  function loadHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
      if (Array.isArray(saved)) {
        state.history = saved.filter((cmd) => typeof cmd === 'string');
        state.historyIndex = state.history.length;
      }
    } catch {
      // Données corrompues ou stockage indisponible : on repart à zéro
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Dispatcher de commandes
  // ──────────────────────────────────────────────────────────────
  const handlers = {
    help:   cmdHelp,
    clear:  cmdClear,
    pwd:    cmdPwd,
    ls:     cmdLs,
    man:    cmdMan,
    set:    cmdSet,
    open:   cmdOpen,
    rm:     cmdRm,
    get:    cmdGet,
    show:   cmdShow,
    reboot: cmdReboot,
    whoami: cmdWhoami,
    date:   cmdDate,
    history: cmdHistory,
    cd:     cmdCd,
    cat:    cmdCat,
    neofetch: cmdNeofetch,
    sudo:   cmdSudo,
    bash:   cmdBash,
    exit:   cmdExit
  };

  /**
   * Message bash-like pour une commande inconnue, avec suggestion de
   * la commande la plus proche (distance de Levenshtein <= 2).
   */
  function unknownCommandMessage(name) {
    const lowered = name.toLowerCase();
    let best = null;
    let bestDistance = Infinity;
    for (const command of Object.keys(handlers)) {
      const distance = levenshtein(lowered, command);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = command;
      }
    }

    const base = `bash : « ${escapeHTML(name)} » : commande introuvable`;
    if (best && bestDistance <= 2) {
      return `${base}. Vouliez-vous dire : <span class="helpCommand">${escapeHTML(best)}</span> ?`;
    }
    return base;
  }

  /**
   * Distance de Levenshtein entre deux chaînes (version itérative
   * à deux lignes pour économiser la mémoire).
   */
  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    let previous = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const current = [i];
      for (let j = 1; j <= n; j++) {
        current[j] = Math.min(
          previous[j] + 1,                    // suppression
          current[j - 1] + 1,                 // insertion
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)  // substitution
        );
      }
      previous = current;
    }
    return previous[n];
  }

  /**
   * Découpe la commande en `[name, ...args]`
   * et délègue au handler approprié.
   */
  const executeCommand = async (rawCommand) => {
    const trimmed = rawCommand.trim();
    if (!trimmed) {
      printOutput(`${escapeHTML(DEFAULT_BEGIN_SHELL.textContent)}`);
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
  // Commandes
  // ──────────────────────────────────────────────────────────────

  function cmdHelp() {
    // Rendu CLI : nom aligné sur le plus long, description à droite
    const width = Math.max(...state.commands.map((cmd) => cmd.name.length)) + 2;
    return state.commands
      .map((cmd) =>
        `<span class="helpCommand">${escapeHTML(cmd.name.padEnd(width))}</span>${escapeHTML(cmd.description)}`)
      .join('\n');
  }

  function cmdClear() {
    // Vide la sortie en conservant l'élément defaultText (la factory
    // en garde une référence, il ne faut pas le recréer)
    DEFAULT_TEXT.innerHTML = '';
    SHELL_OUTPUT.innerHTML = '';
    SHELL_OUTPUT.appendChild(DEFAULT_TEXT);
    return null;
  }

  function cmdPwd() {
    return escapeHTML(state.currentDir);
  }

  function cmdCd(args) {
    // Sans argument : retour au dossier personnel (/root)
    const target = args[0] ?? '';
    const newPath = target === '' ? '/root' : resolvePath(target);

    const node = navigateTree(newPath);
    if (!node) return `cd : ${escapeHTML(target)} : fichier ou dossier introuvable`;
    if (!isDirectory(node)) return `cd : ${escapeHTML(target)} : n'est pas un dossier`;

    state.currentDir = newPath;
    updatePrompt();
    return null;
  }

  /**
   * Lecture des fichiers réservée au propriétaire (bastien) et au
   * compte anonymous — comme un login FTP anonyme, il a accès en
   * lecture. Tout autre nom d'utilisateur est refusé.
   */
  function canReadFiles() {
    const username = DEFAULT_BEGIN_SHELL.textContent.split('@')[0];
    return username === 'bastien' || username === 'anonymous';
  }

  function cmdCat(args) {
    if (args.length === 0) return 'cat : veuillez donner un argument';

    const target = args[0];
    const node = lookUpTree(target);

    if (node === null) {
      return `cat : ${escapeHTML(target)} : fichier introuvable`;
    }
    if (isDirectory(node)) {
      return `cat : ${escapeHTML(target)} : est un dossier`;
    }
    if (!canReadFiles()) {
      return `cat : ${escapeHTML(target)} : Permission non accordée`;
    }
    if (typeof node !== 'string') {
      return `cat : ${escapeHTML(target)} : fichier binaire (non affichable). Essayez : open`;
    }
    return escapeHTML(node);
  }

  /**
   * Permissions façon ls -l : dossier, lien symbolique ou fichier.
   */
  function lsMode(key, node) {
    if (key === '.' || key === '..' || isDirectory(node)) return 'drwxr-xr-x';
    if (node?.type === 'link') return 'lrwxrwxrwx';
    return '-rw-r--r--';
  }

  /**
   * Taille en octets : réelle pour les fichiers texte, 4096 pour un
   * dossier, valeur stable dérivée du nom pour les fichiers distants.
   */
  function lsSize(key, node) {
    if (key === '.' || key === '..' || isDirectory(node)) return 4096;
    if (typeof node === 'string') return new TextEncoder().encode(node).length;
    return 1024 + [...key].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 900000, 7);
  }

  /**
   * Rendu ls -l : total, puis une ligne par entrée avec droits,
   * liens, propriétaire, groupe, taille, date et nom.
   */
  function lsLong(dir, keys) {
    const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
      'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const now = new Date();
    const date = `${MONTHS[now.getMonth()]} ${String(now.getDate()).padStart(2, ' ')} `
      + `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const rows = keys.map((key) => {
      const node = dir[key];
      const isDir = key === '.' || key === '..' || isDirectory(node);
      const name = isDir
        ? `<span class="lsDir">${escapeHTML(key)}</span>`
        : node?.type === 'link'
          ? `<span class="lsLink">${escapeHTML(key)}</span> -> <span class="lsTarget">${escapeHTML(node.url)}</span>`
          : escapeHTML(key);
      return {
        mode: lsMode(key, node),
        links: isDir ? 2 : 1,
        size: lsSize(key, node),
        name
      };
    });

    const total = rows.reduce((sum, row) => sum + Math.ceil(row.size / 1024), 0);
    const wSize = Math.max(...rows.map((row) => String(row.size).length));
    const lines = rows.map((row) =>
      `${row.mode} ${row.links} bastien bastien ${String(row.size).padStart(wSize)} ${date} ${row.name}`);

    return `total ${total}\n${lines.join('\n')}`;
  }

  function cmdLs(args) {
    const option = args[0] ?? null;
    const dir = navigateTree(state.currentDir);
    if (!dir) return `ls : impossible d'accéder à ${escapeHTML(state.currentDir)}`;

    // Options combinables : -a, -l, -la, -al...
    let flags = '';
    if (option) {
      if (!/^-[al]+$/.test(option)) {
        return `ls : option « ${escapeHTML(option)} » inconnue. Voir : man ls`;
      }
      flags = option.slice(1);
    }
    const showAll = flags.includes('a');

    let keys = Object.keys(dir).filter((key) => {
      if (key === 'type') return false; // champ de métadonnées, pas une entrée
      return showAll || !key.startsWith('.');
    });
    keys = keys.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    if (showAll) keys = ['.', '..', ...keys];

    if (keys.length === 0) return '';

    if (flags.includes('l')) return lsLong(dir, keys);

    // Rendu court ls --color : colonnes alignées, dossiers en couleur
    const width = Math.max(...keys.map((key) => key.length)) + 2;
    return keys
      .map((key) => {
        const isDir = key === '.' || key === '..' || isDirectory(dir[key]);
        const cell = escapeHTML(key.padEnd(width));
        return isDir ? `<span class="lsDir">${cell}</span>` : cell;
      })
      .join('');
  }

  function cmdMan(args) {
    if (args.length === 0) return 'man : veuillez donner au moins un argument';

    const target = args[0].toLowerCase();
    const entry = state.manCommands[target];
    if (!entry) return `man : aucune entrée pour la commande « ${escapeHTML(target)} »`;

    // Rendu façon page de man : NOM, DESCRIPTION, OPTIONS, EXEMPLES,
    // avec l'indentation canonique des pages groff
    const INDENT  = '       ';   // marge gauche des sections
    const HANGING = '              '; // retrait des textes sous option/exemple

    const helpEntry = state.commands.find((c) => c.name === target);

    let out = `<span class="cliSection">${escapeHTML(target.toUpperCase())}(1)</span>\n\n`;

    out += '<span class="cliSection">NOM</span>\n'
         + `${INDENT}<span class="helpCommand">${escapeHTML(target)}</span>`
         + ` — ${escapeHTML(helpEntry?.description ?? '')}\n\n`;

    out += '<span class="cliSection">DESCRIPTION</span>\n'
         + `${INDENT}${escapeHTML(entry.description)}\n\n`;

    if (Array.isArray(entry.options) && entry.options.length > 0) {
      out += '<span class="cliSection">OPTIONS</span>\n';
      for (const opt of entry.options) {
        out += `${INDENT}<span class="helpCommand">${escapeHTML(opt.name)}</span>\n`
             + `${HANGING}${escapeHTML(opt.usage)}\n`;
      }
      out += '\n';
    }

    if (Array.isArray(entry.examples) && entry.examples.length > 0) {
      out += '<span class="cliSection">EXEMPLES</span>\n';
      for (const ex of entry.examples) {
        out += `${INDENT}<span class="helpCommand">$ ${escapeHTML(ex.cmd)}</span>\n`;
        if (ex.desc) out += `${HANGING}${escapeHTML(ex.desc)}\n`;
      }
    }

    return out;
  }

  function cmdSet(args) {
    if (args.length === 0) return 'set : veuillez donner au moins un argument';

    const [key, ...rest] = args;
    if (key === 'username') {
      if (rest.length === 0) return 'set : usage : set username <nom>';
      // Reconstitue le nom (autorise les espaces -> remplacés par _)
      const username = rest.join('_').slice(0, 32); // garde-fou de longueur
      DEFAULT_BEGIN_SHELL.textContent = `${username}@portfolio:${state.currentDir}> `;
      return 'modification effectuée dans le terminal';
    }
    if (key === 'theme') {
      if (rest.length === 0) {
        return 'set : usage : set theme <couleur | #ec34f3> — set theme default pour réinitialiser';
      }
      return setTheme(rest[0]);
    }

    return `set : argument inconnu « ${escapeHTML(key)} »`;
  }

  function cmdOpen(args) {
    if (args.length === 0) return 'open : veuillez donner au moins un argument';

    const target = args[0];
    const node = lookUpTree(target);

    if (node === null) {
      return `open : ${escapeHTML(target)} : fichier introuvable`;
    }
    if (isDirectory(node)) {
      return `open : ${escapeHTML(target)} : est un dossier`;
    }
    if (!canReadFiles()) {
      return `open : ${escapeHTML(target)} : Permission non accordée`;
    }
    if (typeof node === 'string') {
      return `open : ${escapeHTML(target)} : fichier texte. Essayez : cat`;
    }
    if (!isOpenable(node)) {
      return `open : ${escapeHTML(target)} : n'est pas ouvrable`;
    }

    window.open(node.url, '_blank', 'noopener,noreferrer');
    return `ouverture de ${escapeHTML(target)} dans un nouvel onglet...`;
  }

  async function cmdRm(args) {
    if (args[0] !== '*') return `rm : argument inconnu « ${escapeHTML(args[0] ?? '')} »`;

    // Mini scénario : refus de supprimer
    const defaultText = document.createElement('p');
    SHELL_OUTPUT.appendChild(defaultText);
    const message = "Je ne vous permet pas de supprimer mon travail_"
                  + ' Pourquoi faites-vous ça ?'
                  + '_  ..................................................................................';

    await typewrite(defaultText, message, 70);
    await delay(2500);
    SHELL_OUTPUT.innerHTML = '';
    await delay(500);
    cmdReboot();
    return null;
  }

  async function cmdGet(args) {
    if (args.length === 0) return 'get : veuillez donner au moins un argument';

    if (args[0] === 'sha') {
      // Affichage d'un hash unique
      if (args.length > 1) {
        const value = args.slice(1).join(' ');
        const hash  = await sha256(value);
        state.shaCache.set(value, hash);
        return `valeur SHA-256 de « ${escapeHTML(value)} » : <span class="helpCommand">${hash}</span>`;
      }

      // Liste des hashs déjà calculés
      if (state.shaCache.size === 0) {
        return 'get sha : aucun hash calculé. Exemple : get sha MyPassword';
      }

      const entries = [...state.shaCache];
      const width = Math.max(...entries.map(([value]) => value.length)) + 2;
      return entries
        .map(([value, hash]) =>
          `  <span class="helpCommand">${escapeHTML(value.padEnd(width))}</span>${hash}`)
        .join('\n');
    }

    return `get : argument inconnu « ${escapeHTML(args[0])} »`;
  }

  function cmdShow() {
    const projects = ['Nastruire', 'Bastodoc (cette doc)', 'Portfolio (vous y êtes)'];
    return projects.map((p) => `&nbsp;&nbsp;• ${escapeHTML(p)}`).join('<br>');
  }

  function cmdReboot() {
    window.location.reload();
    return null;
  }

  function cmdWhoami() {
    const prompt = DEFAULT_BEGIN_SHELL.textContent;
    const username = prompt.split('@')[0];
    return escapeHTML(username);
  }

  /**
   * Easter egg : on ne devient pas root sur ce portfolio.
   * Refus systématique, à la manière du vrai sudo.
   */
  function cmdSudo() {
    const username = DEFAULT_BEGIN_SHELL.textContent.split('@')[0];
    return `<span style="color:var(--warning);">sudo :</span> ${escapeHTML(username)} n'est pas dans le fichier sudoers. Cet incident sera signalé.`;
  }

  /**
   * Ouvre une nouvelle fenêtre de shell, comme le lancement d'un
   * bash dans un terminal.
   */
  function cmdBash() {
    const error = spawnShell();
    if (error) return error;
    return 'bash : nouvelle fenêtre de shell ouverte';
  }

  /**
   * Ferme la fenêtre courante — sauf la fenêtre principale, qui est
   * le portfolio lui-même.
   */
  function cmdExit() {
    if (root.id === 'shellContainer') {
      return 'exit : impossible de fermer le shell principal. Utilisez la pastille rouge.';
    }
    // Laisse le temps à l'écho de la commande de s'afficher
    setTimeout(() => root.remove(), 50);
    return 'exit';
  }

  function cmdDate() {
    return escapeHTML(new Date().toString());
  }

  function cmdHistory() {
    if (state.history.length === 0) {
      return 'history : aucune commande enregistrée pour le moment';
    }
    return state.history
      .map((cmd, index) =>
        `<span style="color:var(--text-muted);">${String(index + 1).padStart(3)} </span> ${escapeHTML(cmd)}`)
      .join('<br>');
  }

  // ──────────────────────────────────────────────────────────────
  // neofetch
  // ──────────────────────────────────────────────────────────────
  /** Durée de session lisible : "42s", "3m 12s", "2h 4m". */
  function formatUptime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  /** Nom de navigateur simplifié, pour la ligne "Terminal". */
  function browserName() {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
    if (ua.includes('Chrome')) return 'Chromium';
    if (ua.includes('Safari')) return 'Safari';
    return 'web';
  }

  function cmdNeofetch() {
    const username = DEFAULT_BEGIN_SHELL.textContent.split('@')[0];
    const uptime = formatUptime(Date.now() - state.sessionStart);

    const art = [
      '    .----------------.',
      "    | o o | portfolio |",
      "    |----------------|",
      "    |  > _           |",
      "    |                |",
      "    '----------------'"
    ].join('\n');

    const palette = ['#ef4444', '#f59e0b', '#10b981', '#22d3ee', '#67e8f9', '#94a3b8', '#e2e8f0']
      .map((color) => `<span class="paletteBlock" style="background:${color};"></span>`)
      .join('');

    const info = [
      `<div class="neofetchTitle">${escapeHTML(username)}@portfolio</div>`,
      '<div class="neofetchSep">------------------</div>',
      `<div><span class="neofetchKey">OS</span> Portfolio OS x86_64</div>`,
      `<div><span class="neofetchKey">Host</span> bastienbonora.fr</div>`,
      `<div><span class="neofetchKey">Kernel</span> portfolio-1.0.0 (web)</div>`,
      `<div><span class="neofetchKey">Uptime</span> ${uptime}</div>`,
      `<div><span class="neofetchKey">Shell</span> portfolio-sh</div>`,
      `<div><span class="neofetchKey">Terminal</span> ${browserName()}</div>`,
      `<div><span class="neofetchKey">Compétences</span> Réseaux • Cybersécurité • Admin Sys • Linux</div>`,
      `<div><span class="neofetchKey">GitHub</span> github.com/Fracorbas02</div>`,
      `<div class="neofetchPalette">${palette}</div>`
    ].join('');

    return `
      <div class="neofetchOutput">
        <pre class="neofetchArt">${escapeHTML(art)}</pre>
        <div class="neofetchInfo">${info}</div>
      </div>`;
  }

  // ──────────────────────────────────────────────────────────────
  // Navigation arborescence
  // ──────────────────────────────────────────────────────────────
  function navigateTree(path) {
    const segments = path.split('/').filter(Boolean);
    let node = state.tree;
    for (const segment of segments) {
      node = node?.[segment];
      if (!node) return null;
    }
    return node;
  }

  /**
   * Résout un chemin (absolu ou relatif au dossier courant) en
   * chemin absolu normalisé : gère ".", ".." et les segments vides.
   */
  function resolvePath(path) {
    const base = path.startsWith('/') ? path : `${state.currentDir}/${path}`;
    const stack = [];
    for (const segment of base.split('/')) {
      if (!segment || segment === '.') continue;
      if (segment === '..') {
        stack.pop();
        continue;
      }
      stack.push(segment);
    }
    return `/${stack.join('/')}`;
  }

  /**
   * Un dossier est un objet de l'arbre sans champ "type" (la racine)
   * ou avec type "directory". Les fichiers ({ type: "file" }) et les
   * liens ({ type: "link" }) ne sont pas des dossiers.
   */
  function isDirectory(node) {
    return node !== null && typeof node === 'object'
      && !Array.isArray(node)
      && (!node.type || node.type === 'directory');
  }

  /**
   * Un élément ouvrable par open : fichier local ou lien externe.
   */
  function isOpenable(node) {
    return node?.type === 'file' || node?.type === 'link';
  }

  /**
   * Résout un chemin dans l'arbre et renvoie le nœud cible, ou null
   * s'il n'existe pas. Le champ "type" est une métadonnée, pas un
   * fichier : il n'est jamais résolu.
   */
  function lookUpTree(target) {
    const path = resolvePath(target);
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (name === 'type') return null;

    const parentPath = path.slice(0, path.lastIndexOf('/')) || '/';
    const parent = navigateTree(parentPath);
    const node = name ? parent?.[name] : parent;
    return node === undefined || node === null ? null : node;
  }

  /**
   * Reconstruit la ligne de prompt avec le dossier courant.
   */
  function updatePrompt() {
    const username = DEFAULT_BEGIN_SHELL.textContent.split('@')[0];
    DEFAULT_BEGIN_SHELL.textContent = `${username}@portfolio:${state.currentDir}> `;
  }

  // ──────────────────────────────────────────────────────────────
  // SHA-256 (Web Crypto)
  // ──────────────────────────────────────────────────────────────
  async function sha256(message) {
    const buffer = new TextEncoder().encode(message);
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
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
    cmdClear();
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
  function applyCompletion(candidates, lastWord, before) {
    if (candidates.length === 0) return;

    if (candidates.length === 1) {
      COMMAND_INPUT.value = `${before}${candidates[0]} `;
    } else {
      let prefix = candidates[0];
      for (const name of candidates) {
        while (!name.startsWith(prefix)) prefix = prefix.slice(0, -1);
      }
      COMMAND_INPUT.value = `${before}${prefix.length > lastWord.length ? prefix : lastWord}`;
      printOutput(candidates
        .map((name) => `<span class="helpCommand">${escapeHTML(name)}</span>`)
        .join('&nbsp;&nbsp;'));
      scrollToBottom();
    }
    resizeInput();
  }

  /**
   * Candidats de complétion pour le dernier argument d'une commande.
   */
  function argumentCandidates(command, prefix) {
    let pool = [];
    switch (command) {
      case 'open': {
        const dir = navigateTree(state.currentDir);
        pool = Object.keys(dir ?? {})
          .filter((key) => key !== 'type')
          .filter((key) => isOpenable(dir[key]));
        break;
      }
      case 'man':  pool = Object.keys(state.manCommands ?? {}); break;
      case 'set':  pool = ['username']; break;
      case 'get':  pool = ['sha']; break;
      case 'ls':   pool = ['-a', '-l', '-la']; break;
      case 'rm':   pool = ['*']; break;
      case 'cd': {
        const dir = navigateTree(state.currentDir);
        pool = Object.keys(dir ?? {})
          .filter((key) => key !== 'type')
          .filter((key) => isDirectory(dir[key]));
        break;
      }
      case 'cat': {
        const dir = navigateTree(state.currentDir);
        pool = Object.keys(dir ?? {})
          .filter((key) => key !== 'type')
          .filter((key) => typeof dir[key] === 'string');
        break;
      }
      default: return [];
    }
    return pool.filter((name) => name.startsWith(prefix));
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
    applyCompletion(argumentCandidates(command.toLowerCase(), lastWord), lastWord, before);
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
        cmdClear();
        return;
      }

      // Ctrl+C : annule la ligne en cours, affiche ^C comme bash
      if (event.ctrlKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        printOutput(`${escapeHTML(DEFAULT_BEGIN_SHELL.textContent)}${escapeHTML(COMMAND_INPUT.value)}^C`);
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
        return;
      }
      const rect = root.getBoundingClientRect();
      savedSize = { height: rect.height };
      root.classList.add('minimized');
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
  loadHistory();
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
    // shell fraîchement ouvert
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
    restoreTheme();

    try {
      const response = await fetch('./src/JSON/elements.json?v=20260930');
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
