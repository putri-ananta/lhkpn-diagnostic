import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../utils/formatting';

export function LHKPNDetail({ categoryDetails, itemized, identity }) {
  const [isOpen, setIsOpen] = useState(false);

  const categories = [
    { key: 'tanah_dan_bangunan', title: 'A. Tanah dan Bangunan' },
    { key: 'alat_transportasi_dan_mesin', title: 'B. Alat Transportasi dan Mesin' },
    { key: 'harta_bergerak_lainnya', title: 'C. Harta Bergerak Lainnya' },
    { key: 'surat_berharga', title: 'D. Surat Berharga' },
    { key: 'kas_dan_setara_kas', title: 'E. Kas dan Setara Kas' },
    { key: 'harta_lainnya', title: 'F. Harta Lainnya' },
    { key: 'subtotal_harta', title: 'Sub Total Harta' },
    { key: 'hutang', title: 'III. Hutang' },
    { key: 'total_harta_kekayaan', title: 'IV. Total Harta Kekayaan' }
  ];

  return (
    <div className="keu-card" style={{ marginTop: '1.5rem' }}>
      <div
        className="keu-card-header"
        style={{ cursor: 'pointer', marginBottom: 0, paddingBottom: isOpen ? '0.75rem' : 0, borderBottom: isOpen ? '1px solid var(--keu-border-subtle)' : 'none' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <h3 className="keu-card-title">
          <FileText size={20} color="#60a5fa" />
          Detail Data LHKPN Hasil Ekstraksi
        </h3>
        <button className="keu-btn keu-btn-outline keu-btn-sm">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          {isOpen ? 'Sembunyikan Detail' : 'Tampilkan Detail Ekstraksi'}
        </button>
      </div>

      {isOpen && (
        <div style={{ marginTop: '1.25rem' }}>
          {/* Identity Fields Summary Grid */}
          <div style={{ backgroundColor: 'var(--keu-bg-primary)', padding: '1rem', borderRadius: 'var(--keu-radius-md)', marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '0.875rem', color: 'var(--keu-text-muted)', marginBottom: '0.75rem' }}>
              INFORMASI IDENTITAS PENYAMPAIAN:
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', fontSize: '0.8125rem' }}>
              <div><span style={{ color: 'var(--keu-text-dim)' }}>NHK:</span> <strong style={{ color: 'var(--keu-text-main)' }}>{identity?.nhk || '-'}</strong></div>
              <div><span style={{ color: 'var(--keu-text-dim)' }}>Bidang:</span> <strong style={{ color: 'var(--keu-text-main)' }}>{identity?.bidang || '-'}</strong></div>
              <div><span style={{ color: 'var(--keu-text-dim)' }}>Unit Kerja:</span> <strong style={{ color: 'var(--keu-text-main)' }}>{identity?.unit_kerja || '-'}</strong></div>
              <div><span style={{ color: 'var(--keu-text-dim)' }}>Tgl Penyampaian:</span> <strong style={{ color: 'var(--keu-text-main)' }}>{identity?.tanggal_penyampaian || '-'}</strong></div>
              <div><span style={{ color: 'var(--keu-text-dim)' }}>Jenis Laporan:</span> <strong style={{ color: 'var(--keu-text-main)' }}>{identity?.jenis_laporan || '-'}</strong></div>
              <div><span style={{ color: 'var(--keu-text-dim)' }}>Status Verifikasi:</span> <strong style={{ color: '#34d399' }}>{identity?.status_verifikasi || '-'}</strong></div>
            </div>
          </div>

          {/* Categories Table */}
          <div className="keu-table-container">
            <table className="keu-table">
              <thead>
                <tr>
                  <th>Kategori LHKPN</th>
                  <th>Nilai Terdaftar</th>
                  <th>Teks Mentah PDF</th>
                  <th>Tingkat Kepercayaan</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(({ key, title }) => {
                  const detail = categoryDetails?.[key] || {};
                  const isZero = detail.isZero;
                  const val = detail.value;

                  return (
                    <tr key={key}>
                      <td style={{ fontWeight: 600 }}>{title}</td>
                      <td style={{ fontWeight: 700, color: isZero ? 'var(--keu-text-muted)' : 'var(--keu-text-main)' }}>
                        {val !== null && val !== undefined ? formatCurrency(val) : 'Tidak Terbaca'}
                      </td>
                      <td style={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: 'var(--keu-text-muted)' }}>
                        {detail.rawText || (isZero ? 'Rp. ----' : '-')}
                      </td>
                      <td>
                        {detail.confidence === 'high' ? (
                          <span className="keu-badge keu-badge-success">
                            <CheckCircle2 size={12} /> Tinggi
                          </span>
                        ) : (
                          <span className="keu-badge keu-badge-warning">
                            <AlertTriangle size={12} /> Sedang
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Itemized Asset Records if available */}
          {itemized && Object.keys(itemized).length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h4 style={{ fontSize: '0.875rem', color: 'var(--keu-text-muted)', marginBottom: '0.75rem' }}>
                RINCIAN ITEM HARTA TERDAFTAR:
              </h4>
              {Object.entries(itemized).map(([catKey, items]) => (
                <div key={catKey} style={{ marginBottom: '1rem' }}>
                  <h5 style={{ fontSize: '0.8125rem', color: '#60a5fa', marginBottom: '0.5rem', textTransform: 'capitalize' }}>
                    {catKey.replace(/_/g, ' ')} ({items.length} Item):
                  </h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          fontSize: '0.8125rem',
                          padding: '0.5rem 0.75rem',
                          backgroundColor: 'var(--keu-bg-primary)',
                          borderRadius: 'var(--keu-radius-sm)',
                          display: 'flex',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span style={{ color: 'var(--keu-text-muted)' }}>{item.deskripsi}</span>
                        <span style={{ fontWeight: 600 }}>{formatCurrency(item.nilai)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
