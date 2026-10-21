import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  Search,
  UsersRound
} from 'lucide-react';
import { runFinancialDiagnosis } from '../engine/financialEngine';
import {
  buildTimeseriesAnalysis,
  getEffectiveLHKPNData,
  getReportingYear,
  groupRecordsByIndividual
} from '../engine/lhkpnDomain';
import { formatCurrency } from '../utils/formatting';

const PAGE_SIZE = 25;

const STATUS_LABELS = {
  'single-year': 'Satu Tahun',
  'multi-year': 'Multi-tahun',
  incomplete: 'Data Belum Lengkap',
  conflict: 'Konflik Tahun'
};

function text(value, fallback = 'Tidak tersedia') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function money(value) {
  return Number.isFinite(value) ? formatCurrency(value, true) : 'Tidak tersedia';
}

function statusClass(status) {
  if (status === 'multi-year') return 'keu-badge-success';
  if (status === 'single-year') return 'keu-badge-info';
  if (status === 'conflict') return 'keu-badge-danger';
  return 'keu-badge-warning';
}

function makeRows(grouping) {
  return grouping.groups.map((group) => {
    const latestRecord = group.latestRecord;
    const latest = latestRecord ? getEffectiveLHKPNData(latestRecord) : null;
    const analysis = buildTimeseriesAnalysis(group.effectiveRecords);
    const latestAnnual = analysis.rows.at(-1);
    const diagnosis = latest ? runFinancialDiagnosis(latest) : null;

    return {
      group,
      name: text(group.identity?.nama),
      institution: text(latest?.identity?.lembaga || group.identity?.lembaga),
      position: text(latest?.identity?.jabatan || group.identity?.jabatan),
      years: [...new Set(group.records.map(getReportingYear).filter(Number.isInteger))].sort((a, b) => a - b),
      latestYear: latestRecord ? getReportingYear(latestRecord) : null,
      latestNetWorth: latest?.assets?.total_harta_kekayaan ?? null,
      wealthChange: latestAnnual?.wealthChange ?? null,
      diagnosisStatus: diagnosis?.overallStatus || null,
      status: group.status
    };
  });
}

export function BatchSummaryTable({
  records = [],
  grouping: suppliedGrouping,
  failedFiles = [],
  onResetBatch,
  onSelectGroup,
  onResolveConflict,
  onIdentityDecision
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const grouping = suppliedGrouping || groupRecordsByIndividual(records);
  const rows = useMemo(() => makeRows(grouping), [grouping]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('id-ID');
    return rows
      .filter((row) => !query || [row.name, row.institution, row.position, row.years.join(' ')]
        .some((value) => value.toLocaleLowerCase('id-ID').includes(query)))
      .sort((left, right) => {
        const leftValue = left[sortField];
        const rightValue = right[sortField];
        if (leftValue === null || leftValue === undefined) return 1;
        if (rightValue === null || rightValue === undefined) return -1;
        const comparison = typeof leftValue === 'string'
          ? leftValue.localeCompare(rightValue, 'id-ID')
          : Number(leftValue) - Number(rightValue);
        return sortAsc ? comparison : -comparison;
      });
  }, [rows, searchQuery, sortAsc, sortField]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleRows = filteredRows.length > PAGE_SIZE
    ? filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    : filteredRows;

  const changeSort = (field) => {
    setPage(1);
    if (field === sortField) setSortAsc((value) => !value);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      <section className="keu-card">
        <div className="keu-card-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <h2 className="keu-card-title">
              <UsersRound size={22} color="#60a5fa" />
              Ringkasan Beberapa LHKPN
            </h2>
            <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
              {records.length} dokumen berhasil dikelompokkan menjadi {grouping.groups.length} wajib lapor.
            </p>
          </div>
          <button type="button" className="keu-btn keu-btn-outline keu-btn-sm" onClick={onResetBatch}>
            Unggah Dokumen Lain
          </button>
        </div>

        <label className="keu-field-group" style={{ position: 'relative', maxWidth: 480 }}>
          <span className="keu-label">Cari wajib lapor</span>
          <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 12, bottom: 12, color: 'var(--keu-text-muted)' }} />
          <input
            className="keu-input"
            style={{ paddingLeft: '2.25rem' }}
            value={searchQuery}
            onChange={(event) => { setSearchQuery(event.target.value); setPage(1); }}
            placeholder="Nama, instansi, jabatan, atau tahun"
          />
        </label>
      </section>

      {grouping.uncertain.length > 0 && (
        <section className="keu-card" aria-labelledby="identity-review-heading">
          <h3 id="identity-review-heading" className="keu-card-title">
            <AlertTriangle size={19} color="#fbbf24" />
            Tinjau Kecocokan Identitas ({grouping.uncertain.length})
          </h3>
          <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.82rem', margin: '0.45rem 0 1rem' }}>
            Dokumen dengan nama yang mirip tidak digabungkan sebelum Anda mengonfirmasinya.
          </p>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {grouping.uncertain.map((item) => {
              const identity = getEffectiveLHKPNData(item.record).identity;
              return item.candidates.map((candidate) => {
                const candidateGroup = grouping.groups.find((group) => group.id === candidate.groupId);
                const representative = candidateGroup?.records?.[0];
                return (
                  <div key={`${item.recordId}-${candidate.groupId}`} style={{ padding: '0.85rem', border: '1px solid var(--keu-border-subtle)', borderRadius: 'var(--keu-radius-md)', background: 'var(--keu-bg-primary)' }}>
                    <p style={{ fontWeight: 700 }}>{text(identity.nama)} ↔ {text(candidateGroup?.identity?.nama)}</p>
                    <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.78rem', marginTop: '0.25rem' }}>
                      Perlu konfirmasi pengguna; perubahan jabatan atau instansi tidak otomatis menolak kecocokan.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginTop: '0.7rem' }}>
                      <button type="button" className="keu-btn keu-btn-primary keu-btn-sm" onClick={() => onIdentityDecision?.(item.recordId, representative?.id, true)}>
                        <CheckCircle2 size={14} /> Orang yang Sama
                      </button>
                      <button type="button" className="keu-btn keu-btn-outline keu-btn-sm" onClick={() => onIdentityDecision?.(item.recordId, representative?.id, false)}>
                        Bukan Orang yang Sama
                      </button>
                    </div>
                  </div>
                );
              });
            })}
          </div>
        </section>
      )}

      {grouping.groups.some((group) => group.duplicateResolution.unresolvedConflicts.length > 0) && (
        <section className="keu-card" aria-labelledby="conflict-heading">
          <h3 id="conflict-heading" className="keu-card-title">
            <AlertTriangle size={19} color="#f87171" />
            Pilih Dokumen untuk Tahun yang Sama
          </h3>
          <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.82rem', margin: '0.45rem 0 1rem' }}>
            Nilai keuangan berbeda ditemukan pada tahun pelaporan yang sama. Tidak ada dokumen yang dipilih otomatis.
          </p>
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            {grouping.groups.flatMap((group) => group.duplicateResolution.unresolvedConflicts.map((conflict) => (
              <div key={conflict.id} style={{ padding: '0.9rem', border: '1px solid var(--keu-status-danger-border)', borderRadius: 'var(--keu-radius-md)', background: 'var(--keu-status-danger-bg)' }}>
                <strong>{text(group.identity?.nama)} — Tahun {conflict.year}</strong>
                <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.7rem' }}>
                  {conflict.records.map((record) => {
                    const effective = getEffectiveLHKPNData(record);
                    return (
                      <button key={record.id} type="button" className="keu-btn keu-btn-outline" style={{ justifyContent: 'space-between', whiteSpace: 'normal' }} onClick={() => onResolveConflict?.(group.id, conflict.id, record.id)}>
                        <span>{record.fileMeta?.name || 'Dokumen LHKPN'}</span>
                        <span>{money(effective.assets?.total_harta_kekayaan)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )))}
          </div>
        </section>
      )}

      {failedFiles.length > 0 && (
        <div className="keu-alert keu-alert-warning">
          <AlertTriangle size={19} />
          <div>
            <strong>{failedFiles.length} dokumen gagal diproses.</strong> Dokumen lain yang berhasil tetap tersedia.
            <ul style={{ margin: '0.4rem 0 0 1.1rem' }}>
              {failedFiles.map((file) => <li key={file.id || file.name}>{file.name}: {file.error || 'Format tidak dapat dibaca.'}</li>)}
            </ul>
          </div>
        </div>
      )}

      <div className="keu-table-container">
        <table className="keu-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => changeSort('name')}>Nama <ArrowUpDown size={12} /></th>
              <th>Instansi / Jabatan</th>
              <th>Tahun Tersedia</th>
              <th className="sortable" onClick={() => changeSort('latestYear')}>LHKPN Terbaru <ArrowUpDown size={12} /></th>
              <th className="sortable" onClick={() => changeSort('latestNetWorth')}>Kekayaan Bersih Terbaru <ArrowUpDown size={12} /></th>
              <th>Perubahan Kekayaan</th>
              <th>Status Analisis</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--keu-text-muted)', padding: '2rem' }}>Tidak ada wajib lapor yang cocok.</td></tr>
            ) : visibleRows.map((row) => (
              <tr key={row.group.id}>
                <td style={{ fontWeight: 700 }}>{row.name}</td>
                <td><div>{row.institution}</div><small style={{ color: 'var(--keu-text-muted)' }}>{row.position}</small></td>
                <td>{row.years.length ? row.years.join(', ') : 'Tidak terbaca'}</td>
                <td>{row.latestYear ?? 'Tidak terbaca'}</td>
                <td style={{ fontWeight: 700 }}>{money(row.latestNetWorth)}</td>
                <td>{money(row.wealthChange)}</td>
                <td>
                  <span className={`keu-badge ${statusClass(row.status)}`}>{STATUS_LABELS[row.status] || row.diagnosisStatus || 'Perlu Ditinjau'}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className="keu-btn keu-btn-primary keu-btn-sm"
                    disabled={!row.group.latestRecord || row.group.status === 'conflict'}
                    onClick={() => onSelectGroup?.(row.group)}
                  >
                    <Eye size={14} /> Lihat Detail
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredRows.length > PAGE_SIZE && (
        <nav aria-label="Paginasi ringkasan batch" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem' }}>
          <button type="button" className="keu-btn keu-btn-outline keu-btn-sm" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Sebelumnya</button>
          <span style={{ color: 'var(--keu-text-muted)', fontSize: '0.82rem' }}>Halaman {safePage} dari {pageCount}</span>
          <button type="button" className="keu-btn keu-btn-outline keu-btn-sm" disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Berikutnya</button>
        </nav>
      )}

      <div style={{ color: 'var(--keu-text-dim)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <FileSpreadsheet size={14} /> Satu baris mewakili satu identitas yang telah dikonfirmasi.
      </div>
    </div>
  );
}
