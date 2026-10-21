import React from 'react';
import { ArrowRight, FileSearch, Files } from 'lucide-react';

const workflows = [
  {
    id: 'single',
    title: 'Cek Satu LHKPN',
    description:
      'Unggah satu dokumen LHKPN untuk melihat kondisi dan diagnosis keuangan secara menyeluruh.',
    buttonLabel: 'Mulai Cek Satu LHKPN',
    Icon: FileSearch,
    accent: 'var(--keu-brand-light)',
    iconBackground: 'var(--keu-status-info-bg)',
    iconBorder: 'var(--keu-status-info-border)'
  },
  {
    id: 'batch',
    title: 'Cek Beberapa LHKPN',
    description:
      'Unggah beberapa dokumen LHKPN untuk analisis kolektif dan perbandingan perkembangan kekayaan antar tahun.',
    buttonLabel: 'Mulai Cek Beberapa LHKPN',
    Icon: Files,
    accent: 'var(--keu-accent-teal)',
    iconBackground: 'var(--keu-status-success-bg)',
    iconBorder: 'var(--keu-status-success-border)'
  }
];

export function WorkflowLanding({ onSelectWorkflow = () => {} }) {
  return (
    <section
      aria-labelledby="workflow-landing-title"
      style={{
        width: '100%',
        maxWidth: '960px',
        margin: 'clamp(2rem, 8vh, 5rem) auto',
        padding: '0 0.25rem'
      }}
    >
      <header
        style={{
          maxWidth: '680px',
          margin: '0 auto clamp(1.75rem, 4vw, 2.5rem)',
          textAlign: 'center'
        }}
      >
        <span
          className="keu-badge keu-badge-info"
          style={{ marginBottom: '1rem' }}
        >
          Analisis LHKPN
        </span>
        <h2
          id="workflow-landing-title"
          style={{
            color: 'var(--keu-text-main)',
            fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
            lineHeight: 1.15,
            letterSpacing: '-0.035em',
            marginBottom: '0.875rem'
          }}
        >
          Pilih jenis pemeriksaan
        </h2>
        <p
          style={{
            color: 'var(--keu-text-muted)',
            fontSize: 'clamp(0.95rem, 2vw, 1.05rem)',
            lineHeight: 1.7
          }}
        >
          Analisis satu dokumen secara mendalam atau bandingkan beberapa dokumen dalam satu alur pemeriksaan.
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
          gap: 'clamp(1rem, 3vw, 1.5rem)',
          alignItems: 'stretch'
        }}
      >
        {workflows.map(({ id, title, description, buttonLabel, Icon, accent, iconBackground, iconBorder }) => (
          <article
            key={id}
            className="keu-card"
            aria-labelledby={`workflow-${id}-title`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: '300px',
              padding: 'clamp(1.5rem, 4vw, 2rem)'
            }}
          >
            <div
              aria-hidden="true"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '58px',
                height: '58px',
                marginBottom: '1.5rem',
                color: accent,
                backgroundColor: iconBackground,
                border: `1px solid ${iconBorder}`,
                borderRadius: 'var(--keu-radius-lg)'
              }}
            >
              <Icon size={28} strokeWidth={1.8} />
            </div>

            <h3
              id={`workflow-${id}-title`}
              style={{
                color: 'var(--keu-text-main)',
                fontSize: '1.25rem',
                lineHeight: 1.3,
                marginBottom: '0.75rem'
              }}
            >
              {title}
            </h3>
            <p
              style={{
                color: 'var(--keu-text-muted)',
                fontSize: '0.925rem',
                lineHeight: 1.65,
                marginBottom: '1.75rem'
              }}
            >
              {description}
            </p>

            <button
              type="button"
              className="keu-btn keu-btn-primary"
              onClick={() => onSelectWorkflow(id)}
              aria-label={buttonLabel}
              style={{ width: '100%', marginTop: 'auto' }}
            >
              {buttonLabel}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
