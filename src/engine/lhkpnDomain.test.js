import { describe, expect, it } from 'vitest';
import {
  ASSET_CATEGORY_FIELDS,
  COLLISION_TYPES,
  MATCH_STATES,
  applyManualAdjustments,
  buildTimeseriesAnalysis,
  calculateAnnualTimeseries,
  classifyRecordCollision,
  computeContentHash,
  createFinancialFingerprint,
  createLHKPNRecord,
  generateTimeseriesInsights,
  getEffectiveLHKPNData,
  groupRecordsByIndividual,
  matchIdentities,
  normalizeIdentity,
  normalizeNhK,
  normalizePersonName,
  parseReportingYear,
  resolveRecordDuplicates,
  validateManualAdjustments,
  validateRecordConsistency
} from './lhkpnDomain';

const BASE_ASSETS = Object.freeze({
  tanah_dan_bangunan: 500,
  alat_transportasi_dan_mesin: 100,
  harta_bergerak_lainnya: 50,
  surat_berharga: 150,
  kas_dan_setara_kas: 200,
  harta_lainnya: 0,
  subtotal_harta: 1000,
  hutang: 100,
  total_harta_kekayaan: 900
});

function makeExtraction({
  name = 'Budi Santoso',
  nhk = 'NHK-123',
  year = '2023',
  institution = 'Kementerian A',
  position = 'Direktur',
  assets = {},
  categoryDetails,
  success = true,
  fileName = 'LHKPN.pdf',
  parsedAt = '2026-01-01T00:00:00.000Z'
} = {}) {
  return {
    fileName,
    isParsedSuccess: success,
    status: success ? 'Selesai' : 'Perlu Ditinjau',
    errorReason: success ? undefined : 'Ekstraksi tidak lengkap',
    identity: {
      nama: name,
      nhk,
      tahun_laporan: year,
      lembaga: institution,
      jabatan: position,
      unit_kerja: 'Unit Utama'
    },
    assets: { ...BASE_ASSETS, ...assets },
    categoryDetails,
    parsedAt,
    logs: success ? [] : [{ level: 'warning', msg: 'Sebagian data tidak terbaca.' }]
  };
}

function makeRecord({ id, hash, ...extractionOptions } = {}) {
  return createLHKPNRecord(makeExtraction(extractionOptions), {
    id,
    contentHash: hash,
    createdAt: '2026-01-01T00:00:00.000Z'
  });
}

describe('reporting year parsing', () => {
  it('parses numeric, dedicated, and combined LHKPN year text', () => {
    expect(parseReportingYear(2024)).toBe(2024);
    expect(parseReportingYear('2023')).toBe(2023);
    expect(parseReportingYear('Laporan Periodik - 2022')).toBe(2022);
    expect(parseReportingYear('18 Februari 2025 / Periodik - 2024')).toBe(2024);
  });

  it('rejects placeholders, invalid years, and unrelated values', () => {
    expect(parseReportingYear('-')).toBeNull();
    expect(parseReportingYear('Tahun tidak terbaca')).toBeNull();
    expect(parseReportingYear(1899)).toBeNull();
    expect(parseReportingYear(2100)).toBeNull();
    expect(parseReportingYear(null)).toBeNull();
  });
});

describe('unified LHKPN record', () => {
  it('preserves confirmed zero separately from a missing parser value', () => {
    const extraction = makeExtraction({
      assets: { surat_berharga: 0, kas_dan_setara_kas: 0 },
      categoryDetails: {
        surat_berharga: { value: 0, isZero: true, confidence: 'high' },
        kas_dan_setara_kas: { value: null, isZero: false, confidence: 'low' }
      }
    });

    const record = createLHKPNRecord(extraction, { id: 'record-a' });

    expect(record.original.assets.surat_berharga).toBe(0);
    expect(record.original.assets.kas_dan_setara_kas).toBeNull();
    expect(record.effective.assets.surat_berharga).toBe(0);
    expect(record.effective.provenance['assets.surat_berharga']).toBe('confirmed-zero');
    expect(record.effective.provenance['assets.kas_dan_setara_kas']).toBe('missing');
    expect(record.validation.warnings[0].code).toBe('MISSING_FINANCIAL_FIELDS');
  });

  it('does not treat a failed parser zero-filled fallback as real zero', () => {
    const record = createLHKPNRecord(makeExtraction({
      success: false,
      assets: Object.fromEntries(Object.keys(BASE_ASSETS).map((field) => [field, 0])),
      categoryDetails: undefined
    }), { id: 'failed-record' });

    expect(Object.values(record.original.assets).every((value) => value === null)).toBe(true);
    expect(record.parseStatus).toMatchObject({
      isSuccess: false,
      status: 'Perlu Ditinjau',
      errorReason: 'Ekstraksi tidak lengkap',
      warnings: ['Sebagian data tidak terbaca.']
    });
  });

  it('keeps original and effective snapshots detached from parser input', () => {
    const extraction = makeExtraction();
    const record = createLHKPNRecord(extraction, {
      id: 'record-copy',
      fileMeta: { name: 'source.pdf', size: 1234, type: 'application/pdf', lastModified: 99 },
      contentHash: 'sha256:abc'
    });

    extraction.identity.nama = 'Changed outside';
    extraction.assets.hutang = 999;

    expect(record.original.identity.nama).toBe('Budi Santoso');
    expect(record.effective.identity.nama).toBe('Budi Santoso');
    expect(record.original.assets.hutang).toBe(100);
    expect(record.fileMeta).toEqual({
      name: 'source.pdf',
      size: 1234,
      type: 'application/pdf',
      lastModified: 99,
      contentHash: 'sha256:abc'
    });
    expect(record.reportingYear).toBe(2023);
    expect(record.adjustments).toEqual([]);
  });

  it('returns an extraction-compatible effective snapshot', () => {
    const record = makeRecord({ id: 'compatible' });
    const effective = getEffectiveLHKPNData(record);

    expect(effective.fileName).toBe('LHKPN.pdf');
    expect(effective.isParsedSuccess).toBe(true);
    expect(effective.identity.nama).toBe('Budi Santoso');
    expect(effective.assets.total_harta_kekayaan).toBe(900);

    effective.assets.hutang = 999;
    expect(record.effective.assets.hutang).toBe(100);
  });

  it('derives effective totals from complete categories without overwriting unread originals', () => {
    const extraction = makeExtraction({
      assets: { subtotal_harta: 1000, total_harta_kekayaan: 900 },
      categoryDetails: {
        ...Object.fromEntries(ASSET_CATEGORY_FIELDS.map((field) => [field, { value: BASE_ASSETS[field] }])),
        subtotal_harta: { value: null },
        hutang: { value: 100 },
        total_harta_kekayaan: { value: null }
      }
    });

    const record = createLHKPNRecord(extraction, { id: 'derived-initial' });

    expect(record.original.assets.subtotal_harta).toBeNull();
    expect(record.original.assets.total_harta_kekayaan).toBeNull();
    expect(record.effective.assets.subtotal_harta).toBe(1000);
    expect(record.effective.assets.total_harta_kekayaan).toBe(900);
    expect(record.effective.provenance['assets.subtotal_harta']).toBe('derived');
    expect(record.effective.provenance['assets.total_harta_kekayaan']).toBe('derived');
  });
});

describe('manual adjustments and consistency', () => {
  it('updates effective data immutably and derives dependent totals', () => {
    const originalRecord = makeRecord({ id: 'adjust-me' });
    const updated = applyManualAdjustments(
      originalRecord,
      {
        identity: { jabatan: 'Komisaris', tahun_laporan: 2024 },
        assets: { kas_dan_setara_kas: 300 }
      },
      {
        id: 'audit-1',
        adjustedAt: '2026-02-02T03:04:05.000Z',
        adjustedBy: 'operator',
        reason: 'Koreksi dokumen'
      }
    );

    expect(updated).not.toBe(originalRecord);
    expect(originalRecord.effective.assets.kas_dan_setara_kas).toBe(200);
    expect(originalRecord.effective.assets.subtotal_harta).toBe(1000);
    expect(updated.original.assets.kas_dan_setara_kas).toBe(200);
    expect(updated.effective.assets.kas_dan_setara_kas).toBe(300);
    expect(updated.effective.assets.subtotal_harta).toBe(1100);
    expect(updated.effective.assets.total_harta_kekayaan).toBe(1000);
    expect(updated.effective.identity.jabatan).toBe('Komisaris');
    expect(updated.reportingYear).toBe(2024);
    expect(updated.effective.provenance['assets.kas_dan_setara_kas']).toBe('manual');
    expect(updated.effective.provenance['assets.subtotal_harta']).toBe('derived');
    expect(updated.adjustments).toHaveLength(1);
    expect(updated.adjustments[0]).toMatchObject({
      id: 'audit-1',
      adjustedAt: '2026-02-02T03:04:05.000Z',
      adjustedBy: 'operator',
      reason: 'Koreksi dokumen'
    });
    expect(updated.adjustments[0].changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'assets.kas_dan_setara_kas',
        previousValue: 200,
        newValue: 300,
        origin: 'manual'
      }),
      expect.objectContaining({
        path: 'assets.subtotal_harta',
        previousValue: 1000,
        newValue: 1100,
        origin: 'derived'
      }),
      expect.objectContaining({
        path: 'assets.total_harta_kekayaan',
        previousValue: 900,
        newValue: 1000,
        origin: 'derived'
      })
    ]));
    expect(updated.validation.isConsistent).toBe(true);
  });

  it('keeps explicit totals and surfaces contradictions instead of replacing them', () => {
    const record = makeRecord({ id: 'contradiction' });
    const updated = applyManualAdjustments(record, {
      assets: {
        kas_dan_setara_kas: 300,
        subtotal_harta: 1234,
        total_harta_kekayaan: 999
      }
    }, { adjustedAt: '2026-02-02T00:00:00.000Z' });

    expect(updated.effective.assets.subtotal_harta).toBe(1234);
    expect(updated.effective.assets.total_harta_kekayaan).toBe(999);
    expect(updated.validation.hasContradictions).toBe(true);
    expect(updated.validation.warnings.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'SUBTOTAL_MISMATCH',
      'NET_WORTH_MISMATCH'
    ]));
  });

  it('allows a financial value to be explicitly cleared without converting it to zero', () => {
    const record = makeRecord({ id: 'clear-value' });
    const updated = applyManualAdjustments(record, {
      assets: { surat_berharga: null }
    }, { adjustedAt: '2026-02-02T00:00:00.000Z' });

    expect(updated.effective.assets.surat_berharga).toBeNull();
    expect(updated.effective.provenance['assets.surat_berharga']).toBe('manual');
    expect(updated.validation.checks.categoriesComplete).toBe(false);
  });

  it('does not append an audit event for a no-op save', () => {
    const record = makeRecord({ id: 'no-op' });
    expect(applyManualAdjustments(record, { assets: { hutang: 100 } })).toBe(record);
  });

  it('rejects invalid numbers, unknown fields, blank names, and invalid years', () => {
    const record = makeRecord({ id: 'invalid-adjustment' });
    const validation = validateManualAdjustments(record, {
      identity: { nama: '', tahun_laporan: 'tahun depan', rahasia: 'x' },
      assets: { hutang: -1, kas_dan_setara_kas: Number.NaN, unknown: 1 }
    });

    expect(validation.isValid).toBe(false);
    expect(validation.errors.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'REQUIRED_NAME',
      'INVALID_REPORTING_YEAR',
      'UNSUPPORTED_FIELD',
      'NEGATIVE_FINANCIAL_VALUE',
      'INVALID_FINANCIAL_VALUE'
    ]));
    expect(() => applyManualAdjustments(record, { assets: { hutang: Infinity } })).toThrow(
      'Penyesuaian LHKPN tidak valid.'
    );
  });

  it('reports subtotal and net-worth checks independently', () => {
    const result = validateRecordConsistency({
      assets: { ...BASE_ASSETS, subtotal_harta: 1100, total_harta_kekayaan: 800 }
    });

    expect(result.isValid).toBe(true);
    expect(result.isConsistent).toBe(false);
    expect(result.checks.expectedSubtotal).toBe(1000);
    expect(result.checks.expectedNetWorth).toBe(1000);
    expect(result.warnings.map(({ code }) => code)).toEqual([
      'SUBTOTAL_MISMATCH',
      'NET_WORTH_MISMATCH'
    ]);
  });
});

describe('identity normalization and matching', () => {
  it('normalizes NHK punctuation and harmless name title variations', () => {
    expect(normalizeNhK(' NHK-001.234 ')).toBe('001234');
    expect(normalizeNhK('-')).toBeNull();
    expect(normalizePersonName('Prof. Dr. Budi Santoso, S.E., M.Si.')).toBe('budi santoso');
    expect(normalizePersonName('BUDI   SANTOSO')).toBe('budi santoso');
    expect(normalizeIdentity({ nama: 'Ir. Budi Santoso', lembaga: 'Kementerian  A' })).toMatchObject({
      name: 'budi santoso',
      institution: 'kementerian a'
    });
  });

  it('confirms equal stable identifiers despite position and institution changes', () => {
    const match = matchIdentities(
      { nama: 'Budi Santoso', nhk: 'NHK-123', jabatan: 'Direktur', lembaga: 'A' },
      { nama: 'B. Santoso', nhk: 'nhk 123', jabatan: 'Komisaris', lembaga: 'B' }
    );

    expect(match).toMatchObject({
      state: MATCH_STATES.CONFIRMED,
      confidence: 'high',
      reason: 'same-stable-identifier'
    });
  });

  it('confirms equivalent normalized full names when no IDs contradict', () => {
    const match = matchIdentities(
      { nama: 'Dr. Dewi Lestari, S.H., M.H.', nhk: '-' },
      { nama: 'DEWI LESTARI' }
    );
    expect(match.state).toBe(MATCH_STATES.CONFIRMED);
    expect(match.reason).toBe('same-normalized-name');
  });

  it('treats different stable identifiers as clearly different even for equal names', () => {
    expect(matchIdentities(
      { nama: 'Budi Santoso', nhk: '100' },
      { nama: 'Budi Santoso', nhk: '200' }
    )).toMatchObject({
      state: MATCH_STATES.DIFFERENT,
      reason: 'different-stable-identifier'
    });
  });

  it('holds similar names for confirmation and rejects clearly different names', () => {
    expect(matchIdentities(
      { nama: 'Budi Santoso' },
      { nama: 'Budi Santosa' }
    ).state).toBe(MATCH_STATES.UNCERTAIN);
    expect(matchIdentities(
      { nama: 'Budi Santoso' },
      { nama: 'Ratna Wijaya' }
    ).state).toBe(MATCH_STATES.DIFFERENT);
    expect(matchIdentities(
      { nama: null },
      { nama: 'Ratna Wijaya' }
    ).state).toBe(MATCH_STATES.UNCERTAIN);
  });
});

describe('fingerprints and duplicate-year resolution', () => {
  it('uses a deterministic identity-free fingerprint that distinguishes null and zero', () => {
    const first = makeRecord({ id: 'fp-a', name: 'Person A' });
    const sameFinances = makeRecord({ id: 'fp-b', name: 'Person B', nhk: '999' });
    const missingCash = applyManualAdjustments(first, { assets: { kas_dan_setara_kas: null } }, {
      adjustedAt: '2026-03-01T00:00:00.000Z'
    });
    const zeroCash = applyManualAdjustments(first, { assets: { kas_dan_setara_kas: 0 } }, {
      adjustedAt: '2026-03-01T00:00:00.000Z'
    });

    expect(createFinancialFingerprint(first)).toBe(createFinancialFingerprint(sameFinances));
    expect(createFinancialFingerprint(missingCash)).not.toBe(createFinancialFingerprint(zeroCash));
  });

  it('computes a stable SHA-256 file-content hash when Web Crypto is available', async () => {
    const hash = await computeContentHash('abc');
    if (hash !== null) {
      expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    }
  });

  it('classifies exact, equivalent, conflicting, distinct, and missing-year records', () => {
    const baseline = makeRecord({ id: 'base', hash: 'same-content' });
    const exact = makeRecord({ id: 'exact', hash: 'same-content' });
    const equivalent = makeRecord({ id: 'equivalent', hash: 'other-content' });
    const conflict = makeRecord({
      id: 'conflict',
      hash: 'third-content',
      assets: { kas_dan_setara_kas: 250, subtotal_harta: 1050, total_harta_kekayaan: 950 }
    });
    const anotherYear = makeRecord({ id: 'another-year', year: 2024 });
    const missingYear = makeRecord({ id: 'missing-year', year: '-' });

    expect(classifyRecordCollision(baseline, exact).type).toBe(COLLISION_TYPES.EXACT_DUPLICATE);
    expect(classifyRecordCollision(baseline, equivalent).type).toBe(COLLISION_TYPES.SAME_YEAR_EQUIVALENT);
    expect(classifyRecordCollision(baseline, conflict).type).toBe(COLLISION_TYPES.SAME_YEAR_CONFLICT);
    expect(classifyRecordCollision(baseline, anotherYear).type).toBe(COLLISION_TYPES.DISTINCT);
    expect(classifyRecordCollision(baseline, missingYear).type).toBe(COLLISION_TYPES.MISSING_YEAR);
  });

  it('automatically keeps one exact/equivalent duplicate', () => {
    const first = makeRecord({ id: 'first', hash: 'same-content' });
    const exact = makeRecord({ id: 'exact', hash: 'same-content' });
    const equivalent = makeRecord({ id: 'equivalent', hash: 'different-content' });
    const result = resolveRecordDuplicates([first, exact, equivalent]);

    expect(result.resolvedRecords.map(({ id }) => id)).toEqual(['first']);
    expect(result.duplicates.map(({ type }) => type).sort()).toEqual([
      COLLISION_TYPES.EXACT_DUPLICATE,
      COLLISION_TYPES.SAME_YEAR_EQUIVALENT
    ].sort());
    expect(result.conflicts).toEqual([]);
  });

  it('withholds a conflicting year until the user selects a record', () => {
    const first = makeRecord({ id: 'first' });
    const conflicting = makeRecord({
      id: 'second',
      assets: { hutang: 200, total_harta_kekayaan: 800 }
    });

    const unresolved = resolveRecordDuplicates([first, conflicting]);
    expect(unresolved.resolvedRecords).toEqual([]);
    expect(unresolved.unresolvedConflicts).toHaveLength(1);

    const resolved = resolveRecordDuplicates([first, conflicting], {
      selections: { 2023: 'second' }
    });
    expect(resolved.resolvedRecords.map(({ id }) => id)).toEqual(['second']);
    expect(resolved.conflicts[0]).toMatchObject({ resolved: true, selectedRecordId: 'second' });
  });

  it('keeps missing-year records outside chronological results', () => {
    const missing = makeRecord({ id: 'missing', year: '-' });
    const valid = makeRecord({ id: 'valid', year: '2022' });
    const result = resolveRecordDuplicates([missing, valid]);

    expect(result.resolvedRecords.map(({ id }) => id)).toEqual(['valid']);
    expect(result.withoutYear.map(({ id }) => id)).toEqual(['missing']);
  });
});

describe('grouping records by individual', () => {
  it('groups confirmed identities, keeps people separate, and uses the latest year', () => {
    const budi2022 = makeRecord({ id: 'budi-2022', year: 2022, nhk: '123' });
    const budi2024 = makeRecord({
      id: 'budi-2024',
      year: 2024,
      nhk: 'NHK-123',
      institution: 'Kementerian Baru',
      position: 'Komisaris',
      assets: { kas_dan_setara_kas: 300, subtotal_harta: 1100, total_harta_kekayaan: 1000 }
    });
    const ratna = makeRecord({ id: 'ratna', name: 'Ratna Wijaya', nhk: '456', year: 2023 });

    const result = groupRecordsByIndividual([budi2024, ratna, budi2022]);

    expect(result.groups).toHaveLength(2);
    const budiGroup = result.groups.find(({ records }) => records.some(({ id }) => id === 'budi-2022'));
    expect(budiGroup.records.map(({ id }) => id)).toEqual(['budi-2022', 'budi-2024']);
    expect(budiGroup.years).toEqual([2022, 2024]);
    expect(budiGroup.latestRecord.id).toBe('budi-2024');
    expect(budiGroup.status).toBe('multi-year');
    expect(result.uncertain).toEqual([]);
  });

  it('holds a similar identity for review instead of silently grouping it', () => {
    const budi = makeRecord({ id: 'budi', name: 'Budi Santoso', nhk: '-' });
    const similar = makeRecord({ id: 'similar', name: 'Budi Santosa', nhk: '-' });
    const result = groupRecordsByIndividual([budi, similar]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].records.map(({ id }) => id)).toEqual(['budi']);
    expect(result.uncertain).toHaveLength(1);
    expect(result.uncertain[0].record.id).toBe('similar');
  });

  it('does not strip single-letter name initials as academic titles', () => {
    const match = matchIdentities(
      { nama: 'Andi S', nhk: null },
      { nama: 'Andi M', nhk: null }
    );

    expect(normalizePersonName('Andi S')).toBe('andi s');
    expect(normalizePersonName('Andi M')).toBe('andi m');
    expect(match.state).not.toBe(MATCH_STATES.CONFIRMED);
  });

  it('replays a user-confirmed uncertain identity decision', () => {
    const budi = makeRecord({ id: 'budi', name: 'Budi Santoso', nhk: '-' });
    const similar = makeRecord({ id: 'similar', name: 'Budi Santosa', nhk: '-' });
    const result = groupRecordsByIndividual([budi, similar], {
      confirmedMatches: [['budi', 'similar']]
    });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].records).toHaveLength(2);
    expect(result.uncertain).toEqual([]);
  });

  it('marks a group incomplete when a financial value is manually cleared', () => {
    const original = makeRecord({ id: 'record-clear' });
    const adjusted = applyManualAdjustments(original, {
      assets: { kas_dan_setara_kas: null }
    }, { adjustedAt: '2026-02-01T00:00:00.000Z' });

    const result = groupRecordsByIndividual([adjusted]);

    expect(adjusted.validation.warnings.some(({ code }) => code === 'MISSING_FINANCIAL_FIELDS')).toBe(true);
    expect(result.groups[0].status).toBe('incomplete');
  });
});

describe('annual timeseries calculations and insights', () => {
  it('sorts years, flags gaps, and calculates change against the previous available net worth', () => {
    const year2024 = makeRecord({
      id: 'year-2024',
      year: 2024,
      assets: { subtotal_harta: 1600, hutang: 100, total_harta_kekayaan: 1500 }
    });
    const year2020 = makeRecord({
      id: 'year-2020',
      year: 2020,
      assets: { subtotal_harta: 1100, hutang: 100, total_harta_kekayaan: 1000 }
    });
    const year2022MissingNet = makeRecord({
      id: 'year-2022',
      year: 2022,
      assets: { subtotal_harta: 1300, hutang: 100, total_harta_kekayaan: null }
    });

    const rows = calculateAnnualTimeseries([year2024, year2020, year2022MissingNet]);

    expect(rows.map(({ year }) => year)).toEqual([2020, 2022, 2024]);
    expect(rows[1]).toMatchObject({
      netWorth: null,
      hasYearGap: true,
      missingYearsBefore: [2021],
      growthPercentage: null,
      growthUnavailableReason: 'current-net-worth-missing'
    });
    expect(rows[2]).toMatchObject({
      wealthChange: 500,
      growthPercentage: 50,
      comparedToYear: 2020,
      hasYearGap: true,
      missingYearsBefore: [2023]
    });
  });

  it('does not calculate growth from zero or negative previous net worth', () => {
    const zero = makeRecord({
      id: 'zero',
      year: 2020,
      assets: { subtotal_harta: 100, hutang: 100, total_harta_kekayaan: 0 }
    });
    const negative = makeRecord({
      id: 'negative',
      year: 2021,
      assets: { subtotal_harta: 100, hutang: 200, total_harta_kekayaan: -100 }
    });
    const positive = makeRecord({
      id: 'positive',
      year: 2022,
      assets: { subtotal_harta: 200, hutang: 100, total_harta_kekayaan: 100 }
    });

    const rows = calculateAnnualTimeseries([positive, zero, negative]);
    expect(rows[1]).toMatchObject({
      wealthChange: -100,
      growthPercentage: null,
      growthUnavailableReason: 'previous-net-worth-not-positive'
    });
    expect(rows[2]).toMatchObject({
      wealthChange: 200,
      growthPercentage: null,
      growthUnavailableReason: 'previous-net-worth-not-positive'
    });
  });

  it('generates deterministic neutral insights from numerical thresholds', () => {
    const rows = calculateAnnualTimeseries([
      makeRecord({ id: 'insight-2022', year: 2022 }),
      makeRecord({
        id: 'insight-2023',
        year: 2023,
        assets: {
          tanah_dan_bangunan: 200,
          kas_dan_setara_kas: 800,
          subtotal_harta: 1300,
          hutang: 300,
          total_harta_kekayaan: 1000
        }
      }),
      makeRecord({
        id: 'insight-2024',
        year: 2024,
        assets: {
          tanah_dan_bangunan: 200,
          kas_dan_setara_kas: 1700,
          subtotal_harta: 2200,
          hutang: 300,
          total_harta_kekayaan: 1900
        }
      })
    ]);
    const insights = generateTimeseriesInsights(rows);
    const codes = insights.map(({ code }) => code);

    expect(codes).toEqual(expect.arrayContaining([
      'overall-increase',
      'large-annual-increase',
      'unusual-annual-movement',
      'debt-increase',
      'asset-composition-shift'
    ]));
    expect(insights.find(({ code }) => code === 'unusual-annual-movement').message).toContain(
      'tidak dengan sendirinya menunjukkan pelanggaran'
    );
  });

  it('reports insufficient history instead of inventing a trend', () => {
    const rows = calculateAnnualTimeseries([makeRecord({ id: 'only-one', year: 2024 })]);
    expect(generateTimeseriesInsights(rows)).toEqual([
      expect.objectContaining({ code: 'insufficient-wealth-history' })
    ]);
  });

  it('builds a complete analysis while exposing unresolved same-year conflicts', () => {
    const year2022 = makeRecord({ id: '2022', year: 2022 });
    const year2023a = makeRecord({
      id: '2023-a',
      year: 2023,
      assets: { subtotal_harta: 1200, total_harta_kekayaan: 1100 }
    });
    const year2023b = makeRecord({
      id: '2023-b',
      year: 2023,
      assets: { subtotal_harta: 1400, total_harta_kekayaan: 1300 }
    });

    const unresolved = buildTimeseriesAnalysis([year2023b, year2022, year2023a]);
    expect(unresolved.rows.map(({ year }) => year)).toEqual([2022]);
    expect(unresolved.unresolvedConflicts).toHaveLength(1);

    const selected = buildTimeseriesAnalysis([year2023b, year2022, year2023a], {
      selections: { 2023: '2023-b' }
    });
    expect(selected.rows.map(({ year, recordId }) => [year, recordId])).toEqual([
      [2022, '2022'],
      [2023, '2023-b']
    ]);
  });

  it('marks composition unavailable if even one category is unread', () => {
    const record = makeRecord({ id: 'missing-category' });
    const adjusted = applyManualAdjustments(record, {
      assets: { [ASSET_CATEGORY_FIELDS[0]]: null }
    }, { adjustedAt: '2026-03-03T00:00:00.000Z' });
    const [row] = calculateAnnualTimeseries([adjusted]);
    expect(row.composition).toBeNull();
  });
});
