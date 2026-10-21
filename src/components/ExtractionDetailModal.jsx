import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Landmark,
  PencilLine,
  Save,
  ShieldCheck,
  UserRound,
  X
} from 'lucide-react';
import { formatCurrency } from '../utils/formatting';

const IDENTITY_FIELDS = [
  { key: 'nama', label: 'Nama', required: true },
  { key: 'jabatan', label: 'Jabatan' },
  { key: 'lembaga', label: 'Instansi / Lembaga' },
  { key: 'unit_kerja', label: 'Unit Kerja' },
  { key: 'nhk', label: 'NHK' },
  { key: 'bidang', label: 'Bidang' },
  { key: 'tahun_laporan', label: 'Tahun LHKPN', inputMode: 'numeric' },
  { key: 'tanggal_penyampaian', label: 'Tanggal Pelaporan' },
  { key: 'jenis_laporan', label: 'Jenis Laporan' },
  { key: 'status_verifikasi', label: 'Status Verifikasi' }
];

const CATEGORY_KEYS = [
  'tanah_dan_bangunan',
  'alat_transportasi_dan_mesin',
  'harta_bergerak_lainnya',
  'surat_berharga',
  'kas_dan_setara_kas',
  'harta_lainnya'
];

const ASSET_FIELDS = [
  { key: 'tanah_dan_bangunan', label: 'A. Tanah dan Bangunan' },
  { key: 'alat_transportasi_dan_mesin', label: 'B. Alat Transportasi dan Mesin' },
  { key: 'harta_bergerak_lainnya', label: 'C. Harta Bergerak Lainnya' },
  { key: 'surat_berharga', label: 'D. Surat Berharga' },
  { key: 'kas_dan_setara_kas', label: 'E. Kas dan Setara Kas' },
  { key: 'harta_lainnya', label: 'F. Harta Lainnya' },
  { key: 'subtotal_harta', label: 'Subtotal Harta' },
  { key: 'hutang', label: 'Total Utang' },
  { key: 'total_harta_kekayaan', label: 'Kekayaan Bersih', allowNegative: true }
];

const panelStyle = {
  padding: '1rem',
  backgroundColor: 'var(--keu-bg-primary)',
  border: '1px solid var(--keu-border-subtle)',
  borderRadius: 'var(--keu-radius-md)'
};

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unwrapRecord(value) {
  return isObject(value?.extractedData) ? value.extractedData : (isObject(value) ? value : {});
}

function resolveRecord(record) {
  const fallback = unwrapRecord(record);
  const originalSource = unwrapRecord(record?.original || fallback.original || fallback);
  const effectiveSource = unwrapRecord(record?.effective || fallback.effective || fallback);

  const original = {
    ...originalSource,
    identity: { ...(originalSource.identity || {}) },
    assets: { ...(originalSource.assets || {}) }
  };

  const effective = {
    ...effectiveSource,
    identity: { ...original.identity, ...(effectiveSource.identity || {}) },
    assets: { ...original.assets, ...(effectiveSource.assets || {}) }
  };

  return {
    fallback,
    original,
    effective,
    categoryDetails:
      effectiveSource.categoryDetails ||
      originalSource.categoryDetails ||
      fallback.categoryDetails ||
      {},
    itemized:
      effectiveSource.itemized ||
      originalSource.itemized ||
      fallback.itemized ||
      null
  };
}

function identityValue(value) {
  return value === null || value === undefined ? '' : String(value);
}

function cleanIdentityValue(value) {
  const cleaned = String(value ?? '').trim();
  return cleaned === '' ? null : cleaned;
}

function assetInputValue(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

function parseMoneyInput(rawValue, allowNegative = false) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return { value: null, error: null };

  let cleaned = raw
    .replace(/^rp\s*\.?\s*/i, '')
    .replace(/\s+/g, '');

  if (!/^-?[\d.,]+$/.test(cleaned) || /[.,]{2,}/.test(cleaned)) {
    return { value: null, error: 'Masukkan nominal Rupiah yang valid.' };
  }

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');

  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else {
    const separator = lastComma >= 0 ? ',' : (lastDot >= 0 ? '.' : null);
    if (separator) {
      const pieces = cleaned.split(separator);
      const looksLikeThousands = pieces.length > 2 || (pieces.length === 2 && pieces[1].length === 3);
      cleaned = looksLikeThousands
        ? pieces.join('')
        : cleaned.replace(separator, '.');
    }
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
    return { value: null, error: 'Gunakan nominal Rupiah bulat dalam rentang yang valid.' };
  }
  if (!allowNegative && value < 0) {
    return { value: null, error: 'Nilai ini tidak boleh negatif.' };
  }

  return { value, error: null };
}

function normalizeAssetValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function makeDraft(effective) {
  return {
    identity: Object.fromEntries(
      IDENTITY_FIELDS.map(({ key }) => [key, identityValue(effective.identity?.[key])])
    ),
    assets: Object.fromEntries(
      ASSET_FIELDS.map(({ key }) => [key, assetInputValue(effective.assets?.[key])])
    )
  };
}

function getEditState(draft, effective) {
  const identity = {};
  const assets = {};
  const errors = {};
  const parsedAssets = {};
  let dirty = false;

  for (const field of IDENTITY_FIELDS) {
    const nextValue = cleanIdentityValue(draft.identity?.[field.key]);
    const currentValue = cleanIdentityValue(effective.identity?.[field.key]);
    const changed = nextValue !== currentValue;

    if (changed) {
      dirty = true;
      identity[field.key] = nextValue;
    }

    if (field.required && !nextValue) {
      errors[`identity.${field.key}`] = `${field.label} tidak boleh kosong.`;
    }
    if (changed && field.key === 'tahun_laporan' && nextValue && !/^(?:19|20)\d{2}$/.test(nextValue)) {
      errors[`identity.${field.key}`] = 'Tahun LHKPN harus berada pada rentang 1900–2099.';
    }
  }

  for (const field of ASSET_FIELDS) {
    const rawValue = draft.assets?.[field.key] ?? '';
    const result = parseMoneyInput(rawValue, field.allowNegative);
    const currentValue = normalizeAssetValue(effective.assets?.[field.key]);
    const rawChanged = assetInputValue(currentValue) !== String(rawValue).trim();

    parsedAssets[field.key] = result.value;

    if (result.error) {
      if (rawChanged) dirty = true;
      errors[`assets.${field.key}`] = result.error;
      continue;
    }

    if (result.value !== currentValue) {
      dirty = true;
      assets[field.key] = result.value;
    }
  }

  return { patch: { identity, assets }, errors, parsedAssets, dirty };
}

function valuesDiffer(left, right, type) {
  if (type === 'asset') return normalizeAssetValue(left) !== normalizeAssetValue(right);
  return cleanIdentityValue(left) !== cleanIdentityValue(right);
}

function getContradictionWarnings(assets) {
  const warnings = [];
  const categoryValues = CATEGORY_KEYS.map((key) => normalizeAssetValue(assets?.[key]));
  const subtotal = normalizeAssetValue(assets?.subtotal_harta);
  const debt = normalizeAssetValue(assets?.hutang);
  const netWorth = normalizeAssetValue(assets?.total_harta_kekayaan);

  if (categoryValues.every((value) => value !== null) && subtotal !== null) {
    const categorySum = categoryValues.reduce((sum, value) => sum + value, 0);
    if (Math.abs(categorySum - subtotal) > 1) {
      warnings.push(
        `Jumlah enam kategori adalah ${formatCurrency(categorySum)}, berbeda dari subtotal ${formatCurrency(subtotal)}.`
      );
    }
  }

  if (subtotal !== null && debt !== null && netWorth !== null) {
    const calculatedNetWorth = subtotal - debt;
    if (Math.abs(calculatedNetWorth - netWorth) > 1) {
      warnings.push(
        `Subtotal dikurangi utang adalah ${formatCurrency(calculatedNetWorth)}, berbeda dari kekayaan bersih ${formatCurrency(netWorth)}.`
      );
    }
  }

  return warnings;
}

function displayText(value, unavailable = 'Tidak tersedia') {
  return value === null || value === undefined || value === '' ? unavailable : String(value);
}

function displayMoney(value) {
  const normalized = normalizeAssetValue(value);
  return normalized === null ? 'Tidak tersedia' : formatCurrency(normalized);
}

function confidenceInfo(confidence) {
  switch (String(confidence || '').toLowerCase()) {
    case 'high':
    case 'tinggi':
      return { label: 'Tinggi', className: 'keu-badge-success', icon: CheckCircle2 };
    case 'medium':
    case 'sedang':
      return { label: 'Sedang', className: 'keu-badge-warning', icon: AlertTriangle };
    case 'low':
    case 'rendah':
      return { label: 'Rendah', className: 'keu-badge-danger', icon: AlertTriangle };
    default:
      return { label: 'Tidak tersedia', className: 'keu-badge-neutral', icon: FileSearch };
  }
}

function getItemGroups(itemized) {
  if (Array.isArray(itemized)) {
    return itemized.length > 0 ? [['rincian_harta', itemized]] : [];
  }
  if (!isObject(itemized)) return [];
  return Object.entries(itemized).filter(([, items]) => Array.isArray(items) && items.length > 0);
}

function prettifyKey(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ComparisonValue({ original, effective, type = 'text', origin }) {
  const adjusted = valuesDiffer(original, effective, type === 'asset' ? 'asset' : 'identity');
  const formatter = type === 'asset' ? displayMoney : displayText;
  const changeLabel = origin === 'derived' ? 'Diturunkan' : 'Disesuaikan';

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
        <strong style={{ color: 'var(--keu-text-main)', overflowWrap: 'anywhere' }}>{formatter(effective)}</strong>
        {adjusted && <span className="keu-badge keu-badge-info">{changeLabel}</span>}
      </div>
      {adjusted && (
        <span style={{ display: 'block', marginTop: '0.25rem', color: 'var(--keu-text-dim)', fontSize: '0.75rem' }}>
          Hasil awal: {formatter(original)}
        </span>
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence }) {
  const info = confidenceInfo(confidence);
  const Icon = info.icon;
  return (
    <span className={`keu-badge ${info.className}`}>
      <Icon size={12} aria-hidden="true" />
      {info.label}
    </span>
  );
}

function ExtractionDetailDialog({ sources, onClose, onSave }) {
  const titleId = useId();
  const descriptionId = useId();
  const identityHeadingId = useId();
  const assetHeadingId = useId();
  const itemHeadingId = useId();
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => makeDraft(sources.effective));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const editState = useMemo(
    () => getEditState(draft, sources.effective),
    [draft, sources.effective]
  );

  const currentAssets = isEditing
    ? editState.parsedAssets
    : sources.effective.assets;
  const contradictionWarnings = getContradictionWarnings(currentAssets);
  const itemGroups = getItemGroups(sources.itemized);
  const visibleAssetFields = ASSET_FIELDS;

  const detailEntries = Object.values(sources.categoryDetails).filter(isObject);
  const confidenceCounts = detailEntries.reduce(
    (counts, detail) => {
      const level = String(detail.confidence || '').toLowerCase();
      if (level === 'high') counts.high += 1;
      else if (level === 'medium') counts.medium += 1;
      else if (level === 'low') counts.low += 1;
      return counts;
    },
    { high: 0, medium: 0, low: 0 }
  );

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, []);

  const confirmDiscard = () => {
    if (!isEditing || !editState.dirty) return true;
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
    return window.confirm('Perubahan yang belum disimpan akan dibuang. Lanjutkan?');
  };

  const requestClose = () => {
    if (!isSaving && confirmDiscard()) onClose?.();
  };

  const handleDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
      return;
    }

    if (event.key !== 'Tab' || !modalRef.current) return;
    const focusable = Array.from(modalRef.current.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])'
    )).filter((element) => !element.hasAttribute('hidden'));
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const beginEditing = () => {
    setDraft(makeDraft(sources.effective));
    setSaveError('');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (!confirmDiscard()) return;
    setDraft(makeDraft(sources.effective));
    setSaveError('');
    setIsEditing(false);
  };

  const updateIdentity = (key, value) => {
    setDraft((current) => ({
      ...current,
      identity: { ...current.identity, [key]: value }
    }));
  };

  const updateAsset = (key, value) => {
    setDraft((current) => ({
      ...current,
      assets: { ...current.assets, [key]: value }
    }));
  };

  const handleSave = async () => {
    if (!editState.dirty || Object.keys(editState.errors).length > 0 || !onSave) return;

    setIsSaving(true);
    setSaveError('');
    try {
      await onSave({
        identity: { ...editState.patch.identity },
        assets: { ...editState.patch.assets }
      });
      setIsEditing(false);
      onClose?.();
    } catch (error) {
      setSaveError(error?.message || 'Perubahan tidak dapat disimpan. Silakan coba lagi.');
    } finally {
      setIsSaving(false);
    }
  };

  const fileName =
    sources.effective.fileName ||
    sources.original.fileName ||
    sources.fallback.fileMeta?.name ||
    sources.fallback.fileName ||
    'Dokumen LHKPN';
  const parseSucceeded =
    sources.effective.isParsedSuccess ??
    sources.original.isParsedSuccess ??
    sources.fallback.parseStatus?.isSuccess ??
    sources.fallback.isParsedSuccess;
  const parserError =
    sources.effective.errorReason ||
    sources.original.errorReason ||
    sources.fallback.parseStatus?.errorReason ||
    sources.fallback.errorReason;
  const parserWarningSource = sources.fallback.parseStatus?.warnings || sources.fallback.warnings;
  const parserWarnings = Array.isArray(parserWarningSource) ? parserWarningSource : [];
  const parserStatusLabel = parseSucceeded === true
    ? 'Ekstraksi selesai'
    : parseSucceeded === false
      ? 'Perlu ditinjau'
      : (sources.fallback.parseStatus?.status || sources.fallback.status || 'Status tidak tersedia');

  return (
    <div
      className="keu-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      onKeyDown={handleDialogKeyDown}
    >
      <div
        ref={modalRef}
        className="keu-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        style={{ maxWidth: '1120px', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <header style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--keu-border-subtle)', backgroundColor: 'var(--keu-surface-card)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
            <div style={{ minWidth: 0 }}>
              <h2 id={titleId} className="keu-card-title" style={{ fontSize: '1.2rem' }}>
                <FileSearch size={21} color="#60a5fa" aria-hidden="true" />
                Detail Data LHKPN Hasil Ekstraksi
              </h2>
              <p id={descriptionId} style={{ marginTop: '0.4rem', color: 'var(--keu-text-muted)', fontSize: '0.82rem', overflowWrap: 'anywhere' }}>
                {fileName} · Nilai awal tetap dipertahankan saat penyesuaian disimpan.
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              className="keu-btn keu-btn-outline keu-btn-sm"
              onClick={requestClose}
              aria-label="Tutup detail ekstraksi"
              disabled={isSaving}
            >
              <X size={18} aria-hidden="true" />
              Tutup
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem', alignItems: 'center' }}>
            <span className={`keu-badge ${parseSucceeded === true ? 'keu-badge-success' : parseSucceeded === false ? 'keu-badge-warning' : 'keu-badge-neutral'}`}>
              {parseSucceeded === false ? <AlertTriangle size={12} aria-hidden="true" /> : <ShieldCheck size={12} aria-hidden="true" />}
              {parserStatusLabel}
            </span>
            {detailEntries.length > 0 ? (
              <>
                {confidenceCounts.high > 0 && <span className="keu-badge keu-badge-success">{confidenceCounts.high} keyakinan tinggi</span>}
                {confidenceCounts.medium > 0 && <span className="keu-badge keu-badge-warning">{confidenceCounts.medium} keyakinan sedang</span>}
                {confidenceCounts.low > 0 && <span className="keu-badge keu-badge-danger">{confidenceCounts.low} keyakinan rendah</span>}
              </>
            ) : (
              <span className="keu-badge keu-badge-neutral">Konteks ekstraksi tidak tersedia</span>
            )}
            {isEditing && <span className="keu-badge keu-badge-info">Mode penyesuaian</span>}
          </div>
        </header>

        <div style={{ minHeight: 0, padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {parserError && (
            <div className="keu-alert keu-alert-warning">
              <AlertTriangle size={19} aria-hidden="true" />
              <div>
                <strong>Catatan parser:</strong>{' '}
                {parserError}
              </div>
            </div>
          )}

          {parserWarnings.length > 0 && (
            <div className="keu-alert keu-alert-warning">
              <AlertTriangle size={19} aria-hidden="true" />
              <div>
                <strong>Catatan ekstraksi:</strong>
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                  {parserWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            </div>
          )}

          <section aria-labelledby={identityHeadingId}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem' }}>
              <h3 id={identityHeadingId} style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UserRound size={18} color="#60a5fa" aria-hidden="true" />
                Identitas Wajib Lapor
              </h3>
              {!isEditing && (
                <button type="button" className="keu-btn keu-btn-primary keu-btn-sm" onClick={beginEditing}>
                  <PencilLine size={15} aria-hidden="true" />
                  Sesuaikan
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(245px, 1fr))', gap: '0.75rem' }}>
              {IDENTITY_FIELDS.map((field) => {
                const originalValue = sources.original.identity?.[field.key];
                const effectiveValue = sources.effective.identity?.[field.key];
                const error = editState.errors[`identity.${field.key}`];
                const inputId = `${titleId}-${field.key}`;

                return (
                  <div key={field.key} style={panelStyle}>
                    <label className="keu-label" htmlFor={isEditing ? inputId : undefined}>
                      {field.label}{field.required && isEditing ? ' *' : ''}
                    </label>
                    {isEditing ? (
                      <>
                        <span style={{ display: 'block', margin: '0.35rem 0 0.5rem', color: 'var(--keu-text-dim)', fontSize: '0.72rem', overflowWrap: 'anywhere' }}>
                          Hasil awal: {displayText(originalValue)}
                        </span>
                        <input
                          id={inputId}
                          type="text"
                          inputMode={field.inputMode || 'text'}
                          className="keu-input"
                          value={draft.identity?.[field.key] ?? ''}
                          onChange={(event) => updateIdentity(field.key, event.target.value)}
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? `${inputId}-error` : undefined}
                          disabled={isSaving}
                        />
                        {error && (
                          <span id={`${inputId}-error`} role="alert" style={{ display: 'block', color: '#f87171', fontSize: '0.75rem', marginTop: '0.35rem' }}>
                            {error}
                          </span>
                        )}
                      </>
                    ) : (
                      <div style={{ marginTop: '0.35rem' }}>
                        <ComparisonValue original={originalValue} effective={effectiveValue} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-labelledby={assetHeadingId}>
            <h3 id={assetHeadingId} style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Landmark size={18} color="#60a5fa" aria-hidden="true" />
              Harta, Utang, dan Kekayaan Bersih
            </h3>

            <div className="keu-table-container">
              <table className="keu-table">
                <caption style={{ textAlign: 'left', padding: '0.75rem 1rem', color: 'var(--keu-text-muted)', fontSize: '0.78rem' }}>
                  Kosongkan nilai efektif untuk menandainya sebagai tidak tersedia; masukkan 0 untuk nilai nol yang terkonfirmasi.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Kategori</th>
                    <th scope="col">Hasil Awal</th>
                    <th scope="col">{isEditing ? 'Nilai Efektif (Rp)' : 'Nilai Efektif'}</th>
                    <th scope="col">Keyakinan &amp; Konteks</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAssetFields.map((field) => {
                    const originalValue = sources.original.assets?.[field.key];
                    const effectiveValue = sources.effective.assets?.[field.key];
                    const detail = sources.categoryDetails?.[field.key] || {};
                    const contextLines = Array.isArray(detail.contextLines) ? detail.contextLines : [];
                    const error = editState.errors[`assets.${field.key}`];
                    const inputId = `${titleId}-asset-${field.key}`;

                    return (
                      <tr key={field.key}>
                        <th scope="row" style={{ backgroundColor: 'transparent', color: 'var(--keu-text-main)', whiteSpace: 'normal', minWidth: '190px' }}>
                          <label htmlFor={isEditing ? inputId : undefined}>{field.label}</label>
                        </th>
                        <td style={{ color: 'var(--keu-text-muted)', whiteSpace: 'nowrap' }}>{displayMoney(originalValue)}</td>
                        <td style={{ minWidth: isEditing ? '240px' : '180px' }}>
                          {isEditing ? (
                            <>
                              <input
                                id={inputId}
                                type="text"
                                inputMode="decimal"
                                className="keu-input"
                                value={draft.assets?.[field.key] ?? ''}
                                onChange={(event) => updateAsset(field.key, event.target.value)}
                                placeholder="Tidak tersedia"
                                aria-invalid={Boolean(error)}
                                aria-describedby={error ? `${inputId}-error` : undefined}
                                disabled={isSaving}
                              />
                              {error && (
                                <span id={`${inputId}-error`} role="alert" style={{ display: 'block', color: '#f87171', fontSize: '0.75rem', marginTop: '0.35rem' }}>
                                  {error}
                                </span>
                              )}
                            </>
                          ) : (
                            <ComparisonValue
                              original={originalValue}
                              effective={effectiveValue}
                              type="asset"
                              origin={sources.effective.provenance?.[`assets.${field.key}`]}
                            />
                          )}
                        </td>
                        <td style={{ minWidth: '235px', verticalAlign: 'top' }}>
                          {isObject(detail) && Object.keys(detail).length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.45rem' }}>
                              <ConfidenceBadge confidence={detail.confidence} />
                              {detail.rawText && (
                                <code style={{ fontSize: '0.72rem', color: 'var(--keu-text-muted)', overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
                                  {detail.rawText}
                                </code>
                              )}
                              {contextLines.length > 0 && (
                                <details style={{ width: '100%', fontSize: '0.75rem', color: 'var(--keu-text-muted)' }}>
                                  <summary style={{ cursor: 'pointer', color: '#60a5fa', fontWeight: 600 }}>
                                    Lihat konteks sumber ({contextLines.length} baris)
                                  </summary>
                                  <div style={{ marginTop: '0.45rem', padding: '0.55rem', borderRadius: 'var(--keu-radius-sm)', backgroundColor: 'var(--keu-bg-primary)', fontFamily: 'monospace', maxHeight: '150px', overflowY: 'auto' }}>
                                    {contextLines.map((line, index) => (
                                      <div key={`${field.key}-${index}`} style={{ padding: '0.15rem 0', overflowWrap: 'anywhere' }}>
                                        {line}
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--keu-text-dim)', fontSize: '0.75rem' }}>Tidak tersedia</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-label="Pemeriksaan konsistensi data">
            {contradictionWarnings.length > 0 ? (
              <div className="keu-alert keu-alert-warning" role="status">
                <AlertTriangle size={20} aria-hidden="true" />
                <div>
                  <strong>Ditemukan ketidaksesuaian nilai.</strong>
                  <ul style={{ margin: '0.45rem 0 0', paddingLeft: '1.1rem' }}>
                    {contradictionWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                  <span style={{ display: 'block', marginTop: '0.45rem', fontSize: '0.78rem' }}>
                    Nilai tetap dapat disimpan, tetapi sebaiknya cocokkan kembali dengan dokumen sumber.
                  </span>
                </div>
              </div>
            ) : (
              <div className="keu-alert keu-alert-info" role="status">
                <CheckCircle2 size={19} aria-hidden="true" />
                <div>
                  <strong>Pemeriksaan otomatis tidak menemukan kontradiksi.</strong>{' '}
                  Perbandingan hanya dilakukan ketika seluruh nilai yang diperlukan tersedia.
                </div>
              </div>
            )}
          </section>

          {itemGroups.length > 0 && (
            <section aria-labelledby={itemHeadingId}>
              <h3 id={itemHeadingId} style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <FileSearch size={18} color="#60a5fa" aria-hidden="true" />
                Rincian Item Harta
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {itemGroups.map(([category, items]) => (
                  <div key={category} style={panelStyle}>
                    <h4 style={{ fontSize: '0.85rem', color: '#60a5fa', marginBottom: '0.55rem' }}>
                      {prettifyKey(category)} ({items.length} item)
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {items.map((item, index) => {
                        const description = item?.deskripsi ?? item?.description ?? `Item ${index + 1}`;
                        const value = item?.nilai ?? item?.value;
                        return (
                          <div key={`${category}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', padding: '0.6rem 0.7rem', borderRadius: 'var(--keu-radius-sm)', backgroundColor: 'var(--keu-surface-card)', border: '1px solid var(--keu-border-subtle)' }}>
                            <span style={{ color: 'var(--keu-text-muted)', fontSize: '0.8rem', overflowWrap: 'anywhere' }}>{displayText(description)}</span>
                            <strong style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{displayMoney(value)}</strong>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {saveError && (
            <div className="keu-alert keu-alert-warning" role="alert">
              <AlertTriangle size={19} aria-hidden="true" />
              <div>{saveError}</div>
            </div>
          )}
        </div>

        <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--keu-border-subtle)', backgroundColor: 'var(--keu-surface-card)' }}>
          <span style={{ color: 'var(--keu-text-muted)', fontSize: '0.78rem' }}>
            {isEditing
              ? `${Object.keys(editState.patch.identity).length + Object.keys(editState.patch.assets).length} field berubah`
              : 'Nilai efektif digunakan oleh seluruh perhitungan analisis.'}
          </span>
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            {isEditing ? (
              <>
                <button type="button" className="keu-btn keu-btn-outline" onClick={cancelEditing} disabled={isSaving}>
                  Batal
                </button>
                <button
                  type="button"
                  className="keu-btn keu-btn-primary"
                  onClick={handleSave}
                  disabled={isSaving || !editState.dirty || Object.keys(editState.errors).length > 0 || !onSave}
                >
                  <Save size={17} aria-hidden="true" />
                  {isSaving ? 'Menyimpan...' : 'Simpan Penyesuaian'}
                </button>
              </>
            ) : (
              <button type="button" className="keu-btn keu-btn-outline" onClick={requestClose}>
                Selesai
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

export function ExtractionDetailModal({ record, isOpen, onClose, onSave }) {
  const sources = useMemo(() => resolveRecord(record), [record]);

  if (!isOpen) return null;

  const recordKey = [
    sources.fallback.id || sources.effective.recordId || sources.original.recordId || '',
    sources.effective.fileName || sources.original.fileName || sources.fallback.fileMeta?.name || sources.fallback.fileName || '',
    sources.effective.parsedAt || sources.original.parsedAt || sources.fallback.parseStatus?.parsedAt || sources.fallback.parsedAt || '',
    sources.effective.identity?.nhk || sources.original.identity?.nhk || '',
    sources.effective.identity?.tahun_laporan || sources.original.identity?.tahun_laporan || ''
  ].join('|');

  return (
    <ExtractionDetailDialog
      key={recordKey}
      sources={sources}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

export default ExtractionDetailModal;
