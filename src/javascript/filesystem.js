/**
 * Système de fichiers virtuel — Bastien BONORA
 * ----------------------------------------------------------------
 * Fonctions pures de navigation dans l'arborescence JSON du
 * portfolio. Aucun état interne : l'arbre et le dossier courant
 * sont passés en paramètres par chaque fenêtre de shell.
 *
 * Exposé via window.PORTFOLIO_FS : { navigate, resolve, isDirectory,
 * isOpenable, lookUp }
 */
(() => {
  'use strict';

  /**
   * Descend l'arbre segment par segment, ou null si un segment
   * n'existe pas.
   */
  function navigate(tree, path) {
    const segments = path.split('/').filter(Boolean);
    let node = tree;
    for (const segment of segments) {
      node = node?.[segment];
      if (!node) return null;
    }
    return node;
  }

  /**
   * Résout un chemin (absolu ou relatif au dossier courant) en
   * chemin absolu normalisé : gère ".", ".." et les segments vides.
   */
  function resolve(currentDir, path) {
    const base = path.startsWith('/') ? path : `${currentDir}/${path}`;
    const stack = [];
    for (const segment of base.split('/')) {
      if (!segment || segment === '.') continue;
      if (segment === '..') {
        stack.pop();
        continue;
      }
      stack.push(segment);
    }
    return `/${stack.join('/')}`;
  }

  /**
   * Un dossier est un objet de l'arbre sans champ "type" (la racine)
   * ou avec type "directory". Les fichiers ({ type: "file" }) et les
   * liens ({ type: "link" }) ne sont pas des dossiers.
   */
  function isDirectory(node) {
    return node !== null && typeof node === 'object'
      && !Array.isArray(node)
      && (!node.type || node.type === 'directory');
  }

  /**
   * Un élément ouvrable par open : fichier local ou lien externe.
   */
  function isOpenable(node) {
    return node?.type === 'file' || node?.type === 'link';
  }

  /**
   * Résout un chemin dans l'arbre et renvoie le nœud cible, ou null
   * s'il n'existe pas. Le champ "type" est une métadonnée, pas un
   * fichier : il n'est jamais résolu.
   */
  function lookUp(tree, currentDir, target) {
    const path = resolve(currentDir, target);
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (name === 'type') return null;

    const parentPath = path.slice(0, path.lastIndexOf('/')) || '/';
    const parent = navigate(tree, parentPath);
    const node = name ? parent?.[name] : parent;
    return node === undefined || node === null ? null : node;
  }

  window.PORTFOLIO_FS = { navigate, resolve, isDirectory, isOpenable, lookUp };
})();
