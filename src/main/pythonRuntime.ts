import { app, type WebContents } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * FLOWLINE ships its own isolated Python runtime so the app never
 * touches the user's system Python. On first run — or any time the
 * runtime folder is empty — the renderer can ask the main process
 * to download a python-build-standalone "install_only" bundle from
 * GitHub releases and extract it into either the in-repo
 * ``_runtime/python/`` (dev) or ``<userData>/runtime/python/``
 * (packaged).
 *
 * The runtime is intentionally pinned to a known release. When
 * bumping Python, update ``PYTHON_VERSION`` and ``PBS_RELEASE_TAG``
 * together. python-build-standalone keeps each release URL stable.
 *
 * Only one install can be in flight at a time. Progress events are
 * pushed to the requesting WebContents so the renderer can render a
 * progress bar without polling.
 */

// Pin-points for the Python build. Bumping either requires checking
// the release page at
//   https://github.com/astral-sh/python-build-standalone/releases
// to confirm the URL pattern still holds.
const PYTHON_VERSION = '3.12.4';
const PBS_RELEASE_TAG = '20240726';

const BASE_URL = `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_RELEASE_TAG}`;

export interface PythonStatus {
  /** Absolute path to the python interpreter, or null if not installed. */
  pythonPath: string | null;
  /** Directory the runtime is (or would be) installed under. */
  runtimeDir: string;
  /** Whether an install is currently running. */
  installing: boolean;
  /** Version this build targets; purely informational for the UI. */
  version: string;
}

export interface InstallProgress {
  phase: 'starting' | 'downloading' | 'extracting' | 'done' | 'error';
  /** 0-1, only meaningful for `downloading`. NaN if size is unknown. */
  progress: number;
  message: string;
}

let installing = false;

// ──────────────────────────────────────────────────────────────────
// Path resolution
// ──────────────────────────────────────────────────────────────────

/**
 * The directory FLOWLINE uses as its isolated Python home. In dev we
 * write into the repo's ``_runtime/python/`` (gitignored) so hot
 * reload and repeated restarts reuse the same install. In packaged
 * builds the app root is read-only, so we fall back to the user's
 * per-app data directory.
 */
export function getRuntimeDir(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'runtime', 'python');
  }
  // ``app.getAppPath()`` in electron-forge-vite dev points at the
  // project root (where package.json lives).
  return path.join(app.getAppPath(), '_runtime', 'python');
}

function pythonExecutable(runtimeDir: string): string {
  // python-build-standalone's install_only archives put everything
  // under ``python/`` with a Unix-style layout even on Windows —
  // ``python/bin/python3`` on *nix, ``python/python.exe`` at the top
  // on Windows.
  if (process.platform === 'win32') {
    return path.join(runtimeDir, 'python.exe');
  }
  return path.join(runtimeDir, 'bin', 'python3');
}

// ──────────────────────────────────────────────────────────────────
// Detection
// ──────────────────────────────────────────────────────────────────

async function fileExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function detectPython(): Promise<PythonStatus> {
  const runtimeDir = getRuntimeDir();
  const exe = pythonExecutable(runtimeDir);
  const exists = await fileExists(exe);
  return {
    pythonPath: exists ? exe : null,
    runtimeDir,
    installing,
    version: PYTHON_VERSION,
  };
}

// ──────────────────────────────────────────────────────────────────
// Install
// ──────────────────────────────────────────────────────────────────

/**
 * Resolve the python-build-standalone triple for the current host.
 * Only platforms we actually plan to ship FLOWLINE on are listed —
 * unsupported combinations throw so the install bails early with a
 * clear error instead of downloading something that won't run.
 */
function resolveTriple(): string {
  const { platform, arch } = process;
  if (platform === 'win32') {
    if (arch === 'x64') return 'x86_64-pc-windows-msvc';
  }
  if (platform === 'darwin') {
    if (arch === 'x64') return 'x86_64-apple-darwin';
    if (arch === 'arm64') return 'aarch64-apple-darwin';
  }
  if (platform === 'linux') {
    if (arch === 'x64') return 'x86_64-unknown-linux-gnu';
    if (arch === 'arm64') return 'aarch64-unknown-linux-gnu';
  }
  throw new Error(`unsupported platform: ${platform}/${arch}`);
}

function downloadUrl(): string {
  const triple = resolveTriple();
  // Filename format:
  //   cpython-<ver>+<tag>-<triple>-install_only.tar.gz
  return `${BASE_URL}/cpython-${PYTHON_VERSION}+${PBS_RELEASE_TAG}-${triple}-install_only.tar.gz`;
}

function emit(
  sender: WebContents | null,
  event: InstallProgress,
): void {
  if (!sender || sender.isDestroyed()) return;
  sender.send('runtime:install-progress', event);
}

/**
 * Extract ``archivePath`` into ``parentDir`` by shelling out to the
 * system ``tar``. Windows 10 1803+, macOS, and Linux all ship one;
 * doing it this way avoids adding a native tar/zstd dependency to
 * the Electron bundle. Returns the path to the extracted
 * ``python/`` directory.
 */
async function extractTarGz(
  archivePath: string,
  parentDir: string,
): Promise<string> {
  await fsp.mkdir(parentDir, { recursive: true });
  return new Promise<string>((resolve, reject) => {
    const child = spawn('tar', ['-xzf', archivePath, '-C', parentDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (b: Buffer) => (stderr += b.toString()));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(path.join(parentDir, 'python'));
      else reject(new Error(`tar exited with ${code}: ${stderr.trim()}`));
    });
  });
}

/**
 * Download the pinned python-build-standalone bundle and extract it
 * into the runtime directory. Streams download progress to the
 * caller via ``runtime:install-progress`` events on the provided
 * WebContents.
 *
 * Throws if another install is already running or if the bundle
 * can't be fetched / extracted. On success, the runtime dir ends up
 * with the standard python-build-standalone layout (``bin/python3``
 * on *nix, ``python.exe`` on Windows).
 */
export async function installPython(sender: WebContents): Promise<void> {
  if (installing) {
    throw new Error('install already in progress');
  }
  installing = true;

  let triple: string;
  try {
    triple = resolveTriple();
  } catch (err) {
    installing = false;
    emit(sender, {
      phase: 'error',
      progress: NaN,
      message: String((err as Error).message ?? err),
    });
    throw err;
  }

  const url = downloadUrl();
  const runtimeDir = getRuntimeDir();
  const parent = path.dirname(runtimeDir);
  const tmpArchive = path.join(
    os.tmpdir(),
    `flowline-python-${Date.now()}.tar.gz`,
  );

  try {
    emit(sender, {
      phase: 'starting',
      progress: NaN,
      message: `${triple} 用の Python ${PYTHON_VERSION} を取得中…`,
    });

    // Ensure parent dir exists before wiping / creating the runtime.
    await fsp.mkdir(parent, { recursive: true });

    // ── Download ───────────────────────────────────────────────────
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error(`download failed: HTTP ${res.status}`);
    }
    const totalHeader = res.headers.get('content-length');
    const total = totalHeader ? Number(totalHeader) : NaN;
    let received = 0;

    const bodyStream = Readable.fromWeb(
      res.body as unknown as Parameters<typeof Readable.fromWeb>[0],
    );
    bodyStream.on('data', (chunk: Buffer) => {
      received += chunk.length;
      const ratio = Number.isFinite(total) && total > 0 ? received / total : NaN;
      emit(sender, {
        phase: 'downloading',
        progress: ratio,
        message: Number.isFinite(total)
          ? `ダウンロード中 ${(received / 1e6).toFixed(1)}MB / ${(total / 1e6).toFixed(1)}MB`
          : `ダウンロード中 ${(received / 1e6).toFixed(1)}MB`,
      });
    });

    const writeStream = fs.createWriteStream(tmpArchive);
    await pipeline(bodyStream, writeStream);

    // ── Wipe any stale runtime and extract ─────────────────────────
    emit(sender, {
      phase: 'extracting',
      progress: NaN,
      message: 'アーカイブを展開中…',
    });
    await fsp.rm(runtimeDir, { recursive: true, force: true });
    // python-build-standalone archives contain a top-level ``python/``
    // directory — extract into the parent so it materializes at the
    // runtime path we expect.
    await extractTarGz(tmpArchive, parent);

    // Sanity check the extracted interpreter runs before reporting
    // success — if the archive is broken or for the wrong platform,
    // the user sees the failure now instead of at scenario-run time.
    const exe = pythonExecutable(runtimeDir);
    await runAndCheck(exe, ['--version']);

    emit(sender, {
      phase: 'done',
      progress: 1,
      message: `Python ${PYTHON_VERSION} をインストールしました`,
    });
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    emit(sender, { phase: 'error', progress: NaN, message });
    throw err;
  } finally {
    installing = false;
    // Best-effort tmp cleanup — not fatal if it fails.
    try {
      await fsp.rm(tmpArchive, { force: true });
    } catch {
      /* ignore */
    }
  }
}

function runAndCheck(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (b: Buffer) => (stderr += b.toString()));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} exited ${code}: ${stderr.trim()}`));
    });
  });
}

// ──────────────────────────────────────────────────────────────────
// pip install
// ──────────────────────────────────────────────────────────────────

export interface PipInstallResult {
  ok: boolean;
  output: string;
  error?: string;
}

/**
 * Run ``pip install <packages>`` inside the isolated Python runtime,
 * then run optional post-install commands (e.g. ``playwright install chromium``).
 *
 * Progress is streamed to the sender via ``runtime:pip-progress`` events.
 */
export async function pipInstall(
  sender: WebContents,
  packages: string[],
  postCommands?: string[][],
): Promise<PipInstallResult> {
  const status = await detectPython();
  if (!status.pythonPath) {
    return { ok: false, output: '', error: 'Python ランタイムが未インストールです' };
  }

  const exe = status.pythonPath;
  let fullOutput = '';

  const emitProgress = (message: string) => {
    if (sender && !sender.isDestroyed()) {
      sender.send('runtime:pip-progress', { message });
    }
  };

  // Run pip install
  try {
    emitProgress(`pip install ${packages.join(' ')} ...`);
    const pipOutput = await runCommand(exe, ['-m', 'pip', 'install', ...packages]);
    fullOutput += pipOutput + '\n';
    emitProgress('pip install 完了');
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return { ok: false, output: fullOutput, error: `pip install 失敗: ${msg}` };
  }

  // Run post-install commands
  if (postCommands) {
    for (const args of postCommands) {
      try {
        const label = args.join(' ');
        emitProgress(`${label} ...`);
        // If first arg is the package name, run it as a python module
        const output = await runCommand(exe, ['-m', ...args]);
        fullOutput += output + '\n';
        emitProgress(`${label} 完了`);
      } catch (err) {
        const msg = (err as Error).message ?? String(err);
        return { ok: false, output: fullOutput, error: `${args.join(' ')} 失敗: ${msg}` };
      }
    }
  }

  return { ok: true, output: fullOutput };
}

/** Run a command and return combined stdout+stderr. */
function runCommand(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300_000, // 5 min max
    });
    let out = '';
    child.stdout.on('data', (b: Buffer) => (out += b.toString()));
    child.stderr.on('data', (b: Buffer) => (out += b.toString()));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`exit ${code}: ${out.slice(-500)}`));
    });
  });
}

/**
 * List installed pip packages. Returns a list of ``name==version`` strings.
 */
export async function pipList(): Promise<string[]> {
  const status = await detectPython();
  if (!status.pythonPath) return [];
  try {
    const output = await runCommand(status.pythonPath, [
      '-m', 'pip', 'list', '--format=freeze',
    ]);
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}
