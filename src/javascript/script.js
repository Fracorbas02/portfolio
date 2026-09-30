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
    historyIndex: -1
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

    CURRENT_SHELL_LINE.style.display = 'flex';
    COMMAND_INPUT.focus();
  };

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // ──────────────────────────────────────────────────────────────
  // Affichage et état de la ligne courante
  // ──────────────────────────────────────────────────────────────
  const scrollToBottom = () => {
    SHELL_OUTPUT.scrollTop = SHELL_OUTPUT.scrollHeight;
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
    date:   cmdDate
  };

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

    const [name, ...args] = trimmed.split(/\s+/);
    const handler = handlers[name.toLowerCase()];

    let output;
    try {
      output = handler ? await handler(args) : `bash: « ${escapeHTML(name)} » : commande introuvable`;
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
    const links = {
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

    const url = links[target];
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

  function cmdDate() {
    return escapeHTML(new Date().toString());
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
    CURRENT_SHELL_LINE.style.display = 'flex';
    COMMAND_INPUT.focus();
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
      if (event.key === 'Enter') {
        event.preventDefault();
        const command = COMMAND_INPUT.value;
        COMMAND_INPUT.value = '';
        resizeInput();
        await executeCommand(command);
        scrollToBottom();
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
      CURRENT_SHELL_LINE.style.display = 'flex';
    }
  }

  // Lancement quand le DOM est prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();