import React from 'react';
import { FileText, Home, Sparkles } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

export function Header({ onHome, showHomeAction = true, onLoadSampleData, showSampleAction = false, theme, onThemeChange }) {
  return (
    <header className="keu-header">
      <div className="keu-header-inner">
        <div className="keu-logo-group">
          <div className="keu-logo-icon">
            <FileText size={20} />
          </div>
          <div>
            <h1 className="keu-logo-title">LHKPN Analyzer</h1>
            <p className="keu-logo-sub">Analisis Finansial Dokumen LHKPN</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {showHomeAction && (
            <button
              type="button"
              className="keu-btn keu-btn-outline keu-btn-sm"
              onClick={onHome}
              title="Kembali ke pilihan analisis"
            >
              <Home size={15} />
              Beranda
            </button>
          )}
          <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
          {showSampleAction && (
            <button
              type="button"
              className="keu-btn keu-btn-outline keu-btn-sm"
              onClick={onLoadSampleData}
              title="Muat data sampel LHKPN untuk pengujian langsung"
            >
              <Sparkles size={14} color="#f59e0b" />
              Muat Contoh
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
