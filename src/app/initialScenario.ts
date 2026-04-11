import type { Scenario } from './types';
import { ERROR_HANDLER_COLOR, ERROR_HANDLER_ID } from './types';

/**
 * Demo scenario showcasing: block-based axis, sync point DAG dependencies,
 * `skipIfMissing` (b-22), `onError: retry` (b-31), and a default-empty
 * error handler track.
 */
export const initialScenario: Scenario = {
  version: '1.0',
  name: '新規シナリオ',
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
  errorHandler: {
    id: ERROR_HANDLER_ID,
    name: 'エラー処理',
    color: ERROR_HANDLER_COLOR,
    blocks: [],
  },
  subroutines: [],
};
