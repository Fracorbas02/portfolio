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
 * Chaque handler reçoit (args, stdin) : stdin est le texte brut
 * de la commande précédente au bout d'un pipeline (script.js), ou
 * null hors pipeline. Seules les commandes qui le peuvent (cat,
 * grep, wc) le consomment.
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

    /**
     * Texte affichable d'un fichier : contenu brut, ou rendu texte
     * du viewer pour les fichiers interactifs (partagé cat/grep).
     * Renvoie null pour un fichier binaire.
     */
    function fileText(node) {
      if (node.viewer && window.PORTFOLIO_VIEWERS?.[node.viewer]?.toText) {
        return window.PORTFOLIO_VIEWERS[node.viewer].toText();
      }
      if (typeof node === 'string') return node;
      return null;
    }

    function cmdCat(args, stdin = null) {
      // Sans argument mais dans un pipeline : l'entrée standard,
      // comme le vrai cat (commande | cat)
      if (args.length === 0) {
        if (stdin === null) return 'cat : veuillez donner un argument';
        return escapeHTML(stdin);
      }

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
      const text = fileText(node);
      if (text === null) {
        return `cat : ${escapeHTML(target)} : fichier binaire (non affichable). Essayez : open`;
      }
      return escapeHTML(text);
    }

    /**
     * grep : recherche un motif dans un fichier texte, ou dans
     * l'entrée standard au bout d'un pipeline (commande | grep
     * motif), avec les options combinables -i (insensible à la
     * casse) et -n (numéros de ligne). Aucune correspondance →
     * sortie vide, comme le vrai grep.
     */
    function cmdGrep(args, stdin = null) {
      // Options combinables en tête de ligne : -i, -n, -in, -ni...
      let flags = '';
      while (args.length > 0 && /^-[in]+$/.test(args[0])) {
        flags += args.shift().slice(1);
      }
      if (args.length === 0) {
        return 'usage : grep [-i] [-n] <motif> <fichier>  (ou : commande | grep [-i] [-n] <motif>)';
      }

      const pattern = args[0];
      let text;
      if (args.length >= 2) {
        const target = args[1];
        const node = lookUpTree(target);

        if (node === null) return `grep : ${escapeHTML(target)} : fichier introuvable`;
        if (isDirectory(node)) return `grep : ${escapeHTML(target)} : est un dossier`;
        if (!canReadFiles()) {
          return `grep : ${escapeHTML(target)} : Permission non accordée`;
        }

        text = fileText(node);
        if (text === null) {
          return `grep : ${escapeHTML(target)} : fichier binaire (non analysable)`;
        }
      } else if (stdin !== null) {
        text = stdin; // pipeline : l'entrée standard de la commande
      } else {
        return 'usage : grep [-i] [-n] <motif> <fichier>  (ou : commande | grep [-i] [-n] <motif>)';
      }

      const insensitive = flags.includes('i');
      const showLineNumbers = flags.includes('n');
      const needle = insensitive ? pattern.toLowerCase() : pattern;

      const matches = [];
      text.split('\n').forEach((line, index) => {
        const haystack = insensitive ? line.toLowerCase() : line;
        if (haystack.includes(needle)) {
          const number = showLineNumbers
            ? `<span style="color:var(--text-muted);">${index + 1}:</span> `
            : '';
          matches.push(number + escapeHTML(line));
        }
      });
      return matches.join('\n');
    }

    /**
     * wc : compte les lignes (-l) d'un fichier texte, ou de
     * l'entrée standard au bout d'un pipeline, ou par défaut
     * lignes/mots/octets comme le vrai wc.
     */
    function cmdWc(args, stdin = null) {
      let linesOnly = false;
      if (args[0] === '-l') {
        linesOnly = true;
        args.shift();
      }

      let text;
      let suffix = '';
      if (args.length > 0) {
        const target = args[0];
        const node = lookUpTree(target);

        if (node === null) return `wc : ${escapeHTML(target)} : fichier introuvable`;
        if (isDirectory(node)) return `wc : ${escapeHTML(target)} : est un dossier`;
        if (!canReadFiles()) {
          return `wc : ${escapeHTML(target)} : Permission non accordée`;
        }

        text = fileText(node);
        if (text === null) {
          return `wc : ${escapeHTML(target)} : fichier binaire (non analysable)`;
        }
        suffix = ` ${escapeHTML(target)}`;
      } else if (stdin !== null) {
        text = stdin; // pipeline : l'entrée standard de la commande
      } else {
        return 'usage : wc [-l] <fichier>  (ou : commande | wc [-l])';
      }

      // Comme le vrai wc : les lignes sont les caractères \n
      const lines = (text.match(/\n/g) ?? []).length;
      if (linesOnly) return `${lines}${suffix}`;

      const words = text.split(/\s+/).filter(Boolean).length;
      const bytes = new TextEncoder().encode(text).length;
      return `${lines} ${words} ${bytes}${suffix}`;
    }

    /**
     * Valeur d'une variable d'environnement : USER et PWD sont
     * vivantes (lues depuis le prompt et le dossier courant), les
     * autres viennent de `export` (state.variables).
     */
    function variableValue(name) {
      if (name === 'USER') return prompt.textContent.split('@')[0];
      if (name === 'PWD') return state.currentDir;
      return state.variables?.[name] ?? '';
    }

    /**
     * echo : affiche ses arguments, en développant les variables
     * $USER, $PWD et celles définies par `export` — n'importe où
     * dans le mot, comme en bash.
     */
    function cmdEcho(args) {
      const expanded = args.map((arg) =>
        arg.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => variableValue(name)));
      return escapeHTML(expanded.join(' '));
    }

    /**
     * export : définit des variables d'environnement visibles par
     * echo ($NOM), ou les liste sans argument, à la manière de
     * `export -p`.
     */
    function cmdExport(args) {
      if (args.length === 0) {
        const declared = Object.entries(state.variables ?? {})
          .map(([key, value]) => `declare -x ${key}="${escapeHTML(value)}"`);
        return [
          `declare -x USER="${escapeHTML(variableValue('USER'))}"`,
          `declare -x PWD="${escapeHTML(variableValue('PWD'))}"`,
          ...declared
        ].join('\n');
      }

      for (const arg of args) {
        const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(arg);
        if (!match) {
          return `export : ${escapeHTML(arg)} : identifiant invalide (attendu : NOM=valeur)`;
        }
        state.variables[match[1]] = match[2];
      }
      return null;
    }

    // Clé localStorage partagée avec le chargement (script.js)
    const ALIAS_STORAGE_KEY = 'portfolioShellAliases';

    function persistAliases() {
      try {
        localStorage.setItem(ALIAS_STORAGE_KEY, JSON.stringify(state.aliases ?? {}));
      } catch {
        // Stockage indisponible : les alias restent en mémoire
      }
    }

    /**
     * alias : définit un alias de commande (persisté en localStorage)
     * ou les liste sans argument, à la manière de bash. La valeur
     * peut être entre guillemets simples ou doubles.
     */
    function cmdAlias(args) {
      if (args.length === 0) {
        const entries = Object.entries(state.aliases ?? {});
        if (entries.length === 0) return null;
        return entries
          .map(([name, value]) => `alias ${escapeHTML(name)}='${escapeHTML(value)}'`)
          .join('\n');
      }

      const joined = args.join(' ');
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(joined);

      // alias <nom> : affiche la définition existante
      if (!match) {
        if (args.length === 1 && Object.hasOwn(state.aliases, args[0])) {
          return `alias ${escapeHTML(args[0])}='${escapeHTML(state.aliases[args[0]])}'`;
        }
        return 'alias : usage : alias NOM=\'commande\' (ou alias sans argument pour lister)';
      }

      let value = match[2];
      const quoted = value.length > 1
        && ((value.startsWith("'") && value.endsWith("'"))
          || (value.startsWith('"') && value.endsWith('"')));
      if (quoted) value = value.slice(1, -1);

      state.aliases[match[1]] = value;
      persistAliases();
      return null;
    }

    /**
     * unalias : supprime un alias défini au préalable.
     */
    function cmdUnalias(args) {
      if (args.length === 0) return 'unalias : veuillez donner un nom d\'alias';

      for (const name of args) {
        if (!Object.hasOwn(state.aliases, name)) {
          return `unalias : ${escapeHTML(name)} : alias introuvable`;
        }
        delete state.aliases[name];
      }
      persistAliases();
      return null;
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

      // La page part en pager plein écran (script.js), façon less
      return { __pager: true, title: `${target}(1)`, html: out };
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

    async function cmdOpen(args) {
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
        // Les viewers blog/docs vivent du flux du site : la même
        // requête en direct est faite que par `blog`/`docs`.
        if (node.viewer === 'blog' || node.viewer === 'docs') {
          await ensureFeedViewer(node.viewer);
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
     * Attente visible : si la promesse dépasse le seuil, une ligne
     * animée s'insère à la fin de l'historique — requête réseau en
     * cours — puis disparaît dès la réponse. En dessous du seuil,
     * rien ne s'affiche : la commande paraît instantanée.
     */
    const withLoading = (promise, label) => {
      const line = document.createElement('div');
      line.className = 'cliLoading';
      line.innerHTML = `<span class="cliLoadingSpinner"></span>${escapeHTML(label)}`;
      const timer = setTimeout(() => output.appendChild(line), 300);
      return promise.finally(() => {
        clearTimeout(timer);
        line.remove();
      });
    };

    /**
     * Charge le flux d'un viewer (blog ou docs) depuis le site en
     * direct — flux RSS ou sitemap+pages — puis reconstruit le
     * viewer avec ce que le site a répondu. Le repli local
     * (instantané JSON) reste géré par le flux lui-même.
     */
    const ensureFeedViewer = async (name) => {
      const feed = name === 'docs'
        ? window.PORTFOLIO_DOCS_FEED
        : window.PORTFOLIO_BLOG_FEED;
      const base = name === 'docs'
        ? window.PORTFOLIO_DOCS_BASE
        : window.PORTFOLIO_BLOG_BASE;
      const label = name === 'docs'
        ? 'requête de la documentation en direct…'
        : 'requête du flux du blog en direct…';
      if (!feed) return;
      try { await withLoading(feed.load(), label); }
      catch { /* site muet : viewer statique */ }
      if (feed.items.length > 0 && base) {
        window.PORTFOLIO_VIEWERS[name] = window.PORTFOLIO_DOC_VIEWER.create(
          feed.buildViewerConfig(base)
        );
      }
    };

    /**
     * blog : raccourci vers le viewer du blog (bastodoc), même
     * comportement que `open blog/blog.html` depuis n'importe où.
     * Les articles viennent du flux RSS du site (blogFeed.js),
     * avec repli sur l'instantané local si le flux est muet.
     */
    async function cmdBlog() {
      const node = lookUpTree('/root/blog/blog.html');
      if (!node) return 'blog : viewer introuvable — essayez : open blog/blog.html';
      if (!canReadFiles()) return 'blog : Permission non accordée';
      await ensureFeedViewer('blog');
      const error = spawnShell({ viewer: node, seedHistory: state.history.slice() });
      if (error) return error;
      return 'ouverture du blog dans une nouvelle fenêtre...';
    }

    /**
     * docs : raccourci vers le viewer de la documentation (bas-
     * todoc), même comportement que `open docs/docs.html`. La
     * navigation vient du site (docsFeed.js) — arbre des caté-
     * gories et pages lisibles — avec repli sur l'instantané
     * local si le site reste muet côté CORS.
     */
    async function cmdDocs() {
      const node = lookUpTree('/root/docs/docs.html');
      if (!node) return 'docs : viewer introuvable — essayez : open docs/docs.html';
      if (!canReadFiles()) return 'docs : Permission non accordée';
      await ensureFeedViewer('docs');
      const error = spawnShell({ viewer: node, seedHistory: state.history.slice() });
      if (error) return error;
      return 'ouverture de la documentation dans une nouvelle fenêtre...';
    }

    /**
     * Easter egg sudo rm -rf / : le portfolio entier fond en trame
     * ░ du haut vers le bas, puis un message de restauration
     * s'affiche avant le rechargement de la page, comme si le
     * système venait d'être réinstallé.
     */
    async function meltEverything() {
      // Tous les noeuds texte visibles, triés du haut vers le bas
      const nodes = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const tag = node.parentElement?.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
          return node.textContent.trim().length > 0
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      });
      let current = walker.nextNode();
      while (current) {
        const top = current.parentElement?.getBoundingClientRect().top ?? Infinity;
        nodes.push({ node: current, top });
        current = walker.nextNode();
      }
      nodes.sort((a, b) => a.top - b.top);

      // La trame descend par petits lots, au rythme aléatoire
      for (let i = 0; i < nodes.length; i += 3) {
        for (const { node } of nodes.slice(i, i + 3)) {
          node.textContent = '░'.repeat(node.textContent.length);
        }
        await delay(35 + Math.random() * 45);
      }

      await delay(700);
      const overlay = document.createElement('div');
      overlay.className = 'meltOverlay';
      overlay.textContent = 'réinitialisation du portfolio en cours...';
      document.body.appendChild(overlay);
      await delay(1400);
      window.location.reload();
    }

    /**
     * Easter egg : on ne devient pas root sur ce portfolio.
     * Refus systématique, à la manière du vrai sudo — sauf pour
     * la fameuse commande interdite, qui a un effet spécial.
     */
    function cmdSudo(args) {
      const username = prompt.textContent.split('@')[0];
      if (args.join(' ') === 'rm -rf /') {
        meltEverything();
        return null;
      }
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
      grep:   cmdGrep,
      wc:     cmdWc,
      echo:   cmdEcho,
      export: cmdExport,
      alias:  cmdAlias,
      unalias: cmdUnalias,
      sudo:   cmdSudo,
      blog:   cmdBlog,
      docs:   cmdDocs,
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
