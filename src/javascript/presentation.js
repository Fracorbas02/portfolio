/**
 * Page « À propos » — Bastien BONORA
 * --------------------------------------------------
 * Ce script gère :
 *   - Le menu hamburger latéral (cohérent avec script.js)
 *   - Les animations au scroll des items de la timeline
 *     via IntersectionObserver, avec fallback gracieux.
 */

(() => {
  'use strict';

  // ──────────────────────────────────────────────────────────────
  // Références DOM
  // ──────────────────────────────────────────────────────────────
  const HAMBURGER     = document.getElementById('hamburgerMenu');
  const MENU_CONTENT  = document.getElementById('menuContent');
  const ACCORDIONS    = document.querySelectorAll('.accordion');
  const PANEL_BUTTONS = document.querySelectorAll('.panelButton');
  const TIMELINE_ITEMS = document.querySelectorAll('.timeline__item');

  // ──────────────────────────────────────────────────────────────
  // Menu hamburger
  // ──────────────────────────────────────────────────────────────
  function toggleMenu(forceClose = false) {
    const isOpen = MENU_CONTENT.classList.contains('open');
    const willOpen = !forceClose && !isOpen;

    HAMBURGER.classList.toggle('change', willOpen);
    MENU_CONTENT.classList.toggle('open', willOpen);
    HAMBURGER.setAttribute('aria-expanded', String(willOpen));

    if (willOpen) {
      MENU_CONTENT.removeAttribute('hidden');
    } else {
      // Délai pour laisser l'animation de fermeture se terminer
      setTimeout(() => {
        if (!MENU_CONTENT.classList.contains('open')) {
          MENU_CONTENT.setAttribute('hidden', '');
        }
      }, 400);
    }
  }

  function setupMenu() {
    HAMBURGER.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    for (const accordion of ACCORDIONS) {
      accordion.addEventListener('click', () => {
        const isActive = accordion.classList.toggle('active');
        accordion.setAttribute('aria-expanded', String(isActive));

        const panel = accordion.nextElementSibling;
        if (!panel) return;

        if (isActive) {
          panel.style.maxHeight = `${panel.scrollHeight + 24}px`;
        } else {
          panel.style.maxHeight = null;
        }
      });
    }

    for (const button of PANEL_BUTTONS) {
      button.addEventListener('click', () => {
        const url = button.dataset.url;
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      });
    }

    // Fermeture au clic extérieur
    document.addEventListener('click', (event) => {
      if (!MENU_CONTENT.classList.contains('open')) return;
      if (MENU_CONTENT.contains(event.target)) return;
      if (HAMBURGER.contains(event.target)) return;
      toggleMenu(true);
    });

    // Fermeture sur Échap
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && MENU_CONTENT.classList.contains('open')) {
        toggleMenu(true);
      }
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Animations au scroll (timeline)
  // ──────────────────────────────────────────────────────────────
  function setupTimelineAnimations() {
    // Si l'utilisateur préfère réduire les animations, on affiche tout d'un coup
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      TIMELINE_ITEMS.forEach((item) => item.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -80px 0px'
      }
    );

    TIMELINE_ITEMS.forEach((item) => observer.observe(item));
  }

  // ──────────────────────────────────────────────────────────────
  // Initialisation
  // ──────────────────────────────────────────────────────────────
  function init() {
    setupMenu();
    setupTimelineAnimations();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();