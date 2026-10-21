import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BatchSummaryTable } from './components/BatchSummaryTable';
import { ExtractionDetailModal } from './components/ExtractionDetailModal';
import { FinancialDiagnosis } from './components/FinancialDiagnosis';
import { FinancialSimulationPage } from './components/FinancialSimulationPage';
import { Header } from './components/Header';
import { LHKPNUploader } from './components/LHKPNUploader';
import { ParsingProgress } from './components/ParsingProgress';
import { TimeseriesAnalysisPage } from './components/TimeseriesAnalysisPage';
import { WorkflowLanding } from './components/WorkflowLanding';
import {
  applyManualAdjustments,
  computeContentHash,
  createLHKPNRecord,
  getEffectiveLHKPNData,
  groupRecordsByIndividual
} from './engine/lhkpnDomain';
import { parseLHKPNPDF } from './engine/lhkpnParser';
import { SAMPLE_LHKPN_LIST } from './fixtures/sampleLHKPNData';

const THEME_KEY = 'lhkpn-theme';
const MAX_PDF_SIZE = 25 * 1024 * 1024;

function readStoredTheme() {
  if (typeof window === 'undefined') return 'system';
  return window.localStorage.getItem(THEME_KEY) || 'system';
}

const initialState = {
  screen: 'landing',
  workflow: null,
  records: [],
  failedFiles: [],
  selectedRecordId: null,
  selectedGroupId: null,
  activeRecordIds: [],
  analysisReturnScreen: 'upload',
  extractionOpen: false,
  processing: {
    currentFileName: '',
    completedFiles: 0,
    totalFiles: 0,
    fileStatuses: []
  },
  batch: {
    confirmedMatches: [],
    rejectedMatches: [],
    conflictSelections: {}
  },
  timeseries: {
    baselineId: null,
    records: [],
    confirmedRecordIds: [],
    rejectedRecordIds: [],
    conflictSelections: {},
    uploadState: null
  },
  simulationByRecord: {}
};

function replaceRecord(records, updatedRecord) {
  return records.map((record) => record.id === updatedRecord.id ? updatedRecord : record);
}

function addUniqueRecords(current, incoming) {
  const byId = new Map(current.map((record) => [record.id, record]));
  incoming.forEach((record) => byId.set(record.id, record));
  return [...byId.values()];
}

function addPair(pairs, pair) {
  if (!pair[0] || !pair[1]) return pairs;
  const key = [...pair].sort().join('::');
  return pairs.some((item) => [...item].sort().join('::') === key) ? pairs : [...pairs, pair];
}

function removePair(pairs, pair) {
  const key = [...pair].sort().join('::');
  return pairs.filter((item) => [...item].sort().join('::') !== key);
}

function removePairsWithRecord(pairs, recordId) {
  return (pairs || []).filter((pair) => !Array.isArray(pair) || !pair.includes(recordId));
}

function identityChanged(previousRecord, nextRecord) {
  return JSON.stringify(previousRecord?.effective?.identity || {})
    !== JSON.stringify(nextRecord?.effective?.identity || {});
}

// Exported for reducer-level interaction tests; App remains the only state owner.
// oxlint-disable-next-line react/only-export-components
export function appReducer(state, action) {
  switch (action.type) {
    case 'SELECT_WORKFLOW':
      return {
        ...initialState,
        workflow: action.workflow,
        screen: 'upload'
      };
    case 'RESET_HOME':
      return { ...initialState };
    case 'PROCESS_START':
      return {
        ...state,
        screen: 'processing',
        records: [],
        failedFiles: [],
        selectedRecordId: null,
        selectedGroupId: null,
        activeRecordIds: [],
        processing: action.processing,
        batch: initialState.batch,
        timeseries: initialState.timeseries,
        simulationByRecord: {}
      };
    case 'PROCESS_UPDATE':
      return { ...state, processing: { ...state.processing, ...action.processing } };
    case 'PROCESS_DONE': {
      const first = action.records[0] || null;
      const isSingle = state.workflow === 'single';
      return {
        ...state,
        screen: isSingle && first ? 'analysis' : state.workflow === 'batch' ? 'batch' : 'upload',
        records: action.records,
        failedFiles: action.failedFiles,
        selectedRecordId: isSingle ? first?.id || null : null,
        selectedGroupId: null,
        activeRecordIds: isSingle && first ? [first.id] : [],
        analysisReturnScreen: 'upload',
        processing: {
          ...state.processing,
          completedFiles: state.processing.totalFiles,
          currentFileName: ''
        }
      };
    }
    case 'OPEN_ANALYSIS':
      return {
        ...state,
        screen: 'analysis',
        selectedRecordId: action.recordId,
        selectedGroupId: action.groupId || null,
        activeRecordIds: action.activeRecordIds || [action.recordId],
        analysisReturnScreen: action.returnScreen || (state.workflow === 'batch' ? 'batch' : 'upload'),
        extractionOpen: false
      };
    case 'OPEN_SIMULATION':
      return { ...state, screen: 'simulation' };
    case 'OPEN_TIMESERIES': {
      const baselineChanged = state.timeseries.baselineId !== state.selectedRecordId;
      const selectedRecords = state.records.filter((record) => state.activeRecordIds.includes(record.id));
      return {
        ...state,
        screen: 'timeseries',
        timeseries: baselineChanged ? {
          ...initialState.timeseries,
          baselineId: state.selectedRecordId,
          records: selectedRecords,
          conflictSelections: state.selectedGroupId
            ? { ...(state.batch.conflictSelections[state.selectedGroupId] || {}) }
            : {}
        } : {
          ...state.timeseries,
          records: addUniqueRecords(state.timeseries.records, selectedRecords)
        }
      };
    }
    case 'BACK_TO_ANALYSIS':
      return { ...state, screen: 'analysis' };
    case 'BACK_FROM_ANALYSIS':
      return { ...state, screen: state.analysisReturnScreen, extractionOpen: false };
    case 'SET_EXTRACTION_OPEN':
      return { ...state, extractionOpen: action.open };
    case 'UPDATE_RECORD': {
      const previousRecord = state.records.find((record) => record.id === action.record.id);
      const didChangeIdentity = identityChanged(previousRecord, action.record);
      const isTimeseriesBaseline = state.timeseries.baselineId === action.record.id;
      const withoutAdjustedRecord = (ids) => ids.filter((id) => id !== action.record.id);
      return {
        ...state,
        records: replaceRecord(state.records, action.record),
        batch: didChangeIdentity ? {
          ...state.batch,
          confirmedMatches: removePairsWithRecord(state.batch.confirmedMatches, action.record.id),
          rejectedMatches: removePairsWithRecord(state.batch.rejectedMatches, action.record.id)
        } : state.batch,
        timeseries: {
          ...state.timeseries,
          records: replaceRecord(state.timeseries.records, action.record),
          confirmedRecordIds: didChangeIdentity
            ? isTimeseriesBaseline ? [] : withoutAdjustedRecord(state.timeseries.confirmedRecordIds)
            : state.timeseries.confirmedRecordIds,
          rejectedRecordIds: didChangeIdentity
            ? isTimeseriesBaseline ? [] : withoutAdjustedRecord(state.timeseries.rejectedRecordIds)
            : state.timeseries.rejectedRecordIds
        }
      };
    }
    case 'BATCH_IDENTITY_DECISION': {
      const pair = [action.recordId, action.representativeId];
      return {
        ...state,
        batch: {
          ...state.batch,
          confirmedMatches: action.accepted
            ? addPair(state.batch.confirmedMatches, pair)
            : removePair(state.batch.confirmedMatches, pair),
          rejectedMatches: action.accepted
            ? removePair(state.batch.rejectedMatches, pair)
            : addPair(state.batch.rejectedMatches, pair)
        }
      };
    }
    case 'BATCH_CONFLICT_SELECTION':
      return {
        ...state,
        batch: {
          ...state.batch,
          conflictSelections: {
            ...state.batch.conflictSelections,
            [action.groupId]: {
              ...(state.batch.conflictSelections[action.groupId] || {}),
              [action.conflictId]: action.recordId
            }
          }
        }
      };
    case 'TIMESERIES_UPLOAD_START':
    case 'TIMESERIES_UPLOAD_UPDATE':
      return {
        ...state,
        timeseries: { ...state.timeseries, uploadState: action.uploadState }
      };
    case 'TIMESERIES_UPLOAD_DONE':
      return {
        ...state,
        records: addUniqueRecords(state.records, action.records),
        timeseries: {
          ...state.timeseries,
          records: addUniqueRecords(state.timeseries.records, action.records),
          uploadState: action.uploadState
        }
      };
    case 'TIMESERIES_IDENTITY_DECISION': {
      const withoutRecord = (values) => values.filter((id) => id !== action.recordId);
      return {
        ...state,
        timeseries: {
          ...state.timeseries,
          confirmedRecordIds: action.accepted
            ? [...withoutRecord(state.timeseries.confirmedRecordIds), action.recordId]
            : withoutRecord(state.timeseries.confirmedRecordIds),
          rejectedRecordIds: action.accepted
            ? withoutRecord(state.timeseries.rejectedRecordIds)
            : [...withoutRecord(state.timeseries.rejectedRecordIds), action.recordId]
        }
      };
    }
    case 'TIMESERIES_CONFLICT_SELECTION':
      return {
        ...state,
        timeseries: {
          ...state.timeseries,
          conflictSelections: {
            ...state.timeseries.conflictSelections,
            [action.conflictId]: action.recordId
          }
        }
      };
    case 'SIMULATION_CHANGE':
      return {
        ...state,
        simulationByRecord: {
          ...state.simulationByRecord,
          [action.recordId]: action.value
        }
      };
    default:
      return state;
  }
}

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [theme, setTheme] = useState(readStoredTheme);
  const runTokenRef = useRef(0);
  const recordSequenceRef = useRef(0);
  const parseCacheRef = useRef(new Map());

  useEffect(() => {
    const applyTheme = () => {
      const effectiveTheme = theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        : theme;
      document.documentElement.setAttribute('data-theme', effectiveTheme);
    };
    applyTheme();
    window.localStorage.setItem(THEME_KEY, theme);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener?.('change', applyTheme);
    return () => media.removeEventListener?.('change', applyTheme);
  }, [theme]);

  const selectedRecord = state.records.find((record) => record.id === state.selectedRecordId) || null;
  const effectiveSelected = selectedRecord ? getEffectiveLHKPNData(selectedRecord) : null;

  const batchGrouping = useMemo(() => groupRecordsByIndividual(state.records, {
    confirmedMatches: state.batch.confirmedMatches,
    rejectedMatches: state.batch.rejectedMatches,
    conflictSelections: state.batch.conflictSelections
  }), [state.batch, state.records]);

  const makeRecord = async (file, token) => {
    const bytes = await file.arrayBuffer();
    if (runTokenRef.current !== token) throw new Error('PROCESS_CANCELLED');
    const contentHash = await computeContentHash(bytes);
    if (runTokenRef.current !== token) throw new Error('PROCESS_CANCELLED');
    let extraction = contentHash ? parseCacheRef.current.get(contentHash) : null;
    if (!extraction) {
      extraction = await parseLHKPNPDF(bytes, file.name);
      if (runTokenRef.current !== token) throw new Error('PROCESS_CANCELLED');
      if (extraction?.fatalError || extraction?.status === 'Gagal') {
        throw new Error(extraction.errorReason || 'Dokumen PDF tidak dapat dibaca.');
      }
      if (contentHash) parseCacheRef.current.set(contentHash, extraction);
    }
    recordSequenceRef.current += 1;
    return createLHKPNRecord(extraction, {
      id: `lhkpn-${token}-${recordSequenceRef.current}-${contentHash?.slice(0, 10) || 'nohash'}`,
      contentHash,
      fileMeta: {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        contentHash
      }
    });
  };

  const processFiles = async (files) => {
    const token = runTokenRef.current + 1;
    runTokenRef.current = token;
    const selectedFiles = state.workflow === 'single' ? files.slice(0, 1) : files;
    let statuses = selectedFiles.map((file, index) => ({
      id: `${token}-${index}`,
      name: file.name,
      status: 'pending'
    }));
    dispatch({
      type: 'PROCESS_START',
      processing: {
        currentFileName: selectedFiles[0]?.name || '',
        completedFiles: 0,
        totalFiles: selectedFiles.length,
        fileStatuses: statuses
      }
    });

    const records = [];
    const failedFiles = [];
    for (let index = 0; index < selectedFiles.length; index += 1) {
      if (runTokenRef.current !== token) return;
      const file = selectedFiles[index];
      statuses = statuses.map((item, itemIndex) => itemIndex === index ? { ...item, status: 'processing' } : item);
      dispatch({
        type: 'PROCESS_UPDATE',
        processing: { currentFileName: file.name, completedFiles: index, fileStatuses: statuses }
      });

      try {
        const record = await makeRecord(file, token);
        if (runTokenRef.current !== token) return;
        records.push(record);
        statuses = statuses.map((item, itemIndex) => itemIndex === index
          ? { ...item, status: record.parseStatus.isSuccess && record.parseStatus.warnings.length === 0 ? 'success' : 'warning' }
          : item);
      } catch (error) {
        if (runTokenRef.current !== token) return;
        const message = error?.message || 'Dokumen tidak dapat diproses.';
        failedFiles.push({ id: statuses[index].id, name: file.name, error: message });
        statuses = statuses.map((item, itemIndex) => itemIndex === index
          ? { ...item, status: 'failed', error: message }
          : item);
      }

      dispatch({
        type: 'PROCESS_UPDATE',
        processing: { completedFiles: index + 1, fileStatuses: statuses }
      });
    }

    if (runTokenRef.current === token) {
      dispatch({ type: 'PROCESS_DONE', records, failedFiles });
    }
  };

  const loadSampleData = () => {
    const token = runTokenRef.current + 1;
    runTokenRef.current = token;
    const sources = state.workflow === 'single' ? SAMPLE_LHKPN_LIST.slice(0, 1) : SAMPLE_LHKPN_LIST;
    const records = sources.map((sample, index) => createLHKPNRecord(sample, {
      id: `sample-${token}-${index}`,
      fileMeta: { name: sample.fileName, type: 'application/pdf' }
    }));
    dispatch({
      type: 'PROCESS_START',
      processing: {
        currentFileName: 'Data contoh',
        completedFiles: records.length,
        totalFiles: records.length,
        fileStatuses: records.map((record) => ({
          id: record.id,
          name: record.fileMeta.name,
          status: record.parseStatus.isSuccess && record.parseStatus.warnings.length === 0 ? 'success' : 'warning'
        }))
      }
    });
    dispatch({ type: 'PROCESS_DONE', records, failedFiles: [] });
  };

  const processHistoricalFiles = async (files) => {
    const token = runTokenRef.current;
    const historicalFiles = Array.from(files || []);
    const validationError = (file) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLocaleLowerCase('id-ID').endsWith('.pdf');
      if (!isPdf) return 'Berkas bukan PDF.';
      if (file.size > MAX_PDF_SIZE) return 'Ukuran berkas melebihi 25 MB.';
      return null;
    };
    let statuses = historicalFiles.map((file, index) => {
      const error = validationError(file);
      return { id: `history-${token}-${index}-${file.lastModified}`, name: file.name, status: error ? 'failed' : 'pending', error };
    });
    const initialFailures = statuses
      .filter((item) => item.error)
      .map((item) => ({ id: item.id, name: item.name, error: item.error }));
    const uploadState = { currentFileName: historicalFiles[0]?.name || '', completedFiles: 0, totalFiles: historicalFiles.length, fileStatuses: statuses, failedFiles: initialFailures };
    dispatch({ type: 'TIMESERIES_UPLOAD_START', uploadState });
    const records = [];
    const failedFiles = [...initialFailures];

    for (let index = 0; index < historicalFiles.length; index += 1) {
      if (runTokenRef.current !== token) return;
      const file = historicalFiles[index];
      if (statuses[index].error) {
        dispatch({ type: 'TIMESERIES_UPLOAD_UPDATE', uploadState: { ...uploadState, currentFileName: file.name, completedFiles: index + 1, fileStatuses: statuses, failedFiles } });
        continue;
      }
      statuses = statuses.map((item, itemIndex) => itemIndex === index ? { ...item, status: 'processing' } : item);
      dispatch({ type: 'TIMESERIES_UPLOAD_UPDATE', uploadState: { ...uploadState, currentFileName: file.name, completedFiles: index, fileStatuses: statuses, failedFiles } });
      try {
        const record = await makeRecord(file, token);
        if (runTokenRef.current !== token) return;
        records.push(record);
        statuses = statuses.map((item, itemIndex) => itemIndex === index
          ? { ...item, status: record.parseStatus.isSuccess && record.parseStatus.warnings.length === 0 ? 'success' : 'warning' }
          : item);
      } catch (error) {
        if (runTokenRef.current !== token) return;
        const failure = { id: statuses[index].id, name: file.name, error: error?.message || 'Dokumen tidak dapat diproses.' };
        failedFiles.push(failure);
        statuses = statuses.map((item, itemIndex) => itemIndex === index ? { ...item, status: 'failed', error: failure.error } : item);
      }
      dispatch({ type: 'TIMESERIES_UPLOAD_UPDATE', uploadState: { ...uploadState, currentFileName: file.name, completedFiles: index + 1, fileStatuses: statuses, failedFiles } });
    }

    if (runTokenRef.current === token) {
      dispatch({
        type: 'TIMESERIES_UPLOAD_DONE',
        records,
        uploadState: { ...uploadState, currentFileName: '', completedFiles: historicalFiles.length, fileStatuses: statuses, failedFiles }
      });
    }
  };

  const goHome = () => {
    runTokenRef.current += 1;
    // Keep the content-hash cache for this browser session so the same PDF is
    // not parsed again. The cache remains memory-only and disappears on reload.
    dispatch({ type: 'RESET_HOME' });
  };

  const saveAdjustment = (patch) => {
    if (!selectedRecord) throw new Error('Rekaman LHKPN tidak ditemukan.');
    const updated = applyManualAdjustments(selectedRecord, patch, { adjustedBy: 'Pengguna' });
    dispatch({ type: 'UPDATE_RECORD', record: updated });
  };

  const renderScreen = () => {
    if (state.screen === 'landing') {
      return <WorkflowLanding onSelectWorkflow={(workflow) => dispatch({ type: 'SELECT_WORKFLOW', workflow })} />;
    }
    if (state.screen === 'upload') {
      return (
        <div>
          {state.failedFiles.length > 0 && (
            <div className="keu-alert keu-alert-warning" role="alert" style={{ maxWidth: 800, margin: '1rem auto 0' }}>
              <div>
                <strong>Dokumen belum dapat diproses.</strong>
                <ul style={{ margin: '0.4rem 0 0 1rem' }}>
                  {state.failedFiles.map((file) => <li key={file.id || file.name}>{file.name}: {file.error}</li>)}
                </ul>
              </div>
            </div>
          )}
          <LHKPNUploader isBatchMode={state.workflow === 'batch'} onProcessFiles={processFiles} onLoadSampleData={loadSampleData} />
        </div>
      );
    }
    if (state.screen === 'processing') {
      return <ParsingProgress {...state.processing} />;
    }
    if (state.screen === 'batch') {
      return (
        <BatchSummaryTable
          records={state.records}
          grouping={batchGrouping}
          failedFiles={state.failedFiles}
          onResetBatch={() => dispatch({ type: 'SELECT_WORKFLOW', workflow: 'batch' })}
          onSelectGroup={(group) => dispatch({
            type: 'OPEN_ANALYSIS',
            recordId: group.latestRecord.id,
            groupId: group.id,
            activeRecordIds: group.records.map((record) => record.id),
            returnScreen: 'batch'
          })}
          onIdentityDecision={(recordId, representativeId, accepted) => dispatch({ type: 'BATCH_IDENTITY_DECISION', recordId, representativeId, accepted })}
          onResolveConflict={(groupId, conflictId, recordId) => dispatch({ type: 'BATCH_CONFLICT_SELECTION', groupId, conflictId, recordId })}
        />
      );
    }
    if (state.screen === 'analysis' && effectiveSelected) {
      return (
        <FinancialDiagnosis
          extractedData={effectiveSelected}
          onBack={() => dispatch({ type: 'BACK_FROM_ANALYSIS' })}
          backLabel={state.analysisReturnScreen === 'batch' ? 'Kembali ke Ringkasan' : 'Unggah Ulang'}
          onSimulation={() => dispatch({ type: 'OPEN_SIMULATION' })}
          onTimeseries={() => dispatch({ type: 'OPEN_TIMESERIES' })}
          onExtraction={() => dispatch({ type: 'SET_EXTRACTION_OPEN', open: true })}
        />
      );
    }
    if (state.screen === 'simulation' && selectedRecord) {
      return (
        <FinancialSimulationPage
          record={selectedRecord}
          extractedData={selectedRecord}
          simulationState={state.simulationByRecord[selectedRecord.id]}
          onSimulationStateChange={(value) => dispatch({ type: 'SIMULATION_CHANGE', recordId: selectedRecord.id, value })}
          onBack={() => dispatch({ type: 'BACK_TO_ANALYSIS' })}
        />
      );
    }
    if (state.screen === 'timeseries' && selectedRecord) {
      return (
        <TimeseriesAnalysisPage
          baselineRecord={selectedRecord}
          records={state.timeseries.records}
          uploadState={state.timeseries.uploadState}
          onUploadFiles={processHistoricalFiles}
          identityDecisions={{
            ...Object.fromEntries(state.timeseries.confirmedRecordIds.map((id) => [id, 'confirmed'])),
            ...Object.fromEntries(state.timeseries.rejectedRecordIds.map((id) => [id, 'different']))
          }}
          conflictSelections={state.timeseries.conflictSelections}
          onIdentityDecision={(recordId, decision) => dispatch({
            type: 'TIMESERIES_IDENTITY_DECISION',
            recordId,
            accepted: decision === 'confirmed'
          })}
          onConflictSelection={(conflictId, recordId) => dispatch({ type: 'TIMESERIES_CONFLICT_SELECTION', conflictId, recordId })}
          onBack={() => dispatch({ type: 'BACK_TO_ANALYSIS' })}
        />
      );
    }
    return (
      <div className="keu-alert keu-alert-warning">
        Data untuk layar ini tidak tersedia. Kembali ke beranda dan unggah dokumen kembali.
      </div>
    );
  };

  return (
    <div className="keu-app-container">
      <Header
        onHome={goHome}
        showHomeAction={state.screen !== 'landing'}
        theme={theme}
        onThemeChange={setTheme}
      />
      <main className="keu-main-content">{renderScreen()}</main>
      <ExtractionDetailModal
        record={selectedRecord}
        isOpen={state.extractionOpen}
        onClose={() => dispatch({ type: 'SET_EXTRACTION_OPEN', open: false })}
        onSave={saveAdjustment}
      />
    </div>
  );
}

export default App;
