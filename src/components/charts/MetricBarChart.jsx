import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { formatPercent } from '../../utils/formatting';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export function MetricBarChart({ metrics }) {
  if (!metrics || metrics.length === 0) return null;

  const validMetrics = metrics.filter(m => m.ratio !== null && m.ratio !== undefined);
  if (validMetrics.length === 0) return null;

  const data = {
    labels: validMetrics.map(m => m.name.replace(/ \(.*?\)/, '')),
    datasets: [
      {
        label: 'Nilai Saat Ini',
        data: validMetrics.map(m => Math.round((m.ratio || 0) * 100)),
        backgroundColor: validMetrics.map(m => {
          switch (m.statusCategory) {
            case 'success': return '#10b981';
            case 'warning': return '#f59e0b';
            case 'danger': return '#ef4444';
            case 'info': return '#6366f1';
            default: return '#94a3b8';
          }
        }),
        borderRadius: 8,
        borderSkipped: false,
        borderWidth: 0
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          usePointStyle: true,
          pointStyleWidth: 8,
          font: {
            size: 11
          },
          padding: 12
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            return `Nilai: ${formatPercent(context.parsed.y / 100)}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 10
          },
          maxRotation: 45,
          minRotation: 45,
          color: 'var(--keu-text-muted)'
        }
      },
      y: {
        beginAtZero: true,
        max: 100,
        grid: {
          color: 'var(--keu-border-subtle)'
        },
        ticks: {
          callback: function(value) {
            return formatPercent(value / 100);
          },
          font: {
            size: 10
          },
          color: 'var(--keu-text-muted)'
        }
      }
    }
  };

  return (
    <div style={{ height: '300px', width: '100%' }}>
      <Bar data={data} options={options} />
    </div>
  );
}

export default MetricBarChart;
