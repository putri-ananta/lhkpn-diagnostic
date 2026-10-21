import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, FileSearch, Loader2 } from 'lucide-react';

export function ParsingProgress({
  currentFileName = 'LHKPN.pdf',
  completedFiles = 0,
  totalFiles = 1,
  fileStatuses = []
}) {
  const safeTotal = Math.max(1, totalFiles);
  const progress = Math.min(100, Math.round((completedFiles / safeTotal) * 100));

  return (
    <div className="keu-card" style={{ maxWidth: '720px', margin: '3rem auto' }} aria-live="polite">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(37, 99, 235, 0.15)', display: 'grid', placeItems: 'center', color: '#60a5fa', flexShrink: 0 }}>
          <Loader2 size={27} className="animate-spin" />
        </div>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 750 }}>Memproses Dokumen LHKPN</h2>
          <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Sedang membaca: <strong style={{ color: 'var(--keu-text-main)' }}>{currentFileName}</strong>
          </p>
        </div>
      </div>

      <div style={{ height: 9, borderRadius: 999, overflow: 'hidden', background: 'var(--keu-bg-primary)' }}>
        <div style={{ height: '100%', width: `${Math.max(5, progress)}%`, background: 'linear-gradient(90deg, #2563eb, #0d9488)', transition: 'width 180ms ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.45rem', fontSize: '0.78rem', color: 'var(--keu-text-muted)' }}>
        <span>{completedFiles} dari {totalFiles} berkas selesai</span>
        <span>{progress}%</span>
      </div>

      {fileStatuses.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '1.4rem' }}>
          {fileStatuses.map((item) => (
            <div key={item.id || item.name} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.65rem 0.8rem', background: 'var(--keu-bg-primary)', borderRadius: 'var(--keu-radius-md)', border: '1px solid var(--keu-border-subtle)' }}>
              {item.status === 'success' ? <CheckCircle2 size={17} color="#34d399" />
                : item.status === 'failed' ? <AlertTriangle size={17} color="#f87171" />
                  : item.status === 'warning' ? <AlertCircle size={17} color="#fbbf24" />
                  : item.status === 'processing' ? <Loader2 size={17} color="#60a5fa" className="animate-spin" />
                    : <FileSearch size={17} color="var(--keu-text-muted)" />}
              <span style={{ flex: 1, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
              <span className={`keu-badge ${item.status === 'success' ? 'keu-badge-success' : item.status === 'failed' ? 'keu-badge-danger' : item.status === 'warning' ? 'keu-badge-warning' : 'keu-badge-info'}`}>
                {item.status === 'success' ? 'Selesai' : item.status === 'failed' ? 'Gagal' : item.status === 'warning' ? 'Perlu ditinjau' : item.status === 'processing' ? 'Diproses' : 'Menunggu'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
