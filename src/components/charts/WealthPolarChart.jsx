import React from 'react';
import { PolarArea } from 'react-chartjs-2';
import { Chart as ChartJS, RadialLinearScale, ArcElement, Tooltip, Legend } from 'chart.js';
import { formatCurrency } from '../../utils/formatting';

ChartJS.register(RadialLinearScale, ArcElement, Tooltip, Legend);

export function WealthPolarChart({ assets }) {
  const {
    tanah_dan_bangunan = 0,
    kas_dan_setara_kas = 0,
    surat_berharga = 0,
    subtotal_harta = 0,
    hutang = 0
  } = assets || {};

  const netWealth = subtotal_harta - hutang;

  const data = {
    labels: ['Harta Produktif', 'Harta Likuid', 'Harta Investasi', 'Harta Lainnya'],
    datasets: [{
      data: [
        tanah_dan_bangunan,
        kas_dan_setara_kas,
        surat_berharga,
        subtotal_harta - tanah_dan_bangunan - kas_dan_setara_kas - surat_berharga
      ],
      backgroundColor: [
        'rgba(16, 185, 129, 0.75)',
        'rgba(6, 182, 212, 0.75)',
        'rgba(99, 102, 241, 0.75)',
        'rgba(139, 92, 246, 0.75)'
      ],
      borderWidth: 0
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          padding: 15,
          usePointStyle: true,
          pointStyleWidth: 10,
          font: {
            size: 11
          }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const label = context.label || '';
            const value = context.parsed.r || 0;
            return `${label}: ${formatCurrency(value)}`;
          }
        }
      }
    },
    scales: {
      r: {
        beginAtZero: true,
        ticks: {
          display: false
        },
        grid: {
          color: 'var(--keu-border-subtle)'
        },
        angleLines: {
          color: 'var(--keu-border-subtle)'
        },
        pointLabels: {
          font: {
            size: 10,
            weight: '500'
          },
          color: 'var(--keu-text-main)'
        }
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      <PolarArea data={data} options={options} width={280} height={280} />
      <div style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--keu-text-muted)' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: netWealth >= 0 ? '#10b981' : '#ef4444', marginTop: '0.5rem' }}>
          {formatCurrency(netWealth)}
        </div>
        <div>Nilai Bersih</div>
      </div>
    </div>
  );
}

export default WealthPolarChart;
