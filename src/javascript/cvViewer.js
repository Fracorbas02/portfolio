/**
 * CV Viewer
 * --------------------------------------------------
 * Données et rendu du viewer de CV interactif, ouvert via
 * `open CV.pdf` dans une nouvelle fenêtre de shell.
 *
 * Le pilotage clavier (flèches, Entrée, Échap, Ctrl+C) est géré
 * par script.js ; ce module ne fait que décrire les rubriques
 * du CV et produire le rendu ASCII correspondant à l'état
 * courant (menu ou rubrique ouverte).
 *
 * Exposition globale (pas de système de modules ici) :
 *   window.CV_VIEWER.sections() -> liste des rubriques
 *   window.CV_VIEWER.render({ index, section }) -> HTML
 */

(() => {
  'use strict';

  const escape = (text) => String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // ── Rubriques du CV ──────────────────────────────────────────
  // Chaque rubrique : { id, title, entries: [{ heading, sub, lines }] }
  const SECTIONS = [
    {
      id: 'profil',
      title: 'Profil',
      entries: [
        {
          heading: 'À propos',
          lines: [
            "Persévérant, perspicace, autonome et à l'aise en",
            "travail d'équipe, j'approfondis mes connaissances",
            'en cybersécurité au quotidien.'
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
          lines: ['74130 Bonneville — France']
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
            'https://nastruire.fr/'
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
            'Parcours Cybersécurité'
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
            'Configuration avancée de matériel Cisco'
          ]
        },
        {
          heading: 'Firewall',
          lines: [
            'Stormshield — VPN, IKEv2, NAT, filtrage',
            'Configuration avancée'
          ]
        },
        {
          heading: 'Systèmes Linux',
          lines: [
            'ArchLinux au quotidien, Debian, Kali',
            'Scripting bash, automatisation'
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
          heading: 'Virtualisation',
          lines: [
            'Proxmox, VMware, VirtualBox',
            'Lab de 3 ESX à la maison'
          ]
        },
        {
          heading: 'Programmation',
          lines: ['Python, C — bonne capacité d’adaptation']
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
            'Stormshield CSNA & CSNE',
            'Cisco CCNA 1 & 2'
          ]
        },
        {
          heading: 'RootMe',
          lines: ['1220 pts — 75 challenges — root-me.org']
        },
        {
          heading: 'TryHackMe',
          lines: [
            '[0xA] [WIZARD] — 12 379 points',
            '85 rooms — tryhackme.com/p/Fracorbas',
            'nmap, gobuster, hashcat, john, gtfobins…'
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
          lines: [
            'bastien.bonora@gmail.com',
            '+33 6 16 29 64 01',
            'https://bastienbonora.fr/',
            'Clé PGP disponible sur bastienbonora.fr'
          ]
        },
        {
          heading: 'Réseaux',
          lines: [
            'LinkedIn : linkedin.com/in/bastien-bonora',
            'GitHub : github.com/Fracorbas02'
          ]
        }
      ]
    }
  ];

  // ── Rendu ASCII ──────────────────────────────────────────────
  const TITLE = 'CV — BASTIEN BONORA';
  const SUBTITLE = 'Administrateur Systèmes & Réseaux';
  const WIDTH = 58;

  const FOOTER_MENU = '↑↓ naviguer · Entrée ouvrir · Échap quitter';
  const FOOTER_SECTION = '↑↓ défiler · Entrée/Échap retour · Ctrl+C PDF';
  const FOOTER_HINT = 'Ctrl+C : CV PDF dans le navigateur · q quitter';

  const headingHTML = (text) =>
    `<span class="cvViewerHeading">${escape(text)}</span>`;
  const subHTML = (text) =>
    `<span class="cvViewerSub">${escape(text)}</span>`;
  const textHTML = (text) =>
    `<span class="cvViewerText">${escape(text)}</span>`;
  const mutedHTML = (text) =>
    `<span class="cvViewerMuted">${escape(text)}</span>`;

  /** Écran menu : cartouche titre + rubriques + aide. */
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
      { html: mutedHTML(FOOTER_MENU), text: FOOTER_MENU },
      { html: mutedHTML(FOOTER_HINT), text: FOOTER_HINT }
    ];

    const bar = '─'.repeat(WIDTH);
    const rows = visible.map((v) =>
      v.border ? `├${bar}┤` : `│${v.html}${' '.repeat(Math.max(0, WIDTH - v.text.length))}│`
    );
    return [`┌${bar}┐`, ...rows, `└${bar}┘`].join('\n');
  };

  /** Écran rubrique : barre de titre + contenu défilable + aide. */
  const renderSection = (sectionId) => {
    const section = SECTIONS.find((s) => s.id === sectionId);
    if (!section) return renderMenu(0);

    const lines = [];
    for (const entry of section.entries) {
      lines.push(headingHTML(entry.heading));
      if (entry.sub) lines.push(subHTML(entry.sub));
      for (const line of entry.lines) {
        lines.push(textHTML(`  • ${line}`));
      }
      lines.push('');
    }
    lines.pop(); // dernier saut de ligne superflu

    const header = `  ${section.title.toUpperCase()}`;

    const body = [
      `┌─${escape(header)}─${'─'.repeat(Math.max(0, WIDTH - header.length - 3))}┐`,
      '',
      ...lines.map((l) => `  ${l}`),
      '',
      mutedHTML(`  ${FOOTER_SECTION}`),
      mutedHTML(`  ${FOOTER_HINT}`)
    ].join('\n');

    return `<div class="cvViewerSection">${body}</div>`;
  };

  const render = (viewerState) => {
    if (!viewerState) return '';
    return viewerState.section === null
      ? renderMenu(viewerState.index)
      : renderSection(viewerState.section);
  };

  window.CV_VIEWER = {
    sections: () => SECTIONS.map(({ id, title }) => ({ id, title })),
    render
  };
})();
