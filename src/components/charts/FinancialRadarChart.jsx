import React from 'react';
import { Radar } from 'react-chartjs-2';
import { Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js';
import { formatPercent } from '../../utils/formatting';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export function FinancialRadarChart({ metrics }) {
  if (!metrics || metrics.length === 0) return null;

  const validMetrics = metrics.filter(m => m.ratio !== null && m.ratio !== undefined);
  if (validMetrics.length === 0) return null;

  // Normalize metrics to 0-100 scale for radar
  const normalizeMetric = (metric) => {
    const ratio = metric.ratio || 0;
    const pct = ratio * 100;
    
    switch (metric.key) {
      case 'dar':
        // Lower DAR is better (inverse)
        return Math.max(0, 100 - pct);
      case 'car':
        // Optimal range 5-15%
        if (pct < 5) return (pct / 5) * 50;
        if (pct <= 15) return 50 + ((pct - 5) / 10) * 50;
        return Math.max(0, 100 - (pct - 15));
      case 'property':
        // Optimal range 40-60%
        if (pct < 40) return (pct / 40) * 50;
        if (pct <= 60) return 50 + ((pct - 40) / 20) * 50;
        return Math.max(0, 100 - ((pct - 60) / 20) * 50);
      case 'depreciating':
        // Lower is better
        return Math.max(0, 100 - pct);
      case 'productive':
        // Higher is better
        return Math.min(100, pct);
      default:
        return pct;
    }
  };

  const data = {
    labels: validMetrics.map(m => m.name.replace(/ \(.*?\)/, '')),
    datasets: [
      {
        label: 'Skor Finansial',
        data: validMetrics.map(normalizeMetric),
        backgroundColor: 'rgba(99, 102, 241, 0.25)',
        borderColor: '#6366f1',
        borderWidth: 0,
        pointBackgroundColor: '#6366f1',
        pointBorderColor: 'transparent',
        pointBorderWidth: 0,
        pointRadius: 4,
        pointHoverRadius: 6
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'top',
        labels: {
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
            const index = context.dataIndex;
            const metric = validMetrics[index];
            return `${metric.name}: ${formatPercent(metric.ratio || 0)}`;
          }
        }
      }
    },
    scales: {
      r: {
        beginAtZero: true,
        max: 100,
        angleLines: {
          color: 'var(--keu-border-subtle)'
        },
        grid: {
          color: 'var(--keu-border-subtle)'
        },
        pointLabels: {
          font: {
            size: 10,
            weight: '500'
          },
          color: 'var(--keu-text-main)'
        },
        ticks: {
          stepSize: 20,
          backdropColor: 'transparent',
          font: {
            size: 9
          },
          color: 'var(--keu-text-dim)'
        }
      }
    }
  };

  return (
    <div style={{ height: '320px', width: '100%', display: 'flex', justifyContent: 'center' }}>
      <Radar data={data} options={options} />
    </div>
  );
}

export default FinancialRadarChart;
