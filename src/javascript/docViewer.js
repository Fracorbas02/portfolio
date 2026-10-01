/**
 * Document Viewer — moteur générique — Bastien BONORA
 * --------------------------------------------------
 * Moteur de pages interactives consultables dans le shell, à la
 * manière du viewer de CV : menu ASCII navigable au clavier,
 * rubriques, panneau latéral animé (logos, ticker, spinner) et
 * barre de raccourcis façon nano. Piloté par données : chaque
 * viewer n'est qu'un objet de configuration passé à create().
 *
 * Le pilotage clavier (flèches, Entrée, Échap, q, chiffres 1-9,
 * Ctrl+C) reste géré par script.js, comme pour le viewer CV.
 *
 * create(config) -> API identique à window.CV_VIEWER :
 *   sections() / render(viewerState) / renderMain(viewerState)
 *   / bar(viewerState) / links(sectionId)
 *   / startAnimations(scope) / stopAnimations()
 *
 * config : {
 *   title, subtitle,          — cartouche du menu
 *   sections: [{ id, title, entries: [{ heading, sub, lines,
 *              links }] }],   — même forme que le CV
 *   logos: [{ title, art }],  — rotation du panneau latéral
 *   platforms: [string],      — lignes du ticker plateformes
 *   typedPhrases: [string],   — texte tapé dans le statut
 *   statusLabel: string,      — texte du spinner (défaut :
 *                               'scan du périmètre...')
 *   ctrlLabel: string         — libellé du ^C dans la barre bas
 * }
 */
(() => {
  'use strict';

  const escape = (text) => String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // ── Constantes de mise en page (identiques au viewer CV) ────
  const WIDTH = 58;
  const SIDE_WIDTH = 30;
  const LOGO_W = 26;
  const LOGO_ROWS = 7;
  const LOGO_HOLD_TICKS = 40; // ~4,4 s d'affichage par logo (110 ms/tick)
  const BADGE_ROWS = 5;
  const BADGE_W = SIDE_WIDTH - 1;
  const BADGE_SCROLL_TICKS = 6; // ~0,66 s par ligne (110 ms/tick)
  const SPIN_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  const headingHTML = (text) =>
    `<span class="cvViewerHeading">${escape(text)}</span>`;
  const subHTML = (text) =>
    `<span class="cvViewerSub">${escape(text)}</span>`;
  const textHTML = (text) =>
    `<span class="cvViewerText">${escape(text)}</span>`;
  const mutedHTML = (text) =>
    `<span class="cvViewerMuted">${escape(text)}</span>`;

  /** Ligne de contenu : texte simple ou lien cliquable. */
  const lineHTML = (line) => {
    if (typeof line === 'string') return `  • ${textHTML(line)}`;
    const external = /^https?:/.test(line.href);
    return `  • <a class="cvViewerLink" href="${escape(line.href)}"${
      external ? ' target="_blank" rel="noopener noreferrer"' : ''
    }">${textHTML(line.text)}</a>`;
  };

  /** Encadré du panneau latéral : le pad compte le texte visible. */
  const sideBox = (title, rows, titleClass = 'cvViewerMuted') => {
    const bar = '─'.repeat(SIDE_WIDTH);
    const row = (r) => r.border ? `├${bar}┤`
      : `│ ${r.html}${' '.repeat(Math.max(0, SIDE_WIDTH - 1 - r.text.length))}│`;
    return [
      `┌${bar}┐`,
      row({ html: `<span class="${titleClass}">${escape(title)}</span>`, text: title }),
      `├${bar}┤`,
      ...rows.map(row),
      `└${bar}┘`
    ].join('\n');
  };

  window.PORTFOLIO_DOC_VIEWER = {
    /**
     * Construit un viewer complet à partir d'un jeu de données.
     * Chaque instance possède son propre état d'animation : deux
     * viewers ouverts dans deux fenêtres de shell vivent leur vie.
     */
    create(config) {
      const {
        title, subtitle, sections,
        logos = [], platforms = [], typedPhrases = [],
        statusLabel = 'scan du périmètre...', ctrlLabel = 'quitter'
      } = config;

      // ── Écran menu : cartouche titre + rubriques ─────────────
      const renderMenu = (index) => {
        const visible = [
          { html: `<span class="cvViewerTitle">${escape(title)}</span>`, text: title },
          { html: `<span class="cvViewerSubtitle">${escape(subtitle)}</span>`, text: subtitle },
          { border: true },
          ...sections.map((section, i) => ({
            html: `<span class="${i === index ? 'cvViewerItemSelected' : 'cvViewerItem'}">${escape((i === index ? '► ' : '  ') + section.title)}</span>`,
            text: (i === index ? '► ' : '  ') + section.title
          })),
          { border: true },
          { html: mutedHTML('Tout est cliquable, tout est réel.'), text: 'Tout est cliquable, tout est réel.' }
        ];

        const bar = '─'.repeat(WIDTH);
        const rows = visible.map((v) =>
          v.border ? `├${bar}┤` : `│${v.html}${' '.repeat(Math.max(0, WIDTH - v.text.length))}│`
        );
        return [`┌${bar}┐`, ...rows, `└${bar}┘`].join('\n');
      };

      // ── Écran rubrique : barre de titre + contenu ────────────
      const renderSection = (sectionId) => {
        const section = sections.find((s) => s.id === sectionId);
        if (!section) return renderMenu(0);

        const lines = [];
        let linkIndex = 0; // numérotation globale : touches 1-9
        for (const entry of section.entries) {
          lines.push(headingHTML(entry.heading));
          if (entry.sub) lines.push(subHTML(entry.sub));
          if (entry.lines) {
            for (const line of entry.lines) lines.push(lineHTML(line));
          }
          if (entry.links) {
            // Items numérotés : le numéro ouvre le lien au clavier
            for (const link of entry.links) {
              linkIndex += 1;
              const external = /^https?:/.test(link.href);
              const prefix = `  ${linkIndex} `;
              lines.push(`${prefix}<a class="cvViewerLink" href="${escape(link.href)}"${
                external ? ' target="_blank" rel="noopener noreferrer"' : ''
              }>${textHTML(link.label.padEnd(10))} ${textHTML(link.value)}</a>`);
            }
          }
          lines.push('');
        }
        lines.pop(); // dernier saut de ligne superflu

        const header = `  ${section.title.toUpperCase()}`;
        const body = [
          `┌─${escape(header)}─${'─'.repeat(Math.max(0, WIDTH - header.length - 3))}┐`,
          '',
          ...lines.map((l) => `  ${l}`)
        ].join('\n');

        return `<div class="cvViewerSection">${body}</div>`;
      };

      // ── Panneau latéral : logos animés + ticker + statut ──────
      // Le logo courant reste affiché, s'efface ligne par ligne
      // (trame ░) puis le suivant se dessine. Toutes les lignes
      // sont complétées à LOGO_W pour garder le cadre aligné.
      const logoState = { i: 0, phase: 'hold', ticks: LOGO_HOLD_TICKS, row: 0 };
      const badgeState = { offset: 0, ticks: BADGE_SCROLL_TICKS };

      const badgeWindow = () => {
        if (platforms.length === 0) return [];
        const rows = [];
        for (let k = 0; k < BADGE_ROWS; k++) {
          rows.push(
            platforms[(badgeState.offset + k) % platforms.length]
              .padEnd(BADGE_W).slice(0, BADGE_W)
          );
        }
        return rows;
      };

      const animateBadges = (scope) => {
        if (platforms.length === 0) return;
        const rows = scope.querySelectorAll('.cvViewerBadgeRow');
        if (rows.length < BADGE_ROWS) return;
        badgeState.ticks -= 1;
        if (badgeState.ticks > 0) return;
        badgeState.ticks = BADGE_SCROLL_TICKS;
        badgeState.offset = (badgeState.offset + 1) % platforms.length;
        const win = badgeWindow();
        rows.forEach((row, i) => { row.textContent = win[i]; });
      };

      const animateLogo = (scope) => {
        if (logos.length === 0) return;
        const rows = scope.querySelectorAll('.cvViewerLogoRow');
        const title = scope.querySelector('.cvViewerLogoTitle');
        if (rows.length < LOGO_ROWS || !title) return;

        if (logoState.phase === 'hold') {
          logoState.ticks -= 1;
          if (logoState.ticks > 0) return;
          logoState.phase = 'wipe';
          logoState.row = 0;
          return;
        }

        if (logoState.phase === 'wipe') {
          rows[logoState.row].textContent = '░'.repeat(LOGO_W);
          logoState.row += 1;
          if (logoState.row >= LOGO_ROWS) {
            logoState.phase = 'draw';
            logoState.row = 0;
            logoState.i = (logoState.i + 1) % logos.length;
            title.textContent = logos[logoState.i].title.padEnd(LOGO_W);
          }
          return;
        }

        // phase 'draw' : le nouveau logo se dessine ligne par ligne
        const art = logos[logoState.i].art;
        rows[logoState.row].textContent = art[logoState.row].padEnd(LOGO_W).slice(0, LOGO_W);
        logoState.row += 1;
        if (logoState.row >= LOGO_ROWS) {
          logoState.phase = 'hold';
          logoState.ticks = LOGO_HOLD_TICKS;
        }
      };

      const renderSide = () => {
        const parts = [];

        if (logos.length > 0) {
          const logo = logos[logoState.i];
          const padArt = (line) => line.padEnd(LOGO_W).slice(0, LOGO_W);
          parts.push(sideBox(padArt(logo.title), logo.art.map((l) => ({
            html: `<span class="cvViewerTux cvViewerLogoRow">${escape(padArt(l))}</span>`,
            text: padArt(l)
          })), 'cvViewerMuted cvViewerLogoTitle'));
        }

        if (platforms.length > 0) {
          parts.push(sideBox('plateformes', badgeWindow().map((l) => ({
            html: `<span class="cvViewerBadge cvViewerBadgeRow">${escape(l)}</span>`, text: l
          }))));
        }

        // Statut libre (hors cadre) : le texte tapé grandit à chaque
        // tick, un cadre figerait mal son alignement
        parts.push([
          `  <span class="cvViewerSpin">⠋</span> ${escape(statusLabel)}...`,
          '',
          `  &gt; <span class="cvViewerType"></span><span class="cvViewerUnderscore">_</span>`
        ].join('\n'));

        return parts.join('\n\n');
      };

      // ── Machine à écrire du statut ───────────────────────────
      let tick = 0;
      const typed = { phrase: 0, pos: 0, hold: 0, erasing: false };

      const typedText = () => {
        if (typedPhrases.length === 0) return '';
        const phrase = typedPhrases[typed.phrase];
        if (typed.erasing) {
          typed.pos -= 1;
          if (typed.pos <= 0) {
            typed.erasing = false;
            typed.pos = 0;
            typed.phrase = (typed.phrase + 1) % typedPhrases.length;
          }
        } else if (typed.pos < phrase.length) {
          typed.pos += 1;
        } else {
          typed.hold += 1;
          if (typed.hold >= 9) { // petite pause une fois la phrase tapée
            typed.hold = 0;
            typed.erasing = true;
          }
        }
        return phrase.slice(0, Math.max(0, typed.pos));
      };

      // ── Animations ───────────────────────────────────────────
      // `scope` limite les requêtes DOM à la fenêtre de shell qui
      // affiche ce viewer : plusieurs viewers peuvent vivre en même
      // temps, chacun dans sa fenêtre.
      let animTimer = null;

      const startAnimations = (scope = document) => {
        stopAnimations();
        animTimer = setInterval(() => {
          tick += 1;
          const spin = scope.querySelector('.cvViewerSpin');
          const type = scope.querySelector('.cvViewerType');
          if (!spin && !type && scope.querySelector('.cvViewerLogoRow') === null) {
            stopAnimations();
            return;
          }
          if (spin) spin.textContent = SPIN_FRAMES[tick % SPIN_FRAMES.length];
          if (type) type.textContent = typedText();
          animateLogo(scope);
          animateBadges(scope);
        }, 110);
      };

      const stopAnimations = () => {
        if (animTimer !== null) {
          clearInterval(animTimer);
          animTimer = null;
        }
      };

      // ── Barre de raccourcis façon nano (bas de fenêtre) ──────
      const key = (combo, label) =>
        `<span class="cvViewerKey">${escape(combo)}</span> ${escape(label)}`;

      const barHTML = (viewerState) => {
        if (!viewerState) return '';
        const sep = '<span class="cvViewerKeySep">│</span>';
        if (viewerState.section === null) {
          return [
            key('↑↓', 'naviguer'),
            key('⏎', 'ouvrir'),
            key('q', 'quitter'),
            key('^C', ctrlLabel)
          ].join(sep);
        }
        const section = sections.find((s) => s.id === viewerState.section);
        const hasLinks = section?.entries.some((entry) => entry.links?.length > 0);
        if (hasLinks) {
          return [
            key('1-9', 'ouvrir un lien'),
            key('↑↓', 'défiler'),
            key('⏎/⎋', 'menu'),
            key('^C', ctrlLabel),
            key('q', 'quitter')
          ].join(sep);
        }
        return [
          key('↑↓', 'défiler'),
          key('⏎/⎋', 'menu'),
          key('^C', ctrlLabel),
          key('q', 'quitter')
        ].join(sep);
      };

      // ── API ──────────────────────────────────────────────────
      const renderMain = (viewerState) => {
        if (!viewerState) return '';
        return viewerState.section === null
          ? renderMenu(viewerState.index)
          : renderSection(viewerState.section);
      };

      const render = (viewerState) => {
        if (!viewerState) return '';
        return `<div class="cvViewerMain">${renderMain(viewerState)}</div>`
             + `<div class="cvViewerSide">${renderSide()}</div>`;
      };

      const links = (sectionId) => {
        const section = sections.find((s) => s.id === sectionId);
        if (!section) return [];
        const result = [];
        for (const entry of section.entries) {
          if (entry.links) result.push(...entry.links);
        }
        return result;
      };

      // ── Version texte brut, pour `cat` ───────────────────────
      // Mêmes données que le viewer, sans bordures ni HTML :
      // cat d'un fichier viewer affiche le fond, open affiche la forme.
      const toText = () => {
        const out = [title.toUpperCase(), subtitle, ''];
        for (const section of sections) {
          out.push(`== ${section.title} ==`);
          for (const entry of section.entries) {
            out.push('', entry.heading);
            if (entry.sub) out.push(entry.sub);
            if (entry.lines) {
              for (const line of entry.lines) {
                out.push(typeof line === 'string'
                  ? `  - ${line}`
                  : `  - ${line.text} (${line.href})`);
              }
            }
            if (entry.links) {
              for (const link of entry.links) {
                out.push(`  - ${link.label}${link.value ? ` : ${link.value}` : ''} — ${link.href}`);
              }
            }
          }
          out.push('');
        }
        return out.join('\n').trim() + '\n';
      };

      return {
        sections: () => sections.map(({ id, title: t }) => ({ id, title: t })),
        render,
        renderMain,
        bar: barHTML,
        links,
        toText,
        startAnimations,
        stopAnimations
      };
    }
  };
})();
