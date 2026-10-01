/**
 * CV Viewer
 * --------------------------------------------------
 * Données et rendu du viewer de CV interactif, ouvert via
 * `open CV.pdf` dans une nouvelle fenêtre de shell.
 *
 * Le pilotage clavier (flèches, Entrée, Échap, chiffres 1-8,
 * Ctrl+C) est géré par script.js ; ce module décrit les rubriques
 * du CV, produit le rendu ASCII (colonne principale + panneau
 * latéral de logos animés) et anime le spinner braille, le texte
 * en machine à écrire, la rotation des logos (Tux, TryHackMe,
 * Root-Me, Cisco, Stormshield) et le ticker des plateformes.
 *
 * Exposition globale (pas de système de modules ici) :
 *   window.CV_VIEWER.sections() -> liste des rubriques
 *   window.CV_VIEWER.render(viewerState) -> HTML (2 colonnes)
 *   window.CV_VIEWER.renderMain(viewerState) -> colonne principale
 *   window.CV_VIEWER.bar(viewerState) -> HTML de la barre bas
 *   window.CV_VIEWER.links(sectionId) -> liens ordonnés de la rubrique
 *   window.CV_VIEWER.startAnimations() / stopAnimations()
 */

(() => {
  'use strict';

  const escape = window.PORTFOLIO_HTML.escapeHTML;
  // ── Rubriques du CV ──────────────────────────────────────────
  // Chaque rubrique : { id, title, entries: [{ heading, sub,
  // lines, links }] }. Une ligne peut être une chaîne ou
  // { text, href } pour un lien cliquable (http, mailto:, tel:
  // ou fichier local du portfolio).
  const SECTIONS = [
    {
      id: 'profil',
      title: 'Profil',
      entries: [
        {
          heading: 'À propos',
          lines: [
            "Persévérant, perspicace et autonome, je suis à l'aise",
            "autant en équipe qu'en solitaire. Passionné de cyber-",
            'sécurité, je pratique au quotidien : CTF (TryHackMe,',
            'Root-Me), home-lab auto-hébergé et veille technique.',
            "J'écris aussi des write-ups et des articles sur mon",
            'blog docs.bastienbonora.fr (bastodoc).'
          ]
        },
        {
          heading: 'Poste recherché',
          lines: [
            'Administrateur Systèmes & Réseaux',
            'Disponible dès le 1er octobre 2025'
          ]
        },
        {
          heading: 'Localisation',
          lines: [
            '74130 Bonneville — France (74)',
            'Mobilité : Annecy, Genève, remote'
          ]
        },
        {
          heading: 'En ce moment',
          lines: [
            'Home-lab : Proxmox VE, OPNsense, FreeIPA, GitLab,',
            'SIEM Elastic sur un Dell R620 (32 Go de RAM)',
            'Write-ups TryHackMe + articles sur bastodoc'
          ]
        }
      ]
    },
    {
      id: 'experiences',
      title: 'Expériences & Projets',
      entries: [
        {
          heading: '2022 — 2025  Technicien Informatique Systèmes & Réseaux',
          sub: 'EPSM La Roche-sur-Foron — Service informatique (alternance)',
          lines: [
            'Bastion réseau avec monitoring via la stack ELK',
            'Mise en place d’un SIEM via Elastic Security',
            'Migration de sites externes dans un MPLS',
            'Sauvegarde sécurisée des configurations réseau',
            'Assistance utilisateurs niveau 1-2-3 (ticketing GLPI)',
            'Interventions sur sites — référent réseau',
            '(configuration firewall, switch…)'
          ]
        },
        {
          heading: '2025  Insomni’hack — Lausanne, Suisse',
          lines: ['36e au CTF en équipe (FeelTheBit)']
        },
        {
          heading: '2024  Conférences cyber',
          lines: [
            'European Cyber Week — Rennes',
            'Swiss IT Forum — Genève, Suisse'
          ]
        },
        {
          heading: '2022 — 2024  Projet Nastruire',
          lines: [
            'Jeu sur plateforme Godot, en équipe de 4',
            { text: 'https://nastruire.fr/', href: 'https://nastruire.fr/' }
          ]
        },
        {
          heading: '2022  Trophées NSI',
          lines: ['Lauréat région Auvergne-Rhône-Alpes']
        }
      ]
    },
    {
      id: 'formation',
      title: 'Formation',
      entries: [
        {
          heading: '2022 — 2025  IUT Annecy',
          lines: [
            'BUT Réseaux & Télécoms en alternance',
            'Parcours Cybersécurité',
            'Alternance au service informatique de l’EPSM',
            'La Roche-sur-Foron'
          ]
        },
        {
          heading: 'Baccalauréat',
          lines: [
            'Relevé de notes disponible :',
            'presentation/releve_bac.pdf'
          ]
        }
      ]
    },
    {
      id: 'competences',
      title: 'Compétences',
      entries: [
        {
          heading: 'Réseaux',
          lines: [
            'Cisco CCNA 1 & 2',
            'VPN, VLAN, Trunk, STP, routage, NAT',
            'MPLS, BGP, TLS — articles dédiés sur bastodoc',
            'Configuration avancée de matériel Cisco'
          ]
        },
        {
          heading: 'Sécurité & pare-feu',
          lines: [
            'Stormshield — VPN, IKEv2, NAT, filtrage',
            'SIEM Elastic Security, stack ELK',
            'Offensive security : CTF, Root-Me, TryHackMe',
            'nmap, gobuster, hashcat, john, gtfobins…'
          ]
        },
        {
          heading: 'Systèmes Linux',
          lines: [
            'ArchLinux au quotidien, Debian, Kali',
            'Scripting bash, automatisation, systemd',
            'Docker : images, compose, network/volumes',
            'Debug matériel : boot UKI, bluetooth, eGPU'
          ]
        },
        {
          heading: 'Systèmes Windows',
          lines: [
            'Administration serveur : AD, DNS, DHCP, NPS',
            'Automatisation, scripting PowerShell'
          ]
        },
        {
          heading: 'Virtualisation & infra',
          lines: [
            'Proxmox VE, VMware ESX, VirtualBox',
            'Lab de 3 ESX à la maison',
            'Home-lab : OPNsense, FreeIPA, GitLab, VLANs',
            'Déploiement VPS (rsync), Ubiquiti, SNMP'
          ]
        },
        {
          heading: 'Programmation',
          lines: [
            'Python, C — bonne capacité d’adaptation',
            'JavaScript : ce portfolio est un terminal JS pur',
            'Rust en apprentissage (cheatsheet sur bastodoc)'
          ]
        }
      ]
    },
    {
      id: 'ecrits',
      title: 'Écrits & Write-ups',
      entries: [
        {
          heading: 'Write-ups TryHackMe',
          lines: [
            { text: 'Brute It           — hash cracking, sudo', href: './root/CTF/Brute%20It.html' },
            { text: 'Archangel          — LFI, RCE via log', href: './root/CTF/Archangel.html' },
            { text: 'Mustacchio         — SQLite, GTFOBins', href: './root/CTF/Mustacchio.html' },
            { text: 'Break Out The Cage — énumération, privesc', href: './root/CTF/Break%20Out%20The%20Cage.html' }
          ]
        },
        {
          heading: 'Articles — docs.bastienbonora.fr',
          lines: [
            { text: 'Le modèle OSI · Protocoles TLS, BGP, MPLS', href: 'https://docs.bastienbonora.fr/' },
            { text: 'Docker : commandes fondamentales, compose', href: 'https://docs.bastienbonora.fr/' },
            { text: 'Maîtriser grep · Monitorer son OS Linux', href: 'https://docs.bastienbonora.fr/' },
            { text: 'mon Home-Lab : Proxmox, OPNsense, FreeIPA', href: 'https://docs.bastienbonora.fr/' },
            { text: 'Steam Deck + Kali distrobox · eGPU Linux', href: 'https://docs.bastienbonora.fr/' },
            { text: 'Rust & C cheatsheets · auth. biométrique…', href: 'https://docs.bastienbonora.fr/' }
          ]
        },
        {
          heading: 'À lire aussi',
          lines: [
            'Nastruire — jeu Godot, équipe de 4 (nastruire.fr)',
            { text: 'https://docs.bastienbonora.fr/', href: 'https://docs.bastienbonora.fr/' }
          ]
        }
      ]
    },
    {
      id: 'certifications',
      title: 'Certifications & Plateformes',
      entries: [
        {
          heading: 'Certifications',
          lines: [
            { text: 'Stormshield CSNA & CSNE', href: './root/certif/Certification_CSNA.pdf' },
            { text: 'Cisco CCNA 1 & 2', href: './root/certif/Certification_Cambridge.pdf' },
            { text: 'TOEIC & Cambridge', href: './root/certif/Certification_TOEIC.pdf' }
          ]
        },
        {
          heading: 'Root-Me',
          lines: ['1 220 pts — 75 challenges — root-me.org']
        },
        {
          heading: 'TryHackMe',
          lines: [
            '[0xA] [WIZARD] — 12 379 points',
            { text: 'tryhackme.com/p/Fracorbas', href: 'https://tryhackme.com/p/Fracorbas' },
            '85 rooms — write-ups sur le portfolio'
          ]
        }
      ]
    },
    {
      id: 'contact',
      title: 'Contact',
      entries: [
        {
          heading: 'Coordonnées',
          links: [
            { label: 'E-mail', value: 'bastien.bonora@gmail.com', href: 'mailto:bastien.bonora@gmail.com' },
            { label: 'Téléphone', value: '+33 6 16 29 64 01', href: 'tel:+33616296401' },
            { label: 'Site', value: 'bastienbonora.fr', href: 'https://bastienbonora.fr/' },
            { label: 'Blog', value: 'docs.bastienbonora.fr', href: 'https://docs.bastienbonora.fr/' }
          ]
        },
        {
          heading: 'Réseaux',
          links: [
            { label: 'GitHub', value: 'github.com/Fracorbas02', href: 'https://github.com/Fracorbas02' },
            { label: 'LinkedIn', value: 'in/bastien-bonora', href: 'https://www.linkedin.com/in/bastien-bonora' },
            { label: 'TryHackMe', value: 'p/Fracorbas', href: 'https://tryhackme.com/p/Fracorbas' }
          ]
        },
        {
          heading: 'PGP',
          links: [
            { label: 'Clé publique', value: 'presentation/pubkey.asc', href: './root/presentation/pubkey' }
          ]
        }
      ]
    }
  ];

  // ── Rendu ASCII ──────────────────────────────────────────────
  const TITLE = 'CV — BASTIEN BONORA';
  const SUBTITLE = 'Administrateur Systèmes & Réseaux';
  const WIDTH = 58;

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
    }>${textHTML(line.text)}</a>`;
  };

  /** Écran menu : cartouche titre + rubriques. */
  const renderMenu = (index) => {
    // Construction ligne à ligne : le pad se fait sur le texte
    // visible, pas sur le HTML (les spans ne comptent pas).
    const visible = [
      { html: `<span class="cvViewerTitle">${escape(TITLE)}</span>`, text: TITLE },
      { html: `<span class="cvViewerSubtitle">${escape(SUBTITLE)}</span>`, text: SUBTITLE },
      { border: true },
      ...SECTIONS.map((section, i) => ({
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

  /** Écran rubrique : barre de titre + contenu (liens cliquables). */
  const renderSection = (sectionId) => {
    const section = SECTIONS.find((s) => s.id === sectionId);
    if (!section) return renderMenu(0);

    const lines = [];
    let linkIndex = 0; // numérotation globale : touches 1-8
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

    const header = `  ${section.title.toUpperCase()}`;
    const body = [
      `┌─${escape(header)}─${'─'.repeat(Math.max(0, WIDTH - header.length - 3))}┐`,
      '',
      ...lines.map((l) => `  ${l}`)
    ].join('\n');

    return `<div class="cvViewerSection">${body}</div>`;
  };

  // ── Panneau latéral (grands écrans) ───────────────────────────
  // Tux + badges plateforme + animations (spinner braille, texte
  // qui se tape). Les éléments animés portent des classes que le
  // module retrouve à chaque tick.
  const SIDE_WIDTH = 30;

  /** Encadre des lignes { html, text } : le pad compte le visible. */
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

  // ── Logos animés du panneau latéral ───────────────────────────
  // Le logo de la première boîte défile (Tux → TryHackMe → Root-Me
  // → Cisco → Stormshield) : chaque logo reste affiché un moment,
  // puis l'ancien s'efface ligne par ligne pendant que le suivant
  // se dessine, comme le scan du périmètre plus bas.
  // Tous les logos ont exactement LOGO_ROWS lignes de LOGO_W
  // colonnes max : l'animation réécrit les textContent à longueur
  // constante pour préserver l'alignement du cadre.
  const LOGO_W = 26;
  const LOGO_ROWS = 7;
  const LOGO_HOLD_TICKS = 40; // ~4,4 s d'affichage par logo (110 ms/tick)

  const LOGOS = [
    {
      title: 'linux au quotidien',
      art: [
        '        .--.',
        '       |o_o |',
        '       |:_/ |',
        '      //   \\ \\',
        "     (|     | )",
        "    /'\\_   _/`\\",
        "    \\___)=(___/"
      ]
    },
    {
      title: 'tryhackme',
      art: [
        '     .---------.',
        '    / .-------. \\',
        '   | |         | |',
        '   | |  T H M  | |',
        '   | |         | |',
        "    \\ '-------' /",
        "     '---------'"
      ]
    },
    {
      title: 'root-me.org',
      art: [
        '  .----------------.',
        '  | root@me:~$     |',
        '  | > whoami       |',
        '  | root           |',
        '  |                |',
        '  | 75 challenges  |',
        "  '----------------'"
      ]
    },
    {
      title: 'cisco ccna',
      art: [
        '    \\_/  \\_/  \\_/  \\_/',
        '   _____________________',
        '      |    |    |    |',
        '   ~~~|~~~~|~~~~|~~~~|~~~~',
        '      |    |    |    |',
        '   ~~~|~~~~|~~~~|~~~~|~~~~',
        '      |    |    |    |'
      ]
    },
    {
      title: 'stormshield',
      art: [
        '     .---------.',
        '    /  .-----.  \\',
        '   |  |  S S  |  |',
        '   |  |  S S  |  |',
        "   |   '-----'   |",
        '    \\           /',
        "     '---------'"
      ]
    }
  ];

  // Logo courant et phase de l'animation (voir animateLogo) :
  // 'hold' (affiché) → 'wipe' (effacé ligne par ligne) → 'draw'.
  const logoState = { i: 0, phase: 'hold', ticks: LOGO_HOLD_TICKS, row: 0 };

  // ── Ticker des plateformes ───────────────────────────────────
  // Cartes d'une plateforme : nom + détails, séparées par une
  // ligne vide. La boîte « plateformes » affiche une fenêtre de
  // BADGE_ROWS lignes qui défile d'une ligne à intervalle régulier,
  // comme un bandeau d'actualités en terminal. Les lignes sont
  // complétées à BADGE_W : l'animation réécrit les textContent sans
  // casser l'alignement du cadre.
  const BADGE_ROWS = 5;
  const BADGE_W = SIDE_WIDTH - 1;
  const BADGE_SCROLL_TICKS = 6; // ~0,66 s par ligne (110 ms/tick)

  const PLATFORM_LINES = [
    ' TRYHACKME [0xA] WIZARD',
    '   12 379 pts · 85 rooms',
    '   write-ups sur le portfolio',
    '',
    ' ROOT-ME 1 220 pts',
    '   75 challenges',
    '   root-me.org',
    '',
    ' CISCO CCNA 1 & 2',
    '   routage · VPN · switching',
    '',
    ' STORMSHIELD CSNA · CSNE',
    '   pare-feu · VPN · filtrage',
    ''
  ];

  const badgeState = { offset: 0, ticks: BADGE_SCROLL_TICKS };

  /** Fenêtre de BADGE_ROWS lignes visible dans la boîte. */
  const badgeWindow = () => {
    const rows = [];
    for (let k = 0; k < BADGE_ROWS; k++) {
      rows.push(
        PLATFORM_LINES[(badgeState.offset + k) % PLATFORM_LINES.length]
          .padEnd(BADGE_W).slice(0, BADGE_W)
      );
    }
    return rows;
  };

  /**
   * Fait défiler le ticker : une ligne de moins par intervalle,
   * la fenêtre glisse sur la liste cyclique des plateformes.
   */
  const animateBadges = (scope) => {
    const rows = scope.querySelectorAll('.cvViewerBadgeRow');
    if (rows.length < BADGE_ROWS) return;
    badgeState.ticks -= 1;
    if (badgeState.ticks > 0) return;
    badgeState.ticks = BADGE_SCROLL_TICKS;
    badgeState.offset = (badgeState.offset + 1) % PLATFORM_LINES.length;
    const win = badgeWindow();
    rows.forEach((row, i) => { row.textContent = win[i]; });
  };

  const renderSide = () => {
    // Lignes complétées à LOGO_W : l'animation peut réécrire leur
    // contenu sans casser l'alignement du cadre
    const logo = LOGOS[logoState.i];
    const padArt = (line) => line.padEnd(LOGO_W).slice(0, LOGO_W);
    const tux = sideBox(padArt(logo.title), logo.art.map((l) => ({
      html: `<span class="cvViewerTux cvViewerLogoRow">${escape(padArt(l))}</span>`,
      text: padArt(l)
    })), 'cvViewerMuted cvViewerLogoTitle');
    const badges = sideBox('plateformes', badgeWindow().map((l) => ({
      html: `<span class="cvViewerBadge cvViewerBadgeRow">${escape(l)}</span>`, text: l
    })));
    // Statut libre (hors cadre) : le texte tapé grandit à chaque
    // tick, un cadre figerait mal son alignement
    const status = [
      `  <span class="cvViewerSpin">⠋</span> scan du périmètre...`,
      '',
      `  &gt; <span class="cvViewerType"></span><span class="cvViewerUnderscore">_</span>`
    ].join('\n');
    return [tux, '', badges, '', status].join('\n');
  };

  // ── Animations (spinner + machine à écrire) ──────────────────
  const SPIN_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const TYPED_PHRASES = [
    'admin. systèmes & réseaux',
    'cybersécurité',
    'Arch Linux user',
    'CTF player',
    'curieux de tout'
  ];
  let animTimer = null;
  let tick = 0;
  let typed = { phrase: 0, pos: 0, hold: 0, erasing: false };

  const typedText = () => {
    const phrase = TYPED_PHRASES[typed.phrase];
    if (typed.erasing) {
      typed.pos -= 1;
      if (typed.pos <= 0) {
        typed.erasing = false;
        typed.pos = 0;
        typed.phrase = (typed.phrase + 1) % TYPED_PHRASES.length;
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

  /**
   * Fait défiler les logos du panneau latéral : le logo affiché
   * reste en place (hold), s'efface ligne par ligne en laissant
   * une trame ░ comme une trace de scan (wipe), puis le suivant
   * se dessine ligne par ligne (draw). Titre et lignes sont
   * réécrits à LOGO_W caractères pour garder le cadre aligné.
   */
  const animateLogo = (scope) => {
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
        logoState.i = (logoState.i + 1) % LOGOS.length;
        title.textContent = LOGOS[logoState.i].title.padEnd(LOGO_W);
      }
      return;
    }

    // phase 'draw' : le nouveau logo se dessine ligne par ligne
    const art = LOGOS[logoState.i].art;
    rows[logoState.row].textContent = art[logoState.row].padEnd(LOGO_W).slice(0, LOGO_W);
    logoState.row += 1;
    if (logoState.row >= LOGO_ROWS) {
      logoState.phase = 'hold';
      logoState.ticks = LOGO_HOLD_TICKS;
    }
  };

  // `scope` limite les requêtes DOM à la fenêtre de shell qui
  // affiche le viewer (plusieurs viewers peuvent cohabiter).
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
      const logoRow = scope.querySelector('.cvViewerLogoRow');
      if (!spin && !type && !logoRow) {
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

  // ── Barre de raccourcis façon nano (bas de fenêtre) ──────────
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
        key('^C', 'CV PDF')
      ].join(sep);
    }
    if (viewerState.section === 'contact') {
      return [
        key('1-8', 'ouvrir un contact'),
        key('↑↓', 'défiler'),
        key('⏎/⎋', 'menu'),
        key('^C', 'CV PDF'),
        key('q', 'quitter')
      ].join(sep);
    }
    return [
      key('↑↓', 'défiler'),
      key('⏎/⎋', 'menu'),
      key('^C', 'CV PDF'),
      key('q', 'quitter')
    ].join(sep);
  };

  // ── API ──────────────────────────────────────────────────────
  /** Colonne principale seule : appelée à chaque navigation clavier,
   *  pour ne pas reconstruire le panneau latéral et ses animations. */
  const renderMain = (viewerState) => {
    if (!viewerState) return '';
    return viewerState.section === null
      ? renderMenu(viewerState.index)
      : renderSection(viewerState.section);
  };

  /** Rendu complet (première insertion) : colonne principale + panneau. */
  const render = (viewerState) => {
    if (!viewerState) return '';
    return `<div class="cvViewerMain">${renderMain(viewerState)}</div>`
         + `<div class="cvViewerSide">${renderSide()}</div>`;
  };

  window.CV_VIEWER = {
    sections: () => SECTIONS.map(({ id, title }) => ({ id, title })),
    render,
    renderMain,
    bar: barHTML,
    /** Liens ordonnés d'une rubrique (ouvertures clavier 1-8). */
    links: (sectionId) => {
      const section = SECTIONS.find((s) => s.id === sectionId);
      if (!section) return [];
      const links = [];
      for (const entry of section.entries) {
        if (entry.links) links.push(...entry.links);
      }
      return links;
    },
    startAnimations,
    stopAnimations
  };
})();
