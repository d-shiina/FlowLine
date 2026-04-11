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

/** Single track, 4 blocks in sequence. A good starting point. */
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
        { id: 'b-1', type: 'action', label: 'アプリ起動', slot: 0, deps: [] },
        { id: 'b-2', type: 'action', label: 'データ入力', slot: 1, deps: ['b-1'] },
        { id: 'b-3', type: 'action', label: '送信', slot: 2, deps: ['b-2'] },
        { id: 'b-4', type: 'action', label: '完了通知', slot: 3, deps: ['b-3'] },
      ],
    },
  ],
  syncPoints: [],
  errorHandler: emptyErrorHandler(),
  subroutines: [],
};

/**
 * Showcase: 3 parallel tracks, sync point barrier, `skipIfMissing`,
 * `onError: retry`, and a `timeout`. Also the default sample.
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
        { id: 'b-10', type: 'action', label: 'Excel起動', slot: 0, deps: [] },
        { id: 'b-11', type: 'action', label: 'データ読込', slot: 1, deps: ['b-10'] },
        { id: 'b-12', type: 'loop', label: '行ループ', slot: 2, deps: ['b-11'] },
        { id: 'b-13', type: 'action', label: 'ファイル保存', slot: 3, deps: ['b-12'] },
      ],
    },
    {
      id: 'track-2',
      name: 'メール処理',
      color: '#22C55E',
      blocks: [
        { id: 'b-20', type: 'action', label: '下書き作成', slot: 0, deps: [] },
        { id: 'b-21', type: 'action', label: '添付追加', slot: 1, deps: ['b-20'] },
        {
          id: 'b-22',
          type: 'action',
          label: 'ダイアログ閉じる',
          slot: 2,
          deps: ['b-21'],
          skipIfMissing: true,
        },
        { id: 'b-23', type: 'action', label: 'メール送信', slot: 5, deps: ['b-22'] },
      ],
    },
    {
      id: 'track-3',
      name: 'ログ記録',
      color: '#F59E0B',
      blocks: [
        { id: 'b-30', type: 'action', label: 'ログ開始', slot: 0, deps: [] },
        {
          id: 'b-31',
          type: 'action',
          label: '結果書込',
          slot: 5,
          deps: ['b-30'],
          onError: { retry: 3, then: 'skip' },
          timeout: 60,
        },
      ],
    },
  ],
  syncPoints: [
    {
      id: 'sync-1',
      label: '合流',
      slot: 4,
      deps: ['b-13', 'b-22', 'b-30'],
      trackIds: [],
    },
  ],
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
    description: '3トラック + 同期ポイント + skipIfMissing / retry バッジ',
    scenario: parallel,
  },
  {
    id: 'basic',
    label: '基本シナリオ',
    description: '単一トラック、4ブロック直列',
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
