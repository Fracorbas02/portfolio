/**
 * Séquence de démarrage — Bastien BONORA
 * ----------------------------------------------------------------
 * Log de boot façon systemd/Debian et effet machine à écrire. Les
 * données et le rendu sont ici ; l'orchestration (prompt, focus,
 * neofetch) reste dans script.js, qui passe l'état en paramètre.
 *
 * Exposé via window.PORTFOLIO_BOOT : { lines, welcome, lineHTML,
 * typewrite, delay }
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

  // Log de démarrage façon systemd/Debian : les lignes défilent
  // entières et à toute vitesse, comme un vrai boot.
  const BOOT_SEQUENCE = [
    { kind: 'kernel', t: 0.000000, msg: 'Linux portfolio-os 6.1.0-web (bastien@bastienbonora.fr)' },
    { kind: 'kernel', t: 0.042317, msg: 'Command line: init=/bin/portfolio ro quiet splash' },
    { kind: 'kernel', t: 0.139820, msg: 'Initializing cgroup subsys: competences' },
    { kind: 'kernel', t: 0.310475, msg: 'Memory: JS heap calibrated for visitors' },
    { kind: 'ok',     msg: 'Mounted /root filesystem.' },
    { kind: 'ok',     msg: 'Started Shell Emulation Service.' },
    { kind: 'ok',     msg: 'Started Tab-Completion Service.' },
    { kind: 'ok',     msg: 'Started Command History Service.' },
    { kind: 'ok',     msg: 'Started Levenshtein Suggestion Engine.' },
    { kind: 'ok',     msg: 'Mounted /root/certifications.' },
    { kind: 'ok',     msg: 'Mounted /root/competences.' },
    { kind: 'ok',     msg: 'Started TryHackMe Write-up Archive.' },
    { kind: 'ok',     msg: 'Started Neofetch Display Service.' },
    { kind: 'ok',     msg: 'Started Easter Egg Detection Daemon.' },
    { kind: 'fail',   msg: 'Failed to start Coffee.service.' },
    { kind: 'fail',   msg: "See 'systemctl status coffee' for details.", indent: true },
    { kind: 'ok',     msg: 'Reached target Portfolio Shell.' }
  ];

  const BOOT_LINES_NORMAL = [
    'Bienvenue sur le portfolio de BONORA Bastien$',
    'Vous trouverez dans ce terminal toutes les informations me concernant$',
    "tapez 'help' pour afficher les commandes utilisables"
  ];

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Écrit du texte caractère par caractère dans un élément.
   * Caractères spéciaux : `$` = double saut de ligne, `_` = simple.
   * `shouldStop` (facultatif) : permet d'interrompre l'écriture
   * (boot interrompu par l'easter egg 42, par exemple).
   */
  function typewrite(element, text, speed, shouldStop = null) {
    return new Promise((resolve) => {
      let index = 0;
      const tick = () => {
        if (shouldStop?.() || index >= text.length) {
          return resolve();
        }
        const char = text.charAt(index);
        if (char === '$') {
          element.innerHTML += '<br><br>';
        } else if (char === '_') {
          element.innerHTML += '<br>';
        } else {
          element.innerHTML += escapeHTML(char);
        }
        index += 1;
        setTimeout(tick, speed);
      };
      tick();
    });
  }

  /**
   * Rend une ligne du log de boot à la manière de systemd :
   * horodatage gris pour le noyau, [ OK ] vert, [FAILED] rouge.
   */
  function lineHTML(line) {
    if (line.kind === 'kernel') {
      const ts = line.t.toFixed(6).padStart(11, ' ');
      return `<span class="bootTime">[${ts}]</span> ${escapeHTML(line.msg)}`;
    }
    if (line.kind === 'fail') {
      const pad = line.indent ? '         ' : '';
      return `${pad}<span class="bootFail">[FAILED]</span> ${escapeHTML(line.msg)}`;
    }
    return `<span class="bootOk">[  OK  ]</span> ${escapeHTML(line.msg)}`;
  }

  window.PORTFOLIO_BOOT = {
    lines: BOOT_SEQUENCE,
    welcome: BOOT_LINES_NORMAL,
    lineHTML,
    typewrite,
    delay
  };
})();
