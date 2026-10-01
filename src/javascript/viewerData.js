/**
 * Registre des viewers interactifs — Bastien BONORA
 * ----------------------------------------------------------------
 * Associe chaque valeur du champ `viewer` de l'arborescence JSON à
 * l'API de rendu correspondante (même forme que window.CV_VIEWER).
 * Le shell (script.js) est agnostique : il résout l'API via ce
 * registre au moment du `open`.
 *
 *   cv      → viewer de CV (cvViewer.js)
 *   profile → « qui suis-je » (presentation/qui_suis_je.html)
 *
 * Les viewers construits sur le moteur générique (docViewer.js)
 * s'enregistrent ici au fur et à mesure.
 */
(() => {
  'use strict';

  // ── Logos ASCII partagés par les viewers ─────────────────────
  const LOGO_TUX = {
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
  };

  const LOGO_TERMINAL = {
    title: 'portfolio-sh',
    art: [
      '.---------------------.',
      '| portfolio-sh    _   |',
      '| > whoami           |',
      '| bastien bonora     |',
      "| > open qui_suis_je |",
      '| ...                |',
      "'---------------------'"
    ]
  };

  const LOGO_THM = {
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
  };

  const LOGO_ROOTME = {
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
  };

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

  // ── Viewer « qui suis-je » ───────────────────────────────────
  // La page de présentation personnelle : qui je suis, comment j'en
  // suis arrivé là, ce que je fais au quotidien et ce qui m'anime.
  // Complément du CV (le parcours formel), ouverte via
  // `open qui_suis_je.html` depuis /root/presentation.
  const PROFILE = {
    title: 'QUI SUIS-JE ?',
    subtitle: 'Bastien BONORA — derrière le terminal',
    statusLabel: 'scan du propriétaire',
    ctrlLabel: 'bastienbonora.fr',
    logos: [LOGO_TUX, LOGO_TERMINAL, LOGO_THM, LOGO_ROOTME],
    platforms: PLATFORM_LINES,
    typedPhrases: [
      'curieux de tout',
      'persévérant',
      'autodidacte',
      "à l'aise en équipe",
      'CTF player'
    ],
    sections: [
      {
        id: 'moi',
        title: 'Moi, en quelques lignes',
        entries: [
          {
            heading: 'Qui je suis',
            lines: [
              'Bastien, 22 ans, étudiant en BUT Réseaux & Télécoms',
              "(parcours cybersécurité) à l'IUT d'Annecy, en alternance.",
              'Côté pro : technicien systèmes & réseaux au service',
              'informatique de l\u2019EPSM La Roche-sur-Foron.',
              'Côté perso : un curieux qui démonte tout ce qui tourne,',
              'du kernel Linux au pare-feu du home-lab.'
            ]
          },
          {
            heading: 'Ma façon de travailler',
            lines: [
              'Persévérant : un problème non résolu me tient éveillé.',
              'Perspicace : je cherche la cause, pas le contournement.',
              'Autonome autant qu\u2019à l\u2019aise en équipe de 4 (Nastruire)',
              'ou de 15 (service informatique d\u2019un hôpital).',
              'J\u2019apprends en documentant : write-ups, articles, docs'
            ]
          }
        ]
      },
      {
        id: 'parcours',
        title: 'Comment j\u2019en suis arrivé là',
        entries: [
          {
            heading: '2022 — Baccalauréat',
            lines: [
              'Spécialité NSI (numérique et sciences informatiques).',
              'Lauréat des Trophées NSI — région Auvergne-Rhône-Alpes.'
            ]
          },
          {
            heading: '2022 — Cap sur les réseaux',
            sub: 'IUT d\u2019Annecy — BUT Réseaux & Télécoms',
            lines: [
              'Entrée en BUT R&T, parcours cybersécurité.',
              'Alternance au service informatique de l\u2019EPSM',
              'La Roche-sur-Foron, dès la première année.'
            ]
          },
          {
            heading: '2022 — 2025 — Alternance EPSM',
            sub: 'Technicien Systèmes & Réseaux',
            lines: [
              'Bastion réseau, monitoring stack ELK, SIEM Elastic.',
              'Migration de sites externes dans un MPLS.',
              'Référent réseau sur les interventions sites.'
            ]
          },
          {
            heading: '2024 — Ouverture sur l\u2019écosystème',
            lines: [
              'European Cyber Week — Rennes.',
              'Swiss IT Forum — Genève, Suisse.'
            ]
          },
          {
            heading: '2025 — Première CTF internationale',
            lines: [
              'Insomni\u2019hack — Lausanne, Suisse.',
              '36e au CTF en équipe (FeelTheBit).'
            ]
          }
        ]
      },
      {
        id: 'quotidien',
        title: 'Mon quotidien de geek',
        entries: [
          {
            heading: 'Le home-lab',
            sub: 'Dell R620 — 32 Go de RAM',
            lines: [
              'Proxmox VE, OPNsense, FreeIPA, GitLab.',
              'SIEM Elastic Security pour surveiller tout ça.',
              'VLANs, VPN, déploiement VPS (rsync), SNMP…'
            ]
          },
          {
            heading: 'Les machines du quotidien',
            lines: [
              'ArchLinux au quotidien (boot UKI, eGPU, Steam Deck).',
              'Debian, Kali — et Windows pour le boulot (AD, GPO).',
              'Un lab de 3 ESX qui tourne à la maison.'
            ]
          },
          {
            heading: 'En ce moment',
            lines: [
              'CTF TryHackMe & Root-Me chaque semaine.',
              'Write-ups de rooms TryHackMe sur le portfolio.',
              'Articles techniques sur docs.bastienbonora.fr.'
            ]
          }
        ]
      },
      {
        id: 'valeurs',
        title: 'Ce qui m\u2019anime',
        entries: [
          {
            heading: 'Comprendre',
            lines: [
              'Pas de magie : un protocole, un OS, un kernel…',
              'je veux savoir comment ça marche vraiment.',
              'Débugger jusqu\u2019au bout, même jusqu\u2019au matériel.'
            ]
          },
          {
            heading: 'Partager',
            lines: [
              'Write-ups de CTF, articles, documentation publique.',
              'Ce que j\u2019apprends, je l\u2019écris — pour les autres',
              'et pour moi, six mois plus tard.'
            ]
          },
          {
            heading: 'Construire',
            lines: [
              'Ce portfolio : un terminal bash en JavaScript pur.',
              'Nastruire : un jeu Godot, en équipe de 4.',
              'Un home-lab complet, monté pièce par pièce.'
            ]
          }
        ]
      },
      {
        id: 'contact',
        title: 'Aller plus loin',
        entries: [
          {
            heading: 'Le parcours formel',
            links: [
              { label: 'CV', value: 'le PDF officiel', href: './root/presentation/CV/CV_Bastien_BONORA_2025.pdf' }
            ]
          },
          {
            heading: 'Me joindre',
            links: [
              { label: 'E-mail', value: 'bastien.bonora@gmail.com', href: 'mailto:bastien.bonora@gmail.com' },
              { label: 'Téléphone', value: '+33 6 16 29 64 01', href: 'tel:+33616296401' }
            ]
          },
          {
            heading: 'Me suivre',
            links: [
              { label: 'Site', value: 'bastienbonora.fr', href: 'https://bastienbonora.fr/' },
              { label: 'Blog', value: 'docs.bastienbonora.fr', href: 'https://docs.bastienbonora.fr/' },
              { label: 'GitHub', value: 'github.com/Fracorbas02', href: 'https://github.com/Fracorbas02' },
              { label: 'LinkedIn', value: 'in/bastien-bonora', href: 'https://www.linkedin.com/in/bastien-bonora' },
              { label: 'TryHackMe', value: 'p/Fracorbas', href: 'https://tryhackme.com/p/Fracorbas' }
            ]
          }
        ]
      }
    ]
  };

  window.PORTFOLIO_VIEWERS = {
    cv: window.CV_VIEWER,
    profile: window.PORTFOLIO_DOC_VIEWER.create(PROFILE)
  };
})();
