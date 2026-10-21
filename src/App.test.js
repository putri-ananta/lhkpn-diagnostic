import { describe, expect, it } from 'vitest';
import { appReducer } from './App';

function selectWorkflow(workflow = 'single') {
  return appReducer({}, { type: 'SELECT_WORKFLOW', workflow });
}

function createRecord(id, year = 2024) {
  return {
    id,
    reportingYear: year,
    effective: {
      identity: { name: `Pemilik ${id}` },
      assets: { totalAssets: 1_000_000_000 },
      metadata: {}
    }
  };
}

describe('appReducer', () => {
  it('selects a workflow and resets the session to its upload screen', () => {
    const dirtyState = {
      screen: 'analysis',
      workflow: 'batch',
      records: [createRecord('old')],
      extractionOpen: true
    };

    const next = appReducer(dirtyState, {
      type: 'SELECT_WORKFLOW',
      workflow: 'single'
    });

    expect(next.screen).toBe('upload');
    expect(next.workflow).toBe('single');
    expect(next.records).toEqual([]);
    expect(next.extractionOpen).toBe(false);
  });

  it('navigates analysis to simulation and timeseries, then back to analysis', () => {
    const record = createRecord('record-1');
    let state = selectWorkflow('single');
    state = appReducer(state, {
      type: 'PROCESS_DONE',
      records: [record],
      failedFiles: []
    });

    expect(state.screen).toBe('analysis');
    expect(state.selectedRecordId).toBe(record.id);

    state = appReducer(state, { type: 'OPEN_SIMULATION' });
    expect(state.screen).toBe('simulation');

    state = appReducer(state, { type: 'BACK_TO_ANALYSIS' });
    expect(state.screen).toBe('analysis');

    state = appReducer(state, { type: 'OPEN_TIMESERIES' });
    expect(state.screen).toBe('timeseries');
    expect(state.timeseries.baselineId).toBe(record.id);
    expect(state.timeseries.records).toEqual([record]);

    state = appReducer(state, { type: 'BACK_TO_ANALYSIS' });
    expect(state.screen).toBe('analysis');
  });

  it('opens and closes the extraction detail modal', () => {
    const state = selectWorkflow();
    const opened = appReducer(state, {
      type: 'SET_EXTRACTION_OPEN',
      open: true
    });
    const closed = appReducer(opened, {
      type: 'SET_EXTRACTION_OPEN',
      open: false
    });

    expect(opened.extractionOpen).toBe(true);
    expect(closed.extractionOpen).toBe(false);
    expect(state.extractionOpen).toBe(false);
  });

  it('immutably propagates an adjusted record to primary and timeseries data', () => {
    const original = createRecord('record-1');
    const sibling = createRecord('record-2', 2023);
    const adjusted = {
      ...original,
      effective: {
        ...original.effective,
        assets: { totalAssets: 1_250_000_000 }
      },
      adjustments: [{ field: 'assets.totalAssets' }]
    };
    const state = {
      ...selectWorkflow(),
      records: [original, sibling],
      timeseries: {
        ...selectWorkflow().timeseries,
        records: [sibling, original]
      }
    };

    const next = appReducer(state, {
      type: 'UPDATE_RECORD',
      record: adjusted
    });

    expect(next).not.toBe(state);
    expect(next.records).not.toBe(state.records);
    expect(next.timeseries).not.toBe(state.timeseries);
    expect(next.timeseries.records).not.toBe(state.timeseries.records);
    expect(next.records).toEqual([adjusted, sibling]);
    expect(next.timeseries.records).toEqual([sibling, adjusted]);
    expect(state.records).toEqual([original, sibling]);
    expect(state.timeseries.records).toEqual([sibling, original]);
  });

  it('clears stale identity decisions when an adjusted record changes identity', () => {
    const original = createRecord('record-1');
    const adjusted = {
      ...original,
      effective: {
        ...original.effective,
        identity: { name: 'Identitas Baru', nhk: '999' }
      }
    };
    const state = {
      ...selectWorkflow('batch'),
      records: [original, createRecord('record-2')],
      batch: {
        confirmedMatches: [['record-1', 'record-2'], ['record-2', 'record-3']],
        rejectedMatches: [['record-1', 'record-4']],
        conflictSelections: {}
      },
      timeseries: {
        ...selectWorkflow().timeseries,
        baselineId: 'record-1',
        records: [original],
        confirmedRecordIds: ['record-2'],
        rejectedRecordIds: ['record-3']
      }
    };

    const next = appReducer(state, { type: 'UPDATE_RECORD', record: adjusted });

    expect(next.batch.confirmedMatches).toEqual([['record-2', 'record-3']]);
    expect(next.batch.rejectedMatches).toEqual([]);
    expect(next.timeseries.confirmedRecordIds).toEqual([]);
    expect(next.timeseries.rejectedRecordIds).toEqual([]);
  });

  it('stores batch conflict decisions without discarding other groups or conflicts', () => {
    const state = {
      ...selectWorkflow('batch'),
      batch: {
        confirmedMatches: [],
        rejectedMatches: [],
        conflictSelections: {
          'group-a': { 'conflict-old': 'record-old' }
        }
      }
    };

    const next = appReducer(state, {
      type: 'BATCH_CONFLICT_SELECTION',
      groupId: 'group-a',
      conflictId: 'conflict-new',
      recordId: 'record-new'
    });

    expect(next.batch.conflictSelections).toEqual({
      'group-a': {
        'conflict-old': 'record-old',
        'conflict-new': 'record-new'
      }
    });
    expect(state.batch.conflictSelections).toEqual({
      'group-a': { 'conflict-old': 'record-old' }
    });
  });

  it('records reversible timeseries identity decisions and conflict selections', () => {
    let state = selectWorkflow();
    state = appReducer(state, {
      type: 'TIMESERIES_IDENTITY_DECISION',
      recordId: 'candidate-1',
      accepted: true
    });
    state = appReducer(state, {
      type: 'TIMESERIES_IDENTITY_DECISION',
      recordId: 'candidate-1',
      accepted: true
    });

    expect(state.timeseries.confirmedRecordIds).toEqual(['candidate-1']);
    expect(state.timeseries.rejectedRecordIds).toEqual([]);

    state = appReducer(state, {
      type: 'TIMESERIES_IDENTITY_DECISION',
      recordId: 'candidate-1',
      accepted: false
    });
    expect(state.timeseries.confirmedRecordIds).toEqual([]);
    expect(state.timeseries.rejectedRecordIds).toEqual(['candidate-1']);

    const withConflict = appReducer(state, {
      type: 'TIMESERIES_CONFLICT_SELECTION',
      conflictId: 'year-2024',
      recordId: 'candidate-2'
    });
    expect(withConflict.timeseries.conflictSelections).toEqual({
      'year-2024': 'candidate-2'
    });
    expect(state.timeseries.conflictSelections).toEqual({});
  });
});
