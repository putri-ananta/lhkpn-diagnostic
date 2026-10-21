import React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  CalendarDays,
  Calculator,
  FileSearch,
  Landmark,
  UserRound
} from 'lucide-react';
import { formatCurrency } from '../utils/formatting';
import { runFinancialDiagnosis } from '../engine/financialEngine';
import { FinancialMetricCard } from './FinancialMetricCard';

function displayValue(value) {
  if (value === null || value === undefined || value === '') return 'Tidak tersedia';
  return value;
}

function WealthCard({ label, value, helper, accent = 'var(--keu-text-main)' }) {
  const isAvailable = value !== null && value !== undefined && Number.isFinite(Number(value));

  return (
    <div className="keu-card" style={{ padding: '1rem 1.25rem' }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--keu-text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>
        {label}
      </span>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: isAvailable ? accent : 'var(--keu-text-muted)', marginTop: '0.3rem' }}>
        {isAvailable ? formatCurrency(Number(value)) : 'Tidak tersedia'}
      </div>
      {helper && (
        <span style={{ display: 'block', marginTop: '0.2rem', fontSize: '0.75rem', color: 'var(--keu-text-dim)' }}>
          {helper}
        </span>
      )}
    </div>
  );
}

export function FinancialDiagnosis({
  extractedData,
  onBack,
  backLabel = 'Kembali',
  onSimulation,
  onTimeseries,
  onExtraction
}) {
  if (!extractedData) return null;

  const diagnosis = runFinancialDiagnosis(extractedData);
  const parserWarnings = Array.isArray(extractedData.warnings) ? extractedData.warnings : [];
  const {
    identity,
    assets,
    isParsedSuccess,
    errorReason,
    metrics,
    integrity,
    overallStatus
  } = diagnosis;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        {onBack ? (
          <button type="button" className="keu-btn keu-btn-outline keu-btn-sm" onClick={onBack}>
            <ArrowLeft size={16} />
            {backLabel}
          </button>
        ) : <span />}
        <span className={`keu-badge ${overallStatus === 'Perlu Ditinjau' ? 'keu-badge-warning' : 'keu-badge-info'}`}>
          Status: {overallStatus}
        </span>
      </div>

      {(isParsedSuccess === false || !integrity.isConsistent || parserWarnings.length > 0) && (
        <div className="keu-alert keu-alert-warning">
          <AlertTriangle size={20} />
          <div>
            <strong>Data perlu ditinjau.</strong>{' '}
            {[...new Set([errorReason, ...parserWarnings, ...integrity.warnings].filter(Boolean))].join(' ')}
          </div>
        </div>
      )}

      <section aria-labelledby="identity-heading" className="keu-card">
        <div className="keu-card-header">
          <h2 id="identity-heading" className="keu-card-title">
            <UserRound size={20} color="#60a5fa" />
            Identitas Wajib Lapor
          </h2>
          <span className="keu-badge keu-badge-neutral">NHK: {displayValue(identity.nhk)}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div>
            <span className="keu-label">Nama</span>
            <p style={{ fontWeight: 750, marginTop: '0.25rem' }}>{displayValue(identity.nama)}</p>
          </div>
          <div>
            <span className="keu-label">Jabatan</span>
            <p style={{ fontWeight: 650, marginTop: '0.25rem' }}>{displayValue(identity.jabatan)}</p>
          </div>
          <div>
            <span className="keu-label"><Building2 size={13} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />Instansi / Lembaga</span>
            <p style={{ fontWeight: 650, marginTop: '0.25rem' }}>{displayValue(identity.lembaga)}</p>
          </div>
          <div>
            <span className="keu-label">Unit Kerja</span>
            <p style={{ fontWeight: 650, marginTop: '0.25rem' }}>{displayValue(identity.unit_kerja)}</p>
          </div>
          <div>
            <span className="keu-label"><CalendarDays size={13} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />Tahun LHKPN</span>
            <p style={{ fontWeight: 650, marginTop: '0.25rem' }}>{displayValue(identity.tahun_laporan)}</p>
          </div>
          <div>
            <span className="keu-label">Tanggal Pelaporan</span>
            <p style={{ fontWeight: 650, marginTop: '0.25rem' }}>{displayValue(identity.tanggal_penyampaian)}</p>
          </div>
          <div>
            <span className="keu-label">Status Verifikasi</span>
            <p style={{ fontWeight: 650, marginTop: '0.25rem' }}>{displayValue(identity.status_verifikasi)}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="wealth-heading">
        <h2 id="wealth-heading" style={{ fontSize: '1.1rem', marginBottom: '0.8rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Landmark size={19} color="#60a5fa" />
          Ringkasan Kekayaan
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))', gap: '1rem' }}>
          <WealthCard label="TOTAL ASET" value={assets.subtotal_harta} helper="Seluruh aset sebelum utang" />
          <WealthCard label="TOTAL UTANG" value={assets.hutang} accent={assets.hutang > 0 ? '#f87171' : '#34d399'} />
          <WealthCard label="KEKAYAAN BERSIH" value={assets.total_harta_kekayaan} accent="#60a5fa" helper="Total aset dikurangi utang" />
          <WealthCard label="KAS DAN SETARA KAS" value={assets.kas_dan_setara_kas} accent="#34d399" />
          {assets.total_penghasilan !== null && assets.total_penghasilan !== undefined && (
            <WealthCard label="TOTAL PENGHASILAN" value={assets.total_penghasilan} helper="Sesuai data yang terbaca pada dokumen" />
          )}
        </div>
      </section>

      <section aria-labelledby="diagnosis-heading">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '1rem', flexWrap: 'wrap' }}>
          <h2 id="diagnosis-heading" style={{ fontSize: '1.1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <BarChart3 size={19} color="#60a5fa" />
            Financial Diagnosis
          </h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--keu-text-muted)' }}>Lima rasio dari data efektif LHKPN</span>
        </div>
        <div className="keu-metric-grid">
          {metrics.map((metric) => <FinancialMetricCard key={metric.key} metric={metric} />)}
        </div>
      </section>

      <section aria-labelledby="actions-heading" className="keu-card">
        <div className="keu-card-header">
          <h2 id="actions-heading" className="keu-card-title">Tindakan Tersedia</h2>
          <span style={{ color: 'var(--keu-text-muted)', fontSize: '0.8rem' }}>Konteks dokumen tetap tersimpan selama sesi ini</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.875rem' }}>
          <button type="button" className="keu-btn keu-btn-primary" onClick={onSimulation} disabled={!onSimulation}>
            <Calculator size={17} />
            Simulasi Keuangan
          </button>
          <button type="button" className="keu-btn keu-btn-secondary" onClick={onTimeseries} disabled={!onTimeseries}>
            <BarChart3 size={17} />
            Analisis Timeseries
          </button>
          <button type="button" className="keu-btn keu-btn-outline" onClick={onExtraction} disabled={!onExtraction}>
            <FileSearch size={17} />
            Detail Ekstraksi
          </button>
        </div>
      </section>
    </div>
  );
}
