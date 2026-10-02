/**
 * Commandes du shell — Bastien BONORA
 * ----------------------------------------------------------------
 * Tous les handlers de commandes (ls, cd, cat, man, set, open…) et
 * le registre associé. La fabrique `create(ctx)` reçoit l'état et
 * les éléments de la fenêtre de shell concernée : chaque fenêtre
 * instancie son propre jeu de commandes.
 *
 * ctx : { state, prompt, defaultText, output, root, typewrite,
 *         delay, updatePrompt, updateCursor, spawnShell }
 *
 * Exposé via window.PORTFOLIO_COMMANDS :
 *   create(ctx, extraHandlers) -> { handlers, unknown }
 */
(() => {
  'use strict';

  const escapeHTML = window.PORTFOLIO_HTML.escapeHTML;

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
   * Message bash-like pour une commande inconnue, avec suggestion de
   * la commande la plus proche (distance de Levenshtein <= 2).
   */
  function unknownCommandMessage(registry, name) {
    const lowered = name.toLowerCase();
    let best = null;
    let bestDistance = Infinity;
    for (const command of Object.keys(registry)) {
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

  // SHA-256 (Web Crypto)
  async function sha256(message) {
    const buffer = new TextEncoder().encode(message);
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function create(ctx, extra = {}) {
    const {
      state, prompt, defaultText, output, root,
      typewrite, delay, updatePrompt, updateCursor, spawnShell
    } = ctx;

    // Alias arborescence : mêmes fonctions pures que script.js,
    // branchées sur l'état de cette fenêtre
    const navigateTree = (path) => window.PORTFOLIO_FS.navigate(state.tree, path);
    const resolvePath  = (path) => window.PORTFOLIO_FS.resolve(state.currentDir, path);
    const lookUpTree   = (target) =>
      window.PORTFOLIO_FS.lookUp(state.tree, state.currentDir, target);
    const isDirectory  = window.PORTFOLIO_FS.isDirectory;
    const isOpenable   = window.PORTFOLIO_FS.isOpenable;

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
      defaultText.innerHTML = '';
      output.innerHTML = '';
      output.appendChild(defaultText);
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
      const username = prompt.textContent.split('@')[0];
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
      // Fichier viewer (CV.html, reseaux.html…) : rendu texte brut
      // des mêmes données que `open`, sans le rendu interactif.
      if (node.viewer && window.PORTFOLIO_VIEWERS?.[node.viewer]?.toText) {
        return escapeHTML(window.PORTFOLIO_VIEWERS[node.viewer].toText());
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
        prompt.textContent = `${username}@portfolio:${state.currentDir}> `;
        // Même recalage que updatePrompt : le prompt vient de changer
        // de largeur
        updateCursor();
        return 'modification effectuée dans le terminal';
      }
      if (key === 'theme') {
        if (rest.length === 0) {
          return 'set : usage : set theme <couleur | #ec34f3> — set theme default pour réinitialiser';
        }
        return window.PORTFOLIO_THEME.set(rest[0]);
      }

      return `set : argument inconnu « ${escapeHTML(key)} »`;
    }

    function cmdOpen(args) {
      if (args.length === 0) return 'open : veuillez donner un argument';

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

      // Viewer interactif : le fichier s'ouvre dans une nouvelle
      // fenêtre de shell navigable au clavier (CV, présentation,
      // compétences…). Le champ `viewer` désigne le viewer dans le
      // registre viewerData.js.
      if (node.viewer) {
        if (!window.PORTFOLIO_VIEWERS?.[node.viewer]) {
          return `open : viewer « ${escapeHTML(node.viewer)} » inconnu`;
        }
        const error = spawnShell({ viewer: node, seedHistory: state.history.slice() });
        if (error) return error;
        return `ouverture de ${escapeHTML(target)} dans une nouvelle fenêtre...`;
      }

      if (!window.PORTFOLIO_HTML.isSafeHref(node.url)) {
        return `open : ${escapeHTML(target)} : URL non autorisée`;
      }
      window.open(node.url, '_blank', 'noopener,noreferrer');
      return `ouverture de ${escapeHTML(target)} dans un nouvel onglet...`;
    }

    async function cmdRm(args) {
      if (args[0] !== '*') return `rm : argument inconnu « ${escapeHTML(args[0] ?? '')} »`;

      // Mini scénario : refus de supprimer
      const defaultText = document.createElement('p');
      output.appendChild(defaultText);
      const message = "Je ne vous permet pas de supprimer mon travail_"
                    + ' Pourquoi faites-vous ça ?'
                    + '_  ..................................................................................';

      await typewrite(defaultText, message, 70);
      await delay(2500);
      output.innerHTML = '';
      await delay(500);
      cmdReboot();
      return null;
    }

    async function cmdGet(args) {
      if (args.length === 0) return 'get : veuillez donner un argument';

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
          return 'get sha : aucun hash calculé. Exemple : get sha CV.pdf';
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
      const text = prompt.textContent;
      const username = text.split('@')[0];
      // Easter egg : sous sa vraie identité, le propriétaire du
      // shell se présente tout seul.
      if (username === 'bastien') {
        return `${escapeHTML(username)} — admin systèmes &amp; réseaux @ Alpes Networks`;
      }
      return escapeHTML(username);
    }

    /**
     * Easter egg : on ne devient pas root sur ce portfolio.
     * Refus systématique, à la manière du vrai sudo.
     */
    function cmdSudo() {
      const username = prompt.textContent.split('@')[0];
      return `<span style="color:var(--warning);">sudo :</span> ${escapeHTML(username)} n'est pas dans le fichier sudoers. Cet incident sera signalé.`;
    }

    /**
     * Ouvre une nouvelle fenêtre de shell, comme le lancement d'un
     * bash dans un terminal.
     */
    function cmdBash() {
      // La nouvelle fenêtre hérite de l'historique de celle-ci
      const error = spawnShell({ seedHistory: state.history.slice() });
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
      sudo:   cmdSudo,
      bash:   cmdBash,
      exit:   cmdExit,
      ...extra
    };

    return {
      handlers,
      unknown: (name) => unknownCommandMessage(handlers, name)
    };
  }

  window.PORTFOLIO_COMMANDS = { create };
})();
