import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { formatCurrency } from '../../utils/formatting';

ChartJS.register(ArcElement, Tooltip, Legend);

export function AssetDoughnutChart({ assets, size = 280 }) {
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

  const data = {
    labels: [
      'Tanah & Bangunan',
      'Transportasi & Mesin',
      'Harta Bergerak Lainnya',
      'Surat Berharga',
      'Kas & Setara Kas',
      'Harta Lainnya'
    ],
    datasets: [{
      data: [
        tanah_dan_bangunan,
        alat_transportasi_dan_mesin,
        harta_bergerak_lainnya,
        surat_berharga,
        kas_dan_setara_kas,
        harta_lainnya
      ],
      backgroundColor: [
        '#6366f1',
        '#f59e0b',
        '#ec4899',
        '#10b981',
        '#06b6d4',
        '#8b5cf6'
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
            const value = context.parsed || 0;
            const percentage = ((value / total) * 100).toFixed(1);
            return `${label}: ${formatCurrency(value)} (${percentage}%)`;
          }
        }
      }
    },
    cutout: '60%'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      <Doughnut data={data} options={options} width={size} height={size} />
      <div style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--keu-text-muted)' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--keu-text-main)' }}>
          {formatCurrency(subtotal_harta)}
        </div>
        <div>Total Harta</div>
      </div>
    </div>
  );
}

export default AssetDoughnutChart;
