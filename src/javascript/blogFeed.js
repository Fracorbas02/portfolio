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
  const SNAPSHOT_URL = './src/JSON/articles.json?v=2';

  const escape = window.PORTFOLIO_HTML.escapeHTML;
  const isSafeHref = window.PORTFOLIO_HTML.isSafeHref;

  let items = [];
  let live = false;
  let loading = null;

  // ── Extraction : HTML docusaurus → lignes de texte ───────────
  // Types de lignes : 'h' (titre de section), 'p' (paragraphe),
  // 'li' (puce), 'code' (ligne de bloc de code), 'row' (ligne de
  // tableau, cellules jointes par ' | '). Le code inline d'un
  // paragraphe est conservé entre backticks, le rendu du mode
  // lecture le remet en forme (renderArticle).
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
    const nodes = root.querySelectorAll('h2, h3, h4, p, li, pre, blockquote, tr');
    for (const el of nodes) {
      // Pas de doublons : p imbriqué dans une puce, cellule déjà
      // couverte par sa ligne de tableau
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

      if (el.tagName === 'TR') {
        const cells = Array.from(el.children)
          .map((c) => c.textContent.replace(/\s+/g, ' ').trim())
          .filter(Boolean);
        if (cells.length > 0) lines.push({ t: 'row', text: cells.join(' | ') });
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
  // un texte brut pour tout ce que le mode lecture sait rendre ;
  // les tokens du code sont validés au rendu.
  const validLine = (l) => {
    if (!l || typeof l.t !== 'string') return false;
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
        } else if (line.t === 'row') {
          out.push(`<span class="cvViewerMuted">  ${escape(line.text)}</span>`);
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
    buildViewerConfig,
    renderArticle,
    get items() { return items; },
    get live() { return live; }
  };
})();
