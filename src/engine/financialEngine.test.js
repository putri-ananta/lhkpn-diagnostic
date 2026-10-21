import { describe, it, expect, vi } from 'vitest';

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: new URL('../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
}));
import {
  calculateDAR,
  calculateCAR,
  calculatePropertyConcentration,
  calculateDepreciatingAssetRatio,
  calculateProductiveAssetRatio,
  calculatePersonalFinanceSimulation,
  runFinancialDiagnosis,
  generatePortfolioProfile,
  generateKeyFindings,
  deriveOverallStatus,
  checkDataIntegrity,
  resolveSubtotalFromCategories,
  normalizeFinancialData
} from './financialEngine';
import { parseIndonesianMoney, formatCurrency, formatPercent } from '../utils/formatting';
import {
  assessFinancialCompleteness,
  extractCategoryValuesFromLines,
  extractIdentityFromLines,
  groupTextItemsIntoLines,
  parseLHKPNPDF
} from './lhkpnParser';

function buildMinimalTextPdf(lines) {
  const escapePdfText = (value) => value.replace(/([\\()])/g, '\\$1');
  const content = [
    'BT',
    '/F1 10 Tf',
    ...lines.map((line, index) => `1 0 0 1 50 ${800 - index * 18} Tm (${escapePdfText(line)}) Tj`),
    'ET'
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf).buffer;
}

describe('PDF text layout parsing', () => {
  it('orders text by reading position instead of PDF item order', () => {
    const lines = groupTextItemsIntoLines([
      { str: 'Rp. 100.000', x: 120, y: 700, height: 12 },
      { str: 'KAS', x: 20, y: 700, height: 12 },
      { str: 'TANAH', x: 20, y: 720, height: 12 },
      { str: 'Rp. 200.000', x: 120, y: 720, height: 12 }
    ]);

    expect(lines).toEqual(['TANAH Rp. 200.000', 'KAS Rp. 100.000']);
  });

  it('does not let a large title merge separate body lines', () => {
    const lines = groupTextItemsIntoLines([
      { str: 'PENGUMUMAN', x: 20, y: 760, height: 30 },
      { str: 'A. TANAH DAN BANGUNAN', x: 20, y: 720, height: 10 },
      { str: 'Rp. 6.177.000.000', x: 320, y: 714, height: 10 }
    ]);

    expect(lines).toEqual([
      'PENGUMUMAN',
      'A. TANAH DAN BANGUNAN',
      'Rp. 6.177.000.000'
    ]);
  });

  it('reads official KPK split-line totals without using item or neighbouring values', () => {
    const extracted = extractCategoryValuesFromLines([
      'II. DATA HARTA',
      'A.',
      'TANAH DAN BANGUNAN',
      'Rp.',
      '6.177.000.000',
      '1.',
      'Tanah Seluas 224 m2, HASIL SENDIRI Rp. 750.000.000',
      'B. ALAT TRANSPORTASI DAN MESIN',
      'Rp. 815.000.000',
      '1. MOBIL, TOYOTA Tahun 1997, HASIL SENDIRI Rp. 40.000.000',
      'C. HARTA BERGERAK LAINNYA Rp. 117.500.000',
      'D. SURAT BERHARGA',
      'Rp. ----',
      'E. KAS DAN SETARA KAS',
      'R p . 105.900.000',
      'F. HARTA LAINNYA Rp. 225.188.000',
      'Sub Total',
      'Rp.',
      '7.440.588.000',
      'III. HUTANG',
      'Rp. 62.390.867',
      'IV. TOTAL HARTA KEKAYAAN (II-III)',
      'Rp. 7.378.197.133'
    ]);

    expect(extracted.tanah_dan_bangunan.value).toBe(6177000000);
    expect(extracted.alat_transportasi_dan_mesin.value).toBe(815000000);
    expect(extracted.harta_bergerak_lainnya.value).toBe(117500000);
    expect(extracted.surat_berharga.value).toBe(0);
    expect(extracted.kas_dan_setara_kas.value).toBe(105900000);
    expect(extracted.harta_lainnya.value).toBe(225188000);
    expect(extracted.subtotal_harta.value).toBe(7440588000);
    expect(extracted.hutang.value).toBe(62390867);
    expect(extracted.total_harta_kekayaan.value).toBe(7378197133);
  });

  it('reads identity fields and the combined KPK report header', () => {
    const identity = extractIdentityFromLines([
      '(Tanggal Penyampaian/Jenis Laporan - Tahun: 18 Februari 2025/Periodik - 2024)',
      'Status Verifikasi Administratif Lengkap',
      'BIDANG',
      ': EKSEKUTIF',
      'LEMBAGA : KOMISI PEMBERANTASAN KORUPSI (KPK)',
      'UNIT KERJA',
      ': PIMPINAN',
      'I. DATA PRIBADI',
      '1.',
      'Nama',
      ': JOHANIS TANAK',
      '2. Jabatan : WAKIL KETUA KPK',
      '3.',
      'NHK',
      ': 140163',
      'II. DATA HARTA'
    ]);

    expect(identity).toMatchObject({
      nama: 'JOHANIS TANAK',
      jabatan: 'WAKIL KETUA KPK',
      nhk: '140163',
      bidang: 'EKSEKUTIF',
      lembaga: 'KOMISI PEMBERANTASAN KORUPSI (KPK)',
      unit_kerja: 'PIMPINAN',
      tanggal_penyampaian: '18 Februari 2025',
      jenis_laporan: 'Periodik',
      tahun_laporan: '2024',
      status_verifikasi: 'Administratif Lengkap'
    });
  });

  it('does not invent identity fields from a file name or generic placeholders', () => {
    const identity = extractIdentityFromLines(['Dokumen tanpa bagian identitas'], 'Nama_Dari_File.pdf');

    expect(identity).toEqual({
      nama: null,
      jabatan: null,
      nhk: null,
      bidang: null,
      lembaga: null,
      unit_kerja: null,
      tanggal_penyampaian: null,
      jenis_laporan: null,
      tahun_laporan: null,
      status_verifikasi: null
    });
  });

  it('marks a corrupt PDF as a fatal failure without fabricated zeroes or identity', async () => {
    const invalidPdf = new TextEncoder().encode('bukan dokumen pdf').buffer;
    const result = await parseLHKPNPDF(invalidPdf, 'Nama_Dari_File.pdf');

    expect(result.status).toBe('Gagal');
    expect(result.fatalError).toBe(true);
    expect(result.identity.nama).toBeNull();
    expect(Object.values(result.assets).every((value) => value === null)).toBe(true);
  });

  it('parses a complete supported PDF through the real PDF.js path', async () => {
    const pdf = buildMinimalTextPdf([
      'I. DATA PRIBADI',
      'Nama : BUDI SANTOSO',
      'Jabatan : DIREKTUR',
      'NHK : 12345',
      'LEMBAGA : KEMENTERIAN CONTOH',
      'UNIT KERJA : UNIT UTAMA',
      'Tanggal Penyampaian/Jenis Laporan - Tahun: 18 Februari 2025/Periodik - 2024',
      'II. DATA HARTA',
      'A. TANAH DAN BANGUNAN Rp. 100.000.000',
      'B. ALAT TRANSPORTASI DAN MESIN Rp. 20.000.000',
      'C. HARTA BERGERAK LAINNYA Rp. 10.000.000',
      'D. SURAT BERHARGA Rp. 30.000.000',
      'E. KAS DAN SETARA KAS Rp. 40.000.000',
      'F. HARTA LAINNYA Rp. ----',
      'SUB TOTAL HARTA Rp. 200.000.000',
      'III. HUTANG Rp. 50.000.000',
      'IV. TOTAL HARTA KEKAYAAN Rp. 150.000.000'
    ]);

    const result = await parseLHKPNPDF(pdf, 'dokumen.pdf');

    expect(result.status, result.errorReason).toBe('Selesai');
    expect(result.isParsedSuccess).toBe(true);
    expect(result.identity).toMatchObject({ nama: 'BUDI SANTOSO', nhk: '12345', tahun_laporan: '2024' });
    expect(result.assets).toMatchObject({
      tanah_dan_bangunan: 100_000_000,
      surat_berharga: 30_000_000,
      kas_dan_setara_kas: 40_000_000,
      harta_lainnya: 0,
      subtotal_harta: 200_000_000,
      hutang: 50_000_000,
      total_harta_kekayaan: 150_000_000
    });
  });

  it('accepts confirmed all-zero values but flags a missing debt field', () => {
    const allZero = {
      tanah_dan_bangunan: 0,
      alat_transportasi_dan_mesin: 0,
      harta_bergerak_lainnya: 0,
      surat_berharga: 0,
      kas_dan_setara_kas: 0,
      harta_lainnya: 0,
      subtotal_harta: 0,
      hutang: 0,
      total_harta_kekayaan: 0
    };

    expect(assessFinancialCompleteness(allZero)).toEqual({ isSuccess: true, missingFields: [] });
    expect(assessFinancialCompleteness({ ...allZero, hutang: null })).toEqual({
      isSuccess: false,
      missingFields: ['hutang']
    });
  });
});

describe('Indonesian Money Parsing Utilities', () => {
  it('parses standard Indonesian money strings correctly', () => {
    expect(parseIndonesianMoney('Rp. 8.645.951.000').value).toBe(8645951000);
    expect(parseIndonesianMoney('Rp 400.000.000').value).toBe(400000000);
    expect(parseIndonesianMoney('Rp. 17.596.646.027').value).toBe(17596646027);
    expect(parseIndonesianMoney('R p . 6.177.000.000').value).toBe(6177000000);
  });

  it('handles zero / dash formats correctly', () => {
    expect(parseIndonesianMoney('Rp. ----').value).toBe(0);
    expect(parseIndonesianMoney('----').value).toBe(0);
    expect(parseIndonesianMoney('0').value).toBe(0);
    expect(parseIndonesianMoney('Rp. ----').isZeroPattern).toBe(true);
  });

  it('handles empty or null inputs', () => {
    expect(parseIndonesianMoney(null).value).toBeNull();
    expect(parseIndonesianMoney('').value).toBeNull();
  });

  it('formats compact and exact Indonesian Rupiah', () => {
    expect(formatCurrency(17600000000, true)).toBe('Rp 17,6 miliar');
    expect(formatCurrency(400000000, true)).toBe('Rp 400 juta');
    expect(formatCurrency(17596646027)).toBe('Rp 17.596.646.027');
  });

  it('formats percentage correctly', () => {
    expect(formatPercent(0.47115)).toBe('47,1%');
    expect(formatPercent(0)).toBe('0,0%');
  });
});

describe('Financial Engine Ratios', () => {
  const sampleSubtotal = 17596646027;

  it('calculates Debt-to-Asset Ratio (DAR) correctly', () => {
    // 0 hutang
    const resZero = calculateDAR(0, sampleSubtotal);
    expect(resZero.ratio).toBe(0);
    expect(resZero.status).toBe('Sangat Baik');

    // 500 million hutang
    const resDebt = calculateDAR(500000000, sampleSubtotal);
    expect(resDebt.ratio).toBeCloseTo(500000000 / sampleSubtotal);
    expect(resDebt.status).toBe('Sehat / Aman');
  });

  it('calculates Cash-to-Asset Ratio (CAR) correctly', () => {
    const kas = 8290695027;
    const res = calculateCAR(kas, sampleSubtotal);
    expect(res.ratio).toBeCloseTo(kas / sampleSubtotal);
    // kas / subtotal ~ 47.1% -> Kas Berlebihan / Inflasi (>25%)
    expect(res.status).toBe('Kas Berlebihan / Inflasi');
  });

  it('calculates Property Concentration Ratio correctly', () => {
    const tanah = 8645951000;
    const res = calculatePropertyConcentration(tanah, sampleSubtotal);
    expect(res.ratio).toBeCloseTo(tanah / sampleSubtotal);
    // tanah / subtotal ~ 49.1% -> Berimbang (40%-60%)
    expect(res.status).toBe('Berimbang');
  });

  it('calculates Depreciating Asset Ratio correctly', () => {
    const transport = 400000000;
    const bergerak = 260000000;
    const res = calculateDepreciatingAssetRatio(transport, bergerak, sampleSubtotal);
    expect(res.ratio).toBeCloseTo((transport + bergerak) / sampleSubtotal);
    // ~ 3.75% -> Ideal (<15%)
    expect(res.status).toBe('Ideal');
  });

  it('does not convert an unread depreciating-asset category into zero', () => {
    const missingTransport = calculateDepreciatingAssetRatio(null, 100_000_000, 1_000_000_000);
    const missingMovables = calculateDepreciatingAssetRatio(100_000_000, null, 1_000_000_000);

    expect(missingTransport.ratio).toBeNull();
    expect(missingTransport.status).toBe('Data Tidak Lengkap');
    expect(missingMovables.ratio).toBeNull();
    expect(missingMovables.status).toBe('Data Tidak Lengkap');
  });

  it('calculates Productive Asset Ratio correctly', () => {
    const suratBerharga = 0;
    const res = calculateProductiveAssetRatio(suratBerharga, sampleSubtotal);
    expect(res.ratio).toBe(0);
    expect(res.status).toBe('Rendah / Tidak Ada Investasi');
  });

  it('does not convert unread securities into a confirmed zero allocation', () => {
    const result = calculateProductiveAssetRatio(null, 1_000_000_000);

    expect(result.ratio).toBeNull();
    expect(result.status).toBe('Data Tidak Lengkap');
  });

  it('handles missing or zero subtotal without dividing by zero', () => {
    const resZero = calculateDAR(100000, 0);
    expect(resZero.ratio).toBeNull();
    expect(resZero.status).toBe('Data Tidak Lengkap');

    const resNull = calculateCAR(100000, null);
    expect(resNull.ratio).toBeNull();
    expect(resNull.status).toBe('Data Tidak Lengkap');
  });
});

describe('Personal Finance Simulation', () => {
  it('calculates targets when income and expenditure are provided', () => {
    const sim = calculatePersonalFinanceSimulation(20000000, 10000000);
    expect(sim.hasInputs).toBe(true);
    expect(sim.fireTarget).toBe((10000000 * 12) / 0.04); // 3 billion, expense-based
    expect(sim.minMonthlyInvestment).toBe(20000000 * 0.15); // 3 million
    expect(sim.maxEssentialSpending).toBe(20000000 * 0.65); // 13 million
    expect(sim.emergencyFundTarget).toBe(10000000 * 3); // 30 million
  });

  it('returns nulls when inputs are missing', () => {
    const sim = calculatePersonalFinanceSimulation(null, null);
    expect(sim.hasInputs).toBe(false);
    expect(sim.fireTarget).toBeNull();
    expect(sim.emergencyFundTarget).toBeNull();
  });
});

describe('Full Financial Diagnosis Run', () => {
  it('runs diagnosis engine without crashing on full LHKPN object', () => {
    const sampleLhkpn = {
      identity: { nama: 'Budi Santoso', jabatan: 'Direktur' },
      assets: {
        tanah_dan_bangunan: 8645951000,
        alat_transportasi_dan_mesin: 400000000,
        harta_bergerak_lainnya: 260000000,
        surat_berharga: 0,
        kas_dan_setara_kas: 8290695027,
        harta_lainnya: 0,
        subtotal_harta: 17596646027,
        hutang: 0,
        total_harta_kekayaan: 17596646027
      }
    };

    const diag = runFinancialDiagnosis(sampleLhkpn);
    expect(diag.metrics).toHaveLength(5);
    expect(diag.narrativeSummary).toContain('properti');
    expect(diag.disclaimer).toContain('DISCLAIMER');
    expect(diag.portfolioProfile).toBeDefined();
    expect(diag.portfolioProfile.label).toBeDefined();
    expect(diag.portfolioProfile.color).toBeDefined();
    expect(diag.keyFindings).toBeDefined();
    expect(diag.keyFindings.length).toBeGreaterThan(0);
    expect(diag.categoryDetails).toBeDefined();
  });

  it('returns balanced profile for Tito sample (Surya Tirta)', () => {
    const titoAssets = {
      tanah_dan_bangunan: 3500000000,
      alat_transportasi_dan_mesin: 450000000,
      harta_bergerak_lainnya: 280000000,
      surat_berharga: 1200000000,
      kas_dan_setara_kas: 1800000000,
      harta_lainnya: 0,
      subtotal_harta: 7230000000,
      hutang: 0,
      total_harta_kekayaan: 7230000000
    };

    const metrics = [
      calculateDAR(titoAssets.hutang, titoAssets.subtotal_harta),
      calculateCAR(titoAssets.kas_dan_setara_kas, titoAssets.subtotal_harta),
      calculatePropertyConcentration(titoAssets.tanah_dan_bangunan, titoAssets.subtotal_harta),
      calculateDepreciatingAssetRatio(titoAssets.alat_transportasi_dan_mesin, titoAssets.harta_bergerak_lainnya, titoAssets.subtotal_harta),
      calculateProductiveAssetRatio(titoAssets.surat_berharga, titoAssets.subtotal_harta)
    ];

    const integrity = checkDataIntegrity(titoAssets);
    const overallStatus = deriveOverallStatus(metrics, integrity);
    expect(overallStatus).toBe('Likuiditas Seimbang');

    // Verify key metrics
    expect(metrics[0].ratio).toBe(0); // No debt
    expect(metrics[0].status).toBe('Sangat Baik');
    expect(metrics[1].ratio).toBeCloseTo(1800000000 / 7230000000);
    expect(metrics[3].ratio).toBeCloseTo((450000000 + 280000000) / 7230000000);
    expect(metrics[4].ratio).toBeCloseTo(1200000000 / 7230000000);

    // Portfolio profile should exist and have correct structure
    const profile = generatePortfolioProfile(metrics, titoAssets);
    expect(profile.label).toBeDefined();
    expect(profile.description).toBeDefined();
    expect(profile.color).toBeDefined();

    // Key findings should include debt strength and productive asset note
    const findings = generateKeyFindings(metrics, titoAssets, integrity);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some(f => f.type === 'strength' && f.text.includes('utang'))).toBe(true);
  });

  describe('Portfolio Profile Generation', () => {
    it('returns "Portofolio Seimbang" for balanced portfolio (no debt, good CAR, healthy prop, productive)', () => {
      const assets = {
        tanah_dan_bangunan: 4000000000,
        alat_transportasi_dan_mesin: 500000000,
        harta_bergerak_lainnya: 300000000,
        surat_berharga: 2000000000,
        kas_dan_setara_kas: 1000000000,
        harta_lainnya: 0,
        subtotal_harta: 7800000000,
        hutang: 0,
        total_harta_kekayaan: 7800000000
      };

      const metrics = [
        calculateDAR(assets.hutang, assets.subtotal_harta),
        calculateCAR(assets.kas_dan_setara_kas, assets.subtotal_harta),
        calculatePropertyConcentration(assets.tanah_dan_bangunan, assets.subtotal_harta),
        calculateDepreciatingAssetRatio(assets.alat_transportasi_dan_mesin, assets.harta_bergerak_lainnya, assets.subtotal_harta),
        calculateProductiveAssetRatio(assets.surat_berharga, assets.subtotal_harta)
      ];

      const profile = generatePortfolioProfile(metrics, assets);
      expect(profile.label).toBe('Portofolio Seimbang');
      expect(profile.color).toBe('#34d399');
    });

    it('returns "Portofolio Berisiko" for high debt ratio', () => {
      const assets = {
        tanah_dan_bangunan: 10000000000,
        alat_transportasi_dan_mesin: 1000000000,
        harta_bergerak_lainnya: 500000000,
        surat_berharga: 0,
        kas_dan_setara_kas: 500000000,
        harta_lainnya: 0,
        subtotal_harta: 12000000000,
        hutang: 8000000000,
        total_harta_kekayaan: 4000000000
      };

      const metrics = [
        calculateDAR(assets.hutang, assets.subtotal_harta),
        calculateCAR(assets.kas_dan_setara_kas, assets.subtotal_harta),
        calculatePropertyConcentration(assets.tanah_dan_bangunan, assets.subtotal_harta),
        calculateDepreciatingAssetRatio(assets.alat_transportasi_dan_mesin, assets.harta_bergerak_lainnya, assets.subtotal_harta),
        calculateProductiveAssetRatio(assets.surat_berharga, assets.subtotal_harta)
      ];

      const profile = generatePortfolioProfile(metrics, assets);
      expect(profile.label).toBe('Portofolio Berisiko');
      expect(profile.color).toBe('#f87171');
    });

    it('returns "Likuiditas Sehat" when CAR is in balance range', () => {
      const assets = {
        tanah_dan_bangunan: 3000000000,
        alat_transportasi_dan_mesin: 400000000,
        harta_bergerak_lainnya: 200000000,
        surat_berharga: 1500000000,
        kas_dan_setara_kas: 1100000000, // ~15.5% CAR (in balance range)
        harta_lainnya: 0,
        subtotal_harta: 6200000000, // matches sum of assets
        hutang: 0,
        total_harta_kekayaan: 6200000000
      };

      const metrics = [
        calculateDAR(assets.hutang, assets.subtotal_harta),
        calculateCAR(assets.kas_dan_setara_kas, assets.subtotal_harta),
        calculatePropertyConcentration(assets.tanah_dan_bangunan, assets.subtotal_harta),
        calculateDepreciatingAssetRatio(assets.alat_transportasi_dan_mesin, assets.harta_bergerak_lainnya, assets.subtotal_harta),
        calculateProductiveAssetRatio(assets.surat_berharga, assets.subtotal_harta)
      ];

      const profile = generatePortfolioProfile(metrics, assets);
      // All conditions met -> Portofolio Seimbang
      expect(profile.label).toBe('Portofolio Seimbang');
    });
  });

  describe('Key Findings Generation', () => {
    it('generates strength finding when no debt', () => {
      const assets = {
        tanah_dan_bangunan: 5000000000,
        alat_transportasi_dan_mesin: 500000000,
        harta_bergerak_lainnya: 300000000,
        surat_berharga: 1000000000,
        kas_dan_setara_kas: 2000000000,
        harta_lainnya: 0,
        subtotal_harta: 8800000000,
        hutang: 0,
        total_harta_kekayaan: 8800000000
      };

      const metrics = [
        calculateDAR(assets.hutang, assets.subtotal_harta),
        calculateCAR(assets.kas_dan_setara_kas, assets.subtotal_harta),
        calculatePropertyConcentration(assets.tanah_dan_bangunan, assets.subtotal_harta),
        calculateDepreciatingAssetRatio(assets.alat_transportasi_dan_mesin, assets.harta_bergerak_lainnya, assets.subtotal_harta),
        calculateProductiveAssetRatio(assets.surat_berharga, assets.subtotal_harta)
      ];

      const integrity = checkDataIntegrity(assets);
      const findings = generateKeyFindings(metrics, assets, integrity);

      expect(findings.some(f => f.type === 'strength')).toBe(true);
      expect(findings.some(f => f.text.includes('utang') && f.text.includes('bersih'))).toBe(true);
    });

    it('generates concern when no productive assets', () => {
      const assets = {
        tanah_dan_bangunan: 5000000000,
        alat_transportasi_dan_mesin: 500000000,
        harta_bergerak_lainnya: 300000000,
        surat_berharga: 0,
        kas_dan_setara_kas: 1000000000,
        harta_lainnya: 0,
        subtotal_harta: 6800000000,
        hutang: 0,
        total_harta_kekayaan: 6800000000
      };

      const metrics = [
        calculateDAR(assets.hutang, assets.subtotal_harta),
        calculateCAR(assets.kas_dan_setara_kas, assets.subtotal_harta),
        calculatePropertyConcentration(assets.tanah_dan_bangunan, assets.subtotal_harta),
        calculateDepreciatingAssetRatio(assets.alat_transportasi_dan_mesin, assets.harta_bergerak_lainnya, assets.subtotal_harta),
        calculateProductiveAssetRatio(assets.surat_berharga, assets.subtotal_harta)
      ];

      const integrity = checkDataIntegrity(assets);
      const findings = generateKeyFindings(metrics, assets, integrity);

      expect(findings.some(f => f.type === 'concern' && f.text.includes('surat berharga'))).toBe(true);
    });

    it('includes integrity warning when data is inconsistent', () => {
      const assets = {
        tanah_dan_bangunan: 5000000000,
        alat_transportasi_dan_mesin: 500000000,
        harta_bergerak_lainnya: 300000000,
        surat_berharga: 0,
        kas_dan_setara_kas: 1000000000,
        harta_lainnya: 0,
        subtotal_harta: 9000000000, // Intentionally wrong to trigger warning
        hutang: 0,
        total_harta_kekayaan: 9000000000
      };

      const metrics = [
        calculateDAR(assets.hutang, assets.subtotal_harta),
        calculateCAR(assets.kas_dan_setara_kas, assets.subtotal_harta),
        calculatePropertyConcentration(assets.tanah_dan_bangunan, assets.subtotal_harta),
        calculateDepreciatingAssetRatio(assets.alat_transportasi_dan_mesin, assets.harta_bergerak_lainnya, assets.subtotal_harta),
        calculateProductiveAssetRatio(assets.surat_berharga, assets.subtotal_harta)
      ];

      const integrity = checkDataIntegrity(assets);
      expect(integrity.isConsistent).toBe(false);

      const findings = generateKeyFindings(metrics, assets, integrity);
      expect(findings.some(f => f.type === 'warning')).toBe(true);
      expect(findings[0].type).toBe('warning');
    });
  });

  describe('Derive Overall Status', () => {
    it('returns "Likuiditas Seimbang" when CAR is in balance range', () => {
      const assets = {
        tanah_dan_bangunan: 3000000000,
        alat_transportasi_dan_mesin: 400000000,
        harta_bergerak_lainnya: 200000000,
        surat_berharga: 1500000000,
        kas_dan_setara_kas: 1100000000, // ~15.5% CAR (in balance range)
        harta_lainnya: 0,
        subtotal_harta: 6200000000, // matches sum of assets
        hutang: 0,
        total_harta_kekayaan: 6200000000
      };

      const metrics = [
        calculateDAR(assets.hutang, assets.subtotal_harta),
        calculateCAR(assets.kas_dan_setara_kas, assets.subtotal_harta),
        calculatePropertyConcentration(assets.tanah_dan_bangunan, assets.subtotal_harta),
        calculateDepreciatingAssetRatio(assets.alat_transportasi_dan_mesin, assets.harta_bergerak_lainnya, assets.subtotal_harta),
        calculateProductiveAssetRatio(assets.surat_berharga, assets.subtotal_harta)
      ];

      const integrity = checkDataIntegrity(assets);
      const status = deriveOverallStatus(metrics, integrity);

      expect(status).toBe('Likuiditas Seimbang');
    });

    it('returns "Perlu Perhatian" when 2+ danger metrics exist', () => {
      const assets = {
        tanah_dan_bangunan: 1000000000,
        alat_transportasi_dan_mesin: 800000000,
        harta_bergerak_lainnya: 500000000,
        surat_berharga: 0,
        kas_dan_setara_kas: 100000000,
        harta_lainnya: 0,
        subtotal_harta: 2400000000,
        hutang: 1500000000,
        total_harta_kekayaan: 900000000
      };

      const metrics = [
        calculateDAR(assets.hutang, assets.subtotal_harta),
        calculateCAR(assets.kas_dan_setara_kas, assets.subtotal_harta),
        calculatePropertyConcentration(assets.tanah_dan_bangunan, assets.subtotal_harta),
        calculateDepreciatingAssetRatio(assets.alat_transportasi_dan_mesin, assets.harta_bergerak_lainnya, assets.subtotal_harta),
        calculateProductiveAssetRatio(assets.surat_berharga, assets.subtotal_harta)
      ];

      const integrity = checkDataIntegrity(assets);
      const status = deriveOverallStatus(metrics, integrity);

      // DAR > 50% is danger, depreciating > 25% is danger -> 2 dangers
      expect(status).toBe('Perlu Perhatian');
    });
  });

  describe('resolveSubtotalFromCategories', () => {
    it('returns existing subtotal when provided and positive', () => {
      const assets = {
        tanah_dan_bangunan: 5000000000,
        alat_transportasi_dan_mesin: 500000000,
        harta_bergerak_lainnya: 300000000,
        surat_berharga: 1000000000,
        kas_dan_setara_kas: 2000000000,
        harta_lainnya: 0,
        subtotal_harta: 8800000000,
        hutang: 0
      };
      const result = resolveSubtotalFromCategories(assets);
      expect(result.subtotal).toBe(8800000000);
      expect(result.wasComputed).toBe(false);
    });

    it('computes subtotal from categories when subtotal is missing', () => {
      const assets = {
        tanah_dan_bangunan: 5000000000,
        alat_transportasi_dan_mesin: 500000000,
        harta_bergerak_lainnya: 300000000,
        surat_berharga: 1000000000,
        kas_dan_setara_kas: 2000000000,
        harta_lainnya: 0,
        subtotal_harta: null,
        hutang: 0
      };
      const result = resolveSubtotalFromCategories(assets);
      expect(result.subtotal).toBe(8800000000);
      expect(result.wasComputed).toBe(true);
    });

    it('computes subtotal from categories when subtotal is zero', () => {
      const assets = {
        tanah_dan_bangunan: 5000000000,
        alat_transportasi_dan_mesin: 500000000,
        harta_bergerak_lainnya: 300000000,
        surat_berharga: 1000000000,
        kas_dan_setara_kas: 2000000000,
        harta_lainnya: 0,
        subtotal_harta: 0,
        hutang: 0
      };
      const result = resolveSubtotalFromCategories(assets);
      expect(result.subtotal).toBe(8800000000);
      expect(result.wasComputed).toBe(true);
    });

    it('returns null when no category values are available', () => {
      const assets = {
        tanah_dan_bangunan: 0,
        alat_transportasi_dan_mesin: 0,
        harta_bergerak_lainnya: 0,
        surat_berharga: 0,
        kas_dan_setara_kas: 0,
        harta_lainnya: 0,
        subtotal_harta: null,
        hutang: 0
      };
      const result = resolveSubtotalFromCategories(assets);
      expect(result.subtotal).toBeNull();
      expect(result.wasComputed).toBe(false);
    });

    it('does not derive a subtotal from incomplete categories', () => {
      const result = resolveSubtotalFromCategories({
        tanah_dan_bangunan: 5000000000,
        alat_transportasi_dan_mesin: null,
        harta_bergerak_lainnya: 300000000,
        surat_berharga: 0,
        kas_dan_setara_kas: 2000000000,
        harta_lainnya: 0,
        subtotal_harta: null
      });

      expect(result).toEqual({ subtotal: null, wasComputed: false });
    });
  });

  describe('normalizeFinancialData', () => {
    it('injects computed subtotal when missing', () => {
      const data = {
        identity: { nama: 'Test' },
        assets: {
          tanah_dan_bangunan: 5000000000,
          alat_transportasi_dan_mesin: 500000000,
          harta_bergerak_lainnya: 300000000,
          surat_berharga: 1000000000,
          kas_dan_setara_kas: 2000000000,
          harta_lainnya: 0,
          subtotal_harta: null,
          hutang: 0
        }
      };
      const normalized = normalizeFinancialData(data);
      expect(normalized.assets.subtotal_harta).toBe(8800000000);
      expect(normalized._subtotalComputed).toBe(true);
    });

    it('preserves existing subtotal when present', () => {
      const data = {
        identity: { nama: 'Test' },
        assets: {
          tanah_dan_bangunan: 5000000000,
          alat_transportasi_dan_mesin: 500000000,
          harta_bergerak_lainnya: 300000000,
          surat_berharga: 1000000000,
          kas_dan_setara_kas: 2000000000,
          harta_lainnya: 0,
          subtotal_harta: 8800000000,
          hutang: 0
        }
      };
      const normalized = normalizeFinancialData(data);
      expect(normalized.assets.subtotal_harta).toBe(8800000000);
      expect(normalized._subtotalComputed).toBe(false);
    });

    it('returns original data when no assets available', () => {
      const data = { identity: { nama: 'Test' } };
      const normalized = normalizeFinancialData(data);
      expect(normalized).toBe(data);
    });

    it('does not create a subtotal from a failed partial PDF parse', () => {
      const data = {
        isParsedSuccess: false,
        assets: {
          tanah_dan_bangunan: 5000000000,
          alat_transportasi_dan_mesin: 0,
          harta_bergerak_lainnya: 0,
          surat_berharga: 0,
          kas_dan_setara_kas: 0,
          harta_lainnya: 0,
          subtotal_harta: 0,
          hutang: 0,
          total_harta_kekayaan: 0
        }
      };

      expect(normalizeFinancialData(data)).toBe(data);
    });

    it('does not re-derive values intentionally cleared in the unified effective model', () => {
      const effective = {
        isParsedSuccess: true,
        identity: { nama: 'Contoh' },
        assets: {
          tanah_dan_bangunan: 500_000_000,
          alat_transportasi_dan_mesin: 100_000_000,
          harta_bergerak_lainnya: 50_000_000,
          surat_berharga: 100_000_000,
          kas_dan_setara_kas: 250_000_000,
          harta_lainnya: 0,
          subtotal_harta: null,
          hutang: 0,
          total_harta_kekayaan: null
        },
        provenance: {
          'assets.subtotal_harta': 'manual',
          'assets.total_harta_kekayaan': 'manual'
        }
      };

      const normalized = normalizeFinancialData(effective);
      const diagnosis = runFinancialDiagnosis(effective);

      expect(normalized).toBe(effective);
      expect(diagnosis.assets.subtotal_harta).toBeNull();
      expect(diagnosis.assets.total_harta_kekayaan).toBeNull();
      expect(diagnosis.metrics.every((metric) => metric.ratio === null)).toBe(true);
    });
  });

  describe('Missing Subtotal Bug Fix', () => {
    it('produces valid metrics when subtotal_harta is null', () => {
      const data = {
        identity: { nama: 'Test Person' },
        assets: {
          tanah_dan_bangunan: 5000000000,
          alat_transportasi_dan_mesin: 500000000,
          harta_bergerak_lainnya: 300000000,
          surat_berharga: 1000000000,
          kas_dan_setara_kas: 2000000000,
          harta_lainnya: 0,
          subtotal_harta: null,
          hutang: 0,
          total_harta_kekayaan: null
        }
      };
      const diag = runFinancialDiagnosis(data);
      expect(diag.metrics).toHaveLength(5);
      // All metrics should have valid ratios, not null
      expect(diag.metrics[0].ratio).toBe(0); // DAR
      expect(diag.metrics[1].ratio).toBeCloseTo(2000000000 / 8800000000); // CAR
      expect(diag.metrics[2].ratio).toBeCloseTo(5000000000 / 8800000000); // Property
      expect(diag.metrics[3].ratio).toBeCloseTo((500000000 + 300000000) / 8800000000); // Depreciating
      expect(diag.metrics[4].ratio).toBeCloseTo(1000000000 / 8800000000); // Productive
      // Overall status should NOT be "Perlu Ditinjau"
      expect(diag.overallStatus).not.toBe('Perlu Ditinjau');
    });

    it('produces valid metrics when subtotal_harta is 0', () => {
      const data = {
        identity: { nama: 'Test Person' },
        assets: {
          tanah_dan_bangunan: 5000000000,
          alat_transportasi_dan_mesin: 500000000,
          harta_bergerak_lainnya: 300000000,
          surat_berharga: 1000000000,
          kas_dan_setara_kas: 2000000000,
          harta_lainnya: 0,
          subtotal_harta: 0,
          hutang: 0,
          total_harta_kekayaan: 0
        }
      };
      const diag = runFinancialDiagnosis(data);
      expect(diag.metrics).toHaveLength(5);
      expect(diag.metrics[0].ratio).toBe(0);
      expect(diag.overallStatus).not.toBe('Perlu Ditinjau');
    });

    it('returns "Data Tidak Lengkap" when no categories and no subtotal', () => {
      const data = {
        identity: { nama: 'Test Person' },
        assets: {
          tanah_dan_bangunan: 0,
          alat_transportasi_dan_mesin: 0,
          harta_bergerak_lainnya: 0,
          surat_berharga: 0,
          kas_dan_setara_kas: 0,
          harta_lainnya: 0,
          subtotal_harta: null,
          hutang: 0,
          total_harta_kekayaan: null
        }
      };
      const diag = runFinancialDiagnosis(data);
      expect(diag.metrics).toHaveLength(5);
      // All metrics should show "Data Tidak Lengkap"
      expect(diag.metrics[0].status).toBe('Data Tidak Lengkap');
      expect(diag.metrics[1].status).toBe('Data Tidak Lengkap');
      expect(diag.overallStatus).toBe('Perlu Ditinjau');
    });
  });
});
