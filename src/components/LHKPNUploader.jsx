import React, { useState, useRef } from 'react';
import { UploadCloud, File, Trash2, AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-react';

export function LHKPNUploader({ isBatchMode, onProcessFiles, onLoadSampleData }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const validateAndAddFiles = (filesList) => {
    setErrorMessage('');
    const newPdfFiles = [];
    let invalidCount = 0;

    Array.from(filesList).forEach((file) => {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        newPdfFiles.push(file);
      } else {
        invalidCount++;
      }
    });

    if (invalidCount > 0) {
      setErrorMessage(`Sebanyak ${invalidCount} file diabaikan karena bukan format PDF.`);
    }

    if (newPdfFiles.length === 0) return;

    if (isBatchMode) {
      setSelectedFiles((prev) => [...prev, ...newPdfFiles]);
    } else {
      setSelectedFiles([newPdfFiles[0]]); // single mode only takes 1 file
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files);
    }
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (selectedFiles.length > 0) {
      onProcessFiles(selectedFiles);
    }
  };

  return (
    <div className="keu-card" style={{ maxWidth: '800px', margin: '2rem auto' }}>
      <div className="keu-card-header">
        <h2 className="keu-card-title">
          <UploadCloud size={22} color="#60a5fa" />
          {isBatchMode ? 'Upload Batch Dokumen LHKPN' : 'Upload Dokumen LHKPN'}
        </h2>
        <span className="keu-badge keu-badge-info">Format PDF Resmi KPK</span>
      </div>

      <p style={{ color: 'var(--keu-text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        {isBatchMode
          ? 'Unggah beberapa file PDF LHKPN sekaligus untuk membandingkan rasio dan struktur kekayaan secara langsung.'
          : 'Unggah 1 file PDF LHKPN untuk mengekstraksi data dan menghasilkan laporan Diagnosis Finansial lengkap.'}
      </p>

      {/* Drag & Drop Target */}
      <div
        className={`keu-uploader-dropzone ${isDragOver ? 'drag-active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,application/pdf"
          multiple={isBatchMode}
          style={{ display: 'none' }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'rgba(37, 99, 235, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3b82f6'
            }}
          >
            <UploadCloud size={30} />
          </div>
          <div>
            <span style={{ fontWeight: 600, color: 'var(--keu-text-main)' }}>Klik untuk memilih file</span>
            <span style={{ color: 'var(--keu-text-muted)' }}> atau seret file PDF ke area ini</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--keu-text-dim)' }}>
            Hanya mendukung dokumen .PDF (Maksimal 25MB / file)
          </span>
        </div>
      </div>

      {errorMessage && (
        <div className="keu-alert keu-alert-warning" style={{ marginTop: '1rem' }}>
          <AlertTriangle size={18} />
          <div>{errorMessage}</div>
        </div>
      )}

      {/* Selected File Queue List */}
      {selectedFiles.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h4 style={{ fontSize: '0.875rem', color: 'var(--keu-text-muted)', marginBottom: '0.75rem' }}>
            File Terpilih ({selectedFiles.length}):
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {selectedFiles.map((file, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--keu-bg-primary)',
                  border: '1px solid var(--keu-border-subtle)',
                  borderRadius: 'var(--keu-radius-md)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                  <File size={18} color="#60a5fa" />
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>{file.name}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--keu-text-muted)' }}>
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="keu-btn keu-btn-danger keu-btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFile(idx);
                  }}
                  title="Hapus file"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              className="keu-btn keu-btn-secondary"
              onClick={() => setSelectedFiles([])}
            >
              Kosongkan
            </button>
            <button
              type="button"
              className="keu-btn keu-btn-primary"
              onClick={handleSubmit}
            >
              <CheckCircle2 size={16} />
              Mulai Diagnosis ({selectedFiles.length} File)
            </button>
          </div>
        </div>
      )}

      {/* Quick Sample Trigger Banner */}
      <div
        style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          borderRadius: 'var(--keu-radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Sparkles size={20} color="#f59e0b" />
          <div style={{ fontSize: '0.8125rem' }}>
            <span style={{ fontWeight: 600, color: '#fbbf24' }}>Ingin langsung mencoba tanpa file PDF?</span>
            <p style={{ color: 'var(--keu-text-muted)' }}>Muat contoh data simulasi LHKPN KPK asli untuk pengujian.</p>
          </div>
        </div>
        <button
          type="button"
          className="keu-btn keu-btn-outline keu-btn-sm"
          onClick={onLoadSampleData}
        >
          Muat Contoh
        </button>
      </div>
    </div>
  );
}
