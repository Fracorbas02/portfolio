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
  const SNAPSHOT_URL = './src/JSON/articles.json?v=4';

  const escape = window.PORTFOLIO_HTML.escapeHTML;
  const isSafeHref = window.PORTFOLIO_HTML.isSafeHref;

  // Délai maximal d'une requête : au-delà, l'AbortController coupe
  // et le repli sur l'instantané local prend le relais au lieu de
  // laisser le spinner tourner jusqu'au timeout du navigateur.
  const FETCH_TIMEOUT_MS = 10_000;

  const fetchWithTimeout = (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    return fetch(url, { signal: controller.signal })
      .finally(() => clearTimeout(timer));
  };

  let items = [];
  let live = false;
  let loading = null;

  // ── Extraction : HTML docusaurus → lignes de texte ───────────
  // Types de lignes : 'h' (titre de section), 'p' (paragraphe),
  // 'li' (puce), 'code' (ligne de bloc de code), 'table' (tableau
  // complet, cellules par ligne), 'img' (image, remplacée par son
  // texte alternatif).
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

      // Image (capture, schéma) : le pager garde son URL pour
      // l'afficher à la lecture (imgHTML) — le snapshot aussi
      if (el.tagName === 'IMG') {
        const alt = (el.getAttribute('alt') || '').replace(/\s+/g, ' ').trim();
        lines.push({ t: 'img', text: alt || 'image',
          src: el.getAttribute('src') || '' });
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
    const res = await fetchWithTimeout(SNAPSHOT_URL);
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
        const res = await fetchWithTimeout(FEED_URL);
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

  // ── Images des articles : la vraie image, à la volée ────────
  // Le pager affiche l'image du site d'origine telle quelle : le
  // navigateur la télécharge au moment de la lecture — afficher
  // une image <img> n'est pas soumis au CORS, contrairement à la
  // lecture de son contenu. Sans src connu (flux muet), l'espace
  // indicatif [ image : alt ] reste.
  const imgHTML = (line, baseUrl) => {
    const caption = `<span class="readImg">  [ image : ${escape(line.text)} ]</span>`;
    const raw = typeof line.src === 'string' ? line.src.trim() : '';
    let src = null;
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(raw)) {
      // Image inline du flux : le base64 est sûr dans un attribut
      // src de <img> (jamais dans un href cliquable).
      src = raw;
    } else if (window.PORTFOLIO_HTML.isSafeHref(raw)) {
      try {
        const abs = new URL(raw, baseUrl ?? location.href).href;
        if (/^https?:/.test(abs)) src = abs;
      } catch { /* flux muet : espace indicatif */ }
    }
    if (!src) return caption;
    return `<div class="readImgFigure">`
      + `<img class="readImgReal" src="${escape(src)}"`
      + ` alt="${escape(line.text)}" loading="lazy"></div>`
      + `\n${caption}`;
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
        } else if (line.t === 'img') {
          out.push(imgHTML(line, item.link));
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
