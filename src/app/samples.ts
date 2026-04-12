import type { Scenario } from './types';
import { ERROR_HANDLER_COLOR, ERROR_HANDLER_ID } from './types';

const emptyErrorHandler = () => ({
  id: ERROR_HANDLER_ID,
  name: 'エラー処理',
  color: ERROR_HANDLER_COLOR,
  blocks: [],
});

/** Completely empty: single empty track. */
const empty: Scenario = {
  version: '1.0',
  name: '空のシナリオ',
  variables: { scenario: {} },
  tracks: [
    { id: 'track-1', name: 'トラック1', color: '#3B82F6', blocks: [] },
  ],
  syncPoints: [],
  errorHandler: emptyErrorHandler(),
  subroutines: [],
};

/** Single track, 4 tasks in sequence. */
const basic: Scenario = {
  version: '1.0',
  name: '基本シナリオ',
  variables: { scenario: {} },
  tracks: [
    {
      id: 'track-1',
      name: 'メインフロー',
      color: '#3B82F6',
      blocks: [
        {
          id: 'b-1', label: 'アプリ起動', slot: 0,
          steps: [{ id: 's-b1', type: 'action', label: 'アプリ起動', order: 0 }],
        },
        {
          id: 'b-2', label: 'データ入力', slot: 1,
          steps: [{ id: 's-b2', type: 'action', label: 'データ入力', order: 0 }],
        },
        {
          id: 'b-3', label: '送信', slot: 2,
          steps: [{ id: 's-b3', type: 'action', label: '送信', order: 0 }],
        },
        {
          id: 'b-4', label: '完了通知', slot: 3,
          steps: [{ id: 's-b4', type: 'action', label: '完了通知', order: 0 }],
        },
      ],
    },
  ],
  syncPoints: [],
  errorHandler: emptyErrorHandler(),
  subroutines: [],
};

/**
 * 3 parallel tracks, sync point barrier, skipIfMissing, retry, timeout.
 * Also the default sample.
 */
const parallel: Scenario = {
  version: '1.0',
  name: '並列処理デモ',
  variables: {
    scenario: {
      target_file: 'data.xlsx',
      email_to: '',
    },
  },
  tracks: [
    {
      id: 'track-1',
      name: 'Excel処理',
      color: '#3B82F6',
      blocks: [
        {
          id: 'b-10', label: 'Excel起動', slot: 0,
          steps: [{ id: 's-b10', type: 'action', label: 'Excel起動', order: 0 }],
        },
        {
          id: 'b-11', label: 'データ読込', slot: 1,
          steps: [{ id: 's-b11', type: 'action', label: 'データ読込', order: 0 }],
        },
        {
          id: 'b-12', label: '行ループ処理', slot: 2,
          steps: [
            { id: 's-b12-loop', type: 'loop', label: '行ループ', order: 0, params: { iterations: 5 } },
            { id: 's-b12-work', type: 'action', label: 'セル処理', order: 0, parentStepId: 's-b12-loop' },
          ],
        },
        {
          id: 'b-13', label: 'ファイル保存', slot: 3,
          steps: [{ id: 's-b13', type: 'action', label: 'ファイル保存', order: 0 }],
        },
      ],
    },
    {
      id: 'track-2',
      name: 'メール処理',
      color: '#22C55E',
      blocks: [
        {
          id: 'b-20', label: '下書き作成', slot: 0,
          steps: [{ id: 's-b20', type: 'action', label: '下書き作成', order: 0 }],
        },
        {
          id: 'b-21', label: '添付追加', slot: 1,
          steps: [{ id: 's-b21', type: 'action', label: '添付追加', order: 0 }],
        },
        {
          id: 'b-22', label: 'ダイアログ閉じる', slot: 2,
          steps: [{ id: 's-b22', type: 'action', label: 'ダイアログ閉じる', order: 0, skipIfMissing: true }],
        },
        {
          id: 'b-23', label: 'メール送信', slot: 5,
          steps: [{ id: 's-b23', type: 'action', label: 'メール送信', order: 0 }],
        },
      ],
    },
    {
      id: 'track-3',
      name: 'ログ記録',
      color: '#F59E0B',
      blocks: [
        {
          id: 'b-30', label: 'ログ開始', slot: 0,
          steps: [{ id: 's-b30', type: 'action', label: 'ログ開始', order: 0 }],
        },
        {
          id: 'b-31', label: '結果書込', slot: 5,
          timeout: 60,
          onError: { retry: 3, then: 'skip' },
          steps: [{ id: 's-b31', type: 'action', label: '結果書込', order: 0 }],
        },
      ],
    },
  ],
  syncPoints: [{ id: 'sync-1', label: '合流', slot: 4 }],
  errorHandler: emptyErrorHandler(),
  subroutines: [],
};

/**
 * Control-flow showcase: loops (fixed-count and while), branch with
 * then/else, nested in separate task blocks.
 */
const controlFlow: Scenario = {
  version: '1.0',
  name: 'ループ & 分岐デモ',
  variables: {
    scenario: {
      retries: 0,
      max_retries: 3,
    },
  },
  tracks: [
    {
      id: 'track-1',
      name: 'メイン',
      color: '#3B82F6',
      blocks: [
        {
          id: 'b-setup', label: '初期化', slot: 0,
          steps: [
            { id: 's-setup', type: 'action', label: '初期化', order: 0 },
          ],
        },
        {
          id: 'b-loop1', label: '3回くり返し', slot: 1,
          steps: [
            { id: 's-loop1', type: 'loop', label: '3回くり返し', order: 0, params: { iterations: 3 } },
            { id: 's-loop1-work', type: 'action', label: 'ワーク', order: 0, parentStepId: 's-loop1' },
          ],
        },
        {
          id: 'b-branch', label: 'retries < max?', slot: 2,
          steps: [
            {
              id: 's-branch', type: 'branch', label: 'retries < max?', order: 0,
              params: {
                condition: {
                  '<': [
                    { var: 'scenario.retries' },
                    { var: 'scenario.max_retries' },
                  ],
                },
              },
            },
            { id: 's-then', type: 'action', label: 'リトライ処理', order: 0, parentStepId: 's-branch', parentBranch: 'then' },
            { id: 's-else', type: 'action', label: '諦めて通知', order: 0, parentStepId: 's-branch', parentBranch: 'else' },
          ],
        },
        {
          id: 'b-loop2', label: 'ポーリング', slot: 3,
          steps: [
            {
              id: 's-loop2', type: 'loop', label: 'ポーリング', order: 0,
              params: { whileCondition: { '<': [{ var: 'track.track-1.loop_index' }, 2] } },
            },
            { id: 's-poll', type: 'action', label: 'ステータス確認', order: 0, parentStepId: 's-loop2' },
          ],
        },
        {
          id: 'b-done', label: '完了通知', slot: 4,
          steps: [
            { id: 's-done', type: 'action', label: '完了通知', order: 0 },
          ],
        },
      ],
    },
  ],
  syncPoints: [],
  errorHandler: emptyErrorHandler(),
  subroutines: [],
};

/**
 * Switch showcase: four case lanes, expression-based dispatch.
 */
const switchDemo: Scenario = {
  version: '1.0',
  name: 'スイッチデモ',
  variables: {
    scenario: { status: 'ok' },
  },
  tracks: [
    {
      id: 'track-1',
      name: 'メイン',
      color: '#EC4899',
      blocks: [
        {
          id: 'b-prep', label: 'ステータス取得', slot: 0,
          steps: [{ id: 's-prep', type: 'action', label: 'ステータス取得', order: 0 }],
        },
        {
          id: 'b-switch', label: 'status の分岐', slot: 1,
          steps: [
            {
              id: 's-switch', type: 'switch', label: 'status の分岐', order: 0,
              params: {
                expression: { var: 'scenario.status' },
                cases: ['ok', 'warn', 'error', 'default'],
              },
            },
            { id: 's-ok',   type: 'action', label: '正常処理',      order: 0, parentStepId: 's-switch', parentBranch: 'ok' },
            { id: 's-warn', type: 'action', label: '警告ログ',      order: 0, parentStepId: 's-switch', parentBranch: 'warn' },
            { id: 's-err',  type: 'action', label: 'エラー通知',    order: 0, parentStepId: 's-switch', parentBranch: 'error' },
            { id: 's-def',  type: 'action', label: '不明ステータス', order: 0, parentStepId: 's-switch', parentBranch: 'default' },
          ],
        },
        {
          id: 'b-done', label: '完了通知', slot: 2,
          steps: [{ id: 's-done', type: 'action', label: '完了通知', order: 0 }],
        },
      ],
    },
  ],
  syncPoints: [],
  errorHandler: emptyErrorHandler(),
  subroutines: [],
};

export interface Sample {
  id: string;
  label: string;
  description: string;
  scenario: Scenario;
}

export const SAMPLES: Sample[] = [
  {
    id: 'parallel',
    label: '並列処理デモ',
    description: '3トラック + 同期ポイント + ループ / スキップ / リトライ',
    scenario: parallel,
  },
  {
    id: 'control-flow',
    label: 'ループ & 分岐デモ',
    description: 'ループ(回数/条件)、分岐(TRUE/FALSE)、フローチャートステップ',
    scenario: controlFlow,
  },
  {
    id: 'switch',
    label: 'スイッチデモ',
    description: 'スイッチステップ (N ケース分岐 + default)',
    scenario: switchDemo,
  },
  {
    id: 'basic',
    label: '基本シナリオ',
    description: '単一トラック、4タスク直列',
    scenario: basic,
  },
  {
    id: 'empty',
    label: '空',
    description: '空トラック1本のみ',
    scenario: empty,
  },
];

/** Default sample loaded on first start. */
export const DEFAULT_SAMPLE: Scenario = parallel;

/** Deep-clone helper so sample objects in SAMPLES are never mutated. */
export function cloneSample(s: Scenario): Scenario {
  return JSON.parse(JSON.stringify(s)) as Scenario;
}
