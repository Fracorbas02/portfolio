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

  /**
   * Expression régulière d'un motif de jokers : « * » → n'importe
   * quelle suite de caractères, « ? » → un seul, le reste est
   * pris littéralement (le point compris). Partagée par find et
   * le développement des jokers du shell.
   */
  function globToRegExp(pattern) {
    const escaped = pattern.replace(/[.*+^${}()|[\]\\*?]/g, (ch) => `\\${ch}`);
    return new RegExp(`^${escaped.replace(/\\\*/g, '.*').replace(/\\\?/g, '.')}$`);
  }

  /**
   * Chemins correspondant à un mot contenant des jokers (* et ?),
   * comme le développement du shell : chaque segment du chemin
   * est un mini-motif et le parcours est récursif — un motif
   * comme « *\/notes.txt » traverse l'arbre. Sans joker ou sans correspondance, la liste
   * est vide et l'appelant laisse le mot inchangé, comme bash.
   * Les fichiers masqués ne sont retenus que par un motif qui
   * commence lui-même par un point.
   */
  function globPaths(tree, currentDir, word) {
    if (!/[*?]/.test(word)) return [];
    const absolute = word.startsWith('/');
    const base = absolute
      ? word
      : `${currentDir === '/' ? '' : currentDir}/${word}`;
    const segments = base.split('/').filter(Boolean);

    let paths = [''];
    for (const segment of segments) {
      const matcher = /[*?]/.test(segment) ? globToRegExp(segment) : null;
      const next = [];
      for (const prefix of paths) {
        const dir = prefix === '' ? tree : navigate(tree, prefix);
        if (dir === null || !isDirectory(dir)) continue;
        for (const key of Object.keys(dir)) {
          if (key === 'type') continue;
          if (matcher === null) {
            if (key === segment) next.push(`${prefix}/${key}`);
          } else {
            if (key.startsWith('.') && !segment.startsWith('.')) continue;
            if (matcher.test(key)) next.push(`${prefix}/${key}`);
          }
        }
      }
      paths = next;
      if (paths.length === 0) break;
    }
    paths.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    if (absolute) return paths;
    // Restitution relative, comme le mot saisi : le dossier
    // courant est raboté des chemins trouvés
    const strip = currentDir === '/' ? '' : currentDir;
    return paths.map((p) => p.slice(strip.length + 1));
  }

  window.PORTFOLIO_FS = {
    navigate, resolve, isDirectory, isOpenable, lookUp,
    globToRegExp, globPaths
  };
})();
