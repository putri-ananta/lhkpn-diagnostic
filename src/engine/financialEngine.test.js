import { describe, it, expect } from 'vitest';
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
import { groupTextItemsIntoLines } from './lhkpnParser';

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
});

describe('Indonesian Money Parsing Utilities', () => {
  it('parses standard Indonesian money strings correctly', () => {
    expect(parseIndonesianMoney('Rp. 8.645.951.000').value).toBe(8645951000);
    expect(parseIndonesianMoney('Rp 400.000.000').value).toBe(400000000);
    expect(parseIndonesianMoney('Rp. 17.596.646.027').value).toBe(17596646027);
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

  it('calculates Productive Asset Ratio correctly', () => {
    const suratBerharga = 0;
    const res = calculateProductiveAssetRatio(suratBerharga, sampleSubtotal);
    expect(res.ratio).toBe(0);
    expect(res.status).toBe('Rendah / Tidak Ada Investasi');
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
    expect(sim.fireTarget).toBe(20000000 * 300); // 6 billion
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
