import React, { useState } from 'react';
import { Info, HelpCircle, X } from 'lucide-react';
import { formatPercent } from '../utils/formatting';

export function FinancialMetricCard({ metric }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const { name, ratio, status, statusCategory, idealRange, shortDiagnosis, formula, progressPct } = metric;

  const getBadgeClass = (category) => {
    switch (category) {
      case 'success': return 'keu-badge-success';
      case 'warning': return 'keu-badge-warning';
      case 'danger': return 'keu-badge-danger';
      case 'info': return 'keu-badge-info';
      default: return 'keu-badge-neutral';
    }
  };

  return (
    <>
      <div className="keu-metric-card">
        <div>
          {/* Card Header with Name & Info Trigger */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--keu-text-muted)' }}>
              {name}
            </span>
            <button
              type="button"
              onClick={() => setShowTooltip(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--keu-text-muted)',
                cursor: 'pointer',
                padding: '2px'
              }}
              title="Lihat formula & penjelasan rasio"
            >
              <Info size={16} />
            </button>
          </div>

          {/* Metric Value & Status Badge */}
          <div className="keu-metric-val-row">
            <span className="keu-metric-pct">
              {ratio !== null ? formatPercent(ratio) : 'N/A'}
            </span>
            <span className={`keu-badge ${getBadgeClass(statusCategory)}`}>
              {status}
            </span>
          </div>

          {/* Ideal Benchmark Label */}
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--keu-text-dim)' }}>
            Target Acuan Ideal: <span style={{ color: 'var(--keu-text-muted)', fontWeight: 600 }}>{idealRange}</span>
          </div>
        </div>

        {/* Visual Bar Indicator */}
        <div>
          <div className="keu-metric-bar-track">
            <div
              className={`keu-metric-bar-fill ${statusCategory}`}
              style={{ width: `${Math.max(4, Math.min(100, progressPct))}%` }}
            />
          </div>

          {/* Short Diagnosis Text */}
          <p style={{ fontSize: '0.8125rem', color: 'var(--keu-text-muted)', marginTop: '0.75rem', lineHeight: 1.4 }}>
            {shortDiagnosis}
          </p>
        </div>
      </div>

      {/* Interactive Explanation Modal / Tooltip */}
      {showTooltip && (
        <div className="keu-modal-backdrop" onClick={() => setShowTooltip(false)}>
          <div
            className="keu-modal-container"
            style={{ maxWidth: '500px', padding: '1.5rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <HelpCircle size={20} color="#60a5fa" />
                Penjelasan Rasio: {name}
              </h3>
              <button
                className="keu-btn keu-btn-outline keu-btn-sm"
                onClick={() => setShowTooltip(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
              <div style={{ backgroundColor: 'var(--keu-bg-primary)', padding: '0.875rem', borderRadius: 'var(--keu-radius-md)' }}>
                <span style={{ color: 'var(--keu-text-muted)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
                  FORMULA PERHITUNGAN:
                </span>
                <code style={{ fontSize: '0.9rem', color: '#60a5fa', fontWeight: 600 }}>{formula}</code>
              </div>

              <div>
                <span style={{ color: 'var(--keu-text-muted)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
                  NILAI SAAT INI:
                </span>
                <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                  {ratio !== null ? formatPercent(ratio) : 'Data Tidak Lengkap'}
                </span>
              </div>

              <div>
                <span style={{ color: 'var(--keu-text-muted)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
                  STANDAR BENCHMARK IDEAL:
                </span>
                <span style={{ color: '#34d399', fontWeight: 600 }}>{idealRange}</span>
              </div>

              <div>
                <span style={{ color: 'var(--keu-text-muted)', fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
                  INTERPRETASI ANALITIS:
                </span>
                <p style={{ color: 'var(--keu-text-main)', lineHeight: 1.5 }}>
                  {shortDiagnosis}
                </p>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button
                className="keu-btn keu-btn-primary keu-btn-sm"
                onClick={() => setShowTooltip(false)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
