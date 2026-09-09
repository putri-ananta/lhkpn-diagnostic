import React from 'react';
import { formatCurrency, formatPercent } from '../utils/formatting';

export function AssetComposition({ assets }) {
  const {
    tanah_dan_bangunan = 0,
    alat_transportasi_dan_mesin = 0,
    harta_bergerak_lainnya = 0,
    surat_berharga = 0,
    kas_dan_setara_kas = 0,
    harta_lainnya = 0,
    subtotal_harta = 0
  } = assets || {};

  const total = subtotal_harta > 0 ? subtotal_harta : 1;

  const categories = [
    { name: 'Tanah & Bangunan', value: tanah_dan_bangunan, color: '#3b82f6' },
    { name: 'Transportasi & Mesin', value: alat_transportasi_dan_mesin, color: '#f59e0b' },
    { name: 'Harta Bergerak Lainnya', value: harta_bergerak_lainnya, color: '#ec4899' },
    { name: 'Surat Berharga', value: surat_berharga, color: '#10b981' },
    { name: 'Kas & Setara Kas', value: kas_dan_setara_kas, color: '#06b6d4' },
    { name: 'Harta Lainnya', value: harta_lainnya, color: '#8b5cf6' }
  ];

  return (
    <div className="keu-card" style={{ marginTop: '1.5rem' }}>
      <div className="keu-card-header">
        <h3 className="keu-card-title">Komposisi Harta (Asset Composition)</h3>
        <span className="keu-badge keu-badge-neutral">
          Subtotal Harta: {formatCurrency(subtotal_harta)}
        </span>
      </div>

      {/* Visual Stacked Bar */}
      <div
        style={{
          display: 'flex',
          height: '24px',
          width: '100%',
          backgroundColor: 'var(--keu-bg-primary)',
          borderRadius: 'var(--keu-radius-md)',
          overflow: 'hidden',
          marginBottom: '1.5rem'
        }}
      >
        {categories.map((cat, idx) => {
          const pct = (cat.value / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={idx}
              style={{
                width: `${pct}%`,
                backgroundColor: cat.color,
                transition: 'width 0.5s ease'
              }}
              title={`${cat.name}: ${formatCurrency(cat.value)} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Breakdown Grid Table */}
      <div className="keu-table-container">
        <table className="keu-table">
          <thead>
            <tr>
              <th>Kategori Harta</th>
              <th style={{ textAlign: 'right' }}>Nilai Nominal (Rp)</th>
              <th style={{ textAlign: 'right' }}>Proporsi (%)</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, idx) => {
              const pct = cat.value / total;
              return (
                <tr key={idx}>
                  <td style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '3px',
                        backgroundColor: cat.color,
                        display: 'inline-block'
                      }}
                    />
                    <span style={{ fontWeight: 500 }}>{cat.name}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatCurrency(cat.value)}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--keu-text-muted)' }}>
                    {formatPercent(pct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
