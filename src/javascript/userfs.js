/**
 * Fichiers utilisateur — Bastien BONORA
 * ----------------------------------------------------------------
 * Surcouche persistée de l'arborescence virtuelle : les fichiers du
 * portfolio (elements.json) sont en lecture seule, tout ce que le
 * visiteur crée (touch, mkdir, nano, redirections) vit ici. La
 * surcouche est stockée en localStorage et réappliquée sur l'arbre
 * à chaque démarrage ; rm ne peut supprimer que les fichiers de
 * son propriétaire — jamais le contenu du portfolio.
 *
 * Aucune requête réseau, aucun accès disque : tout reste dans le
 * navigateur de l'utilisateur.
 *
 * Exposé via window.PORTFOLIO_USERFS :
 *   { applyTo, owns, read, write, makeDir, remove, STORAGE_KEY }
 *
 * Les fonctions renvoient true en cas de succès, sinon un code
 * d'erreur (chaîne) que les commandes traduisent en message :
 *   invalidName | tooLarge | system | missingParent | exists |
 *   notFound | isDir | notEmpty
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'portfolioUserFiles';

  // Garde-fou localStorage (~5 Mo au total) : 100 Ko par fichier
  const MAX_FILE_SIZE = 100000;

  // Surcouche en mémoire : { files: { chemin: contenu }, dirs: [chemin] }.
  // Les dossiers implicites (parents d'un fichier créé) n'ont pas
  // d'entrée « dirs » : ils n'existent que par leur contenu, comme
  // dans un vrai système de fichiers.
  let overlay = { files: {}, dirs: [] };

  // Arbre monté par applyTo : la surcouche vit dessus
  let tree = null;

  const isDirectory = window.PORTFOLIO_FS.isDirectory;

  /** Nœud d'un chemin absolu dans l'arbre, ou null. */
  function nodeAt(path) {
    let node = tree;
    for (const segment of path.split('/').filter(Boolean)) {
      if (node === null || typeof node !== 'object') return null;
      node = node[segment];
    }
    return node === undefined || node === null ? null : node;
  }

  /** Chemin parent normalisé (« /root/a/b » → « /root/a »). */
  function parentPath(path) {
    const cut = path.slice(0, path.lastIndexOf('/'));
    return cut === '' ? '/' : cut;
  }

  /**
   * Un nom valide : non vide, raisonnable, sans séparateur (le
   * chemin est déjà résolu) et jamais « type » — métadonnée de
   * l'arbre, pas un fichier.
   */
  function validName(path) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    return name.length >= 1 && name.length <= 64
      && name !== 'type' && !name.includes('/');
  }

  /** Charge la surcouche depuis localStorage, défensivement. */
  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const files = (stored !== null && typeof stored === 'object'
        && !Array.isArray(stored) && stored.files !== null
        && typeof stored.files === 'object' && !Array.isArray(stored.files))
        ? stored.files : {};
      overlay = {
        // Seules les entrées { chemin: chaîne } sont conservées
        files: Object.fromEntries(
          Object.entries(files).filter(([, value]) => typeof value === 'string')),
        dirs: (Array.isArray(stored?.dirs)
          ? stored.dirs.filter((d) => typeof d === 'string') : [])
      };
    } catch {
      overlay = { files: {}, dirs: [] };
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overlay));
    } catch {
      // Stockage indisponible ou plein : la surcouche reste en
      // mémoire pour la session, rien n'est persisté
    }
  }

  /**
   * Crée les dossiers intermédiaires manquants d'un chemin, sans
   * jamais écraser un nœud existant (fichier ou dossier).
   */
  function ensureDirs(path) {
    let node = tree;
    for (const segment of path.split('/').filter(Boolean)) {
      if (node[segment] === undefined || node[segment] === null) {
        node[segment] = {};
      } else if (typeof node[segment] !== 'object') {
        return false;
      }
      node = node[segment];
    }
    return true;
  }

  /**
   * Applique la surcouche sur l'arbre (appelé à chaque démarrage,
   * avant le premier prompt) : dossiers explicites d'abord, puis
   * fichiers — chacun avec ses dossiers parents implicites.
   */
  function applyTo(target) {
    tree = target;
    load();

    const dirs = [...overlay.dirs].sort((a, b) => a.length - b.length);
    for (const dir of dirs) {
      if (nodeAt(dir) === null) ensureDirs(dir);
    }
    for (const [path, content] of Object.entries(overlay.files)) {
      if (!ensureDirs(parentPath(path))) continue;
      const node = nodeAt(path);
      // Écraser un fichier du portfolio n'arrive jamais : write le
      // refuse ; un nœud non-chaîne ici est une anomalie, on l'ignore
      if (typeof node === 'string' || node === null) {
        let parent = tree;
        for (const segment of parentPath(path).split('/').filter(Boolean)) {
          parent = parent[segment];
        }
        parent[path.slice(path.lastIndexOf('/') + 1)] = content;
      }
    }
  }

  /** Un chemin appartient-il à l'utilisateur ? (créé par lui) */
  function owns(path) {
    return Object.hasOwn(overlay.files, path) || overlay.dirs.includes(path);
  }

  /** Contenu d'un fichier utilisateur, ou null. */
  function read(path) {
    return Object.hasOwn(overlay.files, path) ? overlay.files[path] : null;
  }

  /**
   * Crée ou écrase un fichier utilisateur. Refuse le contenu du
   * portfolio (lecture seule) et les noms invalides.
   */
  function write(path, content) {
    if (tree === null) return 'missingParent';
    if (typeof content !== 'string') return 'tooLarge';
    if (content.length > MAX_FILE_SIZE) return 'tooLarge';
    if (!validName(path)) return 'invalidName';

    // Son propre fichier : écrasement autorisé
    if (Object.hasOwn(overlay.files, path)) {
      const existing = nodeAt(path);
      if (existing !== null && typeof existing !== 'string') return 'system';
    } else {
      // Le portfolio est en lecture seule : un nœud existant qui
      // n'est pas un fichier utilisateur ne peut pas être écrasé
      if (nodeAt(path) !== null) return 'system';
      const parent = nodeAt(parentPath(path));
      if (parent === null || !isDirectory(parent)) return 'missingParent';
    }

    let parent = nodeAt(parentPath(path));
    parent[path.slice(path.lastIndexOf('/') + 1)] = content;
    overlay.files[path] = content;
    save();
    return true;
  }

  /**
   * Crée un dossier utilisateur vide. Refuse un chemin existant
   * (fichier ou dossier, portfolio compris).
   */
  function makeDir(path) {
    if (tree === null) return 'missingParent';
    if (!validName(path)) return 'invalidName';
    if (nodeAt(path) !== null) return 'exists';
    const parent = nodeAt(parentPath(path));
    if (parent === null || !isDirectory(parent)) return 'missingParent';

    parent[path.slice(path.lastIndexOf('/') + 1)] = {};
    overlay.dirs.push(path);
    save();
    return true;
  }

  /**
   * Supprime un fichier ou un dossier utilisateur. Un dossier non
   * vide exige recursive ; le contenu du portfolio n'est jamais
   * supprimable.
   */
  function remove(path, { recursive = false } = {}) {
    if (tree === null || !owns(path)) {
      return nodeAt(path) !== null ? 'system' : 'notFound';
    }

    // Fichier utilisateur
    if (Object.hasOwn(overlay.files, path)) {
      const node = nodeAt(path);
      if (node !== null && isDirectory(node)) return 'isDir';
      delete overlay.files[path];
      const parent = nodeAt(parentPath(path));
      delete parent[path.slice(path.lastIndexOf('/') + 1)];
      save();
      return true;
    }

    // Dossier utilisateur : vide, ou vidé par un rm -r
    const prefix = `${path}/`;
    const files = Object.keys(overlay.files).filter((p) => p.startsWith(prefix));
    const dirs = overlay.dirs.filter((p) => p.startsWith(prefix));
    if ((files.length > 0 || dirs.length > 0) && !recursive) return 'notEmpty';

    for (const file of files) {
      delete overlay.files[file];
      const fileParent = nodeAt(parentPath(file));
      delete fileParent[file.slice(file.lastIndexOf('/') + 1)];
    }
    for (const dir of dirs) {
      overlay.dirs = overlay.dirs.filter((d) => d !== dir);
    }
    overlay.dirs = overlay.dirs.filter((d) => d !== path);
    const parent = nodeAt(parentPath(path));
    delete parent[path.slice(path.lastIndexOf('/') + 1)];
    save();
    return true;
  }

  window.PORTFOLIO_USERFS = {
    applyTo, owns, read, write, makeDir, remove, STORAGE_KEY
  };
})();
