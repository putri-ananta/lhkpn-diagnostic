/**
 * LHKPN Financial Calculation & Diagnostic Engine
 * Pure, deterministic functions for computing financial metrics, ratio analysis,
 * data integrity checks, and personal finance simulations.
 */

import { parseIndonesianMoney, formatCurrency, formatPercent } from '../utils/formatting';

/**
 * @typedef {Object} LHKPNAssets
 * @property {number|null} tanah_dan_bangunan
 * @property {number|null} alat_transportasi_dan_mesin
 * @property {number|null} harta_bergerak_lainnya
 * @property {number|null} surat_berharga
 * @property {number|null} kas_dan_setara_kas
 * @property {number|null} harta_lainnya
 * @property {number|null} subtotal_harta
 * @property {number|null} hutang
 * @property {number|null} total_harta_kekayaan
 */

/**
 * Metric analysis result structure
 * @typedef {Object} MetricResult
 * @property {string} key
 * @property {string} name
 * @property {number|null} ratio
 * @property {string} status - e.g. "Sangat Baik", "Ideal", "Sangat Bahaya", etc.
 * @property {string} statusCategory - "success" | "warning" | "danger" | "info" | "neutral"
 * @property {string} idealRange - Human readable benchmark string
 * @property {string} shortDiagnosis - Concise analytical explanation
 * @property {string} formula - Mathematical formula description
 * @property {number} progressPct - 0-100 position relative to visual bar
 */

/**
 * Calculates Debt-to-Asset Ratio (DAR)
 * Formula: hutang / subtotal_harta
 */
export function calculateDAR(hutang, subtotalHarta) {
  if (!subtotalHarta || subtotalHarta <= 0 || hutang === null || hutang === undefined) {
    return {
      key: 'dar',
      name: 'Debt-to-Asset Ratio (DAR)',
      ratio: null,
      status: 'Data Tidak Lengkap',
      statusCategory: 'neutral',
      idealRange: '0% – 5%',
      shortDiagnosis: 'Tidak dapat menghitung DAR karena subtotal harta tidak valid.',
      formula: 'Hutang / Subtotal Harta',
      progressPct: 0
    };
  }

  const ratio = hutang / subtotalHarta;
  const pct = ratio * 100;

  let status = 'Sangat Baik';
  let statusCategory = 'success';
  let shortDiagnosis = 'Beban utang sangat terkendali. Aset bersih tidak terbebani liabilitas berarti.';
  let progressPct = Math.min(100, Math.max(0, pct * 4)); // 0-25% visually maps 0-100%

  if (ratio === 0) {
    status = 'Sangat Baik';
    statusCategory = 'success';
    shortDiagnosis = 'Tidak memiliki utang yang dilaporkan (0%). Struktur aset 100% milik sendiri.';
    progressPct = 0;
  } else if (pct < 5) {
    status = 'Sehat / Aman';
    statusCategory = 'success';
    shortDiagnosis = 'Porsi utang tergolong sangat kecil (< 5%) terhadap total aset declared.';
    progressPct = (pct / 5) * 30;
  } else if (pct <= 50) {
    status = 'Berisiko Tinggi';
    statusCategory = 'danger';
    shortDiagnosis = 'Porsi utang signifikan (5% – 50%). Sebagian besar aset terbebani kewajiban finansial.';
    progressPct = 30 + ((pct - 5) / 45) * 45;
  } else {
    status = 'Sangat Bahaya / Ekstrem';
    statusCategory = 'danger';
    shortDiagnosis = 'Beban utang melebihi 50% dari subtotal harta. Risiko keuangan relatif tinggi.';
    progressPct = 100;
  }

  return {
    key: 'dar',
    name: 'Debt-to-Asset Ratio (DAR)',
    ratio,
    status,
    statusCategory,
    idealRange: '0% – 5%',
    shortDiagnosis,
    formula: 'Hutang / Subtotal Harta',
    progressPct
  };
}

/**
 * Calculates Cash-to-Asset Ratio (CAR)
 * Formula: kas_dan_setara_kas / subtotal_harta
 */
export function calculateCAR(kas, subtotalHarta) {
  if (!subtotalHarta || subtotalHarta <= 0 || kas === null || kas === undefined) {
    return {
      key: 'car',
      name: 'Cash-to-Asset Ratio (CAR)',
      ratio: null,
      status: 'Data Tidak Lengkap',
      statusCategory: 'neutral',
      idealRange: '5% – 15%',
      shortDiagnosis: 'Tidak dapat menghitung CAR karena data tidak lengkap.',
      formula: 'Kas & Setara Kas / Subtotal Harta',
      progressPct: 0
    };
  }

  const ratio = kas / subtotalHarta;
  const pct = ratio * 100;

  let status = 'Ideal';
  let statusCategory = 'success';
  let shortDiagnosis = 'Likuiditas berada pada rentang ideal (5% – 15%). Menjaga keseimbangan kas dan pembentukan aset.';
  let progressPct = 50;

  if (pct < 2) {
    status = 'Sangat Kasur / Asset-Rich, Cash-Poor';
    statusCategory = 'warning';
    shortDiagnosis = 'Likuiditas sangat rendah (< 2%). Kekayaan terkunci pada aset tidak likuid.';
    progressPct = (pct / 2) * 20;
  } else if (pct < 5) {
    status = 'Rendah / Waspada';
    statusCategory = 'warning';
    shortDiagnosis = 'Likuiditas cenderung rendah (2% – 5%). Cadangan dana kas relatif terbatas.';
    progressPct = 20 + ((pct - 2) / 3) * 20;
  } else if (pct <= 15) {
    status = 'Ideal';
    statusCategory = 'success';
    shortDiagnosis = 'Likuiditas ideal (5% – 15%). Kas cukup fleksibel untuk kebutuhan darurat.';
    progressPct = 40 + ((pct - 5) / 10) * 30;
  } else if (pct <= 25) {
    status = 'Tinggi / Perhatian';
    statusCategory = 'info';
    shortDiagnosis = 'Porsi kas lumayan tinggi (15% – 25%). Sebagian dana belum dioptimalkan ke aset produktif.';
    progressPct = 70 + ((pct - 15) / 10) * 15;
  } else {
    status = 'Kas Berlebihan / Inflasi';
    statusCategory = 'warning';
    shortDiagnosis = 'Porsi kas sangat dominan (> 25%). Berisiko mengalami pengurangan daya beli akibat inflasi.';
    progressPct = 100;
  }

  return {
    key: 'car',
    name: 'Cash-to-Asset Ratio (CAR)',
    ratio,
    status,
    statusCategory,
    idealRange: '5% – 15%',
    shortDiagnosis,
    formula: 'Kas & Setara Kas / Subtotal Harta',
    progressPct
  };
}

/**
 * Calculates Property Concentration Ratio
 * Formula: tanah_dan_bangunan / subtotal_harta
 */
export function calculatePropertyConcentration(tanahBangunan, subtotalHarta) {
  if (!subtotalHarta || subtotalHarta <= 0 || tanahBangunan === null || tanahBangunan === undefined) {
    return {
      key: 'property',
      name: 'Konsentrasi Properti',
      ratio: null,
      status: 'Data Tidak Lengkap',
      statusCategory: 'neutral',
      idealRange: '40% – 60%',
      shortDiagnosis: 'Data properti tidak lengkap.',
      formula: 'Tanah & Bangunan / Subtotal Harta',
      progressPct: 0
    };
  }

  const ratio = tanahBangunan / subtotalHarta;
  const pct = ratio * 100;

  let status = 'Berimbang';
  let statusCategory = 'success';
  let shortDiagnosis = 'Alokasi properti proporsional (40% – 60%) untuk pertumbuhan aset jangka panjang.';
  let progressPct = 50;

  if (pct < 40) {
    status = 'Rendah / Wajar';
    statusCategory = 'info';
    shortDiagnosis = 'Porsi properti di bawah 40%. Portofolio aset terdistribusi di kategori lain.';
    progressPct = (pct / 40) * 40;
  } else if (pct <= 60) {
    status = 'Berimbang';
    statusCategory = 'success';
    shortDiagnosis = 'Alokasi properti berada di tingkat yang seimbang (40% – 60%).';
    progressPct = 40 + ((pct - 40) / 20) * 30;
  } else if (pct <= 80) {
    status = 'Tinggi / Perhatian';
    statusCategory = 'warning';
    shortDiagnosis = 'Properti cukup dominan (60% – 80%). Portofolio mulai didominasi aset tidak likuid.';
    progressPct = 70 + ((pct - 60) / 20) * 15;
  } else {
    status = 'Konsentrasi Ekstrem';
    statusCategory = 'danger';
    shortDiagnosis = 'Alokasi properti melampaui 80%. Fleksibilitas pencairan kekayaan sangat terbatas.';
    progressPct = 100;
  }

  return {
    key: 'property',
    name: 'Konsentrasi Properti',
    ratio,
    status,
    statusCategory,
    idealRange: '40% – 60%',
    shortDiagnosis,
    formula: 'Tanah & Bangunan / Subtotal Harta',
    progressPct
  };
}

/**
 * Calculates Depreciating Asset Ratio
 * Formula: (alat_transportasi_dan_mesin + harta_bergerak_lainnya) / subtotal_harta
 */
export function calculateDepreciatingAssetRatio(transportasi, bergerakLainnya, subtotalHarta) {
  const depSum = (transportasi || 0) + (bergerakLainnya || 0);
  if (!subtotalHarta || subtotalHarta <= 0) {
    return {
      key: 'depreciating',
      name: 'Rasio Aset Depresiasi',
      ratio: null,
      status: 'Data Tidak Lengkap',
      statusCategory: 'neutral',
      idealRange: '< 15%',
      shortDiagnosis: 'Data aset depresiasi tidak dapat dihitung.',
      formula: '(Transportasi + Harta Bergerak) / Subtotal Harta',
      progressPct: 0
    };
  }

  const ratio = depSum / subtotalHarta;
  const pct = ratio * 100;

  let status = 'Ideal';
  let statusCategory = 'success';
  let shortDiagnosis = 'Porsi barang konsumtif/kendaraan tergolong rendah (< 15%). Sangat efisien untuk akumulasi kekayaan.';
  let progressPct = (pct / 15) * 40;

  if (pct < 15) {
    status = 'Ideal';
    statusCategory = 'success';
    shortDiagnosis = 'Porsi aset yang mengalami penyusutan nilai tergolong ideal (< 15%).';
    progressPct = (pct / 15) * 40;
  } else if (pct <= 25) {
    status = 'Sedang / Perhatian';
    statusCategory = 'warning';
    shortDiagnosis = 'Porsi aset bergerak mencapai 15% – 25%. Mengalami depresiasi bertahap.';
    progressPct = 40 + ((pct - 15) / 10) * 35;
  } else {
    status = 'Tinggi / Konsumtif';
    statusCategory = 'danger';
    shortDiagnosis = 'Porsi aset bergerak melebihi 25%. Dominasi barang konsumtif yang nilainya terus menyusut.';
    progressPct = 100;
  }

  return {
    key: 'depreciating',
    name: 'Rasio Aset Depresiasi',
    ratio,
    status,
    statusCategory,
    idealRange: '< 15%',
    shortDiagnosis,
    formula: '(Transportasi + Harta Bergerak) / Subtotal Harta',
    progressPct
  };
}

/**
 * Calculates Productive Asset Ratio
 * Formula: surat_berharga / subtotal_harta
 */
export function calculateProductiveAssetRatio(suratBerharga, subtotalHarta) {
  if (!subtotalHarta || subtotalHarta <= 0) {
    return {
      key: 'productive',
      name: 'Rasio Aset Produktif',
      ratio: null,
      status: 'Data Tidak Lengkap',
      statusCategory: 'neutral',
      idealRange: '20% – 50%',
      shortDiagnosis: 'Data surat berharga tidak dapat dihitung.',
      formula: 'Surat Berharga / Subtotal Harta',
      progressPct: 0
    };
  }

  const sbVal = suratBerharga || 0;
  const ratio = sbVal / subtotalHarta;
  const pct = ratio * 100;

  let status = 'Ideal / Produktif';
  let statusCategory = 'success';
  let shortDiagnosis = 'Memiliki alokasi investasi instrumen produktif yang ideal (20% – 50%).';
  let progressPct = 60;

  if (sbVal === 0 || ratio === 0) {
    status = 'Rendah / Tidak Ada Investasi';
    statusCategory = 'warning';
    shortDiagnosis = 'Belum/tidak melaporkan alokasi pada surat berharga/investasi pasar modal (0%).';
    progressPct = 0;
  } else if (pct < 20) {
    status = 'Cukup / Rendah';
    statusCategory = 'info';
    shortDiagnosis = 'Porsi surat berharga di bawah 20%. Potensi diversifikasi pasar modal masih bisa ditingkatkan.';
    progressPct = (pct / 20) * 40;
  } else if (pct <= 50) {
    status = 'Ideal / Produktif';
    statusCategory = 'success';
    shortDiagnosis = 'Alokasi aset produktif berada di posisi ideal (20% – 50%).';
    progressPct = 40 + ((pct - 20) / 30) * 40;
  } else {
    status = 'Sangat Tinggi / Dominan';
    statusCategory = 'success';
    shortDiagnosis = 'Porsi investasi melebihi 50% dari total aset. Kekayaan berfokus pada pasar finansial.';
    progressPct = 100;
  }

  return {
    key: 'productive',
    name: 'Rasio Aset Produktif',
    ratio,
    status,
    statusCategory,
    idealRange: '20% – 50%',
    shortDiagnosis,
    formula: 'Surat Berharga / Subtotal Harta',
    progressPct
  };
}

/**
 * Resolves subtotal_harta from category sums when it's missing or zero.
 * Returns { subtotal: number|null, wasComputed: boolean }
 */
export function resolveSubtotalFromCategories(assets) {
  const {
    tanah_dan_bangunan,
    alat_transportasi_dan_mesin,
    harta_bergerak_lainnya,
    surat_berharga,
    kas_dan_setara_kas,
    harta_lainnya
  } = assets || {};

  const categoryValues = [
    tanah_dan_bangunan,
    alat_transportasi_dan_mesin,
    harta_bergerak_lainnya,
    surat_berharga,
    kas_dan_setara_kas,
    harta_lainnya
  ].filter((v) => v !== null && v !== undefined && v > 0);

  // If subtotal already exists and is positive, return as-is
  const existingSubtotal = assets.subtotal_harta;
  if (existingSubtotal !== null && existingSubtotal !== undefined && existingSubtotal > 0) {
    return { subtotal: existingSubtotal, wasComputed: false };
  }

  // Compute from available category values
  if (categoryValues.length > 0) {
    const computed = categoryValues.reduce((a, b) => a + b, 0);
    return { subtotal: computed, wasComputed: true };
  }

  return { subtotal: null, wasComputed: false };
}

/**
 * Normalizes extracted financial data by injecting computed subtotals
 * when the original value is missing or zero.
 */
export function normalizeFinancialData(extractedData) {
  if (!extractedData || !extractedData.assets) {
    return extractedData;
  }

  const { subtotal, wasComputed } = resolveSubtotalFromCategories(extractedData.assets);
  if (subtotal === null) {
    return extractedData;
  }

  const normalizedAssets = { ...extractedData.assets };
  if (!normalizedAssets.subtotal_harta || normalizedAssets.subtotal_harta <= 0) {
    normalizedAssets.subtotal_harta = subtotal;
  }

  // Compute total_harta_kekayaan if missing
  if (
    (!normalizedAssets.total_harta_kekayaan || normalizedAssets.total_harta_kekayaan <= 0) &&
    normalizedAssets.hutang !== null &&
    normalizedAssets.hutang !== undefined
  ) {
    normalizedAssets.total_harta_kekayaan = subtotal - normalizedAssets.hutang;
  }

  return {
    ...extractedData,
    assets: normalizedAssets,
    _subtotalComputed: wasComputed
  };
}

/**
 * Consistency Check for extracted LHKPN values
 */
export function checkDataIntegrity(assets) {
  const warnings = [];
  const {
    tanah_dan_bangunan,
    alat_transportasi_dan_mesin,
    harta_bergerak_lainnya,
    surat_berharga,
    kas_dan_setara_kas,
    harta_lainnya,
    subtotal_harta,
    hutang,
    total_harta_kekayaan
  } = assets;

  // If subtotal is missing or zero, try to compute from categories
  let effectiveSubtotal = subtotal_harta;
  if (!effectiveSubtotal || effectiveSubtotal <= 0) {
    const resolved = resolveSubtotalFromCategories(assets);
    if (resolved.subtotal !== null) {
      effectiveSubtotal = resolved.subtotal;
      warnings.push('Subtotal harta tidak tersedia — dihitung dari penjumlahan 6 kategori aset.');
    } else {
      warnings.push('Subtotal harta bernilai 0 atau tidak dapat diekstraksi.');
      return { isConsistent: false, warnings };
    }
  }

  const sumCategories =
    (tanah_dan_bangunan || 0) +
    (alat_transportasi_dan_mesin || 0) +
    (harta_bergerak_lainnya || 0) +
    (surat_berharga || 0) +
    (kas_dan_setara_kas || 0) +
    (harta_lainnya || 0);

  // Allow small rounding tolerance (e.g. 1000 Rp)
  const categoryDiff = Math.abs(sumCategories - effectiveSubtotal);
  if (categoryDiff > 1000) {
    warnings.push(
      `Jumlah 6 kategori harta (Rp ${sumCategories.toLocaleString('id-ID')}) memiliki selisih dengan Subtotal Harta (Rp ${effectiveSubtotal.toLocaleString('id-ID')}). Nilai hasil ekstraksi perlu ditinjau.`
    );
  }

  if (total_harta_kekayaan !== null && total_harta_kekayaan !== undefined) {
    const expectedTotal = effectiveSubtotal - (hutang || 0);
    const totalDiff = Math.abs(expectedTotal - total_harta_kekayaan);
    if (totalDiff > 1000) {
      warnings.push(
        `Total Harta Kekayaan (Rp ${total_harta_kekayaan.toLocaleString('id-ID')}) tidak persis sama dengan Subtotal - Hutang (Rp ${expectedTotal.toLocaleString('id-ID')}). Nilai hasil ekstraksi perlu ditinjau.`
      );
    }
  }

  return {
    isConsistent: warnings.length === 0,
    warnings
  };
}

/**
 * Derives overall Batch Status label from metrics
 */
export function deriveOverallStatus(metrics, integrity) {
  if (!integrity.isConsistent) {
    return 'Perlu Ditinjau';
  }

  const dar = metrics.find(m => m.key === 'dar');
  const car = metrics.find(m => m.key === 'car');
  const prop = metrics.find(m => m.key === 'property');
  const dep = metrics.find(m => m.key === 'depreciating');
  const prod = metrics.find(m => m.key === 'productive');

  const dangerCount = metrics.filter(m => m.statusCategory === 'danger').length;
  const warningCount = metrics.filter(m => m.statusCategory === 'warning').length;

  // High risk when more than one danger metric
  if (dangerCount >= 2) {
    return 'Perlu Perhatian';
  }

  // Asset concentration check (prop > 80%)
  if (prop && prop.ratio > 0.8) {
    return 'Konsentrasi Tinggi';
  }

  // Liquidity check
  if (car && car.ratio < 0.02) {
    return 'Likuiditas Rendah';
  }

  // Productive asset check
  if (prod && (prod.ratio === 0 || prod.ratio === null)) {
    return 'Aset Produktif Rendah';
  }

  // Balanced liquidity check: CAR between 5% and 25%
  if (car && car.ratio >= 0.05 && car.ratio <= 0.25) {
    return 'Likuiditas Seimbang';
  }

  if (dangerCount === 0 && warningCount <= 1) {
    return 'Komposisi Sehat';
  }

  return 'Perlu Perhatian';
}

/**
 * Generates rule-based deterministic summary narrative
 */
export function generateNarrativeSummary(metrics, assets) {
  const dar = metrics.find(m => m.key === 'dar');
  const car = metrics.find(m => m.key === 'car');
  const prop = metrics.find(m => m.key === 'property');
  const dep = metrics.find(m => m.key === 'depreciating');
  const prod = metrics.find(m => m.key === 'productive');

  const sentences = [];

  // Property
  if (prop && prop.ratio !== null) {
    sentences.push(
      `Portofolio kekayaan memiliki tingkat konsentrasi properti pada kategori ${prop.status.toLowerCase()} (${(prop.ratio * 100).toFixed(1).replace('.', ',')}% dari subtotal harta).`
    );
  }

  // Liquidity (CAR)
  if (car && car.ratio !== null) {
    sentences.push(
      `Tingkat likuiditas kas tergolong ${car.status.toLowerCase()} (${(car.ratio * 100).toFixed(1).replace('.', ',')}%).`
    );
  }

  // Productive Assets
  if (prod && prod.ratio !== null) {
    if (prod.ratio === 0) {
      sentences.push(`Porsi surat berharga belum tercatat dalam investasi pasar modal.`);
    } else {
      sentences.push(
        `Alokasi pada instrumen surat berharga berada pada tingkat ${prod.status.toLowerCase()} (${(prod.ratio * 100).toFixed(1).replace('.', ',')}%).`
      );
    }
  }

  // Debt (DAR)
  if (dar && dar.ratio !== null) {
    if (dar.ratio === 0) {
      sentences.push(`Rasio utang dilaporkan NIHIL (0%), menunjukkan aset bersih bebas dari liabilitas.`);
    } else {
      sentences.push(
        `Rasio utang terhadap aset berada pada kategori ${dar.status.toLowerCase()} (${(dar.ratio * 100).toFixed(1).replace('.', ',')}%).`
      );
    }
  }

  return sentences.join(' ');
}

/**
 * Personal Finance Simulation calculation engine
 * @param {number|null} monthlyIncome
 * @param {number|null} monthlyExpenditure
 */
export function calculatePersonalFinanceSimulation(monthlyIncome, monthlyExpenditure) {
  const hasIncome = monthlyIncome !== null && monthlyIncome !== undefined && monthlyIncome > 0;
  const hasExpenditure = monthlyExpenditure !== null && monthlyExpenditure !== undefined && monthlyExpenditure > 0;

  let fireTarget = null;
  let minMonthlyInvestment = null;
  let emergencyFundTarget = null;
  let maxEssentialSpending = null;

  if (hasIncome) {
    // FIRE target = monthly_income * 300 (4% rule / 25x annual)
    fireTarget = monthlyIncome * 300;
    // Minimum monthly investment = monthly_income * 15%
    minMonthlyInvestment = monthlyIncome * 0.15;
    // Maximum essential spending = monthly_income * 65%
    maxEssentialSpending = monthlyIncome * 0.65;
  }

  if (hasExpenditure) {
    // Emergency fund target = monthly_expenditure * 3
    emergencyFundTarget = monthlyExpenditure * 3;
  }

  return {
    hasInputs: hasIncome || hasExpenditure,
    fireTarget,
    minMonthlyInvestment,
    emergencyFundTarget,
    maxEssentialSpending
  };
}

/**
 * Generates portfolio profile label and description
 */
export function generatePortfolioProfile(metrics, assets) {
  const dar = metrics.find(m => m.key === 'dar');
  const car = metrics.find(m => m.key === 'car');
  const prop = metrics.find(m => m.key === 'property');
  const dep = metrics.find(m => m.key === 'depreciating');
  const prod = metrics.find(m => m.key === 'productive');

  const profile = { label: '', description: '', color: 'var(--keu-text-muted)' };

  // Determine profile based on key metrics
  const hasDebt = dar && dar.ratio > 0;
  const cashGood = car && car.ratio >= 0.05 && car.ratio <= 0.25;
  const propHealthy = prop && prop.ratio >= 0.4 && prop.ratio <= 0.6;
  const prodGood = prod && prod.ratio >= 0.2;
  const depLow = dep && dep.ratio < 0.15;

  if (!hasDebt && cashGood && propHealthy && prodGood && depLow) {
    profile.label = 'Portofolio Seimbang';
    profile.description = 'Struktur aset seimbang dengan likuiditas memadai, proporsi properti wajar, investasi produktif cukup, dan utang nihil. Fondasi keuangan yang solid untuk akumulasi kekayaan jangka panjang.';
    profile.color = '#34d399';
  } else if (!hasDebt && cashGood && propHealthy) {
    profile.label = 'Likuiditas Sehat';
    profile.description = 'Likuiditas dan alokasi properti berada pada tingkat yang sehat. Potensi pengembangan aset produktif masih terbuka.';
    profile.color = '#34d399';
  } else if (!hasDebt && cashGood) {
    profile.label = 'Cukup Likuid';
    profile.description = 'Likuiditas memadai namun proporsi aset produktif dan properti belum optimal. Terdapat ruang untuk diversifikasi.';
    profile.color = '#60a5fa';
  } else if (!hasDebt) {
    profile.label = 'Kekayaan Konservatif';
    profile.description = 'Tidak ada utang tetapi komposisi aset belum seimbang. Likuiditas dan alokasi investasi perlu peninjauan.';
    profile.color = '#fbbf24';
  } else if (hasDebt && dar && dar.ratio > 0.5) {
    profile.label = 'Portofolio Berisiko';
    profile.description = 'Beban utang ekstrem (>50%) mendominasi struktur aset. Likuiditas dan investasi produktif terdampak signifikan.';
    profile.color = '#f87171';
  } else if (hasDebt) {
    profile.label = 'Portofolio Terbebani';
    profile.description = 'Utang masih terkendali namun perlu perhatian. Pemantauan rasio utang dan peningkatan aset produktif disarankan.';
    profile.color = '#fbbf24';
  } else {
    profile.label = 'Portofolio Belum Optimal';
    profile.description = 'Komposisi aset belum mencapai profil ideal. Diversifikasi likuiditas, properti, dan investasi produktif perlu ditingkatkan.';
    profile.color = '#fbbf24';
  }

  return profile;
}

/**
 * Generates actionable key findings
 */
export function generateKeyFindings(metrics, assets, integrity) {
  const findings = [];
  const dar = metrics.find(m => m.key === 'dar');
  const car = metrics.find(m => m.key === 'car');
  const prop = metrics.find(m => m.key === 'property');
  const dep = metrics.find(m => m.key === 'depreciating');
  const prod = metrics.find(m => m.key === 'productive');

  if (dar && dar.ratio === 0) {
    findings.push({ type: 'strength', text: 'Tidak ada utang dilaporkan — aset 100% bersih dari liabilitas.' });
  } else if (dar && dar.ratio > 0 && dar.ratio <= 0.05) {
    findings.push({ type: 'good', text: `Utang terkendali pada ${formatPercent(dar.ratio)}. Rasio dalam batas aman (<5%).` });
  } else if (dar && dar.ratio > 0.05) {
    findings.push({ type: 'concern', text: `Utang meningkat ke ${formatPercent(dar.ratio)}. Perlu pemantauan ketat terhadap rasio DAR.` });
  }

  if (car && car.ratio >= 0.05 && car.ratio <= 0.25) {
    findings.push({ type: 'good', text: `Likuiditas kas optimal pada ${formatPercent(car.ratio)}. Cadangan dana darurat cukup.` });
  } else if (car && car.ratio < 0.02) {
    findings.push({ type: 'concern', text: `Likuiditas sangat rendah (${formatPercent(car.ratio)}). Kekayaan sebagian besar terkunci di aset tidak likuid.` });
  } else if (car && car.ratio > 0.25) {
    findings.push({ type: 'caution', text: `Kas terlalu dominan (${formatPercent(car.ratio)}). Risiko penurunan daya beli akibat inflasi.` });
  }

  if (prop && prop.ratio > 0.8) {
    findings.push({ type: 'concern', text: `Properti mendominasi ${formatPercent(prop.ratio)} dari total aset. Fleksibilitas pencairan terbatas.` });
  } else if (prop && prop.ratio < 0.4) {
    findings.push({ type: 'caution', text: `Proporsi properti rendah (${formatPercent(prop.ratio)}). Aset masih dapat didiversifikasi lebih baik.` });
  } else if (prop && prop.ratio >= 0.4 && prop.ratio <= 0.6) {
    findings.push({ type: 'good', text: `Alokasi properti seimbang pada ${formatPercent(prop.ratio)}. Kombinasi optimal properti dan aset cair.` });
  }

  if (prod && prod.ratio === 0) {
    findings.push({ type: 'concern', text: 'Tidak ada investasi surat berharga. Kekayaan belum tertanam di instrumen pasar modal.' });
  } else if (prod && prod.ratio >= 0.2) {
    findings.push({ type: 'good', text: `Alokasi surat berharga memadai pada ${formatPercent(prod.ratio)}. Diversifikasi pasar modal terpenuhi.` });
  }

  if (!integrity.isConsistent) {
    findings.unshift({ type: 'warning', text: 'Terdapat inkonsistensi data ekstraksi LHKPN. Perlu peninjauan manual pada laporan asli.' });
  }

  return findings;
}

/**
 * Main entrance for complete Financial Diagnosis
 */
export function runFinancialDiagnosis(extractedData) {
  // Normalize data: inject computed subtotal if missing
  const normalized = normalizeFinancialData(extractedData);
  const assets = normalized.assets || {};

  const dar = calculateDAR(assets.hutang, assets.subtotal_harta);
  const car = calculateCAR(assets.kas_dan_setara_kas, assets.subtotal_harta);
  const property = calculatePropertyConcentration(assets.tanah_dan_bangunan, assets.subtotal_harta);
  const depreciating = calculateDepreciatingAssetRatio(
    assets.alat_transportasi_dan_mesin,
    assets.harta_bergerak_lainnya,
    assets.subtotal_harta
  );
  const productive = calculateProductiveAssetRatio(assets.surat_berharga, assets.subtotal_harta);

  const metrics = [dar, car, property, depreciating, productive];
  const integrity = checkDataIntegrity(assets);
  const overallStatus = deriveOverallStatus(metrics, integrity);
  const narrativeSummary = generateNarrativeSummary(metrics, assets);
  const portfolioProfile = generatePortfolioProfile(metrics, assets);
  const keyFindings = generateKeyFindings(metrics, assets, integrity);

  return {
    identity: extractedData.identity || {},
    assets,
    categoryDetails: extractedData.categoryDetails || {},
    itemized: extractedData.itemized || {},
    metadata: extractedData.metadata || {},
    metrics,
    integrity,
    overallStatus,
    narrativeSummary,
    portfolioProfile,
    keyFindings,
    disclaimer:
      'PEMBERITAHUAN LEPAS TANGGUNG JAWAB (DISCLAIMER): Diagnosis finansial ini dihasilkan secara terstruktur dan deterministik dari angka-angka yang dilaporkan dalam dokumen LHKPN. Hasil analisis ini murni berbentuk informasi diagnostik mengenai struktur portofolio keuangan dan TIDAK menyatakan atau mencerminkan temuan tindak pidana, korupsi, pencucian uang, atau pelanggaran hukum apapun.'
  };
}
