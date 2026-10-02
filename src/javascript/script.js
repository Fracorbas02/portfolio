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
    viewer: null,
    pager: null,
    variables: {},
    // Alias persistés (localStorage) : chargés ici, écrits par les
    // commandes alias/unalias (commands.js) via la même clé. Une
    // valeur corrompue (chaîne, nombre, tableau) est ignorée : un
    // objet est attendu, jamais autre chose.
    aliases: (() => {
      try {
        const stored = JSON.parse(localStorage.getItem('portfolioShellAliases'));
        return (typeof stored === 'object' && stored !== null && !Array.isArray(stored))
          ? stored : {};
      } catch { return {}; }
    })()
  };

  // Nom d'utilisateur persisté (set username) : la fenêtre démarre
  // avec le dernier nom choisi, comme un profil conservé d'une
  // visite à l'autre — même clé que set username (commands.js)
  try {
    const savedUsername = localStorage.getItem('portfolioShellUsername');
    if (typeof savedUsername === 'string' && savedUsername !== '') {
      DEFAULT_BEGIN_SHELL.textContent = `${savedUsername}@portfolio:/root> `;
    }
  } catch { /* localStorage indisponible : prompt par défaut */ }

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

  /**
   * Ouvre la page #index d'un flux en mode lecture (pager).
   * source = viewer d'où vient la demande ('blog', 'docs') : le
   * flux correspondant fournit la page et son rendu — les deux
   * partagent le même moteur (blogFeed.js).
   */
  const enterReadMode = (source, index) => {
    const feeds = {
      blog: window.PORTFOLIO_BLOG_FEED,
      docs: window.PORTFOLIO_DOCS_FEED
    };
    const feed = feeds[source] ?? window.PORTFOLIO_BLOG_FEED;
    const item = feed?.items?.[index];
    if (!item) return;
    const render = feed.renderArticle ?? window.PORTFOLIO_BLOG_FEED.renderArticle;
    enterPager({
      title: item.title,
      label: 'Lecture',
      url: item.link,
      overlay: true,
      html: render(item)
    });
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

  // ──────────────────────────────────────────────────────────────
  // Pager des pages man : plein écran façon less, q pour quitter.
  // L'écran du shell est sauvegardé au moment d'entrer et restitué
  // à la sortie, comme l'écran alternatif du vrai less.
  // ──────────────────────────────────────────────────────────────
  function enterPager(page) {
    // Mode lecture (page.overlay) : le pager se superpose au viewer
    // ouvert sans détruire son DOM — les animations du panneau
    // latéral continuent leur vie derrière la lecture.
    const overlay = !!page.overlay;
    state.pager = {
      title: page.title,
      label: page.label ?? 'Manuel',
      url: page.url ?? null,
      overlay,
      content: null,
      // Recherche « / » : null = pas de recherche, { active }
      // = saisie du motif en cours, hits = occurrences surlignées
      search: null,
      saved: overlay ? null : SHELL_OUTPUT.innerHTML,
      savedScroll: overlay ? SHELL_OUTPUT.scrollTop : null
    };
    root.classList.add('viewerMode');
    if (overlay) {
      const el = document.createElement('div');
      el.className = 'manPager manPagerOverlay';
      el.innerHTML = `<div class="manPagerContent">${page.html}</div>`;
      SHELL_OUTPUT.appendChild(el);
      // La barre de statut vit dans la fenêtre (root), pas dans
      // l'overlay : l'overlay s'arrête au bas de la sortie, au-des-
      // sus de la ligne de prompt invisible (opacity: 0, elle garde
      // le focus clavier) — collée dans l'overlay, la barre flotte-
      // rait au-dessus de cette zone. Dans root, elle s'ancre au
      // bas de la fenêtre comme la barre des pages man.
      const bar = document.createElement('div');
      bar.className = 'cvViewerBar manPagerStatus';
      root.appendChild(bar);
      // Le viewer derrière peut être défilé : l'overlay se place sur
      // la zone visible, pas sur le contenu.
      SHELL_OUTPUT.scrollTop = 0;
      state.pager.content = el.querySelector('.manPagerContent');
      root.classList.add('reading');
    } else {
      SHELL_OUTPUT.classList.add('booting');
      SHELL_OUTPUT.innerHTML =
        `<div class="manPager"><div class="manPagerContent">${page.html}</div></div>`
        + '<div class="cvViewerBar manPagerStatus"></div>';
      state.pager.content = SHELL_OUTPUT.querySelector('.manPagerContent');
    }
    COMMAND_INPUT.value = '';
    resizeInput();
    updatePagerStatus();
    COMMAND_INPUT.focus();
  }

  /**
   * Titres de section du pager : h lines des articles en lecture,
   * sections NOM/DESCRIPTION… des pages man — de quoi dessiner le
   * sommaire (touche s).
   */
  const pagerHeadings = () =>
    state.pager?.content
      ? [...state.pager.content.querySelectorAll('.cliSection')]
      : [];

  /** Barre du bas : titre, position, rappel des touches. */
  function updatePagerStatus() {
    const bar = root.querySelector('.manPagerStatus');
    const content = state.pager?.content;
    if (!bar || !content) return;

    // Saisie d'un motif de recherche (/) : la barre devient la
    // ligne de saisie du motif, comme la ligne basse du vrai less
    const search = state.pager.search;
    if (search?.active) {
      bar.innerHTML = `/<span class="helpCommand">${escapeHTML(search.query)}</span>`
        + '&nbsp;&nbsp;⏎ chercher · ⎋ annuler · retour arrière efface';
      return;
    }

    const max = content.scrollHeight - content.clientHeight;
    const atEnd = max <= 0 || content.scrollTop >= max - 2;
    const label = state.pager.label ?? 'Manuel';
    let html = `${label} <span class="helpCommand">${escapeHTML(state.pager.title)}</span> — `
      + (atEnd ? '(FIN)' : `${Math.round((content.scrollTop / max) * 100)}%`);
    if (search && search.hits.length > 0) {
      html += `&nbsp;&nbsp;/${escapeHTML(search.query)} : ${search.hits.length} occurrence(s)`
        + '&nbsp;&nbsp;<span class="helpCommand">n</span>/<span class="helpCommand">N</span> suivante/précédente';
    } else if (search) {
      html += `&nbsp;&nbsp;/${escapeHTML(search.query)} : aucune occurrence`;
    }
    if (state.pager.url) {
      html += '&nbsp;&nbsp;^C ouvrir dans le navigateur';
    }
    html += '&nbsp;&nbsp;↑↓ défiler · PgUp/PgDn page · / rechercher';
    if (pagerHeadings().length >= 2) {
      html += `&nbsp;&nbsp;<span class="helpCommand">s</span> sommaire`;
    }
    html += `&nbsp;&nbsp;<span class="helpCommand">q</span> quitter`;
    bar.innerHTML = html;
  }

  /** Quitte le pager et restitue l'écran du shell. */
  function quitPager() {
    const bar = root.querySelector('.manPagerStatus');
    if (bar) bar.remove();
    if (state.pager?.overlay) {
      // Lecture par-dessus un viewer : on rend la main au viewer,
      // dont le DOM et ses animations sont restés intacts. Son
      // défilement d'avant lecture est restitué.
      root.classList.remove('reading');
      SHELL_OUTPUT.querySelector('.manPagerOverlay')?.remove();
      SHELL_OUTPUT.scrollTop = state.pager.savedScroll ?? 0;
      state.pager = null;
      COMMAND_INPUT.focus();
      return;
    }
    root.classList.remove('viewerMode');
    SHELL_OUTPUT.innerHTML = state.pager?.saved ?? '';
    state.pager = null;
    showPrompt();
    scrollToBottom();
    COMMAND_INPUT.focus();
  }

  // ──────────────────────────────────────────────────────────────
  // Recherche « / » du pager — les nœuds texte portent les
  // surlignages, le DOM existant (images, code coloré) n'est
  // jamais reconstruit.
  // ──────────────────────────────────────────────────────────────

  /** Retire les surlignages d'une recherche précédente. */
  function clearSearchHighlights(content) {
    content.querySelectorAll('span.readSearchHit').forEach((span) => {
      const parent = span.parentNode;
      parent.replaceChild(document.createTextNode(span.textContent), span);
      parent.normalize();
    });
  }

  /**
   * Surligne chaque occurrence du motif, sans tenir compte de la
   * casse (plus permissif que less, pour une lecture détendue).
   * Chaque occurrence est enveloppée d'un span dans l'ordre du
   * document ; renvoie la liste des occurrences trouvées.
   */
  function highlightMatches(content, query) {
    const needle = query.toLowerCase();
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    const hits = [];
    for (const node of textNodes) {
      const haystack = node.textContent.toLowerCase();
      if (!haystack.includes(needle)) continue;
      const text = node.textContent;
      const fragment = document.createDocumentFragment();
      let pos = 0;
      let index = haystack.indexOf(needle);
      while (index !== -1) {
        fragment.appendChild(document.createTextNode(text.slice(pos, index)));
        const span = document.createElement('span');
        span.className = 'readSearchHit';
        span.textContent = text.slice(index, index + needle.length);
        fragment.appendChild(span);
        hits.push(span);
        pos = index + needle.length;
        index = haystack.indexOf(needle, pos);
      }
      fragment.appendChild(document.createTextNode(text.slice(pos)));
      node.parentNode.replaceChild(fragment, node);
    }
    return hits;
  }

  /** Saute à l'occurrence suivante (n) ou précédente (N). */
  function jumpToSearchHit(delta) {
    const search = state.pager?.search;
    if (!search || search.hits.length === 0) return;
    search.current = (search.current + delta + search.hits.length) % search.hits.length;
    search.hits.forEach((span, i) =>
      span.classList.toggle('readSearchHit--current', i === search.current));
    search.hits[search.current].scrollIntoView({ block: 'center' });
    updatePagerStatus();
  }

  /** Valide le motif saisi et lance la recherche dans le pager. */
  function executePagerSearch() {
    const pager = state.pager;
    pager.search.active = false;
    clearSearchHighlights(pager.content);
    pager.search.hits = pager.search.query === ''
      ? []
      : highlightMatches(pager.content, pager.search.query);
    pager.search.current = -1;
    if (pager.search.hits.length > 0) {
      jumpToSearchHit(1);   // amène directement à la première occurrence
    } else {
      updatePagerStatus();
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Sommaire du pager (touche s) : titres cliquables de la page —
  // ⏎ sur un titre saute à la section correspondante.
  // ──────────────────────────────────────────────────────────────

  /** Amène le pager sur le titre d'indice donné (data-idx). */
  const jumpToHeading = (index) => {
    const target = pagerHeadings()[Number(index)];
    if (target) target.scrollIntoView({ block: 'start' });
  };

  /** Ouvre le sommaire, ou le referme s'il est déjà affiché. */
  function togglePagerToc() {
    const existing = root.querySelector('.readToc');
    if (existing) {
      existing.remove();
      updatePagerStatus();
      return;
    }
    // Un sommaire n'a de sens qu'à partir de deux titres
    if (pagerHeadings().length < 2) return;

    const toc = document.createElement('div');
    toc.className = 'readToc';
    toc.innerHTML = pagerHeadings()
      .map((el, i) => `<div class="readTocItem" data-idx="${i}">${escapeHTML(el.textContent)}</div>`)
      .join('');
    state.pager.content.parentElement.appendChild(toc);
    toc.querySelector('.readTocItem')?.classList.add('readTocItem--selected');
    COMMAND_INPUT.focus();
  }

  /** Clavier du sommaire : ↑↓ sélectionnent, ⏎ saute, ⎋ referme. */
  function handlePagerTocKey(event, tocEl) {
    event.preventDefault();
    const items = [...tocEl.querySelectorAll('.readTocItem')];
    const current = items.findIndex((el) =>
      el.classList.contains('readTocItem--selected'));
    const select = (index) => {
      items.forEach((el, i) => el.classList.toggle('readTocItem--selected', i === index));
      items[index]?.scrollIntoView({ block: 'nearest' });
    };

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      select((current + delta + items.length) % items.length);
      return;
    }
    if (event.key === 'Enter') {
      jumpToHeading(items[current]?.dataset.idx);
      tocEl.remove();
      updatePagerStatus();
      return;
    }
    if (event.key === 'Escape' || event.key === 'q' || event.key === 's') {
      tocEl.remove();
      updatePagerStatus();
    }
  }

  /** Clavier du pager : flèches, pages, g/G, q ou Échap. */
  function handlePagerKey(event) {
    const content = state.pager?.content;
    if (!content) return;

    // Saisie du motif de recherche (/) : toutes les touches lui
    // appartiennent jusqu'à ⏎ ou ⎋
    if (state.pager.search?.active) {
      event.preventDefault();
      const search = state.pager.search;
      if (event.key === 'Enter') {
        executePagerSearch();
      } else if (event.key === 'Escape') {
        state.pager.search = null;
        updatePagerStatus();
      } else if (event.key === 'Backspace') {
        search.query = search.query.slice(0, -1);
        updatePagerStatus();
      } else if (event.key.length === 1
          && !event.ctrlKey && !event.metaKey && !event.altKey) {
        search.query += event.key;
        updatePagerStatus();
      }
      return;
    }

    // Sommaire affiché : le clavier lui appartient
    const tocEl = root.querySelector('.readToc');
    if (tocEl) {
      handlePagerTocKey(event, tocEl);
      return;
    }

    // ^C dans une lecture : ouvre l'article original dans le
    // navigateur, comme le ^C du viewer ouvre le site du blog
    if (event.ctrlKey && event.key.toLowerCase() === 'c' && state.pager.url
        && window.PORTFOLIO_HTML.isSafeHref(state.pager.url)) {
      event.preventDefault();
      window.open(state.pager.url, '_blank', 'noopener,noreferrer');
      quitPager();
      return;
    }

    // « / » : saisie du motif de recherche, façon less
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      state.pager.search = { active: true, query: '', hits: [], current: -1 };
      updatePagerStatus();
      return;
    }

    // n/N : occurrence suivante / précédente de la recherche
    if ((event.key === 'n' || event.key === 'N') && !event.ctrlKey
        && (state.pager.search?.hits?.length ?? 0) > 0) {
      event.preventDefault();
      jumpToSearchHit(event.key === 'n' ? 1 : -1);
      return;
    }

    // « s » : sommaire des titres (sections d'article, page man)
    if (event.key === 's' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      togglePagerToc();
      return;
    }

    const pageStep = Math.max(40, content.clientHeight - 40);
    let handled = true;
    switch (event.key) {
      case 'ArrowDown': content.scrollTop += 20; break;
      case 'ArrowUp':   content.scrollTop -= 20; break;
      case 'PageDown':
      case ' ':         content.scrollTop += pageStep; break;
      case 'PageUp':    content.scrollTop -= pageStep; break;
      case 'Home':
      case 'g':          content.scrollTop = 0; break;
      case 'End':
      case 'G':          content.scrollTop = content.scrollHeight; break;
      case 'q':
      case 'Escape':    quitPager(); break;
      default: handled = false;
    }
    if (handled) {
      event.preventDefault();
      updatePagerStatus();
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Éditeur nano : plein écran, ^O écrit, ^X quitte — l'écran du
  // shell est sauvegardé à l'entrée et restitué à la sortie, comme
  // le pager des pages man. Le fichier du portfolio s'ouvre en
  // lecture seule ; les fichiers de l'utilisateur (userfs.js) se
  // modifient et se persistent en localStorage à chaque ^O.
  // ──────────────────────────────────────────────────────────────
  function enterEditor(request) {
    state.editor = {
      path: request.path,
      title: request.title,
      readonly: request.readonly,
      dirty: false,
      confirm: null,           // null | 'quit' : confirmation ^X
      saved: SHELL_OUTPUT.innerHTML,
      savedScroll: SHELL_OUTPUT.scrollTop,
      textarea: null
    };

    // L'easter egg « 42 » ne se déclenche pas pendant l'édition :
    // ses frappes vont au textarea, pas à l'input du shell
    if (bootedShellApi?.root === root) bootedShellApi.editorOpen = true;

    root.classList.add('viewerMode');
    SHELL_OUTPUT.classList.add('booting');
    SHELL_OUTPUT.innerHTML =
      `<div class="nanoEditor">`
      + `<div class="nanoHeader">GNU nano 7.2&nbsp;&nbsp;&nbsp;&nbsp;<span class="helpCommand">${escapeHTML(request.title)}</span></div>`
      + `<textarea class="nanoTextarea" spellcheck="false"${request.readonly ? ' readonly' : ''}></textarea>`
      + `</div>`
      + '<div class="cvViewerBar nanoStatus"></div>';
    state.editor.textarea = SHELL_OUTPUT.querySelector('.nanoTextarea');
    state.editor.textarea.value = request.content;
    state.editor.textarea.addEventListener('input', () => {
      state.editor.dirty = true;
      state.editor.confirm = null;
      updateEditorStatus();
    });
    state.editor.textarea.addEventListener('keydown', handleEditorKey);
    COMMAND_INPUT.value = '';
    resizeInput();
    updateEditorStatus();
    state.editor.textarea.focus();
  }

  /** Barre du bas : indicateurs, rappel des touches, messages. */
  function updateEditorStatus(message = null) {
    const bar = root.querySelector('.nanoStatus');
    if (!bar || !state.editor) return;

    if (message !== null) {
      bar.innerHTML = `<span style="color:var(--text-muted);">${escapeHTML(message)}</span>`;
      return;
    }
    const editor = state.editor;
    if (editor.confirm === 'quit') {
      bar.innerHTML = 'Enregistrer les modifications ? '
        + `<span class="helpCommand">o</span>ui&nbsp;·&nbsp;<span class="helpCommand">n</span>on&nbsp;·&nbsp;toute autre touche annule`;
      return;
    }
    const flags = editor.readonly
      ? '— lecture seule'
      : editor.dirty ? '— modifié' : '';
    bar.innerHTML = '<span class="helpCommand">^O</span> écrire&nbsp;&nbsp;&nbsp;'
      + `<span class="helpCommand">^X</span> quitter&nbsp;&nbsp;&nbsp;${flags}`;
  }

  /** ^O : écrit le contenu dans l'arbre utilisateur (userfs.js). */
  function saveEditorFile() {
    const editor = state.editor;
    if (editor.readonly) {
      updateEditorStatus('lecture seule : le contenu du portfolio ne se modifie pas');
      return;
    }
    const content = editor.textarea.value;
    const result = window.PORTFOLIO_USERFS.write(editor.path, content);
    if (result !== true) {
      const detail = result === 'missingParent'
        ? 'dossier parent introuvable'
        : result === 'tooLarge'
          ? 'fichier trop volumineux (100 Ko maximum)'
          : result === 'invalidName'
            ? 'nom de fichier invalide'
            : 'contenu du portfolio (lecture seule)';
      updateEditorStatus(`erreur d'écriture : ${detail}`);
      return;
    }
    editor.dirty = false;
    const lines = content === '' ? 0 : content.split('\n').length;
    updateEditorStatus(`« ${editor.title} » — ${lines} ligne(s) écrite(s)`);
  }

  /** Quitte l'éditeur et restitue l'écran du shell. */
  function quitEditor() {
    if (bootedShellApi?.root === root) bootedShellApi.editorOpen = false;
    root.classList.remove('viewerMode');
    SHELL_OUTPUT.innerHTML = state.editor?.saved ?? '';
    SHELL_OUTPUT.scrollTop = state.editor?.savedScroll ?? 0;
    state.editor = null;
    showPrompt();
    scrollToBottom();
    COMMAND_INPUT.focus();
  }

  /** Clavier de l'éditeur : ^O écrit, ^X quitte (confirmation). */
  function handleEditorKey(event) {
    const editor = state.editor;
    if (!editor) return;

    // Confirmation de sortie : o enregistre et quitte, n quitte
    // sans enregistrer, toute autre touche annule
    if (editor.confirm === 'quit') {
      event.preventDefault();
      const key = event.key.toLowerCase();
      if (key === 'o') {
        saveEditorFile();
        if (editor.dirty) {
          editor.confirm = null;
          updateEditorStatus();
        } else {
          quitEditor();
        }
      } else if (key === 'n') {
        quitEditor();
      } else {
        editor.confirm = null;
        updateEditorStatus();
      }
      return;
    }

    if (event.key === 'Tab') {
      // Une tabulation sort du textarea par défaut : elle devient
      // une vraie tabulation dans le texte, comme dans nano
      event.preventDefault();
      const area = editor.textarea;
      const { selectionStart, selectionEnd, value } = area;
      area.value = `${value.slice(0, selectionStart)}\t${value.slice(selectionEnd)}`;
      area.selectionStart = area.selectionEnd = selectionStart + 1;
      editor.dirty = true;
      updateEditorStatus();
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      saveEditorFile();
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      if (editor.dirty && !editor.readonly) {
        editor.confirm = 'quit';
        updateEditorStatus();
      } else {
        quitEditor();
      }
    }
  }

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
      // Rubrique : ↑↓ défilent — sauf rubriques « ères » et
      // « liste d'articles », où elles déplacent la sélection.
      // Entrée ouvre l'article sélectionné (ou revient au menu),
      // Échap retourne au menu, un chiffre ouvre le lien correspondant.
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const view = SHELL_OUTPUT.querySelector('.cvViewer');
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        if (viewer.api.navEra && viewer.api.navEra(
          view, viewer.section, delta)) {
          return;
        }
        if (viewer.api.navList && viewer.api.navList(
          view, viewer.section, delta)) {
          return;
        }
        SHELL_OUTPUT.scrollTop += delta * 40;
        return;
      }
      if (event.key === 'Escape') {
        viewer.section = null;
        renderViewer();
        return;
      }
      if (event.key === 'Enter') {
        // Liste d'articles : Entrée lit l'article sélectionné
        const selected = viewer.api.selectedRead?.(viewer.section);
        if (selected !== null && selected !== undefined) {
          enterReadMode(viewer.node.viewer, selected);
          return;
        }
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
        if (!link) return;
        // Lien « read » : l'article s'ouvre en mode lecture dans le
        // pager, pas dans un onglet
        if (link.read !== undefined) enterReadMode(viewer.node.viewer, link.read);
        else openViewerLink(link.href);
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
   * Découpe la ligne en jobs de commandes : les opérateurs « | »
   * (pipeline), « && » / « || » (enchaînement conditionnel) et
   * « ; » (enchaînement systématique) sont reconnus hors guille-
   * mets simples et doubles — un motif cité ne coupe pas la
   * ligne. Découpage volontairement naïf : pas de substitution ni
   * de sous-shell. Renvoie { jobs } ou { error } :
   *   jobs : [{ gate: null | '&&' | '||' | ';' , segments: [...] }]
   */
  function parseCommandLine(line) {
    const jobs = [];
    let segments = [];
    let current = '';
    let quote = null;
    let gate = null;
    let expectingSegment = false;

    // Clôture d'un segment de commande ; un segment vide (opérateur
    // en trop) est une erreur de syntaxe, comme dans bash
    const endSegment = (operator) => {
      const text = current.trim();
      current = '';
      if (text === '') return { error: operator };
      segments.push(text);
      expectingSegment = false;
      return null;
    };
    const endJob = () => {
      if (segments.length === 0) return;
      jobs.push({ gate, segments });
      segments = [];
      gate = null;
    };

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (quote) {
        current += char;
        if (char === quote) quote = null;
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        current += char;
        continue;
      }
      if (char === '|' || char === '&' || char === ';') {
        let operator = char;
        if ((char === '|' || char === '&') && line[i + 1] === char) {
          operator += char;
          i += 1;
        } else if (char === '&') {
          return { error: operator };
        }
        const error = endSegment(operator);
        if (error) return error;
        if (operator !== '|') {
          endJob();
          gate = operator;
        } else {
          expectingSegment = true;
        }
        continue;
      }
      current += char;
    }
    if (quote !== null) return { error: 'guillemet non fermé' };
    // Clôture du dernier segment avant les contrôles : une ligne
    // bien terminée ne doit jamais ressembler à un opérateur
    // orphelin. Après endJob, gate ne survit que si aucun job n'a
    // pu être clôturé (opérateur orphelin en fin de ligne)
    if (current.trim() !== '') {
      segments.push(current.trim());
      expectingSegment = false;
    }
    endJob();
    if (gate !== null) return { error: gate };
    if (expectingSegment) return { error: '|' };
    return { jobs };
  }

  /**
   * Développe l'alias du premier mot d'un segment, à la bash : la
   * définition remplace le mot, le reste du segment suit. Une
   * seule passe : pas de récursion possible.
   */
  const expandAlias = (segment) => {
    const firstWord = segment.split(/\s+/)[0];
    const aliasValue = state.aliases?.[firstWord];
    return aliasValue !== undefined
      ? `${aliasValue}${segment.slice(firstWord.length)}`
      : segment;
  };

  /**
   * Réussite d'une commande pour les enchaînements && / || : tous
   * les messages d'erreur du shell commencent par « <nom> : »
   * (cat : fichier introuvable…), sortie vide ou null = succès.
   * Un fichier dont le contenu commencerait exactement par
   * « cat : » serait pris pour un échec — garde-fou suffisant
   * pour un portfolio.
   */
  const commandSucceeded = (name, result) => {
    if (typeof result !== 'string' || result === '') return true;
    return !window.PORTFOLIO_HTML.htmlToText(result)
      .startsWith(`${name} :`);
  };

  /**
   * Exécute un pipeline : chaque commande reçoit en entrée standard
   * la sortie du précédent (le HTML du terminal redevient du
   * texte brut pour traverser le tube). Seule la sortie du
   * dernier segment est affichée ; une page man en fin de
   * pipeline prend l'écran du pager.
   */
  /**
   * Redirection « > » / « >> » d'un segment : renvoie
   * { command, target, append } — le texte de la commande sans la
   * redirection, le fichier cible, et si la sortie s'ajoute au
   * lieu d'écraser. Le « > » hors guillemets coupe le segment,
   * comme les opérateurs de parseCommandLine.
   */
  function extractRedirection(segment) {
    let quote = null;
    for (let i = 0; i < segment.length; i++) {
      const char = segment[i];
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
      if (char === '>') {
        const append = segment[i + 1] === '>';
        const end = append ? i + 2 : i + 1;
        return {
          command: segment.slice(0, i).trim(),
          target: segment.slice(end).trim(),
          append
        };
      }
    }
    return { command: segment, target: null, append: false };
  }

  /** Texte traversant un tube ou une redirection : le HTML du
   * terminal redevient du texte brut, pages man comprises. */
  const outputAsText = (result) => {
    if (result && typeof result === 'object' && result.__pager) {
      return window.PORTFOLIO_HTML.htmlToText(result.html ?? '');
    }
    return typeof result === 'string' ? window.PORTFOLIO_HTML.htmlToText(result) : '';
  };

  /**
   * Développe les jokers (* et ?) des arguments, comme le shell :
   * les correspondances de l'arbre remplacent le mot, un mot sans
   * correspondance reste tel quel. Les mots cités ne sont jamais
   * développés — le motif de find (« "*.pdf" ») et le « * » de rm
   * passent tels quels à leur commande.
   */
  const expandGlobs = (args) => args.flatMap((arg) => {
    if (!/[*?]/.test(arg) || /['"]/.test(arg)) return [arg];
    const matches = window.PORTFOLIO_FS.globPaths(state.tree, state.currentDir, arg);
    return matches.length > 0 ? matches : [arg];
  });

  const runPipeline = async (segments) => {
    let stdin = null;
    let result = null;
    let name = '';

    // Redirection : elle vit sur un segment, seul le dernier peut
    // en porter une (c'est lui qui reçoit la sortie finale) —
    // « man ls > f.txt » part dans le fichier, pas dans le pager
    const redirect = extractRedirection(segments[segments.length - 1]);
    if (redirect.target !== null) {
      if (redirect.target === '' || /\s/.test(redirect.target)) {
        return { output: 'bash : erreur de syntaxe près du symbole inattendu « > »', ok: false };
      }
      if (redirect.command === '') {
        return { output: `bash : erreur de syntaxe près du symbole inattendu « ${redirect.append ? '>>' : '>'} »`, ok: false };
      }
      segments = [...segments.slice(0, -1), redirect.command];
    }
    for (let i = 0; i < segments.length; i++) {
      // Une redirection au milieu du pipeline ne s'attache à
      // rien : le vrai bash l'accepte, ici elle est refusée
      const mid = extractRedirection(segments[i]);
      if (i < segments.length - 1 && mid.target !== null) {
        return { output: 'bash : les redirections ne sont prises qu\'en fin de pipeline', ok: false };
      }

      const effective = expandAlias(segments[i]);
      const [rawName, ...rawArgs] = effective.split(/\s+/);
      name = rawName.toLowerCase();
      const handler = handlers[name];

      if (!handler) {
        return { output: unknownCommandMessage(rawName), ok: false };
      }
      // Jokers du shell : « rm * » garde son easter egg, ses
      // arguments ne sont jamais développés
      const args = name === 'rm' ? rawArgs : expandGlobs(rawArgs);
      try {
        result = await handler(args, stdin);
      } catch (err) {
        console.error(err);
        result = '<span style="color:#f87171;">Une erreur est survenue lors de l\'exécution.</span>';
      }

      // Page man : dernière commande → pager ; au milieu du
      // pipeline, son texte traverse le tube comme toute sortie
      if (result && typeof result === 'object' && result.__pager) {
        if (i === segments.length - 1 && redirect.target === null) return { pager: result, ok: true };
        stdin = window.PORTFOLIO_HTML.htmlToText(result.html ?? '');
        continue;
      }
      // Éditeur nano : dernière commande → plein écran ; au milieu
      // du pipeline il refuse de s'insérer, rien n'arrive à le
      // traverser en texte — et une redirection n'a pas de sens
      if (result && typeof result === 'object' && result.__editor) {
        if (i === segments.length - 1 && redirect.target === null) return { editor: result, ok: true };
        return { output: 'nano : ne peut pas s\'insérer dans un pipeline', ok: false };
      }
      stdin = typeof result === 'string'
        ? window.PORTFOLIO_HTML.htmlToText(result)
        : null;
    }

    // La sortie part dans le fichier de l'utilisateur : écriture
    // (>) ou ajout (>>) via userfs.js — le portfolio reste en
    // lecture seule
    if (redirect.target !== null) {
      const path = window.PORTFOLIO_FS.resolve(state.currentDir, redirect.target);
      let content = outputAsText(result);
      if (redirect.append) {
        const existing = window.PORTFOLIO_USERFS.read(path);
        if (existing !== null) content = `${existing}${content}`;
      }
      const writeResult = window.PORTFOLIO_USERFS.write(path, content);
      if (writeResult !== true) {
        const message = writeResult === 'missingParent'
          ? `bash : ${redirect.target} : aucun fichier ou dossier de ce type`
          : writeResult === 'tooLarge'
            ? `bash : ${redirect.target} : fichier trop volumineux (100 Ko maximum)`
            : `bash : ${redirect.target} : permission non accordée`;
        return { output: message, ok: false };
      }
      return { output: null, ok: commandSucceeded(name, result) };
    }

    return {
      output: typeof result === 'string' ? result : null,
      ok: commandSucceeded(name, result)
    };
  };

  /**
   * Positions des substitutions « $(cmd) » d'une ligne, hors
   * guillemets : { spans: [{ start, inner, end }] } — start du
   * « $ », inner la commande imbriquée, end la parenthèse fermante.
   * Les guillemets et la profondeur des parenthèses sont suivis à
   * l'intérieur du motif ; une parenthèse non fermée renvoie
   * { error: true }.
   */
  function substitutionSpans(line) {
    const spans = [];
    let quote = null;
    let i = 0;
    while (i < line.length) {
      const char = line[i];
      if (quote) {
        if (char === quote) quote = null;
        i += 1;
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        i += 1;
        continue;
      }
      if (char === '$' && line[i + 1] === '(') {
        let depth = 1;
        let innerQuote = null;
        let j = i + 2;
        while (j < line.length && depth > 0) {
          const c = line[j];
          if (innerQuote) {
            if (c === innerQuote) innerQuote = null;
          } else if (c === "'" || c === '"') {
            innerQuote = c;
          } else if (c === '(') {
            depth += 1;
          } else if (c === ')') {
            depth -= 1;
          }
          if (depth > 0) j += 1;
        }
        if (depth > 0) return { error: true, spans };
        spans.push({ start: i, inner: line.slice(i + 2, j), end: j });
        i = j + 1;
        continue;
      }
      i += 1;
    }
    return { spans };
  }

  /**
   * Sortie d'une substitution « $(cmd) » : la commande interne
   * s'exécute sans écho ni historique. Les retours à la ligne
   * deviennent des espaces (découpage en mots du vrai bash) ; une
   * commande en échec affiche son message — façon stderr — et
   * remplace le motif par du vide, comme dans bash.
   */
  const runSubstitution = async (inner) => {
    const parsed = parseCommandLine(inner);
    if (parsed.error) {
      printOutput(`bash : erreur de syntaxe près du symbole inattendu « ${escapeHTML(parsed.error)} »`);
      return { abort: true };
    }

    let previousOk = true;
    let lastOutput = '';
    for (const job of parsed.jobs) {
      if (job.gate === '&&' && !previousOk) continue;
      if (job.gate === '||' && previousOk) continue;

      const { output, ok, pager, editor } = await runPipeline(job.segments);
      if (editor) {
        printOutput('nano : ne peut pas s\'insérer dans une substitution');
        return { abort: true };
      }
      // Une page man substituée devient son texte, le pager ne
      // s'ouvre pas au milieu d'une substitution
      lastOutput = pager
        ? (pager.html ?? '')
        : (output ?? '');
      previousOk = ok;
    }
    if (!previousOk) {
      if (typeof lastOutput === 'string' && lastOutput !== '') printOutput(lastOutput);
      return { text: '' };
    }
    return {
      text: window.PORTFOLIO_HTML.htmlToText(lastOutput)
        .replace(/\s*\n+\s*/g, ' ')
        .trim()
    };
  };

  /**
   * Développe les substitutions « $(cmd) » d'une ligne avant son
   * analyse, comme dans bash. Renvoie la ligne développée, ou
   * null si une substitution interrompt tout (erreur de syntaxe).
   */
  const expandSubstitutions = async (line) => {
    const { error, spans } = substitutionSpans(line);
    if (error) {
      printOutput('bash : substitution « $( » non fermée');
      return null;
    }
    if (spans.length === 0) return line;

    let out = '';
    let cursor = 0;
    for (const span of spans) {
      out += line.slice(cursor, span.start);
      const result = await runSubstitution(span.inner);
      if (result.abort) return null;
      out += result.text ?? '';
      cursor = span.end + 1;
    }
    out += line.slice(cursor);
    return out;
  };

  /**
   * Rejeu d'historique, comme dans bash : « !! » relance la
   * dernière commande, « !n » celle du rang n affiché par
   * history. Une ligne sans « ! » revient telle quelle ; un rang
   * introuvable renvoie command null avec le label en cause. La
   * profondeur de rejeu est bornée pour ne jamais boucler sur
   * elle-même, même avec un historique farci de « ! ».
   */
  const replayHistory = (line, history) => {
    let command = line;
    for (let depth = 0; depth < 5; depth += 1) {
      let label = null;
      let entry;
      if (command === '!!') {
        label = '!!';
        entry = history[history.length - 1];
      } else {
        const match = /^!(\d+)$/.exec(command);
        if (match !== null) {
          label = command;
          entry = history[Number(match[1]) - 1];
        }
      }
      if (label === null) break;
      if (entry === undefined) return { command: null, label };
      command = entry;
    }
    return { command, label: null };
  };

  /**
   * Exécute la ligne saisie : écho du prompt, puis jobs de
   * pipeline dans l'ordre, chaque sortie suivant la précédente.
   */
  const executeCommand = async (rawCommand) => {
    const trimmed = rawCommand.trim();
    if (!trimmed) {
      printText(DEFAULT_BEGIN_SHELL.textContent);
      return;
    }

    // Rejeu d'historique : l'historique garde la ligne rejouée,
    // jamais le « ! » qui y a mené
    const replayed = replayHistory(trimmed, state.history);
    if (replayed.command === null) {
      printOutput(`${escapeHTML(DEFAULT_BEGIN_SHELL.textContent)}${escapeHTML(trimmed)}`);
      printOutput(`bash : ${replayed.label} : substitution d'événement introuvable`);
      return;
    }
    const command = replayed.command;

    state.history.push(command);
    state.historyIndex = state.history.length;
    persistHistory();

    // Écho de la ligne avant l'exécution, comme un vrai shell :
    // les sorties suivent l'écho, dans l'ordre des commandes
    printOutput(`${escapeHTML(DEFAULT_BEGIN_SHELL.textContent)}${escapeHTML(command)}`);

    // Substitutions « $(cmd) » : développées avant l'analyse, en
    // une seule passe — l'historique garde la ligne telle que
    // saisie, les substitutions ne s'imbriquent pas
    const expanded = await expandSubstitutions(command);
    if (expanded === null) return;

    const parsed = parseCommandLine(expanded);
    if (parsed.error) {
      printOutput(`bash : erreur de syntaxe près du symbole inattendu « ${escapeHTML(parsed.error)} »`);
      return;
    }

    // La gate du job décide de son exécution : « && » exige la
    // réussite du précédent, « || » son échec, « ; »/null rien
    let previousOk = true;
    for (const job of parsed.jobs) {
      if (job.gate === '&&' && !previousOk) continue;
      if (job.gate === '||' && previousOk) continue;

      const { output, ok, pager, editor } = await runPipeline(job.segments);
      if (pager) {
        enterPager(pager);
        return;
      }
      if (editor) {
        enterEditor(editor);
        return;
      }
      if (typeof output === 'string' && output !== '') {
        printOutput(output);
      }
      previousOk = ok;
    }
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
      if (!api || api.input.value !== '' || api.editorOpen) {
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

    // Options : « ls - », « grep - », « wc - »... Pool dédié pour
    // ls, sinon options lues depuis la page man de la commande.
    if (lastWord.startsWith('-')) {
      const optionPool = command === 'ls' ? ['-a', '-l', '-la'] : null;
      const pool = optionPool
        ?? (state.manCommands?.[command]?.options ?? [])
          .map((opt) => opt.name)
          .filter((name) => name.startsWith('-'));
      if (pool.length > 0) {
        return {
          candidates: pool.filter((name) => name.startsWith(prefix)),
          dirNode: null,
          dirPart: ''
        };
      }
    }

    let pool = [];
    let dirNode = null;
    switch (command) {
      case 'open':
      case 'cd':
      case 'cat':
      case 'grep':
      case 'wc':
      case 'tree':
      case 'find': {
        const dir = navigateTree(dirPart
          ? window.PORTFOLIO_FS.resolve(state.currentDir, dirPart)
          : state.currentDir);
        if (!isDirectory(dir)) break;

        // Les dossiers sont complétés aussi : étapes du chemin,
        // même quand la commande les refuserait en argument final
        const wanted = command === 'cd' || command === 'tree' || command === 'find'
          ? isDirectory
          : command === 'open'
            ? (node) => isDirectory(node) || isOpenable(node)
            // cat / grep : fichiers texte (contenu brut ou viewer
            // avec rendu toText)
            : (node) => isDirectory(node)
              || typeof node === 'string'
              || (node?.viewer && window.PORTFOLIO_VIEWERS?.[node.viewer]?.toText);

        dirNode = dir;
        pool = Object.keys(dir)
          .filter((key) => key !== 'type')
          .filter((key) => wanted(dir[key]));
        break;
      }
      case 'man':  pool = Object.keys(state.manCommands ?? {}); break;
      case 'set':  pool = ['username']; break;
      case 'get':  pool = ['sha']; break;
      case 'rm':   pool = ['*']; break;
      case 'alias':
      case 'unalias': pool = Object.keys(state.aliases ?? {}); break;
      default: break;
    }
    return {
      candidates: pool.filter((name) => name.startsWith(prefix)),
      dirNode,
      dirPart
    };
  }

  /**
   * Dernier segment de commande de la ligne : le texte qui suit le
   * dernier opérateur (|, ||, ;, &&), hors guillemets simples et
   * doubles — comme parseCommandLine, un motif cité ne coupe pas.
   * C'est ce segment que la complétion regarde : la commande en
   * cours de saisie est celle du dernier pipe, pas celle du début
   * de ligne. Le « & » seul n'est pas un opérateur ici : le
   * dispatcher le refuserait de toute façon.
   */
  function lastCommandSegment(line) {
    let quote = null;
    let start = 0;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
      if (char === '|' || char === ';') {
        const doubled = char === '|' && line[i + 1] === char;
        start = i + (doubled ? 2 : 1);
        if (doubled) i += 1;
      } else if (char === '&' && line[i + 1] === '&') {
        start = i + 2;
        i += 1;
      }
    }
    return line.slice(start);
  }

  /**
   * Complétion au Tab : le nom de commande s'il n'y a pas encore
   * d'argument, sinon le dernier argument de la commande. La
   * complétion porte sur le segment actif — après un pipe ou un
   * enchaînement, c'est la commande qui suit l'opérateur qui est
   * complétée, à la manière de bash.
   */
  function tabComplete() {
    const value = COMMAND_INPUT.value;
    const raw = lastCommandSegment(value);
    const segment = raw.trim();

    // Premier mot du segment : complétion du nom de commande,
    // alias compris ; le texte devant le segment est conservé tel
    // quel (prompt, pipes, enchaînements déjà saisis)
    if (!/\s/.test(segment) && !/\s$/.test(raw)) {
      const candidates = [...new Set([
        ...Object.keys(handlers),
        ...Object.keys(state.aliases ?? {})
      ])]
        .filter((name) => name.startsWith(segment.toLowerCase()));
      const before = value.slice(0, value.length - segment.length);
      applyCompletion(candidates, segment, before);
      return;
    }

    // Sinon : complétion du dernier argument de la commande active
    const tokens = segment.split(/\s+/);
    const command = tokens[0];
    const lastWord = /\s$/.test(raw) ? '' : tokens[tokens.length - 1];
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
      // Lien « read » d'un article du blog ou d'une page de la doc :
      // mode lecture dans le pager, pas de navigation hors du shell
      const readAnchor = e.target.closest('a[data-read]');
      if (readAnchor) {
        e.preventDefault();
        enterReadMode(state.viewer?.node?.viewer, Number(readAnchor.dataset.read));
        return;
      }
      // Sommaire du pager : un titre cliqué saute à sa section
      const tocItem = e.target.closest('.readTocItem');
      if (tocItem) {
        e.preventDefault();
        jumpToHeading(tocItem.dataset.idx);
        root.querySelector('.readToc')?.remove();
        updatePagerStatus();
        return;
      }
      // Image d'un article en lecture : un clic l'ouvre en grand
      // dans un onglet — même validation que son rendu (http(s) du
      // site d'origine, ou image inline du flux, jamais un href
      // arbitraire)
      const img = e.target.closest('img.readImgReal');
      if (img) {
        const src = img.getAttribute('src') || '';
        if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(src)) {
          // Image inline : navigation par ancre, window.open
          // refuse les URL data:
          const anchor = document.createElement('a');
          anchor.href = src;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.style.display = 'none';
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
        } else if (/^https?:/.test(src)) {
          window.open(src, '_blank', 'noopener,noreferrer');
        }
        return;
      }
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
      // Pager man actif : toutes les touches lui sont capturées
      if (state.pager) {
        handlePagerKey(event);
        return;
      }

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

  // Fichiers utilisateur : la surcouche persistée (localStorage)
  // est appliquée sur l'arbre avant le premier prompt — touch,
  // mkdir, nano et rm travaillent dessus
  window.PORTFOLIO_USERFS.applyTo(state.tree);

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
      const response = await fetch('./src/JSON/elements.json?v=20261002.22');
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
