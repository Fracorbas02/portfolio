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
  // Références DOM
  // ──────────────────────────────────────────────────────────────
  const COMMAND_INPUT       = document.getElementById('commandInput');
  const CURSOR              = document.querySelector('.cursor');
  const DEFAULT_BEGIN_SHELL = document.getElementById('defaultBeginShellLine');
  const SEARCH_LABEL         = document.getElementById('searchLabel');
  const SHELL_CONTAINER     = document.getElementById('shellContainer');
  const SHELL_CHROME        = document.getElementById('shellChrome');
  const SHELL_OUTPUT        = document.getElementById('shellOutput');
  const CURRENT_SHELL_LINE  = document.querySelector('.currentShellLine');
  const HAMBURGER           = document.getElementById('hamburgerMenu');
  const MENU_CONTENT        = document.getElementById('menuContent');
  const ACCORDIONS          = document.querySelectorAll('.accordion');
  const PANEL_BUTTONS       = document.querySelectorAll('.panelButton');

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

  const BOOT_LINES_FAST = [
    'portfolio initialisation ............................................',
    'please wait a moment, I have to figure out something..........',
    'portfolio created, ready to display informations........'
  ];

  const BOOT_LINES_NORMAL = [
    'Bienvenue sur le portfolio de BONORA Bastien$',
    'Vous trouverez dans ce terminal toutes les informations me concernant$',
    "tapez 'help' pour afficher les commandes utilisables"
  ];

  // Cibles acceptées par la commande open (voir cmdOpen)
  const OPEN_LINKS = {
    cv:        './root/presentation/CV/CV_Bastien_BONORA_2025.pdf',
    nastruire: 'https://nastruire.fr',
    linkedin:  'https://www.linkedin.com/in/bastien-bonora/',
    github:    'https://github.com/Fracorbas02',
    tryhackme: 'https://tryhackme.com/p/Fracorbas',
    thm:       'https://tryhackme.com/p/Fracorbas',
    pgp:       './root/presentation/pubkey',
    docs:      'https://docs.bastienbonora.fr',
    bastodoc:  'https://docs.bastienbonora.fr'
  };

  // ──────────────────────────────────────────────────────────────
  // Utilitaires d'échappement (XSS)
  // ──────────────────────────────────────────────────────────────
  const escapeHTML = (str) =>
    String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);

  // ──────────────────────────────────────────────────────────────
  // Effet machine à écrire
  // ──────────────────────────────────────────────────────────────
  /**
   * Écrit du texte caractère par caractère dans un élément.
   * Caractères spéciaux : `$` = double saut de ligne, `_` = simple.
   */
  const typewrite = (element, text, speed) =>
    new Promise((resolve) => {
      let index = 0;
      const tick = () => {
        if (state.bootInterrupted || index >= text.length) {
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
  const startPortfolio = async () => {
    const defaultText = document.getElementById('defaultText');

    for (const line of BOOT_LINES_FAST) {
      if (state.bootInterrupted) break;
      await typewrite(defaultText, line, 10);
      await delay(800);
      defaultText.innerHTML = '';
    }

    for (const line of BOOT_LINES_NORMAL) {
      if (state.bootInterrupted) break;
      await typewrite(defaultText, line, 20);
      await delay(800);
    }

    showPrompt();
    COMMAND_INPUT.focus();
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
    // Le curseur, en flow flex juste après, suit naturellement.
    const len = COMMAND_INPUT.value.length;
    COMMAND_INPUT.style.width = `${Math.max(0, len)}ch`;
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
    sudo:   cmdSudo
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

    let output;
    try {
      output = handler ? await handler(args) : unknownCommandMessage(name);
    } catch (err) {
      console.error(err);
      output = `<span style="color:#f87171;">Une erreur est survenue lors de l'exécution.</span>`;
    }

    const promptHTML = `${escapeHTML(DEFAULT_BEGIN_SHELL.textContent)}${escapeHTML(trimmed)}`;
    printOutput(output ? `${promptHTML}<br>${output}` : promptHTML);
  };

  // ──────────────────────────────────────────────────────────────
  // Commandes
  // ──────────────────────────────────────────────────────────────

  function cmdHelp() {
    let rows = '';
    for (const cmd of state.commands) {
      rows += `
        <tr>
          <td class="helpCommand">${escapeHTML(cmd.name)}</td>
          <td>${escapeHTML(cmd.description)}</td>
        </tr>`;
    }
    return `
      <table class="helpOutput">
        <thead>
          <tr><th>Commande</th><th>Description</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function cmdClear() {
    SHELL_OUTPUT.innerHTML = '<p id="defaultText"></p>';
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

  function cmdCat(args) {
    if (args.length === 0) return 'cat : veuillez donner un argument';

    const target = args[0];
    const path = resolvePath(target);
    const parentPath = path.slice(0, path.lastIndexOf('/')) || '/';
    const name = path.slice(path.lastIndexOf('/') + 1);

    // Le nœud cible : soit un enfant du dossier parent, soit la racine
    const parent = navigateTree(parentPath);
    const node = name ? parent?.[name] : parent;

    if (node === undefined || node === null) {
      return `cat : ${escapeHTML(target)} : fichier introuvable`;
    }
    if (isDirectory(node)) {
      return `cat : ${escapeHTML(target)} : est un dossier`;
    }
    if (Array.isArray(node)) {
      return `cat : ${escapeHTML(target)} : fichier binaire (non affichable). Essayez : open`;
    }
    return escapeHTML(String(node));
  }

  function cmdLs(args) {
    const option = args[0] ?? null;
    const dir = navigateTree(state.currentDir);
    if (!dir) return `ls : impossible d'accéder à ${escapeHTML(state.currentDir)}`;

    const entries = Object.keys(dir).filter((key) => {
      if (option === '-a') return true;
      if (option === null) return !key.startsWith('.');
      return false;
    });

    if (option && option !== '-a') {
      return `ls : option « ${escapeHTML(option)} » inconnue. Voir : man ls`;
    }

    let rows = '';
    for (const key of entries) {
      const entry = dir[key];
      const type = entry?.type ?? (Array.isArray(entry) ? 'array' : typeof entry);
      rows += `
        <tr>
          <td class="helpCommand">${escapeHTML(key)}</td>
          <td>${escapeHTML(type)}</td>
        </tr>`;
    }

    return `
      <table class="helpOutput">
        <thead>
          <tr><th>Élément</th><th>Type</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function cmdMan(args) {
    if (args.length === 0) return 'man : veuillez donner au moins un argument';

    const target = args[0].toLowerCase();
    const entry = state.manCommands[target];
    if (!entry) return `man : aucune entrée pour la commande « ${escapeHTML(target)} »`;

    let rows = '';
    for (const opt of entry.options) {
      rows += `
        <tr>
          <td class="helpCommand">${escapeHTML(opt.name)}</td>
          <td>${escapeHTML(opt.usage)}</td>
        </tr>`;
    }

    return `
      ${escapeHTML(entry.description)}
      <table class="helpOutput">
        <thead>
          <tr><th>Variable</th><th>Utilisation</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
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

    return `set : argument inconnu « ${escapeHTML(key)} »`;
  }

  function cmdOpen(args) {
    if (args.length === 0) return 'open : veuillez donner au moins un argument';

    const target = args[0].toLowerCase();
    const url = OPEN_LINKS[target];
    if (!url) return `open : argument inconnu « ${escapeHTML(target)} »`;

    window.open(url, '_blank', 'noopener,noreferrer');
    return 'ouverture en cours...';
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

      let rows = '';
      for (const [value, hash] of state.shaCache) {
        rows += `
          <tr>
            <td class="helpCommand">${escapeHTML(value)}</td>
            <td>${hash}</td>
          </tr>`;
      }
      return `
        <table class="helpOutput">
          <thead>
            <tr><th>Mot en clair</th><th>Hash SHA-256</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
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
      `<div><span class="neofetchKey">Compétences</span> Réseaux • Cybersécurité • Python • JS</div>`,
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
   * Un dossier est un objet non tableau dans l'arbre (avec ou sans
   * champ "type" — la racine n'en a pas).
   */
  function isDirectory(node) {
    return node !== null && typeof node === 'object' && !Array.isArray(node);
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
    let sequence = '';
    document.addEventListener('keydown', (event) => {
      if (COMMAND_INPUT.value !== '') {
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
        triggerEasterEgg();
      }
    });
  }

  async function triggerEasterEgg() {
    state.bootInterrupted = true;
    cmdClear();
    const defaultText = document.getElementById('defaultText');
    await delay(400);
    await typewrite(defaultText, 'THE HOLY VALUE OF 42', 70);
    await typewrite(defaultText, '_The answer to life, the universe and everything.', 35);
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
      case 'open': pool = Object.keys(OPEN_LINKS); break;
      case 'man':  pool = Object.keys(state.manCommands ?? {}); break;
      case 'set':  pool = ['username']; break;
      case 'get':  pool = ['sha']; break;
      case 'ls':   pool = ['-a']; break;
      case 'rm':   pool = ['*']; break;
      case 'cd': {
        const dir = navigateTree(state.currentDir);
        pool = Object.keys(dir ?? {}).filter((key) => isDirectory(dir[key]));
        break;
      }
      case 'cat': {
        const dir = navigateTree(state.currentDir);
        pool = Object.keys(dir ?? {}).filter((key) => !isDirectory(dir[key]));
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
    document.addEventListener('click', (e) => {
      // Ne pas voler le focus si on clique sur un bouton ou lien
      if (e.target.closest('button, a, .menuContent')) return;
      COMMAND_INPUT.focus();
    });

    COMMAND_INPUT.addEventListener('input', resizeInput);

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
  // Initialisation
  // ──────────────────────────────────────────────────────────────
  async function init() {
    setupInput();
    setupMenu();
    setupEasterEgg();
    loadHistory();

    // Active drag/resize sur la fenêtre du terminal (si le module est chargé)
    if (typeof window.initWindowManager === 'function' && SHELL_CHROME) {
      window.initWindowManager({
        target: SHELL_CONTAINER,
        handle: SHELL_CHROME
      });
    }

    try {
      const response = await fetch('./src/JSON/elements.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      state.portfolioData = data;
      state.commands      = data.commands;
      state.manCommands   = data.manCommands;
      state.tree          = data.tree.tree;
      state.currentDir    = data.tree.currentDir;

      await startPortfolio();
    } catch (err) {
      console.error('Échec du chargement des données :', err);
      const defaultText = document.getElementById('defaultText');
      defaultText.innerHTML = '<span style="color:#f87171;">Erreur : impossible de charger les données du portfolio.</span>';
      showPrompt();
    }
  }

  // Lancement quand le DOM est prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();