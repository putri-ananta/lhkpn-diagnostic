import React, { useState } from 'react';
import { Calculator, ShieldAlert, CheckCircle } from 'lucide-react';
import { formatCurrency } from '../utils/formatting';
import { calculatePersonalFinanceSimulation } from '../engine/financialEngine';

export function PersonalFinanceSimulation() {
  const [incomeStr, setIncomeStr] = useState('');
  const [expenditureStr, setExpenditureStr] = useState('');

  const parseNum = (str) => {
    const cleaned = str.replace(/[^0-9]/g, '');
    return cleaned ? parseInt(cleaned, 10) : null;
  };

  const incomeVal = parseNum(incomeStr);
  const expenditureVal = parseNum(expenditureStr);

  const simulation = calculatePersonalFinanceSimulation(incomeVal, expenditureVal);

  return (
    <div className="keu-card" style={{ marginTop: '1.5rem' }}>
      <div className="keu-card-header">
        <h3 className="keu-card-title">
          <Calculator size={20} color="#60a5fa" />
          Simulasi Keuangan Pribadi (Optional)
        </h3>
        <span className="keu-badge keu-badge-info">Perencanaan Finansial</span>
      </div>

      <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
        Dokumen LHKPN tidak mencakup arus kas bulanan. Masukkan estimasi pendapatan dan pengeluaran bulanan Anda untuk menghitung target FIRE, dana darurat, dan alokasi investasi.
      </p>

      {/* Input Fields */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="keu-field-group">
          <label className="keu-label">Pendapatan Bersih Bulanan (Rp)</label>
          <input
            type="text"
            className="keu-input"
            placeholder="Contoh: 20.000.000"
            value={incomeStr}
            onChange={(e) => setIncomeStr(e.target.value)}
          />
          {incomeVal && (
            <span style={{ fontSize: '0.75rem', color: '#60a5fa' }}>
              = {formatCurrency(incomeVal)} / bulan
            </span>
          )}
        </div>

        <div className="keu-field-group">
          <label className="keu-label">Pengeluaran Bulanan (Rp)</label>
          <input
            type="text"
            className="keu-input"
            placeholder="Contoh: 10.000.000"
            value={expenditureStr}
            onChange={(e) => setExpenditureStr(e.target.value)}
          />
          {expenditureVal && (
            <span style={{ fontSize: '0.75rem', color: '#60a5fa' }}>
              = {formatCurrency(expenditureVal)} / bulan
            </span>
          )}
        </div>
      </div>

      {/* Results Display */}
      {!simulation.hasInputs ? (
        <div className="keu-alert keu-alert-info">
          <ShieldAlert size={18} />
          <div>
            <strong>Memerlukan input pendapatan/pengeluaran bulanan.</strong> Masukkan nominal di atas untuk melihat angka simulasi perencanaan keuangan pribadi.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          {/* FIRE Target */}
          <div style={{ backgroundColor: 'var(--keu-bg-primary)', padding: '1rem', borderRadius: 'var(--keu-radius-md)', border: '1px solid var(--keu-border-subtle)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--keu-text-muted)', fontWeight: 600 }}>
              TARGET KEBEBASAN FINANSIAL (FIRE Target - 4% Rule)
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#34d399', marginTop: '0.25rem' }}>
              {simulation.fireTarget ? formatCurrency(simulation.fireTarget) : 'Memerlukan input pendapatan'}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--keu-text-dim)', marginTop: '0.25rem' }}>
              Format 300 × pendapatan bulanan (25× pendapatan tahunan).
            </p>
          </div>

          {/* Emergency Fund */}
          <div style={{ backgroundColor: 'var(--keu-bg-primary)', padding: '1rem', borderRadius: 'var(--keu-radius-md)', border: '1px solid var(--keu-border-subtle)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--keu-text-muted)', fontWeight: 600 }}>
              TARGET DANA DARURAT MINIMAL (3× Pengeluaran)
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fbbf24', marginTop: '0.25rem' }}>
              {simulation.emergencyFundTarget ? formatCurrency(simulation.emergencyFundTarget) : 'Memerlukan input pengeluaran'}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--keu-text-dim)', marginTop: '0.25rem' }}>
              Cadangan kas aman minimal 3 bulan pengeluaran rutin.
            </p>
          </div>

          {/* Min Monthly Investment */}
          <div style={{ backgroundColor: 'var(--keu-bg-primary)', padding: '1rem', borderRadius: 'var(--keu-radius-md)', border: '1px solid var(--keu-border-subtle)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--keu-text-muted)', fontWeight: 600 }}>
              INVESTASI BULANAN MINIMAL (15% Pendapatan)
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#60a5fa', marginTop: '0.25rem' }}>
              {simulation.minMonthlyInvestment ? formatCurrency(simulation.minMonthlyInvestment) : 'Memerlukan input pendapatan'}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--keu-text-dim)', marginTop: '0.25rem' }}>
              Alokasi ideal tabungan/investasi produktif setiap bulan.
            </p>
          </div>

          {/* Max Essential Spending */}
          <div style={{ backgroundColor: 'var(--keu-bg-primary)', padding: '1rem', borderRadius: 'var(--keu-radius-md)', border: '1px solid var(--keu-border-subtle)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--keu-text-muted)', fontWeight: 600 }}>
              BATAS PENGELUARAN POKOK MAX (65% Pendapatan)
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--keu-text-main)', marginTop: '0.25rem' }}>
              {simulation.maxEssentialSpending ? formatCurrency(simulation.maxEssentialSpending) : 'Memerlukan input pendapatan'}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--keu-text-dim)', marginTop: '0.25rem' }}>
              Batas pengeluaran kebutuhan dasar agar keuangan tetap seimbang.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
