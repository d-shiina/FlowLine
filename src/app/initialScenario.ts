import type { Scenario } from './types';

/**
 * Demo scenario mirroring the prototype, but re-expressed on a block-based
 * axis. Slots are logical positions (1 slot = SLOT_PX pixels), and deps
 * encode the DAG rather than time.
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
        {
          id: 'b-10',
          type: 'action',
          label: 'Excel起動',
          slot: 0,
          span: 1,
          deps: [],
        },
        {
          id: 'b-11',
          type: 'action',
          label: 'データ読込',
          slot: 1,
          span: 2,
          deps: ['b-10'],
        },
        {
          id: 'b-12',
          type: 'loop',
          label: '行ループ',
          slot: 3,
          span: 3,
          deps: ['b-11'],
        },
        {
          id: 'b-13',
          type: 'action',
          label: 'ファイル保存',
          slot: 7,
          span: 1,
          deps: ['b-12'],
        },
      ],
    },
    {
      id: 'track-2',
      name: 'メール処理',
      color: '#22C55E',
      blocks: [
        {
          id: 'b-20',
          type: 'action',
          label: '下書き作成',
          slot: 0,
          span: 1,
          deps: [],
        },
        {
          id: 'b-21',
          type: 'action',
          label: '添付追加',
          slot: 1,
          span: 1,
          deps: ['b-20'],
        },
        {
          id: 'b-22',
          type: 'wait',
          label: 'Excel待ち',
          slot: 2,
          span: 4,
          deps: ['b-21'],
        },
        {
          id: 'b-23',
          type: 'action',
          label: 'メール送信',
          slot: 7,
          span: 1,
          deps: ['b-22'],
        },
      ],
    },
    {
      id: 'track-3',
      name: 'ログ記録',
      color: '#F59E0B',
      blocks: [
        {
          id: 'b-30',
          type: 'action',
          label: 'ログ開始',
          slot: 0,
          span: 1,
          deps: [],
        },
        {
          id: 'b-31',
          type: 'wait',
          label: '処理待ち',
          slot: 1,
          span: 5,
          deps: ['b-30'],
        },
        {
          id: 'b-32',
          type: 'action',
          label: '結果書込',
          slot: 7,
          span: 1,
          deps: ['b-31'],
        },
      ],
    },
  ],
  syncPoints: [
    {
      id: 'sync-1',
      label: '合流',
      slot: 7,
      deps: ['b-13', 'b-23', 'b-32'],
      trackIds: [],
    },
  ],
  subroutines: [],
};
