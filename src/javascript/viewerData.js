/**
 * Registre des viewers interactifs — Bastien BONORA
 * ----------------------------------------------------------------
 * Associe chaque valeur du champ `viewer` de l'arborescence JSON à
 * l'API de rendu correspondante (même forme que window.CV_VIEWER).
 * Le shell (script.js) est agnostique : il résout l'API via ce
 * registre au moment du `open`.
 *
 *   cv       → viewer de CV (cvViewer.js)
 *   profile  → « qui suis-je » (presentation/qui_suis_je.html)
 *   reseaux  → Réseaux & Télécoms (competences/reseaux.html)
 *   cyber    → Cybersécurité (competences/cybersecurite.html)
 *   dev      → Développement (competences/developpement.html)
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
      "    .---------------.",
      "   /                 \\",
      "  |  portfolio-sh    |",
      "  |  > whoami _      |",
      "  |__________________|",
      "   \\______/---\\______/",
      "  ~ ~ ~ ~ ~ ~ ~ ~ ~ ~",
    ]
  };

  const LOGO_THM = {
    title: 'tryhackme',
    art: [
      "        .-----.",
      "     .-'       '-.",
      "   .'             '.",
      "  (      T H M      )",
      "   '.             .'",
      "     '-._______.-'",
      ""
    ]
  };

  const LOGO_ROOTME = {
    title: 'root-me.org',
    art: [
      "      .-------.",
      "     /---------\\",
      "    |  ()    ()  |",
      "    |     /\\    |",
      "     \\         /",
      "    @\\ |__|__| /@",
      "      |______|"
    ]
  };

  const LOGO_CISCO = {
    title: 'cisco ccna',
    art: [
      "       /\\      /\\",
      "    __/  \\____/  \\__",
      "   |    |    |    |",
      " ==|====|====|====|==",
      "  ~|~~~~~~~~~~~~|~",
      "  ~  c i s c o  ~",
      "   ~ ~ ~ ~ ~ ~ ~ ~"
    ]
  };

  const LOGO_STORMSHIELD = {
    title: 'stormshield',
    art: [
      "    .-------.",
      "   / .-----. \\",
      "  | |       | |",
      "  | |       | |",
      "   \\ '-----' /",
      "    \\       /",
      "     \\_____/"
    ]
  };

  const LOGO_NASTRUIRE = {
    title: 'nastruire — godot',
    art: [
      "    .----------.",
      "   /            \\",
      "  |   _|_    o  |",
      "  |  (_|_)  o o |",
      "  |     [==]     |",
      "   \\            /",
      "    '----------'"
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
    ctrlLabel: 'la page à propos',
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
              'Bastien, 22 ans, diplômé du BUT Réseaux & Télécoms',
              '(parcours cybersécurité) de l\u2019IUT d\u2019Annecy.',
              'Aujourd\u2019hui : admin systèmes & réseaux chez Alpes',
              'Networks, un opérateur internet de petite taille —',
              'petite structure, donc on touche à tout.',
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
          },
          {
            heading: '2025 — Diplômé, et en poste',
            sub: 'admin systèmes & réseaux',
            lines: [
              'BUT R&T validé — Bac+3, le schéma de terminale se',
              'redessine autrement (la suite : Alpes Networks,',
              'un opérateur internet des Alpes).',
              'La cyber reste en fil rouge : CTF, home-lab, write-ups.'
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

  // ── Viewer Réseaux & Télécoms ────────────────────────────────
  // La page Réseaux, ouverte via `open reseaux.html` depuis
  // /root/competences : fondamentaux, protocoles, matériel,
  // terrain et certifications.
  const RESEAUX = {
    title: 'RÉSEAUX & TÉLÉCOMS',
    subtitle: 'routage · commutation · sécurité de périmètre',
    statusLabel: 'scan du réseau',
    ctrlLabel: 'bastodoc',
    logos: [LOGO_CISCO, LOGO_STORMSHIELD, LOGO_TUX],
    platforms: PLATFORM_LINES,
    typedPhrases: [
      'routage & switching',
      'VLAN · trunk · STP',
      'BGP · MPLS · TLS',
      'pare-feu Stormshield',
      'monitoring ELK'
    ],
    sections: [
      {
        id: 'panorama',
        title: 'Les fondamentaux',
        entries: [
          {
            heading: 'Fondations',
            lines: [
              'Modèle OSI : je l\u2019ai même réexpliqué sur bastodoc.',
              'Adressage IPv4/IPv6, subnetting sans calculatrice.',
              'Routage statique et dynamique entre sites.'
            ]
          },
          {
            heading: 'Commutation',
            lines: [
              'VLAN, trunk 802.1Q, STP, port-security.',
              'Conception de segments : utilisateurs, serveurs,',
              'management, DMZ — chacun dans son VLAN.'
            ]
          },
          {
            heading: 'Services réseau',
            lines: [
              'DHCP (scopes, relais), DNS (zones, split-horizon).',
              'NAT/PAT, ACL — filtrer sans casser l\u2019usage.'
            ]
          }
        ]
      },
      {
        id: 'protocoles',
        title: 'Protocoles creusés',
        entries: [
          {
            heading: 'Ceux que j\u2019ai vraiment étudiés',
            lines: [
              'TLS — du handshake à la re-négociation.',
              'BGP — l\u2019AS de l\u2019EPSM vers le monde.',
              'MPLS — migration de sites externes (terrain, pas',
              'seulement la théorie du cours).'
            ]
          },
          {
            heading: 'Articles dédiés sur bastodoc',
            lines: [
              { text: 'Le modèle OSI, couche par couche', href: 'https://docs.bastienbonora.fr/' },
              { text: 'TLS : chiffrement et certificats', href: 'https://docs.bastienbonora.fr/' },
              { text: 'BGP : le routage entre AS', href: 'https://docs.bastienbonora.fr/' },
              { text: 'MPLS : VPN opérateur et labels', href: 'https://docs.bastienbonora.fr/' }
            ]
          }
        ]
      },
      {
        id: 'materiel',
        title: 'Matériel & configurations',
        entries: [
          {
            heading: 'Cisco',
            lines: [
              'CCNA 1 & 2 — routage et switching.',
              'Configuration avancée de matériel Cisco :',
              'interfaces, VLANs, STP, OSPF, ACL, SSH.'
            ]
          },
          {
            heading: 'Stormshield',
            lines: [
              'Certifié CSNA & CSNE — pare-feu Stormshield.',
              'VPN IKEv2 site-à-site et nomade, NAT, filtrage',
              'applicationnel, logs et objets.'
            ]
          },
          {
            heading: 'Écosystème',
            lines: [
              'Ubiquiti (UniFi), SNMP, supervision via ELK.',
              'Lab de 3 ESX + Proxmox pour tester avant de',
              'toucher la production.'
            ]
          }
        ]
      },
      {
        id: 'terrain',
        title: 'En conditions réelles',
        entries: [
          {
            heading: 'EPSM La Roche-sur-Foron — alternance',
            sub: 'Service informatique, 2022 → 2025',
            lines: [
              'Bastion réseau avec monitoring via la stack ELK.',
              'Migration de sites externes dans un MPLS.',
              'Sauvegarde sécurisée des configurations réseau.',
              'Référent réseau sur les interventions sites :',
              'pare-feu, switchs, liens opérateur.'
            ]
          },
          {
            heading: 'Home-lab',
            lines: [
              'OPNsense, VLANs, VPN, FreeIPA, GitLab, SIEM —',
              'mon propre périmètre à sécuriser, 24/7.'
            ]
          }
        ]
      },
      {
        id: 'certifications',
        title: 'Certifications',
        entries: [
          {
            heading: 'Papiers officiels',
            links: [
              { label: 'CSNA', value: 'Stormshield — pdf', href: './root/certif/Certification_CSNA.pdf' },
              { label: 'TOEIC', value: 'pdf', href: './root/certif/Certification_TOEIC.pdf' },
              { label: 'Cambridge', value: 'pdf', href: './root/certif/Certification_Cambridge.pdf' }
            ]
          },
          {
            heading: 'Cisco',
            lines: ['CCNA 1 & 2 — voir la rubrique Matériel.']
          }
        ]
      }
    ]
  };

  // ── Viewer Cybersécurité ─────────────────────────────────────
  // La page Cybersécurité, ouverte via `open cybersecurite.html`
  // depuis /root/competences : offensive, défensive, write-ups,
  // plateformes et veille.
  const CYBER = {
    title: 'CYBERSÉCURITÉ',
    subtitle: 'offensive le jour, défensive au quotidien',
    statusLabel: 'scan de la surface d\u2019attaque',
    ctrlLabel: 'bastodoc',
    logos: [LOGO_THM, LOGO_ROOTME, LOGO_STORMSHIELD],
    platforms: PLATFORM_LINES,
    typedPhrases: [
      'offensive security',
      'SIEM Elastic',
      'CTF player',
      'pare-feu Stormshield',
      'home-lab durci'
    ],
    sections: [
      {
        id: 'offensive',
        title: 'Côté offensive',
        entries: [
          {
            heading: 'CTF & challenges',
            lines: [
              'TryHackMe : [0xA] WIZARD — 12 379 pts, 85 rooms.',
              'Root-Me : 1 220 pts — 75 challenges.',
              'Insomni\u2019hack (Lausanne) : 36e en équipe, FeelTheBit.'
            ]
          },
          {
            heading: 'Outils du quotidien',
            lines: [
              'Recon : nmap, gobuster, énumération méthode.',
              'Cracking : hashcat, john — de la wordlist à la',
              'règle de mangling.',
              'Privesc : GTFOBins, SUID, cron, capabilities.'
            ]
          }
        ]
      },
      {
        id: 'defensive',
        title: 'Côté défensive',
        entries: [
          {
            heading: 'Détection & réponse',
            lines: [
              'SIEM Elastic Security — règles, alertes, cas de',
              'détection sur un trafic réel.',
              'Stack ELK : bastion réseau supervisé à l\u2019EPSM.'
            ]
          },
          {
            heading: 'Durcissement',
            lines: [
              'Pare-feu Stormshield (CSNA/CSNE) : filtrage,',
              'VPN IKEv2, NAT, segmentation VLAN.',
              'FreeIPA pour l\u2019identité et les règles du lab.',
              'Bonne hygiène : moindre privilège, sauvegardes,',
              'configurations versionnées.'
            ]
          }
        ]
      },
      {
        id: 'writeups',
        title: 'Write-ups TryHackMe',
        entries: [
          {
            heading: 'Rooms documentées sur le portfolio',
            links: [
              { label: 'Brute It', value: 'hash cracking, sudo', href: './root/CTF/Brute%20It.html' },
              { label: 'Archangel', value: 'LFI, RCE via log', href: './root/CTF/Archangel.html' },
              { label: 'Mustacchio', value: 'SQLite, GTFOBins', href: './root/CTF/Mustacchio.html' },
              { label: 'Break Out', value: 'énumération, privesc', href: './root/CTF/Break%20Out%20The%20Cage.html' }
            ]
          },
          {
            heading: 'Pourquoi j\u2019écris',
            lines: [
              'Un CTF non écrit est un CTF oublié : chaque write-up',
              'm\u2019oblige à comprendre la faille assez pour',
              'l\u2019expliquer.'
            ]
          }
        ]
      },
      {
        id: 'plateformes',
        title: 'Plateformes & veille',
        entries: [
          {
            heading: 'Profils',
            links: [
              { label: 'TryHackMe', value: 'tryhackme.com/p/Fracorbas', href: 'https://tryhackme.com/p/Fracorbas' },
              { label: 'Root-Me', value: 'root-me.org', href: 'https://root-me.org/' }
            ]
          },
          {
            heading: 'Conférences',
            lines: [
              'European Cyber Week — Rennes (2024).',
              'Swiss IT Forum — Genève (2024).',
              'Insomni\u2019hack — Lausanne (2025).'
            ]
          },
          {
            heading: 'Articles sécurité sur bastodoc',
            lines: [
              { text: 'Monitorer son OS Linux', href: 'https://docs.bastienbonora.fr/' },
              { text: 'Maîtriser grep (et trier des logs)', href: 'https://docs.bastienbonora.fr/' },
              { text: 'Auth. biométrique sous Linux', href: 'https://docs.bastienbonora.fr/' }
            ]
          }
        ]
      }
    ]
  };

  // ── Viewer Développement ─────────────────────────────────────
  // La page Développement, ouverte via `open developpement.html`
  // depuis /root/competences : web, scripts, projets, apprentissage.
  const DEV = {
    title: 'DÉVELOPPEMENT',
    subtitle: 'scripts, web et projets d\u2019équipe',
    statusLabel: 'compilation des projets',
    ctrlLabel: 'bastodoc',
    logos: [LOGO_TUX, LOGO_TERMINAL, LOGO_NASTRUIRE],
    platforms: PLATFORM_LINES,
    typedPhrases: [
      'JavaScript',
      'Python',
      'bash & systemd',
      'Rust en cours',
      'PowerShell'
    ],
    sections: [
      {
        id: 'web',
        title: 'Web',
        entries: [
          {
            heading: 'Ce portfolio',
            lines: [
              'Un terminal bash en JavaScript pur, sans framework :',
              'fenêtres draggables, complétion Tab, historique,',
              'recherche Ctrl+R, thème dynamique… et ces viewers.',
              'HTML/CSS/JS — chaque feature est née d\u2019une idée',
              'de shell réel à imiter.'
            ]
          },
          {
            heading: 'Ce que ça m\u2019a appris',
            lines: [
              'DOM, events, timers — et la discipline d\u2019un code',
              'découpé en modules qui se testent au navigateur.'
            ]
          }
        ]
      },
      {
        id: 'scripts',
        title: 'Scripts & automatisation',
        entries: [
          {
            heading: 'Python & bash',
            lines: [
              'Python : scripts d\u2019automatisation, parsing,',
              'petits outils d\u2019admin.',
              'bash + systemd : services, timers, boot UKI sur',
              'ArchLinux — le quotidien au terminal.'
            ]
          },
          {
            heading: 'PowerShell',
            lines: [
              'Administration Windows : AD, DHCP, NPS.',
              'Automatisation de tâches serveur.'
            ]
          }
        ]
      },
      {
        id: 'projets',
        title: 'Projets',
        entries: [
          {
            heading: 'Les trois têtes d\u2019affiche',
            links: [
              { label: 'Nastruire', value: 'jeu Godot, équipe de 4', href: 'https://nastruire.fr/' },
              { label: 'Bastodoc', value: 'blog de write-ups & docs', href: 'https://docs.bastienbonora.fr/' },
              { label: 'Portfolio', value: 'ce terminal JS', href: 'https://bastienbonora.fr/' }
            ]
          },
          {
            heading: 'Le reste',
            lines: [
              { text: 'github.com/Fracorbas02', href: 'https://github.com/Fracorbas02' },
              'Home-lab : Proxmox, OPNsense, FreeIPA, GitLab,',
              'SIEM — assemblé et scripté maison.'
            ]
          }
        ]
      },
      {
        id: 'apprentissage',
        title: 'En cours d\u2019apprentissage',
        entries: [
          {
            heading: 'Rust',
            lines: [
              'Cheatsheet Rust publiée sur bastodoc.',
              'Objectif : réécrire certains scripts Python en',
              'Rust, pour la rigueur que le langage impose.'
            ]
          },
          {
            heading: 'C',
            lines: [
              'Bases solides : comprendre ce qui se passe sous',
              'les langages haut niveau.'
            ]
          }
        ]
      }
    ]
  };

  // ── Viewer « orientation » ────────────────────────────────────
  // Le projet d'orientation post-bac de terminale : le plan tel
  // qu'il figurait sur le schéma d'époque (un diagramme Whimsical,
  // encore ouvert tel quel via ^C), et ce qui s'est réellement
  // passé. Ouvre via `open projet_orientation.png` depuis
  // /root/presentation.

  // Frise « toute l'histoire » : une ère par période, façon caméra.
  // docViewer.js révèle chaque ère de bas en haut (le chemin se
  // crée), la nettoie en trame ░ puis passe à la suivante ; la
  // période s'affiche en haut à gauche. Lignes ≤ 54 caractères,
  // la route (`═`) ferme chaque ère et prend la couleur d'accent.
  const eraRoad = '═'.repeat(44);
  const ORIENTATION_ERAS = [
    {
      period: '2021 — 2022',
      year: '2021', chip: 'lycée',
      title: 'LYCÉE GUILLAUME FICHET',
      lines: [
        'Terminale à Bonneville (74). Spécialités',
        'Mathématiques et NSI, option maths expertes,',
        'section Euro — anglais certifié B2.',
        'L\u2019année du grand schéma d\u2019orientation :',
        'toutes les voies post-bac dessinées, prépa',
        'intégrée, BUT, licences, BTS. Déjà un cap :',
        'les réseaux, et la cybersécurité.',
        eraRoad
      ]
    },
    {
      period: '2022 — 2023',
      year: '2022', chip: 'BUT R&T',
      title: 'IUT D\u2019ANNECY — BUT R&T, 1re ANNÉE',
      lines: [
        'La voie B, en alternance : formation certifiée',
        'SecNumEdu par l\u2019ANSSI.',
        'Les fondations : TCP/IP, routage, switching,',
        'VLAN, télécoms, systèmes GNU/Linux.',
        'Puis le choix assumé du parcours cybersécurité',
        'dès la 2e année.',
        eraRoad
      ]
    },
    {
      period: '2023 — 2025',
      year: '2023', chip: 'alternance',
      title: 'ALTERNANCE EPSM LA ROCHE-SUR-FORON',
      lines: [
        'Trois ans au service informatique, en',
        'alternance du BUT : du concret, du réseau',
        'et de la sécurité en production.',
        'Bastion supervisé avec la stack ELK,',
        'migration de sites externes dans un MPLS,',
        'pare-feu Stormshield : VPN, NAT, filtrage.',
        'CCNA 1 & 2, CSNA/CSNE Stormshield.',
        'En parallèle : TryHackMe [0xA] Wizard, Root-Me,',
        'write-ups et un home-lab qui grandit.',
        eraRoad
      ]
    },
    {
      period: '2025',
      year: '2025', chip: 'diplômé',
      title: 'DIPLÔMÉ — BAC+3, BUT R&T VALIDÉ',
      lines: [
        'BUT Réseaux & Télécoms en poche, parcours',
        'cybersécurité. Bac+3, et pas plus : le schéma',
        'de terminale se redessine autrement.',
        'Le portfolio et bastodoc prennent forme :',
        'documenter devient une habitude.',
        eraRoad
      ]
    },
    {
      period: 'AUJOURD\u2019HUI',
      year: '∞', chip: 'aujourd\u2019hui',
      title: 'ALPES NETWORKS',
      lines: [
        'Admin systèmes & réseaux chez un opérateur',
        'internet de petite taille : petite structure,',
        'donc on touche à tout, au plus près de la',
        'production.',
        'Toujours en apprentissage : articles et doc',
        'sur bastodoc, write-ups, CTF, home-lab.',
        'La défense en retrait, mais pas abandonnée.',
        eraRoad
      ]
    }
  ];

  // ── Viewer « blog » (bastodoc) ────────────────────────────────
  // Le blog technique : articles, write-ups de CTF et documentation.
  // Raccourci : commande `blog` (équivalent à open blog/blog.html).
  // Les liens locaux pointent vers les write-ups hébergés ici, les
  // externes vers docs.bastienbonora.fr.
  const BLOG = {
    title: 'BASTODOC',
    subtitle: 'le blog — articles, write-ups, documentation',
    statusLabel: 'lecture des flux',
    ctrlLabel: 'le site du blog',
    logos: [LOGO_TERMINAL, LOGO_ROOTME, LOGO_TUX],
    platforms: PLATFORM_LINES,
    typedPhrases: [
      'articles techniques',
      'write-ups de CTF',
      'documentation',
      'archives de veille'
    ],
    sections: [
      {
        id: 'articles',
        title: 'Les derniers articles',
        entries: [
          {
            heading: 'Ce que je publie',
            lines: [
              'Des articles techniques, nés de ce que je démonte',
              'au travail ou dans le home-lab : réseau, sécurité,',
              'systèmes — expliqués couche par couche.'
            ]
          },
          {
            heading: 'À lire sur bastodoc',
            links: [
              { label: 'Blog', value: 'tous les articles', href: 'https://docs.bastienbonora.fr/' },
              { label: 'Portfolio', value: 'bastienbonora.fr', href: 'https://bastienbonora.fr/' }
            ]
          }
        ]
      },
      {
        id: 'writeups',
        title: 'Les write-ups',
        entries: [
          {
            heading: 'CTF TryHackMe — rooms complètes',
            lines: [
              { text: 'Brute It', href: './root/CTF/Brute%20It.html' },
              { text: 'Archangel', href: './root/CTF/Archangel.html' },
              { text: 'Mustacchio', href: './root/CTF/Mustacchio.html' },
              { text: 'Break Out The Cage', href: './root/CTF/Break%20Out%20The%20Cage.html' }
            ]
          },
          {
            heading: 'Pourquoi les écrire',
            lines: [
              'Un CTF non écrit est un CTF oublié : le write-up',
              'force à comprendre chaque étape, et sert de doc',
              'à qui le relit — moi le premier.'
            ]
          }
        ]
      },
      {
        id: 'plateforme',
        title: 'La plateforme',
        entries: [
          {
            heading: 'bastodoc, c\u2019est quoi ?',
            lines: [
              'Mon espace de documentation : articles, notes de',
              'veille et write-ups, écrits pour durer.',
              'Ce que j\u2019apprends, je l\u2019écris — pour les autres',
              'et pour moi, six mois plus tard.'
            ]
          }
        ]
      }
    ]
  };

  const ORIENTATION = {
    title: 'ORIENTATION POST-BAC',
    subtitle: 'le plan de terminale · ce qui en est sorti',
    statusLabel: 'cartographie des parcours',
    ctrlLabel: "l'image originale",
    logos: [LOGO_TERMINAL, LOGO_CISCO, LOGO_TUX],
    platforms: PLATFORM_LINES,
    typedPhrases: [
      'Bac Maths & NSI',
      'BUT R&T — cybersécurité',
      'EPSM en alternance',
      'Alpes Networks',
      'red team / blue team'
    ],
    sections: [
      {
        id: 'depart',
        title: 'Le point de départ',
        entries: [
          {
            heading: 'Terminale, lycée Guillaume Fichet',
            lines: [
              'Bonneville (74), année du grand schéma.',
              'Spécialités Mathématiques et NSI.',
              'Option Mathématiques expertes.',
              'Section Euro — anglais certifié B2.'
            ]
          },
          {
            heading: 'La question de terminale',
            lines: [
              'École d\u2019ingénieur, BUT, licence ou BTS ?',
              'Le schéma d\u2019époque (celui que ^C ouvre en image)',
              'dessinait toutes les voies possibles, avec leurs',
              'années, leurs débouchés et leurs compromises.'
            ]
          }
        ]
      },
      {
        id: 'voies',
        title: 'Les voies envisagées',
        entries: [
          {
            heading: 'Écoles d\u2019ingénieurs — Bac+5 en 5 ans',
            lines: [
              'GEPI Polytech Chambéry : cycle prépa intégré (PEIP),',
              '2 ans de maths-info avant le cycle ingénieur.',
              'Prépas des INP : Valence, Grenoble (ENSIMAG).'
            ]
          },
          {
            heading: 'BUT R&T — Bac+3 en 3 ans',
            lines: [
              'Voie B, en alternance : IUT d\u2019Annecy — formation',
              'certifiée SecNumEdu par l\u2019ANSSI.',
              'Voie C, formation initiale : IUT de Valence.'
            ]
          },
          {
            heading: 'Licences et autres pistes',
            lines: [
              'Licence informatique : Savoie Mont-Blanc, Grenoble',
              'Alpes, Lyon 1 (L1 MISPO puis parcours info).',
              'BUT développement : IUT Grenoble, Annecy, Roanne.',
              'BTS SIO : Cluses, Annecy — puis licence.'
            ]
          }
        ]
      },
      {
        id: 'fait',
        title: 'Ce que j\u2019ai réellement fait',
        entries: [
          {
            heading: 'Le choix final',
            lines: [
              'BUT Réseaux & Télécoms à l\u2019IUT d\u2019Annecy —',
              'la voie B, en alternance.',
              'Parcours cybersécurité en 2e et 3e année.'
            ]
          },
          {
            heading: 'L\u2019alternance',
            sub: 'EPSM La Roche-sur-Foron — service info, 2022 → 2025',
            lines: [
              'Bastion réseau supervisé avec la stack ELK.',
              'Migration de sites externes dans un MPLS.',
              'Pare-feu Stormshield : VPN, NAT, filtrage.'
            ]
          },
          {
            heading: 'Bien plus que prévu',
            lines: [
              'CCNA 1 & 2, certifications Stormshield CSNA/CSNE.',
              'TryHackMe [0xA] Wizard, Root-Me, write-ups.',
              'Ce portfolio, bastodoc, un home-lab complet.'
            ]
          }
        ]
      },
      {
        id: 'apres',
        title: 'Et maintenant ?',
        entries: [
          {
            heading: 'Pas de Bac+5 (pour l\u2019instant)',
            lines: [
              'Le schéma d\u2019époque prévoyait de continuer vers un',
              'master ou une école d\u2019ingénieurs. En vrai, je me',
              'suis arrêté en Bac+3 : diplômé du BUT R&T,',
              'et le volet scolaire s\u2019arrête là.'
            ]
          },
          {
            heading: 'Alpes Networks',
            sub: 'aujourd\u2019hui — admin systèmes & réseaux',
            lines: [
              'Un opérateur internet de petite taille : petite',
              'structure, donc on touche à tout.',
              'Administration système et réseau au quotidien,',
              'au plus près de la production.'
            ]
          },
          {
            heading: 'Côté défense',
            lines: [
              'La Marine Nationale n\u2019est pas abandonnée —',
              'mais presque. La cyber vit quand même : CTF,',
              'TryHackMe, Root-Me, home-lab, write-ups.'
            ]
          },
          {
            heading: 'Toujours en apprentissage',
            lines: [
              'Je continue d\u2019apprendre en continu, et je',
              'documente tout : articles et documentation sur',
              'bastodoc, write-ups de CTF, ce portfolio.'
            ]
          }
        ]
      },
      {
        id: 'histoire',
        title: 'Toute l\u2019histoire',
        eras: ORIENTATION_ERAS
      }
    ]
  };

  // Source unique des logos ASCII du panneau latéral : le viewer CV
  // (cvViewer.js) pointe ici plutôt que de porter sa propre copie
  window.PORTFOLIO_VIEWER_LOGOS = {
    tux:         LOGO_TUX,
    terminal:    LOGO_TERMINAL,
    thm:         LOGO_THM,
    rootme:      LOGO_ROOTME,
    cisco:       LOGO_CISCO,
    stormshield: LOGO_STORMSHIELD,
    nastruire:   LOGO_NASTRUIRE
  };

  // Config de base du viewer blog : servira de modèle au viewer
  // reconstruit depuis le flux RSS (voir blogFeed.js / cmdBlog).
  window.PORTFOLIO_BLOG_BASE = BLOG;

  window.PORTFOLIO_VIEWERS = {
    cv: window.CV_VIEWER,
    profile: window.PORTFOLIO_DOC_VIEWER.create(PROFILE),
    reseaux: window.PORTFOLIO_DOC_VIEWER.create(RESEAUX),
    cyber: window.PORTFOLIO_DOC_VIEWER.create(CYBER),
    dev: window.PORTFOLIO_DOC_VIEWER.create(DEV),
    blog: window.PORTFOLIO_DOC_VIEWER.create(BLOG),
    orientation: window.PORTFOLIO_DOC_VIEWER.create(ORIENTATION)
  };
})();
