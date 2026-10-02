/**
 * Utilitaires HTML partagés — Bastien BONORA
 * ----------------------------------------------------------------
 * Un seul endroit pour l'échappement HTML (utilisé par tous les
 * modules qui rendent du texte dans le terminal ou les viewers) et
 * pour la validation des URLs avant de les placer dans un href.
 *
 * À charger AVANT les autres scripts : les modules y lisent leurs
 * helpers au chargement.
 *
 * Exposé via window.PORTFOLIO_HTML : { escapeHTML, isSafeHref,
 * htmlToText }
 */
(() => {
  'use strict';

  /**
   * Échappe les cinq caractères sensibles du HTML. Toute donnée
   * affichée via innerHTML doit passer par ici (défense XSS).
   */
  const escapeHTML = (str) =>
    String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);

  /**
   * Liste blanche de schémas d'URL : tout href placé dans le DOM
   * doit être validé ici, sinon un « javascript: » ou un
   * « data:text/html » glissé dans les données s'exécuterait au
   * clic. Les chemins relatifs (sans schéma) sont acceptés.
   */
  const SAFE_SCHEMES = ['http', 'https', 'mailto', 'tel'];

  function isSafeHref(href) {
    if (typeof href !== 'string' || href.length === 0) return false;
    const scheme = href.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if (!scheme) return true; // relatif : ./ , / , fichier simple
    return SAFE_SCHEMES.includes(scheme[1].toLowerCase());
  }

  /**
   * Convertit le HTML du terminal en texte brut : les balises de
   * mise en évidence (spans de couleur, <br>) disparaissent, les
   * entités échappées redeviennent leurs caractères. Utilisé par
   * les pipelines (`ls | grep`) : la sortie d'une commande devient
   * l'entrée texte de la suivante. Symétrique d'escapeHTML.
   */
  const htmlToText = (html) =>
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');

  window.PORTFOLIO_HTML = { escapeHTML, isSafeHref, htmlToText };
})();
