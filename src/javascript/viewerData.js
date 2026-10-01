/**
 * Registre des viewers interactifs — Bastien BONORA
 * ----------------------------------------------------------------
 * Associe chaque valeur du champ `viewer` de l'arborescence JSON à
 * l'API de rendu correspondante (même forme que window.CV_VIEWER).
 * Le shell (script.js) est agnostique : il résout l'API via ce
 * registre au moment du `open`.
 *
 *   cv → viewer de CV (cvViewer.js)
 *
 * Les viewers construits sur le moteur générique (docViewer.js)
 * s'enregistrent ici au fur et à mesure.
 */
(() => {
  'use strict';

  window.PORTFOLIO_VIEWERS = {
    cv: window.CV_VIEWER
  };
})();
