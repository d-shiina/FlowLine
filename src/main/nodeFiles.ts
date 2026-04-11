import { app } from 'electron';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Filesystem helpers for the in-app Python node editor. All
 * operations are sandboxed to ``_runtime/nodes/`` so a malicious
 * or buggy renderer can't reach outside the FLOWLINE node tree.
 *
 * Paths are always expressed as forward-slash-relative strings
 * like ``debug/log.py`` or ``custom/my_node.py``. They never
 * start with a slash, never contain ``..``, and must end with
 * ``.py``.
 */

function nodesRoot(): string {
  return path.join(app.getAppPath(), '_runtime', 'nodes');
}

/**
 * Resolve a renderer-supplied relative path to an absolute path
 * inside the nodes directory. Rejects anything that looks like a
 * traversal attempt or references a non-``.py`` file.
 */
function resolveSafePath(relPath: string): string {
  if (typeof relPath !== 'string' || relPath.length === 0) {
    throw new Error('empty path');
  }
  if (relPath.includes('..') || relPath.startsWith('/') || relPath.startsWith('\\')) {
    throw new Error(`unsafe path: ${relPath}`);
  }
  if (!relPath.endsWith('.py')) {
    throw new Error(`only .py files are allowed: ${relPath}`);
  }
  const root = nodesRoot();
  const abs = path.resolve(root, relPath);
  const normRoot = path.resolve(root) + path.sep;
  if (!abs.startsWith(normRoot)) {
    throw new Error(`path escapes nodes root: ${relPath}`);
  }
  return abs;
}

/**
 * Convert a ``path.sep``-separated absolute path into the
 * renderer-facing forward-slash relative form.
 */
function toRelative(abs: string): string {
  const rel = path.relative(nodesRoot(), abs);
  return rel.split(path.sep).join('/');
}

export interface NodeFile {
  /** Forward-slash path relative to ``_runtime/nodes/``. */
  path: string;
  /** File size in bytes; cheap extra info for the UI. */
  size: number;
}

/**
 * Enumerate every ``*.py`` under ``_runtime/nodes/`` so the editor
 * can show files on disk alongside what the worker managed to
 * register. This is how broken / unregistered files surface.
 */
export async function listNodeFiles(): Promise<NodeFile[]> {
  const root = nodesRoot();
  const out: NodeFile[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__pycache__') continue;
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.py')) {
        if (entry.name.startsWith('_')) continue;
        const stat = await fsp.stat(full);
        out.push({ path: toRelative(full), size: stat.size });
      }
    }
  }
  await walk(root);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/**
 * Read a node source file. Returns `null` when the file doesn't
 * exist so the caller can distinguish a missing file from an IO
 * error without catching exceptions.
 */
export async function readNodeSource(relPath: string): Promise<string | null> {
  const abs = resolveSafePath(relPath);
  try {
    return await fsp.readFile(abs, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Write (or create) a node source file. Parent directories are
 * created on demand so the editor can spawn new files under
 * ``custom/`` without a separate mkdir step.
 */
export async function writeNodeSource(
  relPath: string,
  source: string,
): Promise<void> {
  const abs = resolveSafePath(relPath);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, source, 'utf-8');
}

/**
 * Delete a node source file. Missing files succeed silently so
 * repeated delete clicks don't error. Fails loudly on anything
 * else (permission, parent missing, etc.) so the UI can surface it.
 */
export async function deleteNodeSource(relPath: string): Promise<void> {
  const abs = resolveSafePath(relPath);
  try {
    await fsp.unlink(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
}
