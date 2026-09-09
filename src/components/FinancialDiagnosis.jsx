import React from 'react';
import { User, Building, Calendar, AlertTriangle, ShieldCheck, PieChart, FileText, ArrowLeft, Lightbulb, CheckCircle2, XCircle } from 'lucide-react';
import { formatCurrency, formatPercent } from '../utils/formatting';
import { runFinancialDiagnosis } from '../engine/financialEngine';
import { FinancialMetricCard } from './FinancialMetricCard';
import { AssetComposition } from './AssetComposition';
import { PersonalFinanceSimulation } from './PersonalFinanceSimulation';
import { LHKPNDetail } from './LHKPNDetail';

export function FinancialDiagnosis({ extractedData, onBack }) {
  if (!extractedData) return null;

  const diagnosis = runFinancialDiagnosis(extractedData);
  const { identity, assets, categoryDetails, itemized, metrics, integrity, overallStatus, narrativeSummary, portfolioProfile, keyFindings, disclaimer, diagnosticSummary } = diagnosis;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Komposisi Sehat': return 'keu-badge-success';
      case 'Likuiditas Sehat': return 'keu-badge-success';
      case 'Likuiditas Seimbang': return 'keu-badge-success';
      case 'Perlu Perhatian': return 'keu-badge-danger';
      case 'Konsentrasi Tinggi': return 'keu-badge-warning';
      case 'Likuiditas Rendah': return 'keu-badge-warning';
      case 'Aset Produktif Rendah': return 'keu-badge-info';
      default: return 'keu-badge-neutral';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Optional Top Navigation Back Bar */}
      {onBack && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button className="keu-btn keu-btn-outline keu-btn-sm" onClick={onBack}>
            <ArrowLeft size={16} />
            Kembali ke Ringkasan Batch
          </button>
          <span className={`keu-badge ${getStatusBadge(overallStatus)}`}>
            Status: {overallStatus}
          </span>
        </div>
      )}

      {/* TOP SECTION: Identity Summary Header Card */}
      <div className="keu-card">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'rgba(37, 99, 235, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3b82f6'
              }}
            >
              <User size={24} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--keu-text-main)' }}>
                {identity.nama || 'Penyelenggara Negara'}
              </h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', marginTop: '0.25rem', fontSize: '0.875rem', color: 'var(--keu-text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <Building size={14} />
                  {identity.jabatan} — {identity.lembaga}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <Calendar size={14} />
                  LHKPN Tahun {identity.tahun_laporan}
                </span>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--keu-text-muted)', display: 'block' }}>DIAGNOSIS STATUS</span>
            <span className={`keu-badge ${getStatusBadge(overallStatus)}`} style={{ fontSize: '0.875rem', padding: '0.35rem 0.75rem' }}>
              {overallStatus}
            </span>
          </div>
        </div>
      </div>

      {/* WEALTH SUMMARY INDICATORS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <div className="keu-card" style={{ padding: '1rem 1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--keu-text-muted)', fontWeight: 600 }}>TOTAL HARTA KEKAYAAN</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#3b82f6', marginTop: '0.25rem' }}>
            {formatCurrency(assets.total_harta_kekayaan)}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--keu-text-dim)' }}>
            {formatCurrency(assets.total_harta_kekayaan, true)}
          </span>
        </div>

        <div className="keu-card" style={{ padding: '1rem 1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--keu-text-muted)', fontWeight: 600 }}>SUBTOTAL HARTA</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--keu-text-main)', marginTop: '0.25rem' }}>
            {formatCurrency(assets.subtotal_harta)}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--keu-text-dim)' }}>
            Total seluruh aset sebelum hutang
          </span>
        </div>

        <div className="keu-card" style={{ padding: '1rem 1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--keu-text-muted)', fontWeight: 600 }}>HUTANG TERLAPOR</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: assets.hutang > 0 ? '#f87171' : '#34d399', marginTop: '0.25rem' }}>
            {formatCurrency(assets.hutang)}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--keu-text-dim)' }}>
            {assets.hutang === 0 ? 'NIHIL (0%)' : 'Liabilitas terdaftar'}
          </span>
        </div>

        <div className="keu-card" style={{ padding: '1rem 1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--keu-text-muted)', fontWeight: 600 }}>NET WEALTH (Kekayaan Bersih)</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#34d399', marginTop: '0.25rem' }}>
            {formatCurrency(assets.total_harta_kekayaan)}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--keu-text-dim)' }}>
            Subtotal Harta - Hutang
          </span>
        </div>
      </div>

      {/* Non-blocking Parsing Warnings */}
      {!integrity.isConsistent && (
        <div className="keu-alert keu-alert-warning">
          <AlertTriangle size={20} />
          <div>
            <strong>Perhatian Ekstraksi Data:</strong>
            <ul style={{ paddingLeft: '1.25rem', marginTop: '0.25rem' }}>
              {integrity.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* SECTION 3.5: DIAGNOSTIC SCORE & INSIGHTS */}
      {diagnosticSummary && diagnosticSummary.score !== undefined && (
        <div className="keu-card">
          <div className="keu-card-header">
            <h3 className="keu-card-title">
              <Lightbulb size={20} color="#fbbf24" />
              Skor Diagnostik & Rekomendasi
            </h3>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 1rem', borderRadius: 'var(--keu-radius-full)', fontSize: '1.25rem', fontWeight: 800, backgroundColor: diagnosticSummary.score >= 70 ? '#34d39920' : diagnosticSummary.score >= 50 ? '#fbbf2420' : '#f8717120', color: diagnosticSummary.score >= 70 ? '#34d399' : diagnosticSummary.score >= 50 ? '#fbbf24' : '#f87171' }}>
              {diagnosticSummary.grade}
              <span style={{ fontSize: '0.75rem', fontWeight: 500, opacity: 0.8 }}>{diagnosticSummary.score}/100</span>
            </span>
          </div>
          
          {/* Insights */}
          {diagnosticSummary.insights.length > 0 && (
            <div style={{ padding: '0.75rem 0.75rem 0.5rem' }}>
              <h4 style={{ fontSize: '0.8125rem', color: 'var(--keu-text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
                ANALISIS KESEHATAN KEUANGAN:
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {diagnosticSummary.insights.map((insight, idx) => {
                  const colors = {
                    critical: '#f87171',
                    warning: '#f59e0b',
                    caution: '#fbbf24',
                    good: '#34d399'
                  };
                  const icons = {
                    critical: <XCircle size={16} />,
                    warning: <AlertTriangle size={16} />,
                    caution: <Lightbulb size={16} />,
                    good: <CheckCircle2 size={16} />
                  };
                  return (
                    <div key={idx} style={{ display: 'flex', gap: '0.625rem', padding: '0.625rem 0.75rem', borderRadius: 'var(--keu-radius-sm)', backgroundColor: `${colors[insight.type]}10`, border: `1px solid ${colors[insight.type]}30` }}>
                      <span style={{ color: colors[insight.type], flexShrink: 0, marginTop: '2px' }}>{icons[insight.type]}</span>
                      <span style={{ fontSize: '0.875rem', color: 'var(--keu-text-main)', lineHeight: 1.5 }}>{insight.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Recommendations */}
          {diagnosticSummary.recommendations.length > 0 && (
            <div style={{ padding: '0.5rem 0.75rem 0.75rem' }}>
              <h4 style={{ fontSize: '0.8125rem', color: 'var(--keu-text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
                REKOMENDASI TINDAK LANJUT:
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {diagnosticSummary.recommendations.map((rec, idx) => {
                  const isAction = rec.type === 'action';
                  return (
                    <div key={idx} style={{ display: 'flex', gap: '0.625rem', padding: '0.625rem 0.75rem', borderRadius: 'var(--keu-radius-sm)', backgroundColor: isAction ? '#3b82f610' : '#60a5fa10', border: `1px solid ${isAction ? '#3b82f630' : '#60a5fa30'}` }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isAction ? '#3b82f6' : '#60a5fa', flexShrink: 0, minWidth: '60px', textAlign: 'center', padding: '0.125rem 0.375rem', borderRadius: 'var(--keu-radius-full)', backgroundColor: isAction ? '#3b82f620' : '#60a5fa20' }}>
                        {isAction ? 'AKSI' : 'SARAN'}
                      </span>
                      <span style={{ fontSize: '0.875rem', color: 'var(--keu-text-main)', lineHeight: 1.5 }}>{rec.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: FINANCIAL DIAGNOSIS - 5 METRIC CARDS */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PieChart size={20} color="#60a5fa" />
            Financial Diagnosis (5 Rasio Keuangan)
          </h3>
          <span style={{ fontSize: '0.8125rem', color: 'var(--keu-text-muted)' }}>
            Denominator: Subtotal Harta ({formatCurrency(assets.subtotal_harta, true)})
          </span>
        </div>

        <div className="keu-metric-grid">
          {metrics.map((metric) => (
            <FinancialMetricCard key={metric.key} metric={metric} />
          ))}
        </div>
      </div>

      {/* SECTION 5: ASSET COMPOSITION VISUALIZATION */}
      <AssetComposition assets={assets} />

      {/* SECTION 6: PORTFOLIO PROFILE */}
      <div className="keu-card" style={{ marginTop: '1.5rem' }}>
        <div className="keu-card-header">
          <h3 className="keu-card-title">Profil Portofolio</h3>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.25rem 0.75rem', borderRadius: 'var(--keu-radius-full)', fontSize: '0.8125rem', fontWeight: 600, backgroundColor: `${portfolioProfile.color}20`, color: portfolioProfile.color }}>
            {portfolioProfile.label}
          </span>
        </div>
        <p style={{ fontSize: '0.9375rem', color: 'var(--keu-text-main)', lineHeight: 1.6, margin: 0, padding: '0 0.75rem 0.75rem' }}>
          {portfolioProfile.description}
        </p>
      </div>

      {/* SECTION 7: KEY FINDINGS */}
      {keyFindings.length > 0 && (
        <div className="keu-card" style={{ marginTop: '1rem' }}>
          <div className="keu-card-header">
            <h3 className="keu-card-title">Temuan Kunci</h3>
            <span className="keu-badge keu-badge-info">{keyFindings.length} indikator</span>
          </div>
          <div style={{ padding: '0.75rem 0.75rem 0.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {keyFindings.map((finding, idx) => {
              const colors = {
                strength: '#34d399',
                good: '#34d399',
                caution: '#fbbf24',
                warning: '#f59e0b',
                concern: '#f87171'
              };
              const icons = {
                strength: '✓',
                good: '✓',
                caution: '!',
                warning: '⚠',
                concern: '✗'
              };
              return (
                <div key={idx} style={{ display: 'flex', gap: '0.625rem', padding: '0.625rem 0.75rem', borderRadius: 'var(--keu-radius-sm)', backgroundColor: `${colors[finding.type]}10`, border: `1px solid ${colors[finding.type]}30` }}>
                  <span style={{ fontSize: '0.875rem', color: colors[finding.type], flexShrink: 0 }}>{icons[finding.type]}</span>
                  <span style={{ fontSize: '0.875rem', color: 'var(--keu-text-main)', lineHeight: 1.5 }}>{finding.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 8: NARRATIVE DIAGNOSIS SUMMARY & LEGAL DISCLAIMER */}
      <div className="keu-card" style={{ marginTop: '1rem' }}>
        <div className="keu-card-header">
          <h3 className="keu-card-title">Ringkasan Diagnosis & Catatan Analitis</h3>
          <span className="keu-badge keu-badge-info">Deterministik Engine</span>
        </div>

        <div style={{ backgroundColor: 'var(--keu-bg-primary)', padding: '1.25rem', borderRadius: 'var(--keu-radius-md)', borderLeft: '4px solid #3b82f6', marginBottom: '1.25rem' }}>
          <h4 style={{ fontSize: '0.875rem', color: '#60a5fa', marginBottom: '0.5rem', fontWeight: 600 }}>
            RINGKASAN STRUKTUR PORTOFOLIO:
          </h4>
          <p style={{ fontSize: '0.95rem', color: 'var(--keu-text-main)', lineHeight: 1.6 }}>
            {narrativeSummary}
          </p>
        </div>

        {/* Legal Disclaimer Box */}
        <div style={{ display: 'flex', gap: '0.75rem', padding: '1rem', backgroundColor: 'rgba(245, 158, 11, 0.08)', borderRadius: 'var(--keu-radius-md)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
          <ShieldCheck size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.78125rem', color: 'var(--keu-text-muted)', lineHeight: 1.5 }}>
            <strong style={{ color: '#fbbf24' }}>Pernyataan Hukum (Legal Disclaimer):</strong> {disclaimer}
          </div>
        </div>
      </div>

      {/* SECTION 9: DETAILED EXTRACTION DATA */}
      <LHKPNDetail categoryDetails={categoryDetails} itemized={itemized} identity={identity} />

      {/* SECTION 10: PERSONAL FINANCE SIMULATION */}
      <PersonalFinanceSimulation />
    </div>
  );
}
