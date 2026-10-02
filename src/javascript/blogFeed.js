/**
 * Blog Feed — flux RSS de Bastodoc pour le viewer « blog » — Bastien BONORA
 * ----------------------------------------------------------------------
 * Récupère les vrais articles du blog depuis le flux RSS du site de
 * documentation, avec repli sur un instantané local (src/JSON/
 * articles.json) si le flux est indisponible — CORS absent, site
 * hors-ligne, flux mal formé. Le viewer `blog` est alors reconstruit
 * à partir des articles obtenus.
 *
 * Chaque article est réduit en lignes de texte brut : titres, bou-
 * ticks, listes, code — de quoi remplir le mode lecture du pager
 * sans dépendre du rendu du site d'origine. Les lignes de code
 * gardent en plus les tokens Prism du flux : le pager colore,
 * le snapshot les restitue tels quels.
 *
 * window.PORTFOLIO_BLOG_FEED :
 *   load()               -> Promise<items>  (flux live, sinon instantané)
 *   items                -> articles normalisés [{ title, link,
 *                           pubDate, description, lines }]
 *   live                  -> true si les articles viennent du flux
 *   buildViewerConfig(base) -> config docViewer avec les sections
 *                           articles/archives reconstruites
 *   renderArticle(item)  -> HTML du mode lecture (pager)
 *   parseFeed(xmlText)   -> items depuis un XML RSS (publié pour
 *                           les tests et la génération du snapshot)
 */
(() => {
  'use strict';

  const FEED_URL     = 'https://docs.hexanibble.fr/blog/rss.xml';
  const SNAPSHOT_URL = './src/JSON/articles.json?v=3';

  const escape = window.PORTFOLIO_HTML.escapeHTML;
  const isSafeHref = window.PORTFOLIO_HTML.isSafeHref;

  let items = [];
  let live = false;
  let loading = null;

  // ── Extraction : HTML docusaurus → lignes de texte ───────────
  // Types de lignes : 'h' (titre de section), 'p' (paragraphe),
  // 'li' (puce), 'code' (ligne de bloc de code), 'table' (tableau
  // complet, cellules par ligne), 'mermaid' (source d'un
  // diagramme), 'img' (image, remplacée par son texte alternatif).
  // Le code inline d'un paragraphe est conservé entre backticks,
  // le rendu du mode lecture le remet en forme (renderArticle).
  const inlineText = (el) => {
    let out = '';
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          out += child.textContent;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.tagName === 'BR') out += ' ';
          else if (child.tagName === 'CODE') out += `\`${child.textContent}\``;
          else walk(child);
        }
      }
    };
    walk(el);
    return out.replace(/\s+/g, ' ').trim();
  };

  // Bloc de code docusaurus : une div .token-line par ligne (avec
  // un <br> final qui ne vaut rien dans textContent) — sans ce
  // traitement, tout le bloc se retrouve collé sur une ligne.
  // Le flux fournit aussi la coloration Prism : chaque ligne garde
  // ses segments colorés [classe brute, position] — les segments
  // neutres (« token plain ») ne sont pas stockés, le texte brut
  // suffit à les restituer (codeLineHTML).
  const codeLine = (lineEl) => {
    const text = lineEl.textContent.replace(/\s+$/, '');
    const tok = [];
    let pos = 0;
    for (const span of lineEl.children) {
      const cls = (span.className || '').replace(/^token\s+/, '').trim();
      const chunk = span.textContent;
      if (cls && cls !== 'plain') tok.push([cls, pos]);
      pos += chunk.length;
    }
    return { text, tok };
  };

  const codeLines = (pre) => {
    const tokenLines = pre.querySelectorAll('.token-line');
    if (tokenLines.length > 0) {
      return Array.from(tokenLines, codeLine);
    }
    const clone = pre.cloneNode(true);
    clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    return clone.textContent
      .replace(/\t/g, '  ')
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .map((text) => ({ text, tok: [] }));
  };

  // Diagramme mermaid : selon le thème docusaurus, la source se
  // présente en <pre class="mermaid"> (thème mermaid, rendu côté
  // client) ou en bloc de code classique language-mermaid.
  const isMermaid = (pre) =>
    pre.classList.contains('mermaid')
    || /(?:^|\s)language-mermaid(?:\s|$)/.test(pre.className)
    || !!pre.querySelector('code.language-mermaid');

  function extractLines(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const root = doc.querySelector('article') ?? doc.body;
    root.querySelectorAll('script, style, nav, aside, button, iframe, svg')
      .forEach((n) => n.remove());

    const lines = [];
    const nodes = root.querySelectorAll(
      'h2, h3, h4, p, li, pre, blockquote, table, img');
    for (const el of nodes) {
      // Pas de doublons : p imbriqué dans une puce
      if (el.tagName === 'P' && el.closest('li')) continue;
      if (el.tagName !== 'PRE' && el.closest('pre')) continue;

      // Diagramme mermaid : la source du bloc devient une ligne
      // « mermaid » — le pager la dessine en ASCII (mermaidHTML).
      if (el.tagName === 'PRE' && isMermaid(el)) {
        lines.push({
          t: 'mermaid',
          text: codeLines(el).map((l) => l.text).join('\n')
        });
        continue;
      }

      if (el.tagName === 'PRE') {
        for (const raw of codeLines(el)) {
          const entry = { t: 'code', text: raw.text };
          if (raw.tok.length > 0) entry.tok = raw.tok;
          lines.push(entry);
        }
        continue;
      }

      // Tableau complet : les lignes gardent leurs cellules, le
      // rendu aligne les colonnes et dessine les cadres
      // (tableHTML). head = nombre de lignes d'en-tête (thead).
      if (el.tagName === 'TABLE') {
        const trs = el.querySelectorAll('tr');
        if (trs.length === 0) continue;
        const rows = Array.from(trs, (tr) =>
          Array.from(tr.children, (c) =>
            c.textContent.replace(/\s+/g, ' ').trim()));
        if (rows.some((r) => r.some((c) => c !== ''))) {
          lines.push({ t: 'table', head: el.querySelectorAll('thead tr').length, rows });
        }
        continue;
      }

      // Image (capture, schéma) : le pager ne la télécharge pas —
      // un espace la signale, le ^C ouvre l'article pour la voir
      if (el.tagName === 'IMG') {
        const alt = (el.getAttribute('alt') || '').replace(/\s+/g, ' ').trim();
        lines.push({ t: 'img', text: alt || 'image' });
        continue;
      }

      const text = inlineText(el);
      if (!text) continue;
      if (el.tagName === 'LI') lines.push({ t: 'li', text });
      else if (/^H[234]$/.test(el.tagName)) lines.push({ t: 'h', text });
      else lines.push({ t: 'p', text });
    }
    return lines;
  }

  // ── Date courte « JJ/MM/AA » pour les listes d'articles ──────
  function shortDate(pubDate) {
    const d = new Date(pubDate);
    if (Number.isNaN(d.getTime())) return '??/??/??';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
  }

  function longDate(pubDate) {
    const d = new Date(pubDate);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // ── Parseur RSS (RSS 2.0, docusaurus) ────────────────────────
  function parseFeed(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) {
      throw new Error('flux rss mal formé');
    }
    const out = [];
    for (const item of doc.querySelectorAll('item')) {
      const title = item.querySelector('title')?.textContent?.trim();
      const link = item.querySelector('link')?.textContent?.trim();
      if (!title || !link) continue;
      const description = item.querySelector('description')?.textContent?.trim() ?? '';
      const content = item.getElementsByTagName('content:encoded')[0]?.textContent
        ?? description;
      out.push({
        title, link,
        pubDate: item.querySelector('pubDate')?.textContent?.trim() ?? '',
        description,
        lines: extractLines(content)
      });
    }
    return out;
  }

  // ── Chargement : flux live, sinon instantané local ───────────
  // Une ligne du snapshot est gardée si son type est reconnu :
  // les tableaux portent leurs cellules (rows), les autres types
  // un texte brut ; les tokens du code sont validés au rendu.
  const validLine = (l) => {
    if (!l || typeof l.t !== 'string') return false;
    if (l.t === 'table') {
      return typeof l.head === 'number'
        && Array.isArray(l.rows)
        && l.rows.every((r) => Array.isArray(r)
          && r.every((c) => typeof c === 'string'));
    }
    return typeof l.text === 'string';
  };

  async function fetchSnapshot() {
    const res = await fetch(SNAPSHOT_URL);
    if (!res.ok) throw new Error(`snapshot http ${res.status}`);
    const snap = await res.json();
    const list = Array.isArray(snap?.items) ? snap.items : [];
    return list.map((item) => ({
      title: item.title ?? '',
      link: item.link ?? '',
      pubDate: item.pubDate ?? '',
      description: item.description ?? '',
      lines: Array.isArray(item.lines)
        ? item.lines.filter(validLine)
        : []
    }));
  }

  async function load() {
    if (items.length > 0) return items;
    loading ??= (async () => {
      try {
        const res = await fetch(FEED_URL);
        if (!res.ok) throw new Error(`flux http ${res.status}`);
        const parsed = parseFeed(await res.text());
        if (parsed.length === 0) throw new Error('flux vide');
        items = parsed;
        live = true;
      } catch {
        try {
          items = await fetchSnapshot();
          live = false;
        } catch {
          items = [];
          live = false;
        }
      }
      return items;
    })();
    return loading;
  }

  // ── Section articles du viewer ───────────────────────────────
  // Tous les articles du flux dans une liste navigable : ↑↓
  // déplacent la sélection (docViewer navList), ⏎ lit l'article
  // sélectionné, 1-9 ouvrent les neuf premiers.
  function articlesSection() {
    const truncate = (title, width) =>
      title.length > width ? title.slice(0, width - 1) + '…' : title;
    return {
      id: 'articles',
      title: 'Les articles',
      entries: [
        {
          heading: 'Lus sans quitter le shell',
          lines: [
            'Entrée ou un chiffre ouvre l\'article ici, dans un',
            'mode lecture façon less — pas de navigation.',
            'Dans la lecture, ^C l\'ouvre dans le navigateur.',
            'Les flèches ↑↓ parcourent toute la liste.'
          ]
        }
      ],
      listHeading: 'Tous les articles du flux',
      articleList: items.map((item, i) => ({
        label: shortDate(item.pubDate),
        value: truncate(item.title, 40),
        href: item.link,
        read: i
      }))
    };
  }

  /**
   * Reconstruit la config du viewer blog : section articles issue
   * du flux, write-ups et plateforme conservés depuis la config de
   * base (viewerData.js).
   */
  function buildViewerConfig(base) {
    if (items.length === 0) return base;
    const keep = (base.sections ?? []).filter(
      (s) => s.id !== 'articles' && s.id !== 'archives'
    );
    const writeupsAt = keep.findIndex((s) => s.id === 'writeups');
    const insertAt = writeupsAt === -1 ? 0 : writeupsAt;
    const sections = [
      ...keep.slice(0, insertAt),
      articlesSection(),
      ...keep.slice(insertAt)
    ];
    return { ...base, sections };
  }

  // ── Rendu du mode lecture (pager) ────────────────────────────
  // Le code inline extrait entre backticks redevient un span
  // coloré ; les lignes de code consécutives forment un bloc,
  // colorées quand le flux a fourni ses tokens Prism.
  const inlineHTML = (text) =>
    escape(text).replace(/`([^`]+)`/g, '<span class="readInline">$1</span>');

  // Familles de couleurs : les classes Prism du flux, parfois
  // composées (« token string variable »), sont réduites à la
  // première famille reconnue. Les classes restantes (plain,
  // operator, punctuation) gardent la couleur du texte.
  const TOKEN_FAMILIES = [
    ['cmt', ['comment', 'docstring']],
    ['str', ['string', 'char', 'boolean', 'scalar']],
    ['kw', ['keyword', 'instruction', 'atrule', 'important',
            'macro', 'directive', 'shebang', 'section']],
    ['fn', ['function', 'builtin', 'class-name']],
    ['num', ['number', 'unit', 'constant']],
    ['var', ['property', 'attr-name', 'attr-value', 'key',
             'assign-left', 'variable', 'parameter', 'namespace',
             'selector', 'section-name', 'symbol', 'options']]
  ];
  const tokenClass = (raw) => {
    for (const [family, words] of TOKEN_FAMILIES) {
      if (words.some((w) => raw.includes(w))) return family;
    }
    return '';
  };

  // Une ligne de code : texte brut échappé, ou segments colorés
  // quand les tokens sont là. Chaque token couvre de sa position
  // à celle du suivant — le rendu ne dépend jamais de l'intégrité
  // du snapshot : un token hors bornes est ignoré.
  const codeLineHTML = (line) => {
    const marks = (Array.isArray(line.tok) ? line.tok : [])
      .filter((t) => Array.isArray(t) && typeof t[0] === 'string'
        && Number.isInteger(t[1]) && t[1] >= 0 && t[1] <= line.text.length)
      .sort((a, b) => a[1] - b[1]);
    if (marks.length === 0) return escape(line.text);
    let html = '';
    let pos = 0;
    for (let i = 0; i < marks.length; i++) {
      const [cls, off] = marks[i];
      if (off < pos) continue;
      const end = i + 1 < marks.length ? marks[i + 1][1] : line.text.length;
      html += escape(line.text.slice(pos, off));
      const seg = escape(line.text.slice(off, end));
      const family = tokenClass(cls);
      html += family
        ? `<span class="readTok readTok--${family}">${seg}</span>`
        : seg;
      pos = end;
    }
    return html + escape(line.text.slice(pos));
  };

  // ── Tableaux : cadres ASCII, colonnes alignées ───────────────
  // Les cellules longues sont repliées (TABLE_COL_MAX) pour que
  // le tableau reste lisible dans la fenêtre ; les lignes trop
  // larges défilent à l'horizontale, comme les blocs de code.
  const TABLE_COL_MAX = 38;

  const wrapCell = (text, max) => {
    const out = [];
    let line = '';
    for (const word of text.split(' ')) {
      let w = word;
      while (w.length > max) { // mot seul plus long : coupe dure
        if (line !== '') { out.push(line); line = ''; }
        out.push(w.slice(0, max));
        w = w.slice(max);
      }
      if (w === '') continue;
      if (line === '') line = w;
      else if (line.length + 1 + w.length <= max) line += ' ' + w;
      else { out.push(line); line = w; }
    }
    out.push(line);
    return out;
  };

  const tableHTML = (table) => {
    const rows = Array.isArray(table.rows)
      ? table.rows.filter((r) => r.some((c) => c !== ''))
      : [];
    if (rows.length === 0) return '';
    const cols = Math.max(...rows.map((r) => r.length));
    const grid = rows.map((r) => Array.from({ length: cols }, (_, i) =>
      wrapCell(typeof r[i] === 'string' ? r[i] : '', TABLE_COL_MAX)));
    const widths = Array.from({ length: cols }, (_, i) =>
      Math.max(...grid.map((cells) => Math.max(...cells[i].map((l) => l.length)))));

    const border = (l, m, r) =>
      `<span class="readTableBorder">${l}${widths.map((w) => '─'.repeat(w + 2)).join(m)}${r}</span>`;
    const rowHTML = (cells, isHead) =>
      `<span class="readTableBorder">│</span>${cells.map((cell, i) => {
        const pad = ' '.repeat(widths[i] - cell.length);
        const body = isHead
          ? `<span class="readTableHead">${escape(cell)}</span>`
          : escape(cell);
        return ` ${body}${pad} <span class="readTableBorder">│</span>`;
      }).join('')}`;

    const out = [border('┌', '┬', '┐')];
    rows.forEach((_, r) => {
      const isHead = r < table.head;
      const height = Math.max(...grid[r].map((c) => c.length));
      for (let k = 0; k < height; k++) {
        out.push(rowHTML(grid[r].map((c) => c[k] ?? ''), isHead));
      }
      // Séparateur sous la dernière ligne d'en-tête
      if (isHead && r + 1 === table.head) out.push(border('├', '┼', '┤'));
    });
    out.push(border('└', '┴', '┘'));
    return `<div class="readTable">${out.join('\n')}</div>`;
  };

  // ── Diagrammes mermaid : flowcharts en ASCII ────────────────
  // Le pager ne dessine pas tout mermaid — il vise les usages
  // courants des articles d'infra : une chaîne d'étapes (boîtes
  // reliées par │ ▼ ou ──►) ou un arbre de dépendances (branches
  // ├──►). Le reste retombe sur la source dans un bloc de code.
  const MERMAID_ID = '[A-Za-z0-9_.-]+';
  const MERMAID_SHAPE = String.raw`\[[^\]]*\]|\([^)]*\)|\{[^}]*\}`;
  const labelOf = (shape) =>
    shape.replace(/^[\[({]+/, '').replace(/[\])}]+$/, '').trim();

  const parseFlow = (src) => {
    const rows = src.split('\n').map((l) => l.trim()).filter(Boolean);
    const dir = /^(?:flowchart|graph)\s+(TD|TB|BT|LR|RL)\b/i.exec(rows[0] ?? '');
    if (!dir) return null;
    const nodes = new Map();
    const edges = [];
    const shape = `(${MERMAID_SHAPE})?`;
    const arrowRe = new RegExp(
      `^(${MERMAID_ID})\\s*${shape}\\s*(?:-\\.->|-->|==>|===|---|--o|--x)` +
      `\\s*(?:\\|([^|]*)\\|)?\\s*(${MERMAID_ID})\\s*${shape}$`);
    const textRe = new RegExp(
      `^(${MERMAID_ID})\\s*${shape}\\s*--\\s+(.+?)\\s+-->\\s*(${MERMAID_ID})\\s*${shape}$`);
    const label = (id, sh) => nodes.set(id, sh ? labelOf(sh) || id : id);
    for (const row of rows.slice(1)) {
      if (/^(%%|style\s|classDef\s|class\s|click\s|subgraph\b|end\b)/.test(row)) continue;
      let m = arrowRe.exec(row);
      if (m) {
        label(m[1], m[2]);
        label(m[4], m[5]);
        edges.push({ from: m[1], to: m[4], text: (m[3] ?? '').trim() });
        continue;
      }
      m = textRe.exec(row);
      if (m) {
        label(m[1], m[2]);
        label(m[4], m[5]);
        edges.push({ from: m[1], to: m[4], text: m[3].trim() });
        continue;
      }
      m = new RegExp(`^(${MERMAID_ID})\\s*(${MERMAID_SHAPE})$`).exec(row);
      if (m) label(m[1], m[2]);
    }
    if (edges.length === 0 || nodes.size === 0) return null;
    return { vertical: !/^(LR|RL)$/.test(dir[1].toUpperCase()), nodes, edges };
  };

  // Chaîne : chaque noeud a un seul suivant, un seul départ — la
  // suite des boîtes se dessine reliée de bout en bout.
  const findChain = (flow) => {
    const { nodes, edges } = flow;
    if (edges.length !== nodes.size - 1) return null;
    const byFrom = new Map(edges.map((e) => [e.from, e]));
    const starts = [...nodes.keys()].filter(
      (id) => !edges.some((e) => e.to === id));
    if (starts.length !== 1) return null;
    const seq = [];
    const seen = new Set();
    let cur = starts[0];
    while (cur !== undefined) {
      if (seen.has(cur)) return null;
      seen.add(cur);
      seq.push(cur);
      cur = byFrom.get(cur)?.to;
    }
    return seen.size === nodes.size ? { seq, byFrom } : null;
  };

  // Arbre : chaque noeud a au plus un parent, aucun cycle — les
  // dépendances se dessinent en branches ├──► / └──►.
  const findTree = (flow) => {
    const { nodes, edges } = flow;
    const children = new Map([...nodes.keys()].map((id) => [id, []]));
    const parent = new Map();
    for (const e of edges) {
      if (parent.has(e.to)) return null;
      parent.set(e.to, e);
      children.get(e.from)?.push(e);
    }
    for (const id of nodes.keys()) {
      const path = new Set();
      let cur = id;
      while (cur !== undefined) {
        if (path.has(cur)) return null;
        path.add(cur);
        cur = parent.get(cur)?.from;
      }
    }
    const roots = [...nodes.keys()].filter((id) => !parent.has(id));
    return roots.length > 0 ? { children, roots } : null;
  };

  const mermaidSourceHTML = (src) =>
    `<span class="cvViewerMuted">  diagramme mermaid — source :</span>\n`
    + `<div class="readCodeBlock">${escape(src.replace(/\s+$/, ''))}</div>`;

  const chainHTML = (flow, chain) => {
    const label = (id) => flow.nodes.get(id) ?? id;
    const inner = Math.max(...chain.seq.map((id) => label(id).length)) + 2;
    const c = Math.floor(inner / 2); // colonne centrale, dans la boîte
    const frames = chain.seq.map((id) => {
      const t = label(id);
      const left = Math.floor((inner - t.length) / 2);
      const body = ' '.repeat(left) + t + ' '.repeat(inner - t.length - left);
      return {
        top: `┌${'─'.repeat(inner)}┐`,
        mid: `│${body}│`,
        // En vertical, le ┬ attache la flèche descendante ; en
        // horizontal, rien ne part du bas — bord plein.
        bot: flow.vertical
          ? `└${'─'.repeat(c)}┬${'─'.repeat(inner - c - 1)}┘`
          : `└${'─'.repeat(inner)}┘`
      };
    });
    const B = (s) => `<span class="readDiagramBox">${s}</span>`;
    const A = (s) => `<span class="readDiagramArrow">${s}</span>`;
    const out = [];
    if (flow.vertical) {
      chain.seq.forEach((id, i) => {
        out.push(B(frames[i].top), B(frames[i].mid), B(frames[i].bot));
        if (i + 1 < chain.seq.length) {
          const e = chain.byFrom.get(id);
          const stem = `${' '.repeat(c + 1)}${A('│')}`
            + (e.text ? ` ${escape(e.text)}` : '');
          out.push(stem, `${' '.repeat(c + 1)}${A('▼')}`);
        }
      });
    } else {
      const tRow = [], mRow = [], bRow = [];
      chain.seq.forEach((id, i) => {
        tRow.push(B(frames[i].top));
        mRow.push(B(frames[i].mid));
        bRow.push(B(frames[i].bot));
        if (i + 1 < chain.seq.length) {
          const e = chain.byFrom.get(id);
          const arrow = e.text ? `─ ${escape(e.text)} ─►` : '─────►';
          const gap = ' '.repeat(arrow.length + 2);
          mRow.push(` ${A(arrow)} `);
          tRow.push(gap);
          bRow.push(gap);
        }
      });
      out.push(tRow.join(''), mRow.join(''), bRow.join(''));
    }
    return `<div class="readDiagram">${out.join('\n')}</div>`;
  };

  const treeHTML = (flow, tree) => {
    const out = [];
    const walk = (id, prefix, isLast, edge) => {
      const label = flow.nodes.get(id) ?? id;
      const head = edge === null
        ? ''
        : `${prefix}<span class="readDiagramArrow">${isLast ? '└──►' : '├──►'}</span> `;
      const tail = edge?.text
        ? ` <span class="readDiagramArrow">— ${escape(edge.text)} —</span>` : '';
      out.push(`${head}${escape(label)}${tail}`);
      const kids = tree.children.get(id) ?? [];
      kids.forEach((e, i) => walk(
        e.to,
        prefix + (edge === null ? '' : (isLast ? '    ' : '│   ')),
        i === kids.length - 1,
        e));
    };
    for (const root of tree.roots) walk(root, '', true, null);
    return `<div class="readDiagram">${out.join('\n')}</div>`;
  };

  const mermaidHTML = (src) => {
    const flow = parseFlow(src);
    if (!flow) return mermaidSourceHTML(src);
    const chain = findChain(flow);
    if (chain) return chainHTML(flow, chain);
    const tree = findTree(flow);
    if (tree) return treeHTML(flow, tree);
    return mermaidSourceHTML(src);
  };

  // ── Images des articles : demi-blocs colorés ────────────────
  // Le snapshot pré-calcule l'image en demi-blocs : chaque ▄
  // porte son pixel bas en couleur de texte et son pixel haut en
  // couleur de fond — deux lignes de pixels par ligne de texte,
  // sans jamais charger l'image dans le navigateur. Sans art
  // (flux live, image introuvable), l'espace indicatif reste.
  const SAFE_COLOR = /^#[0-9a-f]{6}$/i;
  const imgHTML = (line) => {
    const caption = `<span class="readImg">  [ image : ${escape(line.text)} ]</span>`;
    const art = Array.isArray(line.art) ? line.art : null;
    if (!art) return caption;
    const rows = [];
    for (const runs of art) {
      if (!Array.isArray(runs)) return caption;
      let row = '';
      for (const run of runs) {
        if (!Array.isArray(run) || !Number.isInteger(run[2]) || run[2] < 1) {
          return caption;
        }
        const up = run[0], low = run[1];
        if (!up && !low) {
          row += ' '.repeat(run[2]);
          continue;
        }
        if ((up && !SAFE_COLOR.test(up)) || (low && !SAFE_COLOR.test(low))) {
          return caption;
        }
        const style = low
          ? `color:${low}${up ? `;background-color:${up}` : ''}`
          : `color:${up}`;
        row += `<span class="readImgArt" style="${style}">`
          + (low ? '▄' : '▀').repeat(run[2]) + '</span>';
      }
      rows.push(row);
    }
    if (rows.length === 0) return caption;
    return `<div class="readImgArtBlock">${rows.join('\n')}</div>\n${caption}`;
  };

  function renderArticle(item) {
    const out = [`<span class="cliSection">${escape(item.title)}</span>`];
    const date = longDate(item.pubDate);
    if (date) out.push(`<span class="cvViewerMuted">${escape(date)} · bastodoc</span>`);
    out.push('');

    let previous = null;
    let codeRun = [];
    const flushCode = () => {
      if (codeRun.length === 0) return;
      out.push(`<div class="readCodeBlock">${codeRun.map(codeLineHTML).join('\n')}</div>`);
      codeRun = [];
    };

    for (const line of item.lines ?? []) {
      // Séparateur entre blocs de natures différentes : le code
      // d'un même bloc reste serré.
      if (previous !== null && previous !== line.t) {
        flushCode();
        out.push('');
      }
      if (line.t === 'code') {
        codeRun.push(line);
      } else {
        if (line.t === 'h') {
          out.push(`<span class="cliSection">${escape(line.text)}</span>`);
        } else if (line.t === 'li') {
          out.push(`  • ${inlineHTML(line.text)}`);
        } else if (line.t === 'table') {
          const html = tableHTML(line);
          if (html) out.push(html);
        } else if (line.t === 'mermaid') {
          out.push(mermaidHTML(line.text));
        } else if (line.t === 'img') {
          out.push(imgHTML(line));
        } else {
          out.push(inlineHTML(line.text));
        }
      }
      previous = line.t;
    }
    flushCode();
    return out.join('\n');
  }

  window.PORTFOLIO_BLOG_FEED = {
    FEED_URL,
    load,
    parseFeed,
    extractLines,
    buildViewerConfig,
    renderArticle,
    get items() { return items; },
    get live() { return live; }
  };
})();
