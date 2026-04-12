import { app, dialog, type BrowserWindow } from 'electron';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';
import yauzl from 'yauzl';
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
 * Uses yazl/yauzl (pure JS, no native deps) so it works on all platforms.
 */

interface PackResult {
  ok: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Export a scenario as a .fls file.
 */
export async function packScenario(
  win: BrowserWindow,
  scenarioJson: string,
  nodeIds: string[],
  manifest: Array<{ id: string; [key: string]: unknown }>,
): Promise<PackResult> {
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

  // Legacy .json export.
  if (savePath.endsWith('.json')) {
    await fsp.writeFile(savePath, scenarioJson, 'utf-8');
    return { ok: true, filePath: savePath };
  }

  // Build .fls (ZIP) using yazl.
  const zip = new ZipFile();

  // Add scenario.json (clean, no embeddedNodes).
  const { embeddedNodes: _, ...cleanScenario } = scenario;
  zip.addBuffer(
    Buffer.from(JSON.stringify(cleanScenario, null, 2), 'utf-8'),
    'scenario.json',
  );

  // Collect and add node sources.
  const bundledManifest: Array<{ id: string; path: string; [key: string]: unknown }> = [];
  for (const nodeId of nodeIds) {
    const pyPath = `${nodeId}.py`;
    const source = await readNodeSource(pyPath);
    if (!source) continue;

    zip.addBuffer(Buffer.from(source, 'utf-8'), `nodes/${pyPath}`, {
      compress: true,
    });

    const m = manifest.find((n) => n.id === nodeId);
    if (m) bundledManifest.push({ ...m, path: pyPath });
  }

  // Add manifest.
  if (bundledManifest.length > 0) {
    zip.addBuffer(
      Buffer.from(JSON.stringify(bundledManifest, null, 2), 'utf-8'),
      'nodes/manifest.json',
    );
  }

  // Finalize and write to disk.
  zip.end();
  const writeStream = fs.createWriteStream(savePath);
  await pipeline(zip.outputStream, writeStream);

  return { ok: true, filePath: savePath };
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
 * Import a .fls file.
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

  // .fls (ZIP) import using yauzl.
  const entries = await readZipEntries(filePath);
  const scenarioEntry = entries.get('scenario.json');
  if (!scenarioEntry) {
    return {
      ok: false,
      error: 'scenario.json が見つかりません',
      installedNodes: [],
      updatedNodes: [],
      skippedNodes: [],
    };
  }

  const scenario = JSON.parse(scenarioEntry);

  // Install bundled nodes.
  const installed: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const [entryPath, content] of entries) {
    if (!entryPath.startsWith('nodes/') || !entryPath.endsWith('.py')) continue;
    const relPath = entryPath.slice('nodes/'.length); // e.g. "custom/my-node.py"

    const existingSource = await readNodeSource(relPath);
    if (existingSource) {
      if (existingSource === content) {
        skipped.push(relPath);
      } else {
        await writeNodeSource(relPath, content);
        updated.push(relPath);
      }
    } else {
      await writeNodeSource(relPath, content);
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
}

/**
 * Read all entries from a ZIP file into a Map<path, content>.
 * Uses yauzl (pure JS, no native deps).
 */
function readZipEntries(zipPath: string): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error('failed to open zip'));
      const map = new Map<string, string>();
      const zf = zipfile as any; // readEntry() not in minimal typings

      const readNext = () => zf.readEntry();

      zipfile.on('entry', (entry: yauzl.Entry) => {
        if (entry.fileName.endsWith('/')) {
          readNext();
          return;
        }
        zipfile.openReadStream(entry, (readErr, stream) => {
          if (readErr || !stream) {
            readNext();
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            map.set(entry.fileName, Buffer.concat(chunks).toString('utf-8'));
            readNext();
          });
        });
      });

      zipfile.on('end', () => resolve(map));
      zipfile.on('error', reject);
      readNext();
    });
  });
}
