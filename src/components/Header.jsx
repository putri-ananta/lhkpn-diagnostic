import React from 'react';
import { FileText, Layers, Sparkles } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

export function Header({ activeTab, setActiveTab, onLoadSampleData, theme, onThemeChange }) {
  return (
    <header className="keu-header">
      <div className="keu-header-inner">
        <div className="keu-logo-group">
          <div className="keu-logo-icon">
            <FileText size={20} />
          </div>
          <div>
            <h1 className="keu-logo-title">LHKPN Financial Diagnosis</h1>
            <p className="keu-logo-sub">Danarakca Financial Analytics System</p>
          </div>
        </div>

        <div className="keu-nav-tabs">
          <button
            className={`keu-tab-btn ${activeTab === 'single' ? 'active' : ''}`}
            onClick={() => setActiveTab('single')}
          >
            <FileText size={16} />
            Satu File
          </button>
          <button
            className={`keu-tab-btn ${activeTab === 'batch' ? 'active' : ''}`}
            onClick={() => setActiveTab('batch')}
          >
            <Layers size={16} />
            Batch Upload
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
          <button
            className="keu-btn keu-btn-outline keu-btn-sm"
            onClick={onLoadSampleData}
            title="Muat data sampel LHKPN untuk pengujian langsung"
          >
            <Sparkles size={14} color="#f59e0b" />
            Muat Contoh Data
          </button>
        </div>
      </div>
    </header>
  );
}
