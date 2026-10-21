import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  FileClock,
  FilePlus2,
  FileSearch,
  Loader2,
  TrendingUp,
  UserCheck,
  UserX,
  XCircle
} from 'lucide-react';
import {
  MATCH_STATES,
  buildTimeseriesAnalysis,
  getEffectiveLHKPNData,
  matchIdentities,
  parseReportingYear
} from '../engine/lhkpnDomain';
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const DECISION_INCLUDED = new Set(['confirmed', 'include', 'included', 'accepted', 'accept']);
const DECISION_EXCLUDED = new Set(['different', 'exclude', 'excluded', 'rejected', 'reject']);

function recordId(record, index = 0) {
  return record?.id || `record-${index + 1}`;
}

function getDecision(decisions, id) {
  const raw = decisions instanceof Map ? decisions.get(id) : decisions?.[id];
  if (raw === true) return MATCH_STATES.CONFIRMED;
  if (raw === false) return MATCH_STATES.DIFFERENT;
  const value = typeof raw === 'object' && raw !== null
    ? raw.decision ?? raw.state ?? raw.status
    : raw;
  const normalized = String(value || '').toLocaleLowerCase('id-ID');
  if (DECISION_INCLUDED.has(normalized)) return MATCH_STATES.CONFIRMED;
  if (DECISION_EXCLUDED.has(normalized)) return MATCH_STATES.DIFFERENT;
  return null;
}

function financialValue(record, field) {
  const value = getEffectiveLHKPNData(record).assets?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatRupiah(value, compact = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Tidak tersedia';
  if (compact) {
    const magnitude = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (magnitude >= 1e12) return `${sign}Rp ${(magnitude / 1e12).toLocaleString('id-ID', { maximumFractionDigits: 1 })} T`;
    if (magnitude >= 1e9) return `${sign}Rp ${(magnitude / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
    if (magnitude >= 1e6) return `${sign}Rp ${(magnitude / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  }
  return `Rp ${Math.round(value).toLocaleString('id-ID')}`;
}

function formatPercentage(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function display(value) {
  return value === null || value === undefined || value === '' ? 'Tidak tersedia' : value;
}

function reasonLabel(reason) {
  if (reason === 'previous-net-worth-not-positive') return 'Tidak dapat dihitung: nilai tahun sebelumnya ≤ 0';
  if (reason === 'current-net-worth-missing') return 'Tidak tersedia: kekayaan bersih tidak terbaca';
  if (reason === 'no-previous-net-worth') return 'Belum ada tahun pembanding';
  return 'Tidak tersedia';
}

function statusLabel(status) {
  const normalized = String(status || '').toLocaleLowerCase('id-ID');
  if (['success', 'complete', 'completed', 'done'].includes(normalized)) return 'Selesai';
  if (['failed', 'error'].includes(normalized)) return 'Gagal';
  if (['warning', 'review'].includes(normalized)) return 'Perlu ditinjau';
  if (['processing', 'parsing', 'active'].includes(normalized)) return 'Diproses';
  return 'Menunggu';
}

function statusIcon(status) {
  const label = statusLabel(status);
  if (label === 'Selesai') return <CheckCircle2 size={17} color="#34d399" aria-hidden="true" />;
  if (label === 'Gagal') return <XCircle size={17} color="#f87171" aria-hidden="true" />;
  if (label === 'Perlu ditinjau') return <AlertTriangle size={17} color="#fbbf24" aria-hidden="true" />;
  if (label === 'Diproses') return <Loader2 size={17} color="#60a5fa" className="animate-spin" aria-hidden="true" />;
  return <FileSearch size={17} color="var(--keu-text-muted)" aria-hidden="true" />;
}

function statusBadgeClass(status) {
  const label = statusLabel(status);
  if (label === 'Selesai') return 'keu-badge-success';
  if (label === 'Gagal') return 'keu-badge-danger';
  if (label === 'Perlu ditinjau') return 'keu-badge-warning';
  if (label === 'Diproses') return 'keu-badge-info';
  return 'keu-badge-neutral';
}

function UploadProgress({ uploadState }) {
  const statuses = uploadState?.fileStatuses || uploadState?.statuses || uploadState?.files || [];
  const total = uploadState?.totalFiles ?? statuses.length;
  const completedFromStatuses = statuses.filter((item) => ['Selesai', 'Gagal', 'Perlu ditinjau'].includes(statusLabel(item.status))).length;
  const completed = uploadState?.completedFiles ?? completedFromStatuses;
  const progress = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  if (!uploadState || (total === 0 && statuses.length === 0 && !uploadState.error)) return null;

  return (
    <div style={{ marginTop: '1rem' }} aria-live="polite">
      {total > 0 && (
        <>
          <div style={{ height: 8, borderRadius: 999, overflow: 'hidden', background: 'var(--keu-bg-primary)' }}>
            <div
              style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #2563eb, #0d9488)', transition: 'width 180ms ease' }}
            />
          </div>
          <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.78rem', marginTop: '0.45rem' }}>
            {completed} dari {total} berkas selesai ({progress}%)
            {uploadState.currentFileName ? ` — ${uploadState.currentFileName}` : ''}
          </p>
        </>
      )}

      {uploadState.error && (
        <p role="alert" style={{ color: 'var(--keu-status-danger-text)', fontSize: '0.82rem', marginTop: '0.65rem' }}>
          {uploadState.error}
        </p>
      )}

      {statuses.length > 0 && (
        <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.8rem' }}>
          {statuses.map((item, index) => (
            <div
              key={item.id || `${item.name}-${index}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 0.75rem', border: '1px solid var(--keu-border-subtle)', borderRadius: 'var(--keu-radius-md)', background: 'var(--keu-bg-primary)' }}
            >
              {statusIcon(item.status)}
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                {item.name || 'Dokumen LHKPN'}
                {item.error && (
                  <small style={{ display: 'block', color: 'var(--keu-status-danger-text)', whiteSpace: 'normal', marginTop: '0.2rem' }}>
                    {item.error}
                  </small>
                )}
              </span>
              <span className={`keu-badge ${statusBadgeClass(item.status)}`}>{statusLabel(item.status)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IdentityReview({ item, onIdentityDecision }) {
  const { record, id, match, finalState, userDecision } = item;
  const data = getEffectiveLHKPNData(record);
  const isPending = match.state === MATCH_STATES.UNCERTAIN && !userDecision;
  const isIncluded = finalState === MATCH_STATES.CONFIRMED;
  const name = display(data.identity?.nama);
  const year = record?.reportingYear ?? parseReportingYear(data.identity?.tahun_laporan);

  return (
    <li style={{ listStyle: 'none', padding: '0.9rem', border: '1px solid var(--keu-border-subtle)', borderRadius: 'var(--keu-radius-md)', background: 'var(--keu-bg-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block' }}>{name}</strong>
          <span style={{ display: 'block', color: 'var(--keu-text-muted)', fontSize: '0.78rem', marginTop: '0.15rem' }}>
            {record?.fileMeta?.name || data.fileName} · Tahun {display(year)} · NHK {display(data.identity?.nhk)}
          </span>
        </div>
        <span className={`keu-badge ${isPending ? 'keu-badge-warning' : isIncluded ? 'keu-badge-success' : 'keu-badge-danger'}`}>
          {isPending ? <CircleHelp size={13} aria-hidden="true" /> : isIncluded ? <UserCheck size={13} aria-hidden="true" /> : <UserX size={13} aria-hidden="true" />}
          {isPending ? 'Perlu konfirmasi' : isIncluded ? 'Disertakan' : 'Dikecualikan'}
        </span>
      </div>

      <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.78rem', marginTop: '0.55rem' }}>
        {match.reason === 'different-stable-identifier'
          ? 'NHK berbeda dari dokumen acuan.'
          : match.reason === 'different-name'
            ? 'Nama tidak cocok dengan dokumen acuan.'
            : match.reason === 'missing-name-or-identifier'
              ? 'Nama atau pengenal stabil belum cukup untuk memastikan kecocokan.'
              : match.reason === 'similar-name-requires-confirmation'
                ? 'Nama terlihat mirip, tetapi perlu konfirmasi pengguna.'
                : match.reason === 'same-stable-identifier'
                  ? 'NHK cocok dengan dokumen acuan.'
                  : 'Identitas cocok setelah normalisasi nama.'}
      </p>

      {isPending && (
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
          <button
            type="button"
            className="keu-btn keu-btn-primary keu-btn-sm"
            onClick={() => onIdentityDecision?.(id, MATCH_STATES.CONFIRMED, match)}
          >
            <UserCheck size={15} aria-hidden="true" />
            Orang yang sama
          </button>
          <button
            type="button"
            className="keu-btn keu-btn-outline keu-btn-sm"
            onClick={() => onIdentityDecision?.(id, MATCH_STATES.DIFFERENT, match)}
          >
            <UserX size={15} aria-hidden="true" />
            Orang berbeda
          </button>
        </div>
      )}
    </li>
  );
}

function ConflictReview({ conflicts, onConflictSelection }) {
  if (conflicts.length === 0) return null;

  return (
    <section className="keu-card" aria-labelledby="conflict-heading">
      <div className="keu-card-header">
        <h2 id="conflict-heading" className="keu-card-title">
          <AlertTriangle size={20} color="#fbbf24" aria-hidden="true" />
          Konflik Laporan pada Tahun yang Sama
        </h2>
      </div>
      <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Nilai keuangan berbeda ditemukan untuk tahun yang sama. Pilih satu dokumen sebelum tahun tersebut dimasukkan ke analisis.
      </p>
      <div style={{ display: 'grid', gap: '1rem' }}>
        {conflicts.map((conflict) => (
          <fieldset key={conflict.id} style={{ border: '1px solid var(--keu-status-warning-border)', borderRadius: 'var(--keu-radius-md)', padding: '1rem', minWidth: 0 }}>
            <legend style={{ padding: '0 0.4rem', color: 'var(--keu-status-warning-text)', fontWeight: 700 }}>
              Tahun {conflict.year}
            </legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.75rem' }}>
              {conflict.records.map((record, index) => {
                const id = recordId(record, index);
                const selected = conflict.selectedRecordId === id;
                return (
                  <label
                    key={id}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem', padding: '0.85rem', border: `1px solid ${selected ? 'var(--keu-brand-light)' : 'var(--keu-border-subtle)'}`, borderRadius: 'var(--keu-radius-md)', cursor: 'pointer', background: selected ? 'var(--keu-status-info-bg)' : 'var(--keu-bg-primary)' }}
                  >
                    <input
                      type="radio"
                      name={`conflict-${conflict.id}`}
                      value={id}
                      checked={selected}
                      onChange={() => onConflictSelection?.(conflict.id, id, conflict.year)}
                      style={{ marginTop: '0.25rem' }}
                    />
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {record?.fileMeta?.name || getEffectiveLHKPNData(record).fileName}
                      </strong>
                      <span style={{ display: 'block', color: 'var(--keu-text-muted)', fontSize: '0.76rem', marginTop: '0.3rem' }}>
                        ID: {id}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.45rem' }}>
                        Aset {formatRupiah(financialValue(record, 'subtotal_harta'), true)} · Utang {formatRupiah(financialValue(record, 'hutang'), true)} · Bersih {formatRupiah(financialValue(record, 'total_harta_kekayaan'), true)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
}

function TimeseriesChart({ rows }) {
  const data = {
    labels: rows.map((row) => String(row.year)),
    datasets: [
      {
        label: 'Total Aset',
        data: rows.map((row) => row.totalAssets),
        borderColor: '#60a5fa',
        backgroundColor: '#60a5fa',
        tension: 0.2,
        spanGaps: false
      },
      {
        label: 'Utang',
        data: rows.map((row) => row.totalDebt),
        borderColor: '#f87171',
        backgroundColor: '#f87171',
        tension: 0.2,
        spanGaps: false
      },
      {
        label: 'Kekayaan Bersih',
        data: rows.map((row) => row.netWorth),
        borderColor: '#34d399',
        backgroundColor: '#34d399',
        tension: 0.2,
        spanGaps: false
      }
    ]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#94a3b8', usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${formatRupiah(context.parsed.y)}`
        }
      }
    },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148, 163, 184, 0.12)' } },
      y: {
        ticks: { color: '#94a3b8', callback: (value) => formatRupiah(Number(value), true) },
        grid: { color: 'rgba(148, 163, 184, 0.12)' }
      }
    }
  };

  return (
    <div style={{ height: 360, minWidth: 0 }} aria-label="Grafik total aset, utang, dan kekayaan bersih per tahun">
      <Line data={data} options={options} />
    </div>
  );
}

export function TimeseriesAnalysisPage({
  baselineRecord,
  records = [],
  uploadState,
  onUploadFiles,
  identityDecisions = {},
  conflictSelections = {},
  onIdentityDecision,
  onConflictSelection,
  onBack
}) {
  const baselineId = baselineRecord?.id;
  const historicalRecords = useMemo(() => {
    const seen = new Set();
    if (baselineId) seen.add(baselineId);
    return (records || []).filter(Boolean).filter((record, index) => {
      if (record === baselineRecord) return false;
      const id = recordId(record, index);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [baselineId, baselineRecord, records]);

  const identityReview = useMemo(() => historicalRecords.map((record, index) => {
    const id = recordId(record, index);
    const match = matchIdentities(baselineRecord, record);
    const userDecision = getDecision(identityDecisions, id);
    let finalState = match.state;
    if (match.state === MATCH_STATES.UNCERTAIN && userDecision) finalState = userDecision;
    return { id, record, match, userDecision, finalState };
  }), [baselineRecord, historicalRecords, identityDecisions]);

  const includedRecords = useMemo(() => [
    baselineRecord,
    ...identityReview
      .filter((item) => item.finalState === MATCH_STATES.CONFIRMED)
      .map((item) => item.record)
  ].filter(Boolean), [baselineRecord, identityReview]);

  const analysis = useMemo(
    () => buildTimeseriesAnalysis(includedRecords, { selections: conflictSelections }),
    [includedRecords, conflictSelections]
  );

  const baselineData = baselineRecord ? getEffectiveLHKPNData(baselineRecord) : null;
  const statuses = uploadState?.fileStatuses || uploadState?.statuses || uploadState?.files || [];
  const uploadBusy = Boolean(uploadState?.isProcessing)
    || statuses.some((item) => ['Diproses', 'Menunggu'].includes(statusLabel(item.status)));

  if (!baselineRecord) {
    return (
      <div className="keu-card" role="alert">
        <h1 style={{ fontSize: '1.2rem' }}>Analisis Timeseries belum tersedia</h1>
        <p style={{ color: 'var(--keu-text-muted)', marginTop: '0.5rem' }}>
          Dokumen acuan diperlukan sebelum laporan tahunan lain dapat dicocokkan.
        </p>
        {onBack && (
          <button type="button" className="keu-btn keu-btn-outline" onClick={onBack} style={{ marginTop: '1rem' }}>
            <ArrowLeft size={16} aria-hidden="true" />
            Kembali
          </button>
        )}
      </div>
    );
  }

  const baselineYear = baselineRecord.reportingYear ?? parseReportingYear(baselineData.identity?.tahun_laporan);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.45rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <TrendingUp size={24} color="#60a5fa" aria-hidden="true" />
            Analisis Timeseries LHKPN
          </h1>
          <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.86rem', marginTop: '0.35rem' }}>
            Bandingkan data tahunan setelah identitas, duplikasi, dan konflik laporan ditinjau.
          </p>
        </div>
        {onBack && (
          <button type="button" className="keu-btn keu-btn-outline keu-btn-sm" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" />
            Kembali ke Analisis
          </button>
        )}
      </header>

      <section className="keu-card" aria-labelledby="baseline-heading">
        <div className="keu-card-header">
          <h2 id="baseline-heading" className="keu-card-title">
            <FileClock size={20} color="#60a5fa" aria-hidden="true" />
            Dokumen Acuan
          </h2>
          <span className="keu-badge keu-badge-info">Otomatis disertakan</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <div><span className="keu-label">Nama</span><p style={{ fontWeight: 700, marginTop: '0.25rem' }}>{display(baselineData.identity?.nama)}</p></div>
          <div><span className="keu-label">NHK</span><p style={{ fontWeight: 700, marginTop: '0.25rem' }}>{display(baselineData.identity?.nhk)}</p></div>
          <div><span className="keu-label">Tahun</span><p style={{ fontWeight: 700, marginTop: '0.25rem' }}>{display(baselineYear)}</p></div>
          <div><span className="keu-label">Total Aset</span><p style={{ fontWeight: 700, marginTop: '0.25rem' }}>{formatRupiah(financialValue(baselineRecord, 'subtotal_harta'), true)}</p></div>
          <div><span className="keu-label">Total Utang</span><p style={{ fontWeight: 700, marginTop: '0.25rem' }}>{formatRupiah(financialValue(baselineRecord, 'hutang'), true)}</p></div>
          <div><span className="keu-label">Kekayaan Bersih</span><p style={{ fontWeight: 700, marginTop: '0.25rem' }}>{formatRupiah(financialValue(baselineRecord, 'total_harta_kekayaan'), true)}</p></div>
        </div>
        <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.76rem', marginTop: '0.9rem', overflowWrap: 'anywhere' }}>
          Sumber: {baselineRecord.fileMeta?.name || baselineData.fileName}
        </p>
      </section>

      <section className="keu-card" aria-labelledby="history-upload-heading">
        <div className="keu-card-header">
          <h2 id="history-upload-heading" className="keu-card-title">
            <FilePlus2 size={20} color="#60a5fa" aria-hidden="true" />
            Tambah Riwayat LHKPN
          </h2>
        </div>
        <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.85rem', marginBottom: '0.9rem' }}>
          Unggah satu atau beberapa PDF tahun lain. Setiap berkas akan dicocokkan dengan identitas dokumen acuan.
        </p>
        <label className="keu-btn keu-btn-primary" style={{ width: 'fit-content', cursor: uploadBusy || !onUploadFiles ? 'not-allowed' : 'pointer', opacity: uploadBusy || !onUploadFiles ? 0.5 : 1 }}>
          {uploadBusy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <FilePlus2 size={17} aria-hidden="true" />}
          {uploadBusy ? 'Memproses PDF' : 'Pilih PDF Riwayat'}
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            disabled={uploadBusy || !onUploadFiles}
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              if (files.length > 0) onUploadFiles?.(files);
              event.target.value = '';
            }}
            style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)' }}
          />
        </label>
        <UploadProgress uploadState={uploadState} />
      </section>

      <section className="keu-card" aria-labelledby="identity-review-heading">
        <div className="keu-card-header">
          <h2 id="identity-review-heading" className="keu-card-title">
            <UserCheck size={20} color="#60a5fa" aria-hidden="true" />
            Hasil Pencocokan Identitas
          </h2>
          <span className="keu-badge keu-badge-neutral">{historicalRecords.length} dokumen riwayat</span>
        </div>
        {identityReview.length === 0 ? (
          <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.85rem' }}>Belum ada dokumen riwayat yang diunggah.</p>
        ) : (
          <ul style={{ display: 'grid', gap: '0.65rem', padding: 0, margin: 0 }}>
            {identityReview.map((item) => <IdentityReview key={item.id} item={item} onIdentityDecision={onIdentityDecision} />)}
          </ul>
        )}
      </section>

      {analysis.duplicates.length > 0 && (
        <div className="keu-alert keu-alert-info" role="status">
          <CheckCircle2 size={20} aria-hidden="true" />
          <div>
            <strong>{analysis.duplicates.length} duplikasi diabaikan.</strong>{' '}
            Dokumen dengan isi yang sama atau nilai keuangan setara pada tahun yang sama tidak dihitung dua kali.
          </div>
        </div>
      )}

      {analysis.withoutYear.length > 0 && (
        <div className="keu-alert keu-alert-warning" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <div>
            <strong>{analysis.withoutYear.length} dokumen tidak memiliki tahun laporan yang terbaca.</strong>{' '}
            Dokumen tersebut belum dimasukkan ke tabel tahunan.
          </div>
        </div>
      )}

      <ConflictReview conflicts={analysis.conflicts} onConflictSelection={onConflictSelection} />

      <section className="keu-card" aria-labelledby="annual-table-heading">
        <div className="keu-card-header">
          <h2 id="annual-table-heading" className="keu-card-title">Ringkasan Tahunan</h2>
          <span className="keu-badge keu-badge-info">{analysis.rows.length} tahun terpilih</span>
        </div>
        {analysis.rows.length === 0 ? (
          <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.85rem' }}>
            Belum ada tahun yang siap dianalisis. Selesaikan konflik atau periksa tahun laporan terlebih dahulu.
          </p>
        ) : (
          <div className="keu-table-container">
            <table className="keu-table">
              <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                Perbandingan aset, utang, dan kekayaan bersih LHKPN per tahun
              </caption>
              <thead>
                <tr>
                  <th scope="col">Tahun</th>
                  <th scope="col">Total Aset</th>
                  <th scope="col">Total Utang</th>
                  <th scope="col">Kekayaan Bersih</th>
                  <th scope="col">Perubahan Kekayaan</th>
                  <th scope="col">Pertumbuhan</th>
                </tr>
              </thead>
              <tbody>
                {analysis.rows.map((row) => (
                  <tr key={row.recordId}>
                    <td>
                      <strong>{row.year}</strong>
                      {row.hasYearGap && (
                        <span className="keu-badge keu-badge-warning" style={{ display: 'flex', width: 'fit-content', marginTop: '0.35rem' }}>
                          Jeda: {row.missingYearsBefore.join(', ')}
                        </span>
                      )}
                    </td>
                    <td>{formatRupiah(row.totalAssets)}</td>
                    <td>{formatRupiah(row.totalDebt)}</td>
                    <td>{formatRupiah(row.netWorth)}</td>
                    <td style={{ color: typeof row.wealthChange === 'number' ? row.wealthChange >= 0 ? 'var(--keu-status-success-text)' : 'var(--keu-status-danger-text)' : 'var(--keu-text-muted)' }}>
                      {typeof row.wealthChange === 'number' ? `${row.wealthChange > 0 ? '+' : ''}${formatRupiah(row.wealthChange)}` : 'Belum ada pembanding'}
                    </td>
                    <td>
                      {formatPercentage(row.growthPercentage) || (
                        <span title={reasonLabel(row.growthUnavailableReason)} style={{ color: 'var(--keu-text-muted)', fontSize: '0.78rem' }}>
                          {reasonLabel(row.growthUnavailableReason)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {analysis.rows.length > 0 && (
        <section className="keu-card" aria-labelledby="trend-chart-heading">
          <div className="keu-card-header">
            <h2 id="trend-chart-heading" className="keu-card-title">Tren Nilai LHKPN</h2>
          </div>
          <TimeseriesChart rows={analysis.rows} />
          <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.75rem', marginTop: '0.8rem' }}>
            Garis terputus bila nilai pada suatu tahun tidak tersedia; data yang hilang tidak diperkirakan.
          </p>
        </section>
      )}

      <section className="keu-card" aria-labelledby="insights-heading">
        <div className="keu-card-header">
          <h2 id="insights-heading" className="keu-card-title">
            <TrendingUp size={20} color="#60a5fa" aria-hidden="true" />
            Insight Numerik
          </h2>
        </div>
        <div className="keu-alert keu-alert-info" style={{ marginBottom: '0.9rem' }}>
          Insight bersifat deskriptif dan dihitung dari data efektif yang terpilih; hasilnya bukan kesimpulan kepatuhan atau dugaan pelanggaran.
        </div>
        <ul style={{ display: 'grid', gap: '0.65rem', paddingLeft: '1.1rem' }}>
          {analysis.insights.map((insight, index) => (
            <li key={`${insight.code}-${insight.year || insight.toYear || index}`} style={{ color: insight.severity === 'attention' ? 'var(--keu-status-warning-text)' : 'var(--keu-text-main)', paddingLeft: '0.25rem' }}>
              {insight.message}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default TimeseriesAnalysisPage;
