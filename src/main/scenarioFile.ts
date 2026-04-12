import { app, dialog, type BrowserWindow } from 'electron';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crossZip from 'cross-zip';
import { readNodeSource, writeNodeSource } from './nodeFiles';

/**
 * .fls (FLOWLINE Scenario) file format.
 *
 * A .fls file is a standard ZIP archive containing:
 *
 *   scenario.json        — the scenario data (no embedded node sources)
 *   nodes/<id>.py        — one file per custom node referenced by the scenario
 *   nodes/manifest.json  — manifest snapshots for each bundled node
 *
 * This keeps scenario.json lightweight regardless of how many nodes
 * exist, while remaining fully self-contained and portable.
 */

function nodesRoot(): string {
  return path.join(app.getAppPath(), '_runtime', 'nodes');
}

interface PackResult {
  ok: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Export a scenario as a .fls file.
 * Collects referenced node sources and bundles everything into a ZIP.
 */
export async function packScenario(
  win: BrowserWindow,
  scenarioJson: string,
  nodeIds: string[],
  manifest: Array<{ id: string; [key: string]: unknown }>,
): Promise<PackResult> {
  // Ask user where to save.
  const scenario = JSON.parse(scenarioJson);
  const defaultName = `${scenario.name || 'flowline-scenario'}.fls`;
  const result = await dialog.showSaveDialog(win, {
    title: 'シナリオをエクスポート',
    defaultPath: defaultName,
    filters: [
      { name: 'FLOWLINE Scenario', extensions: ['fls'] },
      { name: 'JSON (レガシー)', extensions: ['json'] },
    ],
  });
  if (result.canceled || !result.filePath) {
    return { ok: false };
  }

  const savePath = result.filePath;

  // If user chose .json, just write the JSON directly (legacy export).
  if (savePath.endsWith('.json')) {
    await fsp.writeFile(savePath, scenarioJson, 'utf-8');
    return { ok: true, filePath: savePath };
  }

  // Build .fls (ZIP) in a temp directory.
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'fls-'));
  try {
    // Write scenario.json (clean, no embeddedNodes).
    const { embeddedNodes: _, ...cleanScenario } = scenario;
    await fsp.writeFile(
      path.join(tmpDir, 'scenario.json'),
      JSON.stringify(cleanScenario, null, 2),
      'utf-8',
    );

    // Collect node sources.
    const nodesDir = path.join(tmpDir, 'nodes');
    await fsp.mkdir(nodesDir, { recursive: true });
    const bundledManifest: Array<{ id: string; path: string; [key: string]: unknown }> = [];

    for (const nodeId of nodeIds) {
      const pyPath = `${nodeId}.py`;
      const source = await readNodeSource(pyPath);
      if (!source) continue;

      // Write .py to temp nodes/ dir.
      const destPath = path.join(nodesDir, pyPath);
      await fsp.mkdir(path.dirname(destPath), { recursive: true });
      await fsp.writeFile(destPath, source, 'utf-8');

      // Find manifest entry.
      const m = manifest.find((n) => n.id === nodeId);
      if (m) bundledManifest.push({ ...m, path: pyPath });
    }

    // Write nodes/manifest.json.
    if (bundledManifest.length > 0) {
      await fsp.writeFile(
        path.join(nodesDir, 'manifest.json'),
        JSON.stringify(bundledManifest, null, 2),
        'utf-8',
      );
    }

    // ZIP the temp directory into the target .fls file.
    crossZip.zipSync(tmpDir, savePath);
    return { ok: true, filePath: savePath };
  } finally {
    // Clean up temp directory.
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

interface UnpackResult {
  ok: boolean;
  scenario?: unknown;
  installedNodes: string[];
  updatedNodes: string[];
  skippedNodes: string[];
  error?: string;
}

/**
 * Import a .fls file. Extracts the scenario and installs bundled nodes.
 */
export async function unpackScenario(
  win: BrowserWindow,
): Promise<UnpackResult> {
  const result = await dialog.showOpenDialog(win, {
    title: 'シナリオをインポート',
    filters: [
      { name: 'FLOWLINE Scenario', extensions: ['fls', 'json'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, installedNodes: [], updatedNodes: [], skippedNodes: [] };
  }

  const filePath = result.filePaths[0];

  // Legacy .json import.
  if (filePath.endsWith('.json')) {
    const text = await fsp.readFile(filePath, 'utf-8');
    const scenario = JSON.parse(text);
    return {
      ok: true,
      scenario,
      installedNodes: [],
      updatedNodes: [],
      skippedNodes: [],
    };
  }

  // .fls (ZIP) import.
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'fls-import-'));
  try {
    crossZip.unzipSync(filePath, tmpDir);

    // Read scenario.json.
    const scenarioPath = path.join(tmpDir, 'scenario.json');
    const scenarioText = await fsp.readFile(scenarioPath, 'utf-8');
    const scenario = JSON.parse(scenarioText);

    // Install bundled nodes.
    const installed: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];

    const nodesDir = path.join(tmpDir, 'nodes');
    const nodeFiles = await collectPyFiles(nodesDir);
    for (const relPath of nodeFiles) {
      const bundledSource = await fsp.readFile(
        path.join(nodesDir, relPath),
        'utf-8',
      );
      const existingSource = await readNodeSource(relPath);

      if (existingSource) {
        // Compare content.
        if (existingSource === bundledSource) {
          skipped.push(relPath);
          continue;
        }
        // Different version — update.
        await writeNodeSource(relPath, bundledSource);
        updated.push(relPath);
      } else {
        // New node.
        await writeNodeSource(relPath, bundledSource);
        installed.push(relPath);
      }
    }

    return {
      ok: true,
      scenario,
      installedNodes: installed,
      updatedNodes: updated,
      skippedNodes: skipped,
    };
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

/** Recursively collect .py files under a directory. */
async function collectPyFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(d, entry.name), rel);
      } else if (entry.isFile() && entry.name.endsWith('.py')) {
        out.push(rel);
      }
    }
  }
  await walk(dir, '');
  return out;
}
