import React, { useState, useMemo } from 'react';
import { Search, Filter, ArrowUpDown, Eye, FileSpreadsheet, X } from 'lucide-react';
import { formatCurrency, formatPercent } from '../utils/formatting';
import { runFinancialDiagnosis } from '../engine/financialEngine';
import { FinancialDiagnosis } from './FinancialDiagnosis';

export function BatchSummaryTable({ batchData, onResetBatch }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLembaga, setSelectedLembaga] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [sortField, setSortField] = useState('total_harta_kekayaan');
  const [sortAsc, setSortAsc] = useState(false);
  const [activeDetailRecord, setActiveDetailRecord] = useState(null);

  // Compute diagnosis for each batch record
  const processedRecords = useMemo(() => {
    return batchData.map((item) => {
      const diag = runFinancialDiagnosis(item);
      const darMetric = diag.metrics.find((m) => m.key === 'dar');
      const carMetric = diag.metrics.find((m) => m.key === 'car');
      const propMetric = diag.metrics.find((m) => m.key === 'property');
      const depMetric = diag.metrics.find((m) => m.key === 'depreciating');
      const prodMetric = diag.metrics.find((m) => m.key === 'productive');

      return {
        rawItem: item,
        diagnosis: diag,
        nama: item.identity?.nama || 'Unknown',
        jabatan: item.identity?.jabatan || '-',
        lembaga: item.identity?.lembaga || '-',
        tahun: item.identity?.tahun_laporan || '-',
        total_harta_kekayaan: item.assets?.total_harta_kekayaan || 0,
        subtotal_harta: item.assets?.subtotal_harta || 0,
        darRatio: darMetric?.ratio ?? null,
        carRatio: carMetric?.ratio ?? null,
        propRatio: propMetric?.ratio ?? null,
        depRatio: depMetric?.ratio ?? null,
        prodRatio: prodMetric?.ratio ?? null,
        overallStatus: diag.overallStatus
      };
    });
  }, [batchData]);

  // Extract unique institutions & status list for filter dropdowns
  const uniqueLembagaList = useMemo(() => {
    const list = processedRecords.map((r) => r.lembaga).filter(Boolean);
    return Array.from(new Set(list));
  }, [processedRecords]);

  const uniqueStatusList = useMemo(() => {
    const list = processedRecords.map((r) => r.overallStatus).filter(Boolean);
    return Array.from(new Set(list));
  }, [processedRecords]);

  // Filtering & Sorting logic
  const filteredRecords = useMemo(() => {
    return processedRecords
      .filter((rec) => {
        const query = searchQuery.toLowerCase();
        const matchesQuery =
          !query ||
          rec.nama.toLowerCase().includes(query) ||
          rec.jabatan.toLowerCase().includes(query) ||
          rec.lembaga.toLowerCase().includes(query);

        const matchesLembaga = selectedLembaga === 'ALL' || rec.lembaga === selectedLembaga;
        const matchesStatus = selectedStatus === 'ALL' || rec.overallStatus === selectedStatus;

        return matchesQuery && matchesLembaga && matchesStatus;
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (valA === null || valA === undefined) valA = -999999999;
        if (valB === null || valB === undefined) valB = -999999999;

        if (typeof valA === 'string') {
          return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return sortAsc ? valA - valB : valB - valA;
      });
  }, [processedRecords, searchQuery, selectedLembaga, selectedStatus, sortField, sortAsc]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Komposisi Sehat': return 'keu-badge-success';
      case 'Perlu Perhatian': return 'keu-badge-danger';
      case 'Konsentrasi Tinggi': return 'keu-badge-warning';
      case 'Likuiditas Rendah': return 'keu-badge-warning';
      case 'Aset Produktif Rendah': return 'keu-badge-info';
      default: return 'keu-badge-neutral';
    }
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Batch Header Bar */}
      <div className="keu-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <h2 className="keu-card-title">
              <FileSpreadsheet size={22} color="#60a5fa" />
              Ringkasan Analisis Batch LHKPN ({processedRecords.length} Dokumen)
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--keu-text-muted)', marginTop: '0.25rem' }}>
              Perbandingan rasio finansial terstruktur antar Penyelenggara Negara.
            </p>
          </div>
          <button className="keu-btn keu-btn-outline keu-btn-sm" onClick={onResetBatch}>
            Upload Dokumen Lain
          </button>
        </div>

        {/* Toolbar: Search & Filter Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.875rem', marginTop: '1.25rem' }}>
          {/* Search Input */}
          <div style={{ position: 'relative' }}>
            <Search size={16} color="var(--keu-text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="keu-input"
              style={{ paddingLeft: '2.25rem' }}
              placeholder="Cari nama, jabatan, instansi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Institution Filter */}
          <select
            className="keu-select"
            value={selectedLembaga}
            onChange={(e) => setSelectedLembaga(e.target.value)}
          >
            <option value="ALL">Semua Lembaga / Instansi</option>
            {uniqueLembagaList.map((lem, idx) => (
              <option key={idx} value={lem}>{lem}</option>
            ))}
          </select>

          {/* Diagnosis Status Filter */}
          <select
            className="keu-select"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="ALL">Semua Status Diagnosis</option>
            {uniqueStatusList.map((st, idx) => (
              <option key={idx} value={st}>{st}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Batch Data Table */}
      <div className="keu-table-container">
        <table className="keu-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => handleSort('nama')}>
                Nama / PN <ArrowUpDown size={12} style={{ marginLeft: '4px' }} />
              </th>
              <th className="sortable" onClick={() => handleSort('lembaga')}>
                Jabatan & Lembaga <ArrowUpDown size={12} style={{ marginLeft: '4px' }} />
              </th>
              <th className="sortable" onClick={() => handleSort('tahun')}>
                Tahun
              </th>
              <th className="sortable" style={{ textAlign: 'right' }} onClick={() => handleSort('total_harta_kekayaan')}>
                Total Harta <ArrowUpDown size={12} style={{ marginLeft: '4px' }} />
              </th>
              <th className="sortable" style={{ textAlign: 'right' }} onClick={() => handleSort('darRatio')}>
                DAR (Utang)
              </th>
              <th className="sortable" style={{ textAlign: 'right' }} onClick={() => handleSort('carRatio')}>
                Cash Ratio
              </th>
              <th className="sortable" style={{ textAlign: 'right' }} onClick={() => handleSort('propRatio')}>
                Properti
              </th>
              <th className="sortable" style={{ textAlign: 'right' }} onClick={() => handleSort('depRatio')}>
                Depresiasi
              </th>
              <th className="sortable" style={{ textAlign: 'right' }} onClick={() => handleSort('prodRatio')}>
                Produktif
              </th>
              <th>Profil Portofolio</th>
              <th>Status Diagnosis</th>
              <th style={{ textAlign: 'center' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ textAlign: 'center', padding: '2rem', color: 'var(--keu-text-muted)' }}>
                  Tidak ada dokumen LHKPN yang cocok dengan kriteria pencarian/filter.
                </td>
              </tr>
            ) : (
              filteredRecords.map((rec, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: 600 }}>{rec.nama}</td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--keu-text-muted)' }}>
                    <div>{rec.jabatan}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--keu-text-dim)' }}>{rec.lembaga}</div>
                  </td>
                  <td>{rec.tahun}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#3b82f6' }}>
                    {formatCurrency(rec.total_harta_kekayaan, true)}
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatPercent(rec.darRatio)}</td>
                  <td style={{ textAlign: 'right' }}>{formatPercent(rec.carRatio)}</td>
                  <td style={{ textAlign: 'right' }}>{formatPercent(rec.propRatio)}</td>
                  <td style={{ textAlign: 'right' }}>{formatPercent(rec.depRatio)}</td>
                  <td style={{ textAlign: 'right' }}>{formatPercent(rec.prodRatio)}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.2rem 0.625rem', borderRadius: 'var(--keu-radius-full)', fontSize: '0.75rem', fontWeight: 600, backgroundColor: `${rec.diagnosis.portfolioProfile.color}20`, color: rec.diagnosis.portfolioProfile.color }}>
                      {rec.diagnosis.portfolioProfile.label}
                    </span>
                  </td>
                  <td>
                    <span className={`keu-badge ${getStatusBadge(rec.overallStatus)}`}>
                      {rec.overallStatus}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="keu-btn keu-btn-primary keu-btn-sm"
                      onClick={() => setActiveDetailRecord(rec.rawItem)}
                    >
                      <Eye size={14} />
                      Lihat Detail
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* DETAIL MODAL OVERLAY FOR BATCH RECORD */}
      {activeDetailRecord && (
        <div className="keu-modal-backdrop" onClick={() => setActiveDetailRecord(null)}>
          <div
            className="keu-modal-container"
            style={{ maxWidth: '1100px', padding: '1.5rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--keu-border-subtle)', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                Diagnosis Finansial Detail — {activeDetailRecord.identity?.nama}
              </h3>
              <button
                className="keu-btn keu-btn-outline keu-btn-sm"
                onClick={() => setActiveDetailRecord(null)}
              >
                <X size={18} /> Tutup
              </button>
            </div>

            {/* Render shared reusable FinancialDiagnosis component */}
            <FinancialDiagnosis extractedData={activeDetailRecord} />
          </div>
        </div>
      )}
    </div>
  );
}
