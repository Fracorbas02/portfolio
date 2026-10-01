/**
 * Neofetch du portfolio — Bastien BONORA
 * ----------------------------------------------------------------
 * Rendu HTML du neofetch (art ASCII + infos système) affiché au
 * démarrage et par la commande `neofetch`. Fonction pure : le nom
 * d'utilisateur et l'heure de début de session sont passés en
 * paramètres.
 *
 * Exposé via window.PORTFOLIO_NEOFETCH : { render(username, startedAt) }
 */
(() => {
  'use strict';

  const escapeHTML = (str) =>
    String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);

  /** Durée de session lisible : "42s", "3m 12s", "2h 4m". */
  function formatUptime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  /** Nom de navigateur simplifié, pour la ligne "Terminal". */
  function browserName() {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
    if (ua.includes('Chrome')) return 'Chromium';
    if (ua.includes('Safari')) return 'Safari';
    return 'web';
  }

  function render(username, sessionStart) {
    const uptime = formatUptime(Date.now() - sessionStart);

    const art = [
      '    .----------------.',
      "    | o o | portfolio |",
      "    |----------------|",
      "    |  > _           |",
      "    |                |",
      "    '----------------'"
    ].join('\n');

    const palette = ['#ef4444', '#f59e0b', '#10b981', '#22d3ee', '#67e8f9', '#94a3b8', '#e2e8f0']
      .map((color) => `<span class="paletteBlock" style="background:${color};"></span>`)
      .join('');

    const info = [
      `<div class="neofetchTitle">${escapeHTML(username)}@portfolio</div>`,
      '<div class="neofetchSep">------------------</div>',
      `<div><span class="neofetchKey">OS</span> Portfolio OS x86_64</div>`,
      `<div><span class="neofetchKey">Host</span> bastienbonora.fr</div>`,
      `<div><span class="neofetchKey">Kernel</span> portfolio-1.0.0 (web)</div>`,
      `<div><span class="neofetchKey">Uptime</span> ${uptime}</div>`,
      `<div><span class="neofetchKey">Shell</span> portfolio-sh</div>`,
      `<div><span class="neofetchKey">Terminal</span> ${browserName()}</div>`,
      `<div><span class="neofetchKey">Compétences</span> Réseaux • Cybersécurité • Admin Sys • Linux</div>`,
      `<div><span class="neofetchKey">GitHub</span> github.com/Fracorbas02</div>`,
      `<div class="neofetchPalette">${palette}</div>`
    ].join('');

    return `
      <div class="neofetchOutput">
        <pre class="neofetchArt">${escapeHTML(art)}</pre>
        <div class="neofetchInfo">${info}</div>
      </div>`;
  }

  window.PORTFOLIO_NEOFETCH = { render };
})();
