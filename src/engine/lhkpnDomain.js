/**
 * Shared LHKPN domain utilities.
 *
 * This module deliberately contains no React or browser-storage code. It keeps
 * the parser result immutable, distinguishes unread values from confirmed
 * zeroes, and exposes the same business rules to single, batch, and timeseries
 * workflows.
 */

export const ASSET_CATEGORY_FIELDS = Object.freeze([
  'tanah_dan_bangunan',
  'alat_transportasi_dan_mesin',
  'harta_bergerak_lainnya',
  'surat_berharga',
  'kas_dan_setara_kas',
  'harta_lainnya'
]);

export const FINANCIAL_FIELDS = Object.freeze([
  ...ASSET_CATEGORY_FIELDS,
  'subtotal_harta',
  'hutang',
  'total_harta_kekayaan'
]);

export const EDITABLE_IDENTITY_FIELDS = Object.freeze([
  'nama',
  'jabatan',
  'nhk',
  'bidang',
  'lembaga',
  'unit_kerja',
  'tanggal_penyampaian',
  'jenis_laporan',
  'tahun_laporan',
  'status_verifikasi'
]);

export const MATCH_STATES = Object.freeze({
  CONFIRMED: 'confirmed',
  UNCERTAIN: 'uncertain',
  DIFFERENT: 'different'
});

export const COLLISION_TYPES = Object.freeze({
  EXACT_DUPLICATE: 'exact-duplicate',
  SAME_YEAR_EQUIVALENT: 'same-year-equivalent',
  SAME_YEAR_CONFLICT: 'same-year-conflict',
  DISTINCT: 'distinct',
  MISSING_YEAR: 'missing-year'
});

export const TIMESERIES_THRESHOLDS = Object.freeze({
  largeWealthChangePct: 25,
  unusualWealthChangePct: 50,
  materialDebtChangePct: 20,
  compositionShiftPercentagePoints: 10
});

const EMPTY_DISPLAY_VALUES = new Set([
  '',
  '-',
  'n/a',
  'na',
  'null',
  'undefined',
  'tidak ada',
  'tidak tersedia',
  'tidak terbaca'
]);

const NAME_PREFIX_TITLES = new Set([
  'prof', 'profesor', 'dr', 'doktor', 'drs', 'dra', 'ir', 'insinyur',
  'h', 'hj', 'haji', 'hajjah', 'kh', 'kiai'
]);

const NAME_SUFFIX_TITLES = new Set([
  'aak', 'ak', 'apt', 'ba', 'bsc', 'ca', 'cpa', 'dr', 'dipl', 'llb', 'llm',
  'ma', 'mba', 'meng', 'mh', 'mhum', 'mkn', 'mm', 'mpd', 'mph', 'msi', 'mt',
  'phd', 'prof', 'sag', 'sap', 'se', 'sh', 'si', 'sip', 'skom', 'sos', 'spd',
  'ssos', 'st'
]);

const FIELD_LABELS = Object.freeze({
  tanah_dan_bangunan: 'tanah dan bangunan',
  alat_transportasi_dan_mesin: 'alat transportasi dan mesin',
  harta_bergerak_lainnya: 'harta bergerak lainnya',
  surat_berharga: 'surat berharga',
  kas_dan_setara_kas: 'kas dan setara kas',
  harta_lainnya: 'harta lainnya',
  subtotal_harta: 'subtotal harta',
  hutang: 'utang',
  total_harta_kekayaan: 'kekayaan bersih'
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function nullableNumber(value) {
  return isFiniteNumber(value) ? value : null;
}

function canonicalText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return EMPTY_DISPLAY_VALUES.has(text.toLocaleLowerCase('id-ID')) ? null : text;
}

function hashString(value) {
  // FNV-1a is used only for stable in-memory ids, never for file verification.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function readExtractedFinancialValue(extraction, field) {
  const detail = extraction?.categoryDetails?.[field];
  if (detail && hasOwn(detail, 'value')) {
    if (isFiniteNumber(detail.value)) return detail.value;
    if (detail.isZero === true || detail.isZeroPattern === true) return 0;
    return null;
  }

  const value = extraction?.assets?.[field];
  if (!isFiniteNumber(value)) return null;

  // The legacy parser uses zero-filled fallback objects on failed/missing
  // extraction. Without category evidence those zeroes are not confirmed.
  if (extraction?.isParsedSuccess === false && value === 0) return null;
  return value;
}

function makeOriginalSnapshot(extraction) {
  const assets = Object.fromEntries(
    FINANCIAL_FIELDS.map((field) => [field, readExtractedFinancialValue(extraction, field)])
  );

  return {
    identity: cloneValue(extraction?.identity || {}),
    assets,
    categoryDetails: cloneValue(extraction?.categoryDetails || {}),
    itemized: cloneValue(extraction?.itemized || {}),
    metadata: cloneValue(extraction?.metadata || {})
  };
}

function makeInitialProvenance(snapshot) {
  const provenance = {};
  for (const [field, value] of Object.entries(snapshot.identity)) {
    provenance[`identity.${field}`] = canonicalText(value) === null ? 'missing' : 'extracted';
  }
  for (const field of FINANCIAL_FIELDS) {
    const value = snapshot.assets[field];
    provenance[`assets.${field}`] = value === null ? 'missing' : value === 0 ? 'confirmed-zero' : 'extracted';
  }
  return provenance;
}

function makeInitialEffectiveSnapshot(snapshot, extraction) {
  const effective = {
    ...cloneValue(snapshot),
    provenance: makeInitialProvenance(snapshot)
  };
  const categoriesComplete = ASSET_CATEGORY_FIELDS.every((field) => isFiniteNumber(effective.assets[field]));

  if (
    !isFiniteNumber(effective.assets.subtotal_harta)
    && categoriesComplete
    && isFiniteNumber(extraction?.assets?.subtotal_harta)
  ) {
    effective.assets.subtotal_harta = ASSET_CATEGORY_FIELDS.reduce(
      (total, field) => total + effective.assets[field],
      0
    );
    effective.provenance['assets.subtotal_harta'] = 'derived';
  }

  if (
    !isFiniteNumber(effective.assets.total_harta_kekayaan)
    && isFiniteNumber(effective.assets.subtotal_harta)
    && isFiniteNumber(effective.assets.hutang)
    && isFiniteNumber(extraction?.assets?.total_harta_kekayaan)
  ) {
    effective.assets.total_harta_kekayaan = effective.assets.subtotal_harta - effective.assets.hutang;
    effective.provenance['assets.total_harta_kekayaan'] = 'derived';
  }

  return effective;
}

function getRecordData(value) {
  if (value?.effective?.assets || value?.effective?.identity) return value.effective;
  return value || {};
}

function getRecordId(value, fallbackIndex = 0) {
  return value?.id || `record-${fallbackIndex + 1}-${hashString(JSON.stringify(createFinancialFingerprint(value)))}`;
}

function getContentHash(record) {
  return canonicalText(record?.fileMeta?.contentHash || record?.contentHash || record?.metadata?.contentHash);
}

/**
 * Parse a reporting year from a numeric value, a dedicated year field, or a
 * combined LHKPN heading. Ambiguous text falls back to its last year token,
 * which matches the KPK "submission date / report type - reporting year"
 * heading layout.
 */
export function parseReportingYear(value) {
  if (Number.isInteger(value) && value >= 1900 && value <= 2099) return value;
  if (value === null || value === undefined) return null;

  const text = canonicalText(value);
  if (!text) return null;

  if (/^(?:19|20)\d{2}$/.test(text)) return Number(text);

  const explicit = [...text.matchAll(
    /(?:tahun(?:\s+laporan)?|periodik|khusus)\s*(?::|-)?\s*((?:19|20)\d{2})\b/gi
  )];
  if (explicit.length > 0) return Number(explicit.at(-1)[1]);

  const allYears = [...text.matchAll(/\b((?:19|20)\d{2})\b/g)];
  return allYears.length > 0 ? Number(allYears.at(-1)[1]) : null;
}

export function getReportingYear(recordOrExtraction) {
  if (hasOwn(recordOrExtraction, 'reportingYear')) {
    return parseReportingYear(recordOrExtraction.reportingYear);
  }
  return parseReportingYear(getRecordData(recordOrExtraction)?.identity?.tahun_laporan);
}

/**
 * Convert a parser result into the shared record shape. Raw File objects and
 * PDF bytes are intentionally not retained.
 */
export function createLHKPNRecord(extraction, options = {}) {
  if (!isPlainObject(extraction)) {
    throw new TypeError('Hasil ekstraksi LHKPN harus berupa objek.');
  }

  const original = makeOriginalSnapshot(extraction);
  const reportingYear = parseReportingYear(original.identity.tahun_laporan);
  const createdAt = options.createdAt || extraction.parsedAt || new Date().toISOString();
  const fileInput = options.fileMeta || options.file || {};
  const fileName = canonicalText(fileInput.name || extraction.fileName) || 'LHKPN.pdf';
  const fileMeta = {
    name: fileName,
    size: isFiniteNumber(fileInput.size) ? fileInput.size : null,
    type: canonicalText(fileInput.type) || 'application/pdf',
    lastModified: isFiniteNumber(fileInput.lastModified) ? fileInput.lastModified : null,
    contentHash: canonicalText(options.contentHash || fileInput.contentHash || extraction.contentHash)
  };
  const effective = makeInitialEffectiveSnapshot(original, extraction);
  const parseWarnings = (extraction.logs || [])
    .filter((entry) => entry?.level === 'warning' || entry?.level === 'error')
    .map((entry) => entry.msg)
    .filter(Boolean);
  const parseStatus = {
    isSuccess: extraction.isParsedSuccess === true,
    status: canonicalText(extraction.status) || (extraction.isParsedSuccess ? 'Selesai' : 'Perlu Ditinjau'),
    errorReason: canonicalText(extraction.errorReason),
    warnings: [...new Set(parseWarnings)],
    parsedAt: canonicalText(extraction.parsedAt)
  };
  const financialFingerprint = createFinancialFingerprint(effective);
  const generatedIdSource = [
    fileName,
    createdAt,
    normalizeNhK(original.identity.nhk),
    normalizePersonName(original.identity.nama),
    reportingYear,
    financialFingerprint
  ].join('|');
  const record = {
    id: canonicalText(options.id) || `lhkpn-${hashString(generatedIdSource)}`,
    original,
    effective,
    adjustments: [],
    fileMeta,
    reportingYear,
    parseStatus,
    createdAt,
    financialFingerprint
  };

  return {
    ...record,
    validation: validateRecordConsistency(record)
  };
}

/** Return an extraction-compatible snapshot for the existing financial engine. */
export function getEffectiveLHKPNData(record) {
  const effective = cloneValue(getRecordData(record));
  return {
    fileName: record?.fileMeta?.name || record?.fileName || 'LHKPN.pdf',
    isParsedSuccess: record?.parseStatus?.isSuccess ?? record?.isParsedSuccess,
    status: record?.parseStatus?.status ?? record?.status,
    errorReason: record?.parseStatus?.errorReason ?? record?.errorReason,
    warnings: cloneValue(record?.parseStatus?.warnings || record?.warnings || []),
    identity: effective.identity || {},
    assets: effective.assets || {},
    categoryDetails: effective.categoryDetails || {},
    itemized: effective.itemized || {},
    metadata: effective.metadata || {},
    provenance: effective.provenance || {}
  };
}

/**
 * Validate arithmetic consistency without filling missing fields. Warnings are
 * structured so the interface can render them without parsing message text.
 */
export function validateRecordConsistency(recordOrData, options = {}) {
  const data = getRecordData(recordOrData);
  const assets = data.assets || {};
  const tolerance = isFiniteNumber(options.tolerance) && options.tolerance >= 0 ? options.tolerance : 1;
  const errors = [];
  const warnings = [];

  for (const field of FINANCIAL_FIELDS) {
    const value = assets[field];
    if (value === null || value === undefined) continue;
    if (!isFiniteNumber(value) || !Number.isSafeInteger(value)) {
      errors.push({
        code: 'INVALID_FINANCIAL_VALUE',
        field: `assets.${field}`,
        message: `Nilai ${FIELD_LABELS[field]} harus berupa bilangan bulat yang aman.`
      });
    } else if (field !== 'total_harta_kekayaan' && value < 0) {
      errors.push({
        code: 'NEGATIVE_FINANCIAL_VALUE',
        field: `assets.${field}`,
        message: `Nilai ${FIELD_LABELS[field]} tidak boleh negatif.`
      });
    }
  }

  const missingFields = FINANCIAL_FIELDS.filter((field) => assets[field] === null || assets[field] === undefined);
  if (missingFields.length > 0) {
    warnings.push({
      code: 'MISSING_FINANCIAL_FIELDS',
      fields: missingFields.map((field) => `assets.${field}`),
      message: `${missingFields.length} nilai keuangan belum tersedia dan tidak dianggap sebagai nol.`
    });
  }

  const categoriesComplete = ASSET_CATEGORY_FIELDS.every((field) => isFiniteNumber(assets[field]));
  let expectedSubtotal = null;
  let subtotalConsistent = null;
  if (categoriesComplete) {
    expectedSubtotal = ASSET_CATEGORY_FIELDS.reduce((sum, field) => sum + assets[field], 0);
    if (isFiniteNumber(assets.subtotal_harta)) {
      subtotalConsistent = Math.abs(assets.subtotal_harta - expectedSubtotal) <= tolerance;
      if (!subtotalConsistent) {
        warnings.push({
          code: 'SUBTOTAL_MISMATCH',
          fields: ['assets.subtotal_harta', ...ASSET_CATEGORY_FIELDS.map((field) => `assets.${field}`)],
          expected: expectedSubtotal,
          actual: assets.subtotal_harta,
          message: 'Subtotal harta tidak sama dengan jumlah enam kategori aset.'
        });
      }
    }
  }

  let expectedNetWorth = null;
  let netWorthConsistent = null;
  if (isFiniteNumber(assets.subtotal_harta) && isFiniteNumber(assets.hutang)) {
    expectedNetWorth = assets.subtotal_harta - assets.hutang;
    if (isFiniteNumber(assets.total_harta_kekayaan)) {
      netWorthConsistent = Math.abs(assets.total_harta_kekayaan - expectedNetWorth) <= tolerance;
      if (!netWorthConsistent) {
        warnings.push({
          code: 'NET_WORTH_MISMATCH',
          fields: ['assets.subtotal_harta', 'assets.hutang', 'assets.total_harta_kekayaan'],
          expected: expectedNetWorth,
          actual: assets.total_harta_kekayaan,
          message: 'Kekayaan bersih tidak sama dengan subtotal harta dikurangi utang.'
        });
      }
    }
  }

  const contradictionCodes = new Set(['SUBTOTAL_MISMATCH', 'NET_WORTH_MISMATCH']);
  const hasContradictions = warnings.some((warning) => contradictionCodes.has(warning.code));

  return {
    isValid: errors.length === 0,
    isConsistent: errors.length === 0 && !hasContradictions,
    hasContradictions,
    errors,
    warnings,
    checks: {
      categoriesComplete,
      expectedSubtotal,
      subtotalConsistent,
      expectedNetWorth,
      netWorthConsistent
    }
  };
}

/** Validate and normalize an adjustment payload without changing the record. */
export function validateManualAdjustments(record, changes) {
  const errors = [];
  const normalizedChanges = { identity: {}, assets: {} };

  if (!isPlainObject(changes)) {
    return {
      isValid: false,
      errors: [{ code: 'INVALID_ADJUSTMENT', field: null, message: 'Penyesuaian harus berupa objek.' }],
      normalizedChanges
    };
  }

  for (const section of Object.keys(changes)) {
    if (section !== 'identity' && section !== 'assets') {
      errors.push({
        code: 'UNSUPPORTED_SECTION',
        field: section,
        message: `Bagian ${section} tidak dapat disesuaikan.`
      });
    }
  }

  if (hasOwn(changes, 'identity') && !isPlainObject(changes.identity)) {
    errors.push({ code: 'INVALID_SECTION', field: 'identity', message: 'Data identitas harus berupa objek.' });
  } else {
    for (const [field, rawValue] of Object.entries(changes.identity || {})) {
      if (!EDITABLE_IDENTITY_FIELDS.includes(field)) {
        errors.push({
          code: 'UNSUPPORTED_FIELD',
          field: `identity.${field}`,
          message: `Kolom identitas ${field} tidak dapat disesuaikan.`
        });
        continue;
      }

      if (field === 'tahun_laporan') {
        if (rawValue === null || rawValue === '') {
          normalizedChanges.identity[field] = null;
        } else {
          const year = parseReportingYear(rawValue);
          if (year === null) {
            errors.push({
              code: 'INVALID_REPORTING_YEAR',
              field: 'identity.tahun_laporan',
              message: 'Tahun pelaporan harus berada pada rentang 1900–2099.'
            });
          } else {
            normalizedChanges.identity[field] = String(year);
          }
        }
        continue;
      }

      if (rawValue !== null && typeof rawValue !== 'string') {
        errors.push({
          code: 'INVALID_IDENTITY_VALUE',
          field: `identity.${field}`,
          message: `Nilai ${field} harus berupa teks atau kosong.`
        });
        continue;
      }

      const value = canonicalText(rawValue);
      if (field === 'nama' && value === null) {
        errors.push({
          code: 'REQUIRED_NAME',
          field: 'identity.nama',
          message: 'Nama wajib lapor tidak boleh kosong saat disesuaikan.'
        });
      } else {
        normalizedChanges.identity[field] = value;
      }
    }
  }

  if (hasOwn(changes, 'assets') && !isPlainObject(changes.assets)) {
    errors.push({ code: 'INVALID_SECTION', field: 'assets', message: 'Data keuangan harus berupa objek.' });
  } else {
    for (const [field, rawValue] of Object.entries(changes.assets || {})) {
      if (!FINANCIAL_FIELDS.includes(field)) {
        errors.push({
          code: 'UNSUPPORTED_FIELD',
          field: `assets.${field}`,
          message: `Kolom keuangan ${field} tidak dapat disesuaikan.`
        });
        continue;
      }

      if (rawValue === null || rawValue === '') {
        normalizedChanges.assets[field] = null;
        continue;
      }
      if (!isFiniteNumber(rawValue) || !Number.isSafeInteger(rawValue)) {
        errors.push({
          code: 'INVALID_FINANCIAL_VALUE',
          field: `assets.${field}`,
          message: `Nilai ${FIELD_LABELS[field]} harus berupa bilangan bulat yang aman atau kosong.`
        });
        continue;
      }
      if (field !== 'total_harta_kekayaan' && rawValue < 0) {
        errors.push({
          code: 'NEGATIVE_FINANCIAL_VALUE',
          field: `assets.${field}`,
          message: `Nilai ${FIELD_LABELS[field]} tidak boleh negatif.`
        });
        continue;
      }
      normalizedChanges.assets[field] = rawValue;
    }
  }

  // Make sure callers cannot accidentally validate changes for another shape.
  if (!record?.effective) {
    errors.push({
      code: 'INVALID_RECORD',
      field: null,
      message: 'Rekaman LHKPN belum menggunakan model data bersama.'
    });
  }

  return { isValid: errors.length === 0, errors, normalizedChanges };
}

function appendChange(auditChanges, effective, section, field, nextValue, origin) {
  const previousValue = effective[section]?.[field] ?? null;
  if (Object.is(previousValue, nextValue)) return false;
  effective[section][field] = nextValue;
  effective.provenance[`${section}.${field}`] = origin;
  auditChanges.push({
    path: `${section}.${field}`,
    previousValue,
    newValue: nextValue,
    origin
  });
  return true;
}

/**
 * Apply user changes immutably. Category/subtotal/debt changes derive dependent
 * totals unless the user explicitly supplied those totals in the same save.
 */
export function applyManualAdjustments(record, changes, auditMeta = {}) {
  const checked = validateManualAdjustments(record, changes);
  if (!checked.isValid) {
    const error = new TypeError('Penyesuaian LHKPN tidak valid.');
    error.validationErrors = checked.errors;
    throw error;
  }

  const effective = cloneValue(record.effective);
  effective.identity ||= {};
  effective.assets ||= {};
  effective.provenance ||= {};
  const auditChanges = [];

  for (const [field, value] of Object.entries(checked.normalizedChanges.identity)) {
    appendChange(auditChanges, effective, 'identity', field, value, 'manual');
  }
  for (const [field, value] of Object.entries(checked.normalizedChanges.assets)) {
    appendChange(auditChanges, effective, 'assets', field, value, 'manual');
  }

  const changedAssetFields = new Set(Object.keys(checked.normalizedChanges.assets));
  const categoryWasChanged = ASSET_CATEGORY_FIELDS.some((field) => changedAssetFields.has(field));
  const categoriesComplete = ASSET_CATEGORY_FIELDS.every((field) => isFiniteNumber(effective.assets[field]));

  if (categoryWasChanged && categoriesComplete && !changedAssetFields.has('subtotal_harta')) {
    const derivedSubtotal = ASSET_CATEGORY_FIELDS.reduce((sum, field) => sum + effective.assets[field], 0);
    appendChange(auditChanges, effective, 'assets', 'subtotal_harta', derivedSubtotal, 'derived');
  }

  const totalDependencyChanged = categoryWasChanged
    || changedAssetFields.has('subtotal_harta')
    || changedAssetFields.has('hutang');
  if (
    totalDependencyChanged
    && !changedAssetFields.has('total_harta_kekayaan')
    && isFiniteNumber(effective.assets.subtotal_harta)
    && isFiniteNumber(effective.assets.hutang)
  ) {
    appendChange(
      auditChanges,
      effective,
      'assets',
      'total_harta_kekayaan',
      effective.assets.subtotal_harta - effective.assets.hutang,
      'derived'
    );
  }

  if (auditChanges.length === 0) return record;

  const adjustedAt = auditMeta.adjustedAt || new Date().toISOString();
  const adjustment = {
    id: canonicalText(auditMeta.id) || `adjustment-${hashString(`${record.id}|${adjustedAt}|${JSON.stringify(auditChanges)}`)}`,
    adjustedAt,
    adjustedBy: canonicalText(auditMeta.adjustedBy),
    reason: canonicalText(auditMeta.reason),
    changes: auditChanges
  };
  const nextRecord = {
    ...record,
    effective,
    reportingYear: parseReportingYear(effective.identity.tahun_laporan),
    adjustments: [...(record.adjustments || []), adjustment],
    financialFingerprint: createFinancialFingerprint(effective)
  };

  return {
    ...nextRecord,
    validation: validateRecordConsistency(nextRecord)
  };
}

export function normalizeNhK(value) {
  const text = canonicalText(value);
  if (!text) return null;
  const normalized = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    // Some parser fixtures retain the field label ("NHK-123"), while the
    // official document extractor commonly returns only "123".
    .replace(/^NHK/, '');
  return normalized && !EMPTY_DISPLAY_VALUES.has(normalized.toLocaleLowerCase('id-ID')) ? normalized : null;
}

/** Normalize harmless name/title formatting while retaining actual name tokens. */
export function normalizePersonName(value) {
  const text = canonicalText(value);
  if (!text) return null;

  const tokens = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .toLocaleLowerCase('id-ID')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  while (tokens.length > 1 && NAME_PREFIX_TITLES.has(tokens[0])) tokens.shift();
  while (tokens.length > 1 && NAME_SUFFIX_TITLES.has(tokens.at(-1))) tokens.pop();
  return tokens.join(' ') || null;
}

function normalizeSupportingIdentity(value) {
  const text = canonicalText(value);
  if (!text) return null;
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .toLocaleLowerCase('id-ID')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeIdentity(identityOrRecord) {
  const identity = getRecordData(identityOrRecord)?.identity || identityOrRecord || {};
  const name = normalizePersonName(identity.nama);
  return {
    nhk: normalizeNhK(identity.nhk),
    name,
    nameTokens: name ? name.split(' ') : [],
    institution: normalizeSupportingIdentity(identity.lembaga || identity.instansi),
    position: normalizeSupportingIdentity(identity.jabatan),
    unit: normalizeSupportingIdentity(identity.unit_kerja)
  };
}

function levenshteinDistance(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function nameSimilarity(first, second) {
  if (!first.name || !second.name) return { token: 0, character: 0 };
  const firstTokens = new Set(first.nameTokens);
  const secondTokens = new Set(second.nameTokens);
  const intersection = [...firstTokens].filter((token) => secondTokens.has(token)).length;
  const union = new Set([...firstTokens, ...secondTokens]).size;
  const token = union === 0 ? 0 : intersection / union;
  const maxLength = Math.max(first.name.length, second.name.length);
  const character = maxLength === 0
    ? 1
    : 1 - (levenshteinDistance(first.name, second.name) / maxLength);
  return { token, character };
}

/** Reusable identity matcher for timeseries and batch grouping. */
export function matchIdentities(firstIdentity, secondIdentity) {
  const first = normalizeIdentity(firstIdentity);
  const second = normalizeIdentity(secondIdentity);
  const supportingMatches = [
    first.institution && first.institution === second.institution ? 'institution' : null,
    first.position && first.position === second.position ? 'position' : null,
    first.unit && first.unit === second.unit ? 'unit' : null
  ].filter(Boolean);

  if (first.nhk && second.nhk) {
    if (first.nhk === second.nhk) {
      return {
        state: MATCH_STATES.CONFIRMED,
        confidence: 'high',
        reason: 'same-stable-identifier',
        supportingMatches,
        normalized: { first, second }
      };
    }
    return {
      state: MATCH_STATES.DIFFERENT,
      confidence: 'high',
      reason: 'different-stable-identifier',
      supportingMatches,
      normalized: { first, second }
    };
  }

  if (!first.name || !second.name) {
    return {
      state: MATCH_STATES.UNCERTAIN,
      confidence: 'low',
      reason: 'missing-name-or-identifier',
      supportingMatches,
      normalized: { first, second }
    };
  }

  if (
    first.name === second.name
    || [...first.nameTokens].sort().join('|') === [...second.nameTokens].sort().join('|')
  ) {
    return {
      state: MATCH_STATES.CONFIRMED,
      confidence: first.nhk || second.nhk ? 'medium' : 'high',
      reason: 'same-normalized-name',
      supportingMatches,
      normalized: { first, second }
    };
  }

  const similarity = nameSimilarity(first, second);
  const seemsSimilar = similarity.character >= 0.72 || similarity.token >= 0.34;
  return {
    state: seemsSimilar ? MATCH_STATES.UNCERTAIN : MATCH_STATES.DIFFERENT,
    confidence: seemsSimilar && supportingMatches.length > 0 ? 'medium' : seemsSimilar ? 'low' : 'high',
    reason: seemsSimilar ? 'similar-name-requires-confirmation' : 'different-name',
    similarity,
    supportingMatches,
    normalized: { first, second }
  };
}

/**
 * A lossless deterministic financial fingerprint. Null is deliberately encoded
 * separately from zero. It is not a content hash and contains no identity data.
 */
export function createFinancialFingerprint(recordOrData) {
  const assets = getRecordData(recordOrData)?.assets || {};
  const values = FINANCIAL_FIELDS.map((field) => {
    const value = assets[field];
    return isFiniteNumber(value) ? value : null;
  });
  return `financial-v1:${JSON.stringify(values)}`;
}

/** Compute a SHA-256 content hash in browsers that expose Web Crypto. */
export async function computeContentHash(input) {
  if (!globalThis.crypto?.subtle) return null;
  let bytes;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else if (ArrayBuffer.isView(input)) {
    bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else if (typeof Blob !== 'undefined' && input instanceof Blob) {
    bytes = new Uint8Array(await input.arrayBuffer());
  } else {
    throw new TypeError('Konten untuk hash harus berupa string, Blob, ArrayBuffer, atau TypedArray.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function classifyRecordCollision(firstRecord, secondRecord) {
  const firstHash = getContentHash(firstRecord);
  const secondHash = getContentHash(secondRecord);
  if (firstHash && secondHash && firstHash === secondHash) {
    return { type: COLLISION_TYPES.EXACT_DUPLICATE, autoResolvable: true };
  }

  const firstYear = getReportingYear(firstRecord);
  const secondYear = getReportingYear(secondRecord);
  if (firstYear === null || secondYear === null) {
    return { type: COLLISION_TYPES.MISSING_YEAR, autoResolvable: false };
  }
  if (firstYear !== secondYear) {
    return { type: COLLISION_TYPES.DISTINCT, autoResolvable: true };
  }

  const sameFinances = createFinancialFingerprint(firstRecord) === createFinancialFingerprint(secondRecord);
  return {
    type: sameFinances ? COLLISION_TYPES.SAME_YEAR_EQUIVALENT : COLLISION_TYPES.SAME_YEAR_CONFLICT,
    autoResolvable: sameFinances,
    year: firstYear
  };
}

function selectionForConflict(selections, conflictId, year) {
  if (selections instanceof Map) return selections.get(conflictId) || selections.get(year) || selections.get(String(year));
  return selections?.[conflictId] || selections?.[year] || selections?.[String(year)] || null;
}

/**
 * Remove exact/equivalent duplicates and surface financial conflicts. Records
 * from an unresolved conflicting year are withheld from resolvedRecords.
 */
export function resolveRecordDuplicates(records, options = {}) {
  const input = Array.isArray(records) ? records.filter(Boolean) : [];
  const duplicates = [];
  const conflicts = [];
  const withoutYear = [];
  const uniqueByContent = [];
  const hashOwners = new Map();

  input.forEach((record, index) => {
    const recordId = getRecordId(record, index);
    const hash = getContentHash(record);
    if (hash && hashOwners.has(hash)) {
      duplicates.push({
        type: COLLISION_TYPES.EXACT_DUPLICATE,
        keptRecordId: hashOwners.get(hash).id,
        duplicateRecordId: recordId,
        contentHash: hash
      });
      return;
    }
    if (hash) hashOwners.set(hash, { id: recordId, record });
    uniqueByContent.push({ id: recordId, record, index });
  });

  const byYear = new Map();
  for (const entry of uniqueByContent) {
    const year = getReportingYear(entry.record);
    if (year === null) {
      withoutYear.push(entry.record);
      continue;
    }
    const existing = byYear.get(year) || [];
    existing.push(entry);
    byYear.set(year, existing);
  }

  const resolvedRecords = [];
  for (const [year, entries] of [...byYear.entries()].sort(([left], [right]) => left - right)) {
    if (entries.length === 1) {
      resolvedRecords.push(entries[0].record);
      continue;
    }

    const fingerprints = new Set(entries.map(({ record }) => createFinancialFingerprint(record)));
    if (fingerprints.size === 1) {
      resolvedRecords.push(entries[0].record);
      for (const duplicate of entries.slice(1)) {
        duplicates.push({
          type: COLLISION_TYPES.SAME_YEAR_EQUIVALENT,
          year,
          keptRecordId: entries[0].id,
          duplicateRecordId: duplicate.id
        });
      }
      continue;
    }

    const conflictId = `year-${year}-${hashString(entries.map(({ id }) => id).sort().join('|'))}`;
    const selectedId = selectionForConflict(options.selections || {}, conflictId, year);
    const selected = entries.find(({ id }) => id === selectedId);
    const conflict = {
      id: conflictId,
      type: COLLISION_TYPES.SAME_YEAR_CONFLICT,
      year,
      recordIds: entries.map(({ id }) => id),
      records: entries.map(({ record }) => record),
      resolved: Boolean(selected),
      selectedRecordId: selected?.id || null
    };
    conflicts.push(conflict);
    if (selected) resolvedRecords.push(selected.record);
  }

  resolvedRecords.sort((left, right) => getReportingYear(left) - getReportingYear(right));
  return {
    resolvedRecords,
    duplicates,
    conflicts,
    unresolvedConflicts: conflicts.filter((conflict) => !conflict.resolved),
    withoutYear
  };
}

function identityPairKey(firstId, secondId) {
  return [firstId, secondId].sort().join('::');
}

function normalizePairDecisions(pairs) {
  return new Set((pairs || []).map((pair) => {
    if (Array.isArray(pair)) return identityPairKey(String(pair[0]), String(pair[1]));
    return String(pair);
  }));
}

function createPersonGroup(record, index) {
  const identity = getRecordData(record)?.identity || {};
  const identityKey = normalizeNhK(identity.nhk) || normalizePersonName(identity.nama) || getRecordId(record, index);
  return {
    id: `person-${hashString(`${identityKey}|${getRecordId(record, index)}`)}`,
    identity: cloneValue(identity),
    records: [record]
  };
}

/**
 * Group confirmed identities while holding uncertain matches outside groups.
 * `confirmedMatches` and `rejectedMatches` accept `[recordIdA, recordIdB]`
 * pairs, allowing user decisions to be replayed deterministically.
 */
export function groupRecordsByIndividual(records, options = {}) {
  const input = Array.isArray(records) ? records.filter(Boolean) : [];
  const groups = [];
  const uncertain = [];
  const confirmedPairs = normalizePairDecisions(options.confirmedMatches);
  const rejectedPairs = normalizePairDecisions(options.rejectedMatches);

  input.forEach((record, index) => {
    const recordId = getRecordId(record, index);
    const confirmedCandidates = [];
    const uncertainCandidates = [];

    for (const group of groups) {
      const representative = group.records[0];
      const representativeId = getRecordId(representative);
      const pairKey = identityPairKey(recordId, representativeId);
      let match;
      if (confirmedPairs.has(pairKey)) {
        match = { state: MATCH_STATES.CONFIRMED, confidence: 'user-confirmed', reason: 'user-confirmed' };
      } else if (rejectedPairs.has(pairKey)) {
        match = { state: MATCH_STATES.DIFFERENT, confidence: 'user-confirmed', reason: 'user-rejected' };
      } else {
        match = matchIdentities(record, representative);
      }

      if (match.state === MATCH_STATES.CONFIRMED) confirmedCandidates.push({ group, match });
      if (match.state === MATCH_STATES.UNCERTAIN) uncertainCandidates.push({ group, match });
    }

    if (confirmedCandidates.length > 0) {
      confirmedCandidates[0].group.records.push(record);
    } else if (uncertainCandidates.length > 0) {
      uncertain.push({
        record,
        recordId,
        candidates: uncertainCandidates.map(({ group, match }) => ({ groupId: group.id, match }))
      });
    } else {
      groups.push(createPersonGroup(record, index));
    }
  });

  const hydratedGroups = groups.map((group) => {
    const resolution = resolveRecordDuplicates(group.records, {
      selections: options.conflictSelections?.[group.id] || options.conflictSelections || {}
    });
    const years = resolution.resolvedRecords.map(getReportingYear).filter((year) => year !== null);
    const latestRecord = resolution.resolvedRecords.at(-1) || null;
    let status = years.length > 1 ? 'multi-year' : 'single-year';
    if (resolution.unresolvedConflicts.length > 0) status = 'conflict';
    else if (
      resolution.withoutYear.length > 0
      || group.records.some((record) => (
        !record?.parseStatus?.isSuccess
        || record.parseStatus.warnings?.length > 0
        || record.validation?.warnings?.length > 0
        || record.validation?.isConsistent === false
      ))
    ) {
      status = 'incomplete';
    }
    return {
      ...group,
      records: [...group.records].sort((left, right) => (getReportingYear(left) ?? Infinity) - (getReportingYear(right) ?? Infinity)),
      effectiveRecords: resolution.resolvedRecords,
      years,
      latestRecord,
      status,
      duplicateResolution: resolution
    };
  });

  return {
    groups: hydratedGroups,
    uncertain,
    ungrouped: uncertain.map(({ record }) => record)
  };
}

function makeComposition(assets) {
  const categoriesComplete = ASSET_CATEGORY_FIELDS.every((field) => isFiniteNumber(assets[field]));
  if (!categoriesComplete || !isFiniteNumber(assets.subtotal_harta) || assets.subtotal_harta <= 0) return null;
  return Object.fromEntries(
    ASSET_CATEGORY_FIELDS.map((field) => [field, assets[field] / assets.subtotal_harta])
  );
}

/** Calculate chronological annual rows from already selected effective records. */
export function calculateAnnualTimeseries(records) {
  const resolution = resolveRecordDuplicates(records);
  const sorted = resolution.resolvedRecords
    .filter((record) => getReportingYear(record) !== null)
    .sort((left, right) => getReportingYear(left) - getReportingYear(right));
  let previousRow = null;
  let previousAvailableNetWorthRow = null;

  return sorted.map((record) => {
    const data = getRecordData(record);
    const assets = data.assets || {};
    const year = getReportingYear(record);
    const totalAssets = nullableNumber(assets.subtotal_harta);
    const totalDebt = nullableNumber(assets.hutang);
    const netWorth = nullableNumber(assets.total_harta_kekayaan);
    let wealthChange = null;
    let growthPercentage = null;
    let growthUnavailableReason = null;
    let comparedToYear = null;

    if (netWorth !== null && previousAvailableNetWorthRow) {
      comparedToYear = previousAvailableNetWorthRow.year;
      wealthChange = netWorth - previousAvailableNetWorthRow.netWorth;
      if (previousAvailableNetWorthRow.netWorth > 0) {
        growthPercentage = (wealthChange / previousAvailableNetWorthRow.netWorth) * 100;
      } else {
        growthUnavailableReason = 'previous-net-worth-not-positive';
      }
    } else if (netWorth === null) {
      growthUnavailableReason = 'current-net-worth-missing';
    } else {
      growthUnavailableReason = 'no-previous-net-worth';
    }

    const row = {
      recordId: getRecordId(record),
      record,
      year,
      totalAssets,
      totalDebt,
      netWorth,
      wealthChange,
      growthPercentage,
      growthUnavailableReason,
      comparedToYear,
      hasYearGap: previousRow !== null && year - previousRow.year > 1,
      missingYearsBefore: previousRow === null
        ? []
        : Array.from({ length: Math.max(0, year - previousRow.year - 1) }, (_, index) => previousRow.year + index + 1),
      composition: makeComposition(assets)
    };
    previousRow = row;
    if (netWorth !== null) previousAvailableNetWorthRow = row;
    return row;
  });
}

function formatRupiah(value) {
  return `Rp ${Math.abs(value).toLocaleString('id-ID')}`;
}

/** Produce neutral, deterministic insights from calculated annual rows only. */
export function generateTimeseriesInsights(rows, thresholds = TIMESERIES_THRESHOLDS) {
  const orderedRows = [...(rows || [])].sort((left, right) => left.year - right.year);
  const insights = [];
  const wealthRows = orderedRows.filter((row) => isFiniteNumber(row.netWorth));

  if (wealthRows.length < 2) {
    insights.push({
      code: 'insufficient-wealth-history',
      severity: 'info',
      message: 'Diperlukan sedikitnya dua tahun dengan kekayaan bersih terbaca untuk menilai perkembangan.'
    });
  } else {
    const first = wealthRows[0];
    const latest = wealthRows.at(-1);
    const change = latest.netWorth - first.netWorth;
    insights.push({
      code: change > 0 ? 'overall-increase' : change < 0 ? 'overall-decrease' : 'overall-stable',
      severity: 'info',
      fromYear: first.year,
      toYear: latest.year,
      value: change,
      message: change > 0
        ? `Kekayaan bersih yang dilaporkan meningkat ${formatRupiah(change)} dari ${first.year} ke ${latest.year}.`
        : change < 0
          ? `Kekayaan bersih yang dilaporkan menurun ${formatRupiah(change)} dari ${first.year} ke ${latest.year}.`
          : `Kekayaan bersih yang dilaporkan tidak berubah dari ${first.year} ke ${latest.year}.`
    });
  }

  for (const row of orderedRows) {
    if (!isFiniteNumber(row.growthPercentage)) continue;
    const magnitude = Math.abs(row.growthPercentage);
    if (magnitude >= thresholds.largeWealthChangePct) {
      insights.push({
        code: row.growthPercentage > 0 ? 'large-annual-increase' : 'large-annual-decrease',
        severity: 'info',
        year: row.year,
        comparedToYear: row.comparedToYear,
        value: row.growthPercentage,
        threshold: thresholds.largeWealthChangePct,
        message: `Perubahan kekayaan bersih ${row.growthPercentage > 0 ? 'naik' : 'turun'} ${magnitude.toLocaleString('id-ID', { maximumFractionDigits: 1 })}% pada ${row.year} dibanding ${row.comparedToYear}.`
      });
    }
    if (magnitude >= thresholds.unusualWealthChangePct) {
      insights.push({
        code: 'unusual-annual-movement',
        severity: 'attention',
        year: row.year,
        comparedToYear: row.comparedToYear,
        value: row.growthPercentage,
        threshold: thresholds.unusualWealthChangePct,
        message: `Pergerakan tahunan ${magnitude.toLocaleString('id-ID', { maximumFractionDigits: 1 })}% melampaui ambang peninjauan numerik ${thresholds.unusualWealthChangePct}%; perubahan ini tidak dengan sendirinya menunjukkan pelanggaran.`
      });
    }
  }

  const debtRows = orderedRows.filter((row) => isFiniteNumber(row.totalDebt));
  if (debtRows.length >= 2) {
    const first = debtRows[0];
    const latest = debtRows.at(-1);
    const debtChange = latest.totalDebt - first.totalDebt;
    const debtChangePct = first.totalDebt > 0 ? (debtChange / first.totalDebt) * 100 : null;
    const material = first.totalDebt === 0
      ? latest.totalDebt !== 0
      : Math.abs(debtChangePct) >= thresholds.materialDebtChangePct;
    if (material) {
      insights.push({
        code: debtChange > 0 ? 'debt-increase' : debtChange < 0 ? 'debt-decrease' : 'debt-stable',
        severity: 'info',
        fromYear: first.year,
        toYear: latest.year,
        value: debtChange,
        percentage: debtChangePct,
        threshold: thresholds.materialDebtChangePct,
        message: debtChange > 0
          ? `Utang yang dilaporkan meningkat ${formatRupiah(debtChange)} dari ${first.year} ke ${latest.year}.`
          : `Utang yang dilaporkan menurun ${formatRupiah(debtChange)} dari ${first.year} ke ${latest.year}.`
      });
    }
  }

  for (let index = 1; index < orderedRows.length; index += 1) {
    const previous = orderedRows[index - 1];
    const current = orderedRows[index];
    if (!previous.composition || !current.composition) continue;
    const changes = ASSET_CATEGORY_FIELDS.map((field) => ({
      field,
      percentagePoints: (current.composition[field] - previous.composition[field]) * 100
    })).sort((left, right) => Math.abs(right.percentagePoints) - Math.abs(left.percentagePoints));
    const largest = changes[0];
    if (Math.abs(largest.percentagePoints) >= thresholds.compositionShiftPercentagePoints) {
      insights.push({
        code: 'asset-composition-shift',
        severity: 'info',
        year: current.year,
        comparedToYear: previous.year,
        field: largest.field,
        value: largest.percentagePoints,
        threshold: thresholds.compositionShiftPercentagePoints,
        message: `Porsi ${FIELD_LABELS[largest.field]} berubah ${Math.abs(largest.percentagePoints).toLocaleString('id-ID', { maximumFractionDigits: 1 })} poin persentase antara ${previous.year} dan ${current.year}.`
      });
    }
  }

  return insights;
}

/** Resolve duplicate years, calculate annual rows, and attach insights. */
export function buildTimeseriesAnalysis(records, options = {}) {
  const resolution = resolveRecordDuplicates(records, { selections: options.selections || {} });
  const rows = calculateAnnualTimeseries(resolution.resolvedRecords);
  return {
    rows,
    insights: generateTimeseriesInsights(rows, options.thresholds || TIMESERIES_THRESHOLDS),
    ...resolution
  };
}
