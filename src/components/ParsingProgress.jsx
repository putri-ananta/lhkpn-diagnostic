import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, FileSearch, Calculator, PieChart } from 'lucide-react';

const STEPS = [
  { id: 1, label: 'Membaca dokumen PDF', icon: FileSearch },
  { id: 2, label: 'Mengekstrak data identitas & kategori LHKPN', icon: Loader2 },
  { id: 3, label: 'Menghitung 5 rasio finansial utama', icon: Calculator },
  { id: 4, label: 'Menyiapkan laporan Diagnosis Finansial', icon: PieChart }
];

export function ParsingProgress({ totalFiles = 1, currentFileName = 'LHKPN.pdf', onComplete }) {
  const [activeStep, setActiveStep] = useState(1);

  useEffect(() => {
    const timer1 = setTimeout(() => setActiveStep(2), 600);
    const timer2 = setTimeout(() => setActiveStep(3), 1200);
    const timer3 = setTimeout(() => setActiveStep(4), 1800);
    const timer4 = setTimeout(() => {
      if (onComplete) onComplete();
    }, 2400);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [onComplete]);

  return (
    <div className="keu-card" style={{ maxWidth: '640px', margin: '3rem auto', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(37, 99, 235, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#3b82f6'
          }}
        >
          <Loader2 size={32} className="animate-spin" />
        </div>
      </div>

      <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        Memproses Pemindaian Dokumen LHKPN
      </h3>
      <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.875rem', marginBottom: '2rem' }}>
        Dokumen: <span style={{ color: 'var(--keu-text-main)', fontWeight: 600 }}>{currentFileName}</span>
      </p>

      {/* Step Indicators */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', textAlign: 'left' }}>
        {STEPS.map((step) => {
          const isDone = activeStep > step.id;
          const isCurrent = activeStep === step.id;
          const Icon = step.icon;

          return (
            <div
              key={step.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--keu-radius-md)',
                backgroundColor: isCurrent ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                border: isCurrent ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                opacity: isDone || isCurrent ? 1 : 0.4,
                transition: 'all 0.3s ease'
              }}
            >
              {isDone ? (
                <CheckCircle2 size={20} color="#34d399" />
              ) : isCurrent ? (
                <Loader2 size={20} color="#60a5fa" className="animate-spin" />
              ) : (
                <Icon size={20} color="var(--keu-text-muted)" />
              )}
              <span style={{ fontSize: '0.875rem', fontWeight: isCurrent ? 600 : 400 }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
