import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Package, RefreshCw, CheckCircle, XCircle } from 'lucide-react';

/**
 * Known node package presets — one-click install for common setups.
 */
const PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  packages: string[];
  postCommands?: string[][];
}> = [
  {
    id: 'playwright',
    label: 'ブラウザ操作 (Playwright)',
    description: 'Chromium ブラウザの自動操作',
    packages: ['playwright'],
    postCommands: [['playwright', 'install', 'chromium']],
  },
  {
    id: 'requests',
    label: 'HTTP リクエスト',
    description: 'REST API 呼び出し、Web スクレイピング',
    packages: ['requests', 'beautifulsoup4'],
  },
  {
    id: 'excel',
    label: 'Excel 操作',
    description: 'Excel ファイルの読み書き',
    packages: ['openpyxl'],
  },
  {
    id: 'ocr',
    label: 'OCR (文字認識)',
    description: '画像からテキストを抽出',
    packages: ['pytesseract', 'Pillow'],
  },
  {
    id: 'pdf',
    label: 'PDF 操作',
    description: 'PDF の読み取り・生成',
    packages: ['PyPDF2', 'reportlab'],
  },
  {
    id: 'email',
    label: 'メール送受信',
    description: 'SMTP / IMAP メール操作',
    packages: ['secure-smtplib', 'imapclient'],
  },
];

interface Props {
  /** Currently installed packages (name==version strings). */
  installedPackages: string[];
  onRefresh: () => void;
}

type InstallState = 'idle' | 'installing' | 'done' | 'error';

export function PackageManager({ installedPackages, onRefresh }: Props) {
  const [installState, setInstallState] = useState<InstallState>('idle');
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [customPkg, setCustomPkg] = useState('');
  const unsubRef = useRef<(() => void) | null>(null);

  // Subscribe to pip progress events.
  useEffect(() => {
    const runtime = window.flowlineRuntime;
    if (!runtime) return;
    const unsub = runtime.onPipProgress((e) => setProgressMsg(e.message));
    unsubRef.current = unsub;
    return () => unsub();
  }, []);

  const isInstalled = useCallback(
    (pkg: string) =>
      installedPackages.some((p) =>
        p.toLowerCase().startsWith(pkg.toLowerCase() + '=='),
      ),
    [installedPackages],
  );

  const handleInstall = useCallback(
    async (packages: string[], postCommands?: string[][]) => {
      const runtime = window.flowlineRuntime;
      if (!runtime) return;

      setInstallState('installing');
      setProgressMsg('準備中...');
      setErrorMsg('');

      const result = await runtime.pipInstall(packages, postCommands);
      if (result.ok) {
        setInstallState('done');
        setProgressMsg('');
        onRefresh();
        // Auto-reset after 3 seconds
        setTimeout(() => setInstallState('idle'), 3000);
      } else {
        setInstallState('error');
        setErrorMsg(result.error ?? '不明なエラー');
      }
    },
    [onRefresh],
  );

  const handleCustomInstall = useCallback(() => {
    const pkg = customPkg.trim();
    if (!pkg) return;
    handleInstall(pkg.split(/\s+/));
    setCustomPkg('');
  }, [customPkg, handleInstall]);

  return (
    <div className="fl-scroll max-h-48 min-h-20 overflow-auto">
      {/* Progress / status bar */}
      {installState === 'installing' && (
        <div className="flex items-center gap-2 border-b border-fl-border bg-[#3b82f610] px-4 py-2">
          <RefreshCw className="h-3 w-3 animate-spin text-[#3b82f6]" />
          <span className="font-mono text-[10px] text-[#3b82f6]">
            {progressMsg}
          </span>
        </div>
      )}
      {installState === 'done' && (
        <div className="flex items-center gap-2 border-b border-fl-border bg-[#22c55e10] px-4 py-2">
          <CheckCircle className="h-3 w-3 text-[#22c55e]" />
          <span className="font-mono text-[10px] text-[#22c55e]">
            インストール完了
          </span>
        </div>
      )}
      {installState === 'error' && (
        <div className="flex items-center gap-2 border-b border-fl-border bg-[#ef444410] px-4 py-2">
          <XCircle className="h-3 w-3 text-[#ef4444]" />
          <span className="truncate font-mono text-[10px] text-[#ef4444]">
            {errorMsg}
          </span>
          <button
            type="button"
            onClick={() => setInstallState('idle')}
            className="ml-auto font-mono text-[9px] text-fl-text-faint hover:text-fl-text"
          >
            閉じる
          </button>
        </div>
      )}

      {/* Preset packages */}
      <div className="flex flex-col">
        {PRESETS.map((preset) => {
          const allInstalled = preset.packages.every(isInstalled);
          return (
            <div
              key={preset.id}
              className="flex items-center gap-3 border-b border-fl-border px-4 py-2 hover:bg-fl-panel-2"
            >
              <Package className="h-3.5 w-3.5 flex-shrink-0 text-fl-text-faint" />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] font-bold text-fl-text-muted">
                  {preset.label}
                </div>
                <div className="font-mono text-[8px] text-fl-text-ghost">
                  {preset.description} — {preset.packages.join(', ')}
                </div>
              </div>
              {allInstalled ? (
                <span className="flex-shrink-0 rounded bg-[#22c55e18] px-2 py-0.5 font-mono text-[8px] font-bold text-[#22c55e]">
                  インストール済み
                </span>
              ) : (
                <button
                  type="button"
                  disabled={installState === 'installing'}
                  onClick={() =>
                    handleInstall(preset.packages, preset.postCommands)
                  }
                  className="flex flex-shrink-0 items-center gap-1 rounded bg-[#3b82f618] px-2 py-0.5 font-mono text-[9px] font-bold text-[#3b82f6] transition-colors hover:bg-[#3b82f633] disabled:opacity-40"
                >
                  <Download className="h-2.5 w-2.5" /> インストール
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom package install */}
      <div className="flex items-center gap-2 border-b border-fl-border px-4 py-2">
        <input
          value={customPkg}
          onChange={(e) => setCustomPkg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCustomInstall()}
          placeholder="カスタム: パッケージ名を入力 (例: selenium)"
          className="min-w-0 flex-1 bg-transparent font-mono text-[10px] text-fl-text outline-none placeholder:text-fl-text-ghost"
        />
        <button
          type="button"
          disabled={installState === 'installing' || !customPkg.trim()}
          onClick={handleCustomInstall}
          className="flex items-center gap-1 rounded bg-fl-panel-2 px-2 py-0.5 font-mono text-[9px] text-fl-text-dim transition-colors hover:text-fl-text disabled:opacity-40"
        >
          <Download className="h-2.5 w-2.5" /> pip install
        </button>
      </div>

      {/* Installed packages count */}
      <div className="px-4 py-1.5 font-mono text-[8px] text-fl-text-ghost">
        {installedPackages.length} パッケージがインストール済み
        <button
          type="button"
          onClick={onRefresh}
          className="ml-2 text-fl-text-faint hover:text-fl-text"
        >
          <RefreshCw className="inline h-2 w-2" /> 更新
        </button>
      </div>
    </div>
  );
}
