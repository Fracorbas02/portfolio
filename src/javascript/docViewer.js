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

  const escape = window.PORTFOLIO_HTML.escapeHTML;
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
    // Schéma hors liste blanche (javascript:, data:…) : texte brut
    if (!window.PORTFOLIO_HTML.isSafeHref(line.href)) {
      return `  • ${textHTML(line.text)}`;
    }
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

        const header = `  ${section.title.toUpperCase()}`;
        const boxTop =
          `┌─${escape(header)}─${'─'.repeat(Math.max(0, WIDTH - header.length - 3))}┐`;

        // ── Rubrique « ères » : une période à la fois, façon caméra.
        // Chaque ère affiche sa période (timeline, en haut à gauche)
        // puis son contenu se construit de bas en haut (le chemin se
        // crée sous nos yeux), se dissout en trame ░, et l'ère
        // suivante prend le relais. Machine d'états : animateJourney.
        if (section.eras) {
          const erasHTML = section.eras.map((era, i) => {
            const pad = '─'.repeat(Math.max(0, 46 - era.period.length));
            const timeline = `<span class="cvViewerTimeline">── ${escape(era.period)} ${pad}</span>`;
            const title = `<span class="cvViewerEraTitle">${escape(era.title)}</span>`;
            const rows = era.lines.map((line) => {
              const cls = /^[ │▼╰╮└┐┌┤├═]/.test(line)
                ? 'cvViewerJourneyLine cvViewerJourneyPath'
                : 'cvViewerJourneyLine';
              return `  <span class="${cls}">${escape(line) || '&nbsp;'}</span>`;
            });
            const active = i === 0 ? ' cvViewerEra--active' : '';
            const body = [timeline, title, '', ...rows].join('\n');
            return `<div class="cvViewerEra${active}">${body}</div>`;
          }).join('');
          return `<div class="cvViewerSection" data-eras="1">${boxTop}\n${erasHTML}</div>`;
        }

        const lines = [];
        let linkIndex = 0; // numérotation globale : touches 1-9
        for (const entry of section.entries ?? []) {
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
              const labelHTML = `${textHTML(link.label.padEnd(10))} ${textHTML(link.value)}`;
              // Schéma hors liste blanche : texte brut, pas de lien
              const anchor = window.PORTFOLIO_HTML.isSafeHref(link.href)
                ? `<a class="cvViewerLink" href="${escape(link.href)}"${
                    external ? ' target="_blank" rel="noopener noreferrer"' : ''
                  }>${labelHTML}</a>`
                : labelHTML;
              lines.push(`${prefix}${anchor}`);
            }
          }
          lines.push('');
        }
        lines.pop(); // dernier saut de ligne superflu

        const body = [
          boxTop,
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

      // ── Frise chronologique : le panneau droit des ères ────
      // Vertical, une étape par ère : l'étape courante en accent,
      // les étapes passées en clair, les futures en atténué.
      const chronoHTML = (section, activeIdx) => {
        const items = [];
        section.eras.forEach((era, i) => {
          const cls = i === activeIdx
            ? 'cvViewerChronoItem cvViewerChronoItem--active'
            : i < activeIdx
              ? 'cvViewerChronoItem cvViewerChronoItem--past'
              : 'cvViewerChronoItem';
          items.push(
            `<div class="${cls}">${escape(String(era.year).padStart(4))}  ${escape(era.chip)}</div>`);
          if (i < section.eras.length - 1) {
            items.push('<div class="cvViewerChronoLink">   │</div>');
          }
        });
        return [
          '<div class="cvViewerChronoTitle">LE PARCOURS</div>',
          ...items,
          '',
          '<div class="cvViewerChronoHint">↑↓ les étapes, une fois</div>',
          '<div class="cvViewerChronoHint">l\u2019histoire racontée</div>'
        ].join('');
      };

      const setChronoActive = (scope, idx) => {
        scope.querySelectorAll('.cvViewerChronoItem').forEach((el, i) => {
          el.classList.toggle('cvViewerChronoItem--active', i === idx);
          el.classList.toggle('cvViewerChronoItem--past', i < idx);
        });
      };

      // ── Ères : la caméra suit le chemin ─────────────────────
      // Chaque action avance l'ère active d'un cran :
      //   1. révélation de bas en haut (le chemin se crée)
      //   2. pause une fois l'écran complet — le temps de lire
      //   3. nettoyage : les lignes se dissolvent en trame ░,
      //      de bas en haut, puis l'ère suivante démarre
      // La frise chronologique suit, et les flèches ↑↓ prennent la
      // main (navEra). Tout l'état vit dans le DOM : ré-afficher
      // la rubrique rejoue l'animation depuis la première ère.
      const ERA_STEP = 2; // une action toutes les 2 ticks (~220 ms)
      const HIDDEN_LINE =
        '.cvViewerJourneyLine:not(.cvViewerJourneyLine--shown):not(.cvViewerJourneyLine--wiped)';
      const animateJourney = (scope) => {
        const secEl = scope.querySelector('.cvViewerSection[data-eras]');
        if (!secEl || secEl.dataset.manual === '1') return;
        const era = scope.querySelector('.cvViewerEra--active');
        if (!era) return;

        secEl.dataset.t = String((Number(secEl.dataset.t) || 0) + 1);
        if (Number(secEl.dataset.t) % ERA_STEP !== 0) return;

        // 1. Le chemin se crée, de bas en haut
        const hidden = era.querySelectorAll(HIDDEN_LINE);
        if (hidden.length > 0) {
          hidden[hidden.length - 1].classList.add('cvViewerJourneyLine--shown');
          return;
        }

        // Dernière ère : l'écran reste affiché, l'histoire est finie
        if (!era.nextElementSibling) return;

        // 2. Pause avant le nettoyage, proportionnelle au contenu
        if (era.dataset.hold === undefined) {
          era.dataset.hold = String(
            8 + era.querySelectorAll('.cvViewerJourneyLine').length);
        }
        era.dataset.hold = String(Number(era.dataset.hold) - 1);
        if (Number(era.dataset.hold) > 0) return;

        // 3. Nettoyage : dissolution en trame, de bas en haut
        const shown = era.querySelectorAll('.cvViewerJourneyLine--shown');
        if (shown.length > 0) {
          const line = shown[shown.length - 1];
          line.textContent = '░'.repeat(line.textContent.length || 1);
          line.classList.remove('cvViewerJourneyLine--shown');
          line.classList.add('cvViewerJourneyLine--wiped');
          return;
        }

        // Écran vide : place à l'ère suivante, la frise suit
        const all = scope.querySelectorAll('.cvViewerEra');
        era.classList.remove('cvViewerEra--active');
        era.classList.add('cvViewerEra--done');
        era.nextElementSibling.classList.add('cvViewerEra--active');
        setChronoActive(scope, Array.from(all).indexOf(era.nextElementSibling));
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

      const renderSide = (viewerState = null, container = null) => {
        // Rubrique « ères » : le panneau devient la frise du parcours
        const section = viewerState?.section
          ? sections.find((s) => s.id === viewerState.section)
          : null;
        if (section?.eras) {
          let active = 0;
          if (container) {
            const act = container.querySelector('.cvViewerEra--active');
            if (act) {
              active = Array.from(container.querySelectorAll('.cvViewerEra')).indexOf(act);
            }
          }
          return `<div class="cvViewerChrono">${chronoHTML(section, active)}</div>`;
        }

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
          // Fenêtre fermée (pastille rouge) sans passer par quit :
          // le viewer n'est plus dans le document, on stoppe
          if (!scope.isConnected) {
            stopAnimations();
            return;
          }
          tick += 1;
          const spin = scope.querySelector('.cvViewerSpin');
          const type = scope.querySelector('.cvViewerType');
          if (!spin && !type
              && scope.querySelector('.cvViewerLogoRow') === null
              && scope.querySelector('.cvViewerJourneyLine') === null) {
            stopAnimations();
            return;
          }
          if (spin) spin.textContent = SPIN_FRAMES[tick % SPIN_FRAMES.length];
          if (type) type.textContent = typedText();
          animateLogo(scope);
          animateBadges(scope);
          animateJourney(scope);
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
        // Rubrique « ères » : les flèches naviguent entre les étapes
        if (section?.eras) {
          return [
            key('↑↓', 'les étapes'),
            key('⏎/⎋', 'menu'),
            key('^C', ctrlLabel),
            key('q', 'quitter')
          ].join(sep);
        }
        const hasLinks = section?.entries?.some((entry) => entry.links?.length > 0);
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
             + `<div class="cvViewerSide">${renderSide(viewerState)}</div>`;
      };

      const links = (sectionId) => {
        const section = sections.find((s) => s.id === sectionId);
        if (!section) return [];
        const result = [];
        for (const entry of section.entries ?? []) {
          if (entry.links) result.push(...entry.links);
        }
        return result;
      };

      // Navigation manuelle entre les ères (flèches ↑↓) : prend la
      // main sur la machine automatique, restaure le texte dissous
      // en trame et met la frise à jour. Retourne false si la
      // rubrique n'a pas d'ères ou si on est déjà au bord.
      const navEra = (container, sectionId, delta) => {
        const section = sections.find((s) => s.id === sectionId);
        if (!section?.eras || !container) return false;
        const secEl = container.querySelector('.cvViewerSection[data-eras]');
        if (!secEl) return false;
        const eraEls = Array.from(secEl.querySelectorAll('.cvViewerEra'));
        if (eraEls.length === 0) return false;
        const current = eraEls.findIndex((el) =>
          el.classList.contains('cvViewerEra--active'));
        const target = current + delta;
        if (target < 0 || target >= eraEls.length) return false;

        secEl.dataset.manual = '1';
        eraEls.forEach((el, i) => {
          el.classList.toggle('cvViewerEra--active', i === target);
          el.classList.remove('cvViewerEra--done');
          delete el.dataset.hold;
          // Restaure les lignes d'origine : le nettoyage avait
          // remplacé le texte par une trame ░
          el.querySelectorAll('.cvViewerJourneyLine').forEach((span, li) => {
            span.textContent = section.eras[i].lines[li] || '\u00a0';
            span.classList.remove('cvViewerJourneyLine--wiped');
            span.classList.add('cvViewerJourneyLine--shown');
          });
        });
        setChronoActive(container, target);
        return true;
      };

      // ── Version texte brut, pour `cat` ───────────────────────
      // Mêmes données que le viewer, sans bordures ni HTML :
      // cat d'un fichier viewer affiche le fond, open affiche la forme.
      const toText = () => {
        const out = [title.toUpperCase(), subtitle, ''];
        for (const section of sections) {
          out.push(`== ${section.title} ==`);
          if (section.eras) {
            for (const era of section.eras) {
              out.push('', `-- ${era.period} : ${era.title} --`);
              for (const line of era.lines) out.push(`  ${line}`);
            }
            continue;
          }
          for (const entry of section.entries ?? []) {
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
        renderSide,
        bar: barHTML,
        links,
        navEra,
        toText,
        startAnimations,
        stopAnimations
      };
    }
  };
})();
