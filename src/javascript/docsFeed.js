/**
 * Docs Feed — documentation Docusaurus pour le viewer « docs » —
 * Bastien BONORA
 * -----------------------------------------------------------------
 * Récupère les pages de la documentation (docs.bastienbonora.fr)
 * pour les lire dans le shell : une section par catégorie de la
 * barre latérale du site, chaque page ouverte en mode lecture
 * dans le pager (même moteur que les articles du blog).
 *
 * Deux sources, comme blogFeed.js : le site live (sitemap puis
 * pages, avec fusion des barres latérales de chaque page — une
 * seule catégorie y est développée à la fois) si le serveur sert
 * des en-têtes CORS, sinon l'instantané local (src/JSON/docs.json)
 * généré côté serveur. Le viewer `docs` est reconstruit à partir
 * de la navigation obtenue.
 *
 * window.PORTFOLIO_DOCS_FEED :
 *   load()               -> Promise<pages> (live, sinon instantané)
 *   items                -> pages normalisées [{ title, link, lines }]
 *   tree                 -> catégories imbriquées [{ title, href,
 *                           children }]
 *   live                 -> true si les pages viennent du site
 *   buildViewerConfig(base) -> config docViewer : sections
 *                           préservées + une par catégorie
 */
(() => {
  'use strict';

  const BASE_URL     = 'https://docs.bastienbonora.fr';
  const SITEMAP_URL  = BASE_URL + '/sitemap.xml';
  const SNAPSHOT_URL = './src/JSON/docs.json?v=2';

  const extractLines = window.PORTFOLIO_BLOG_FEED.extractLines;

  let pages = [];
  let tree = [];
  let live = false;
  let loading = null;

  // ── Barre latérale SSR → fragment de navigation ──────────────
  // Une seule catégorie est développée par page : chaque page
  // fournit son chemin expansé, la fusion par href reconstruit
  // l'arbre complet. Une catégorie sans page d'index pointe vers
  // sa première fille — le href est alors partagé avec une page,
  // la fusion réconcilie les deux.
  const sidebarFragment = (doc) => {
    const nav = doc.querySelector('nav.theme-doc-sidebar-menu');
    if (!nav) return [];

    const itemLabel = (li) => {
      const a = li.querySelector('a');
      if (!a) return null;
      const span = a.querySelector('span[title]');
      return {
        title: (span?.getAttribute('title') ?? a.textContent).trim(),
        href: a.getAttribute('href')
      };
    };

    const parseList = (ul) => {
      const out = [];
      for (const li of ul.children) {
        if (li.tagName !== 'LI') continue;
        const label = itemLabel(li);
        if (!label || !label.href) continue;
        const children = [];
        const sub = li.querySelector(':scope > ul');
        if (sub) children.push(...parseList(sub));
        out.push({ ...label, children });
      }
      return out;
    };

    // nav.theme-doc-sidebar-menu porte aussi la classe menu__list :
    // ses enfants sont des li directs
    if (nav.querySelector(':scope > li')) return parseList(nav);
    const sub = nav.querySelector(':scope > ul');
    return sub ? parseList(sub) : [];
  };

  const mergeTree = (dst, frag) => {
    for (const node of frag) {
      let found = dst.find((d) => d.href === node.href);
      if (!found) {
        found = { title: node.title, href: node.href, children: [] };
        dst.push(found);
      }
      mergeTree(found.children, node.children);
    }
    return dst;
  };

  // ── Arbre → pages lisibles ───────────────────────────────────
  // Seules les feuilles (liens de pages) sont lisibles : les
  // catégories sans page d'index empruntent le href de leur
  // première fille, qui existe aussi comme feuille. L'ordre de
  // parcours est celui du snapshot (docs.json) : read d'une page
  // = son index dans items, identique dans la liste et le pager.
  const collectPages = (nodes, fetched, out) => {
    for (const node of nodes) {
      if (node.children.length > 0) {
        collectPages(node.children, fetched, out);
        continue;
      }
      const url = new URL(node.href, BASE_URL).href;
      if (fetched.has(url) && !out.some((p) => p.link === url)) {
        out.push({ title: node.title, link: url, lines: fetched.get(url) });
      }
    }
    return out;
  };

  // ── Sitemap → pages de documentation ─────────────────────────
  const docURLs = (xmlText) => {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) {
      throw new Error('sitemap mal formé');
    }
    return Array.from(doc.querySelectorAll('url > loc'))
      .map((loc) => loc.textContent.trim())
      .filter((u) => u.startsWith(BASE_URL + '/docs/')
        && !u.startsWith(BASE_URL + '/docs/category/')
        && !u.startsWith(BASE_URL + '/docs/tags'));
  };

  // ── Chargement : site live, sinon instantané local ───────────
  // Même contrainte de lignes que le flux blog : une ligne du
  // snapshot est gardée si son type est reconnu.
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

  const validTree = (nodes) => Array.isArray(nodes)
    && nodes.every((n) => n && typeof n.title === 'string'
      && typeof n.href === 'string'
      && (n.children === undefined || validTree(n.children)));

  async function fetchSnapshot() {
    const res = await fetch(SNAPSHOT_URL);
    if (!res.ok) throw new Error(`snapshot http ${res.status}`);
    const snap = await res.json();
    if (!validTree(snap?.tree)) throw new Error('snapshot sans navigation');
    const list = Array.isArray(snap?.pages) ? snap.pages : [];
    return {
      tree: snap.tree,
      pages: list.map((page) => ({
        title: page.title ?? '',
        link: page.link ?? '',
        lines: Array.isArray(page.lines)
          ? page.lines.filter(validLine)
          : []
      }))
    };
  }

  async function loadLive() {
    const res = await fetch(SITEMAP_URL);
    if (!res.ok) throw new Error(`sitemap http ${res.status}`);
    const urls = docURLs(await res.text());
    if (urls.length === 0) throw new Error('sitemap sans pages de doc');

    const docs = await Promise.all(urls.map(async (url) => {
      try {
        const page = await fetch(url);
        if (!page.ok) return null;
        return [url, await page.text()];
      } catch {
        return null;
      }
    }));

    const treeLocal = [];
    const fetched = new Map();
    for (const entry of docs) {
      if (!entry) continue;
      const [url, html] = entry;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      mergeTree(treeLocal, sidebarFragment(doc));
      fetched.set(url, extractLines(html));
    }
    if (fetched.size === 0) throw new Error('aucune page de doc lue');

    const pagesLocal = collectPages(treeLocal, fetched, []);
    for (const [url, lines] of fetched) {
      if (!pagesLocal.some((p) => p.link === url)) {
        pagesLocal.push({ title: url, link: url, lines });
      }
    }
    return { tree: treeLocal, pages: pagesLocal };
  }

  async function load() {
    if (pages.length > 0) return pages;
    loading ??= (async () => {
      try {
        ({ tree, pages } = await loadLive());
        live = true;
      } catch {
        try {
          ({ tree, pages } = await fetchSnapshot());
          live = false;
        } catch {
          tree = [];
          pages = [];
          live = false;
        }
      }
      return pages;
    })();
    return loading;
  }

  // ── Sections du viewer : une par catégorie racine ────────────
  // Chaque catégorie du premier niveau devient une rubrique
  // navigable : ↑↓ déplacent la sélection (docViewer navList),
  // ⏎ lit la page sélectionnée, 1-9 ouvrent les neuf premières.
  // Le label d'une page est la catégorie qui la contient — le
  // titre, lui, porte l'identité de la page.
  function categorySection(category, index) {
    const truncate = (title, width) =>
      title.length > width ? title.slice(0, width - 1) + '…' : title;

    const articleList = [];
    const walk = (node, label) => {
      for (const child of node.children) {
        if (child.children.length > 0) walk(child, child.title);
        else {
          const page = pages.find((p) =>
            p.link === new URL(child.href, BASE_URL).href);
          if (page) {
            articleList.push({
              label: truncate(label, 12),
              value: truncate(page.title, 40),
              href: page.link,
              read: pages.indexOf(page)
            });
          }
        }
      }
    };
    walk(category, category.title);

    return {
      id: `doc-${index}`,
      title: category.title,
      entries: [
        {
          heading: category.title,
          lines: [
            'Entrée ou un chiffre ouvre la page ici, dans un',
            'mode lecture façon less — pas de navigation.',
            'Dans la lecture, ^C l\'ouvre dans le navigateur.',
            'Les flèches ↑↓ parcourent toute la catégorie.'
          ]
        }
      ],
      listHeading: `Pages ${category.title.toLowerCase()}`,
      articleList
    };
  }

  /**
   * Reconstruit la config du viewer docs : les sections de la
   * config de base (viewerData.js) sont conservées en tête, les
   * catégories du site suivent, dans l'ordre de la barre latérale.
   */
  function buildViewerConfig(base) {
    if (pages.length === 0 || tree.length === 0) return base;
    const keep = (base.sections ?? [])
      .filter((s) => !s.id.startsWith('doc-'));
    const sections = [
      ...keep,
      ...tree.map((category, i) => categorySection(category, i))
    ];
    return { ...base, sections };
  }

  window.PORTFOLIO_DOCS_FEED = {
    BASE_URL,
    SITEMAP_URL,
    SNAPSHOT_URL,
    load,
    buildViewerConfig,
    get items() { return pages; },
    get tree() { return tree; },
    get live() { return live; }
  };
})();
