import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, CheckCircle2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { formatCurrency } from '../utils/formatting';

const CATEGORY_GUIDANCE = {
  tanah_dan_bangunan: {
    label: 'Tanah dan Bangunan',
    tips: ['Cari di halaman I (Aset) bagian A', 'Heading: "TANAH DAN BANGUNAN" atau "A. TANAH"', 'Nilai biasanya di baris setelah heading']
  },
  alat_transportasi_dan_mesin: {
    label: 'Alat Transportasi dan Mesin',
    tips: ['Cari di halaman I (Aset) bagian B', 'Heading: "ALAT TRANSPORTASI DAN MESIN" atau "B. ALAT TRANSPORTASI"', 'Termasuk kendaraan, mesin, peralatan']
  },
  harta_bergerak_lainnya: {
    label: 'Harta Bergerak Lainnya',
    tips: ['Cari di halaman I (Aset) bagian C', 'Heading: "HARTA BERGERAK LAINNYA" atau "C. HARTA BERGERAK"', 'Termasuk perhiasan, seni,收藏品']
  },
  surat_berharga: {
    label: 'Surat Berharga',
    tips: ['Cari di halaman I (Aset) bagian D', 'Heading: "SURAT BERHARGA" atau "D. SURAT BERHARGA"', 'Termasuk saham, obligasi, reksadana']
  },
  kas_dan_setara_kas: {
    label: 'Kas dan Setara Kas',
    tips: ['Cari di halaman I (Aset) bagian E', 'Heading: "KAS DAN SETARA KAS" atau "E. KAS"', 'Termasuk uang tunai, saldo bank']
  },
  harta_lainnya: {
    label: 'Harta Lainnya',
    tips: ['Cari di halaman I (Aset) bagian F', 'Heading: "HARTA LAINNYA" atau "F. HARTA LAINNYA"', 'Aset lain yang tidak masuk kategori']
  },
  subtotal_harta: {
    label: 'Subtotal Harta',
    tips: ['Cari di halaman I (Aset) bagian akhir', 'Heading: "Sub Total Harta"', 'Harus sama dengan jumlah 6 kategori di atas']
  },
  hutang: {
    label: 'Hutang',
    tips: ['Cari di halaman II (Hutang)', 'Heading: "III. HUTANG"', 'Nilai bisa "Rp. ----" untuk nihil']
  },
  total_harta_kekayaan: {
    label: 'Total Harta Kekayaan',
    tips: ['Cari di halaman II (Hutang) bagian akhir', 'Heading: "IV. TOTAL HARTA KEKAYAAN"', 'Rumus: Subtotal Harta - Hutang']
  }
};

export function LHKPNDetail({ categoryDetails, itemized, identity }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showRawLines, setShowRawLines] = useState({});

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

  const toggleRawLines = (key) => {
    setShowRawLines(prev => ({ ...prev, [key]: !prev[key] }));
  };

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

          {/* Categories Table with Raw Lines Toggle */}
          <div className="keu-table-container">
            <table className="keu-table">
              <thead>
                <tr>
                  <th>Kategori LHKPN</th>
                  <th>Nilai Terdaftar</th>
                  <th>Teks Mentah PDF</th>
                  <th>Baris Konteks</th>
                  <th>Tingkat Kepercayaan</th>
                  <th>Tips</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(({ key, title }) => {
                  const detail = categoryDetails?.[key] || {};
                  const isZero = detail.isZero;
                  const val = detail.value;
                  const hasRawLines = detail.contextLines && detail.contextLines.length > 0;
                  const guidance = CATEGORY_GUIDANCE[key];

                  return (
                    <tr key={key}>
                      <td style={{ fontWeight: 600, maxWidth: '200px' }}>
                        <div>{title}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--keu-text-muted)', fontWeight: 400 }}>
                          {guidance?.label}
                        </div>
                      </td>
                      <td style={{ fontWeight: 700, color: isZero ? 'var(--keu-text-muted)' : 'var(--keu-text-main)' }}>
                        {val !== null && val !== undefined ? formatCurrency(val) : 'Tidak Terbaca'}
                      </td>
                      <td style={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: 'var(--keu-text-muted)', maxWidth: '180px' }}>
                        {detail.rawText || (isZero ? 'Rp. ----' : '-')}
                      </td>
                      <td>
                        {hasRawLines ? (
                          <button
                            className="keu-btn keu-btn-outline keu-btn-xs"
                            onClick={(e) => { e.stopPropagation(); toggleRawLines(key); }}
                            style={{ fontSize: '0.6875rem', padding: '0.25rem 0.5rem' }}
                          >
                            {showRawLines[key] ? <><EyeOff size={12} /> Sembunyikan</> : <><Eye size={12} /> Lihat Baris</>}
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--keu-text-dim)' }}>-</span>
                        )}
                        {showRawLines[key] && hasRawLines && (
                          <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: 'var(--keu-bg-primary)', borderRadius: 'var(--keu-radius-sm)', fontSize: '0.75rem', fontFamily: 'monospace', maxHeight: '150px', overflowY: 'auto' }}>
                            {detail.contextLines.map((line, idx) => (
                              <div key={idx} style={{ padding: '0.125rem 0', borderBottom: idx < detail.contextLines.length - 1 ? '1px solid var(--keu-border-subtle)' : 'none' }}>
                                {line}
                              </div>
                            ))}
                          </div>
                        )}
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
                      <td style={{ fontSize: '0.75rem', color: 'var(--keu-text-muted)', maxWidth: '200px' }}>
                        {guidance?.tips.slice(0, 2).map((tip, idx) => (
                          <div key={idx} style={{ marginBottom: '0.25rem' }}>• {tip}</div>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Extraction Guidance Box */}
          <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: 'rgba(59, 130, 246, 0.05)', borderRadius: 'var(--keu-radius-md)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <h4 style={{ fontSize: '0.875rem', color: '#3b82f6', marginBottom: '0.75rem', fontWeight: 600 }}>
              💡 PETUNJUK EKSTRAKSI MANUAL:
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', fontSize: '0.8125rem' }}>
              {Object.entries(CATEGORY_GUIDANCE).map(([key, info]) => {
                const detail = categoryDetails?.[key];
                const needsAttention = detail?.value === null || detail?.confidence === 'low';
                if (!needsAttention) return null;
                return (
                  <div key={key} style={{ padding: '0.75rem', backgroundColor: 'var(--keu-bg-primary)', borderRadius: 'var(--keu-radius-sm)', border: '1px solid rgba(248, 113, 113, 0.3)' }}>
                    <div style={{ fontWeight: 600, color: '#f87171', marginBottom: '0.375rem' }}>{info.label}</div>
                    {info.tips.map((tip, idx) => (
                      <div key={idx} style={{ color: 'var(--keu-text-muted)', marginBottom: '0.25rem' }}>• {tip}</div>
                    ))}
                  </div>
                );
              })}
            </div>
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
