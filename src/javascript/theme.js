/**
 * Thème du portfolio — Bastien BONORA
 * ----------------------------------------------------------------
 * `set theme <couleur>` recolore tout le portfolio à partir d'une
 * couleur de base (préréglage nommé ou hexadécimal). Les teintes
 * claires/sombres sont déduites automatiquement.
 *
 * Exposé via window.PORTFOLIO_THEME : { set, restore, reset }
 */
(() => {
  'use strict';

  const escapeHTML = window.PORTFOLIO_HTML.escapeHTML;

  const THEME_KEY = 'portfolioShellTheme';

  const THEME_PRESETS = {
    cyan:   '#22d3ee',
    vert:   '#22c55e',
    rouge:  '#ef4444',
    violet: '#a855f7',
    jaune:  '#eab308',
    orange: '#f97316',
    bleu:   '#3b82f6',
    rose:   '#ec4899',
    blanc:  '#e2e8f0'
  };
  // Alias anglais pour les francophones pressés
  const THEME_ALIASES = {
    green: 'vert', red: 'rouge', purple: 'violet', yellow: 'jaune',
    blue: 'bleu', pink: 'rose', white: 'blanc', magenta: 'rose'
  };

  const clampNumber = (v, min, max) => Math.min(Math.max(v, min), max);

  function hexToRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  function rgbToHsl({ r, g, b }) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rn)      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
      else if (max === gn) h = ((bn - rn) / d + 2) * 60;
      else                 h = ((rn - gn) / d + 4) * 60;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  function hslToHex(h, s, l) {
    s = clampNumber(s, 0, 100) / 100;
    l = clampNumber(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let [rn, gn, bn] = h < 60  ? [c, x, 0]
                     : h < 120 ? [x, c, 0]
                     : h < 180 ? [0, c, x]
                     : h < 240 ? [0, x, c]
                     : h < 300 ? [x, 0, c]
                               : [c, 0, x];
    const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(rn)}${toHex(gn)}${toHex(bn)}`;
  }

  /**
   * Applique une palette complète dérivée d'une couleur de base :
   * accents clairs/foncés, fonds sombres teintés, bordures.
   */
  function applyTheme(hex) {
    const { h, s } = rgbToHsl(hexToRgb(hex));
    const accentL = clampNumber(rgbToHsl(hexToRgb(hex)).l, 45, 85);

    // Accents : clair pour les mises en avant, sombre pour le texte
    // secondaire ; la luminosité de base est bornée pour rester lisible
    const accent       = hslToHex(h, s, accentL);
    const accentStrong = hslToHex(h, s, Math.min(accentL + 12, 92));
    const accentDim    = hslToHex(h, s, Math.max(accentL - 28, 18));

    const { r, g, b } = hexToRgb(accent);

    // Fonds : sombres, faiblement teintés de la couleur de base
    const bgSat = Math.min(s, 32);
    const styles = {
      '--accent':        accent,
      '--accent-strong': accentStrong,
      '--accent-dim':    accentDim,
      '--accent-glow':   `rgba(${r}, ${g}, ${b}, 0.45)`,
      '--bg-base':       hslToHex(h, bgSat, 7),
      '--bg-surface':    hslToHex(h, bgSat, 12),
      '--bg-chrome':     hslToHex(h, bgSat, 5),
      '--bg-hover':      hslToHex(h, bgSat, 20),
      '--border':        `rgba(${r}, ${g}, ${b}, 0.15)`,
      '--border-strong': `rgba(${r}, ${g}, ${b}, 0.30)`,
      '--overlay':       `hsla(${h.toFixed(0)}, ${bgSat}%, 7%, 0.92)`
    };
    for (const [prop, value] of Object.entries(styles)) {
      document.documentElement.style.setProperty(prop, value);
    }
  }

  function resetTheme() {
    for (const prop of [
      '--accent', '--accent-strong', '--accent-dim', '--accent-glow',
      '--bg-base', '--bg-surface', '--bg-chrome', '--bg-hover',
      '--border', '--border-strong', '--overlay'
    ]) {
      document.documentElement.style.removeProperty(prop);
    }
    try { localStorage.removeItem(THEME_KEY); } catch { /* stockage indisponible */ }
  }

  /** Résout une saisie utilisateur (nom ou hexa) en code couleur. */
  function resolveThemeColor(raw) {
    const input = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/^#?[0-9a-f]{6}$/.test(input)) {
      return `#${input.replace('#', '')}`;
    }
    if (/^#?[0-9a-f]{3}$/.test(input)) {
      return `#${[...input.replace('#', '')].map((c) => c + c).join('')}`;
    }
    const name = THEME_ALIASES[input] ?? input;
    return THEME_PRESETS[name] ?? null;
  }

  /** Commande `set theme` : applique, réinitialise ou explique. */
  function setTheme(raw) {
    const input = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (['default', 'defaut', 'reset'].includes(input)) {
      resetTheme();
      return 'thème réinitialisé : cyan (couleur par défaut)';
    }
    const hex = resolveThemeColor(raw);
    if (!hex) {
      const names = Object.keys(THEME_PRESETS).join(', ');
      return `set : couleur inconnue « ${escapeHTML(raw)} »`
           + `<br>Couleurs disponibles : ${names}`
           + '<br>Ou une couleur manuelle en hexadécimal : set theme #ec34f3';
    }
    applyTheme(hex);
    try { localStorage.setItem(THEME_KEY, hex); } catch { /* stockage indisponible */ }
    return `thème appliqué : ${escapeHTML(raw.toLowerCase())} (${hex})`;
  }

  /** Réapplique le thème sauvegardé au chargement de la page. */
  function restoreTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch { /* stockage indisponible */ }
    if (saved && /^#[0-9a-f]{6}$/i.test(saved)) {
      applyTheme(saved);
    }
  }

  window.PORTFOLIO_THEME = {
    set: setTheme,
    restore: restoreTheme,
    reset: resetTheme
  };
})();
