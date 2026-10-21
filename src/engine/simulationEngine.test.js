import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SAFE_WITHDRAWAL_RATE,
  calculateFIRE,
  projectMonthlyCashFlow,
  readEffectiveAssetValue,
  validateSimulationEvent,
  validateSimulationEvents
} from './simulationEngine';

describe('effective asset value resolution', () => {
  it('preserves confirmed zero while keeping missing and manually cleared values unavailable', () => {
    expect(readEffectiveAssetValue({
      assets: { kas_dan_setara_kas: 0 },
      provenance: { 'assets.kas_dan_setara_kas': 'confirmed-zero' }
    }, 'kas_dan_setara_kas')).toBe(0);

    expect(readEffectiveAssetValue({
      assets: { kas_dan_setara_kas: null },
      provenance: { 'assets.kas_dan_setara_kas': 'missing' }
    }, 'kas_dan_setara_kas')).toBeNull();

    expect(readEffectiveAssetValue({
      assets: { kas_dan_setara_kas: null },
      provenance: { 'assets.kas_dan_setara_kas': 'manual' }
    }, 'kas_dan_setara_kas')).toBeNull();
  });

  it('does not trust a zero-filled legacy failed parse without extraction evidence', () => {
    expect(readEffectiveAssetValue({
      assets: { surat_berharga: 0 },
      isParsedSuccess: false
    }, 'surat_berharga')).toBeNull();
  });
});

describe('simulation event validation', () => {
  it('normalizes an absolute one-time income event', () => {
    const result = validateSimulationEvent(
      {
        id: 'bonus',
        description: 'Bonus proyek',
        amount: '5000000',
        date: '2026-03',
        frequency: 'once',
        type: 'income'
      },
      { startDate: '2026-01', horizonMonths: 12 }
    );

    expect(result.valid).toBe(true);
    expect(result.event).toMatchObject({
      id: 'bonus',
      amount: 5000000,
      monthIndex: 2,
      frequency: 'once',
      recurrence: 'once',
      type: 'income',
      direction: 'inflow'
    });
  });

  it('supports a one-based projection month and asset event distinctions', () => {
    const purchase = validateSimulationEvent({
      description: 'Pembelian kendaraan',
      amount: 300000000,
      month: 2,
      recurrence: 'sekali',
      type: 'asset_purchase'
    });
    const sale = validateSimulationEvent({
      description: 'Penjualan tanah',
      amount: 700000000,
      monthIndex: 4,
      recurrence: 'once',
      type: 'asset_sale',
      carryingValue: 600000000
    });

    expect(purchase.event).toMatchObject({
      monthIndex: 1,
      direction: 'outflow',
      affectsNonCashAsset: true
    });
    expect(sale.event).toMatchObject({
      monthIndex: 4,
      direction: 'inflow',
      carryingValue: 600000000,
      affectsNonCashAsset: true
    });
  });

  it('rejects incomplete, negative, and unknown events without throwing', () => {
    const result = validateSimulationEvent({
      description: ' ',
      amount: -1,
      month: 0.5,
      recurrence: 'monthly',
      type: 'mystery'
    });

    expect(result.valid).toBe(false);
    expect(result.event).toBeNull();
    expect(result.errors.map(error => error.code)).toEqual(
      expect.arrayContaining([
        'missing_description',
        'invalid_amount',
        'invalid_type',
        'invalid_frequency',
        'invalid_event_date'
      ])
    );
  });

  it('returns indexed errors for a mixed event collection', () => {
    const result = validateSimulationEvents([
      {
        description: 'Honor tahunan',
        amount: 100,
        month: 1,
        recurrence: 'annual',
        type: 'income'
      },
      null
    ]);

    expect(result.valid).toBe(false);
    expect(result.events).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ index: 1, code: 'invalid_event' });
  });

  it('warns when a valid one-time event is outside the horizon', () => {
    const result = validateSimulationEvent(
      {
        description: 'Biaya di luar periode',
        amount: 100,
        month: 13,
        recurrence: 'one_time',
        type: 'expense'
      },
      { horizonMonths: 12 }
    );

    expect(result.valid).toBe(true);
    expect(result.warnings[0].code).toBe('event_after_horizon');
  });
});

describe('monthly cash-flow projection', () => {
  it('projects regular income and expenses from extracted cash', () => {
    const result = projectMonthlyCashFlow({
      baselineCash: 10000000,
      monthlyIncome: 5000000,
      monthlyExpenses: 3000000,
      horizonMonths: 3,
      startDate: '2026-01'
    });

    expect(result.available).toBe(true);
    expect(result.label).toBe('Proyeksi Arus Kas');
    expect(result.isCashFlowOnly).toBe(true);
    expect(result.monthly).toHaveLength(3);
    expect(result.monthly[0]).toMatchObject({
      monthIndex: 0,
      monthNumber: 1,
      date: '2026-01',
      netCashFlow: 2000000,
      cumulativeCashFlow: 2000000,
      projectedCashBalance: 12000000
    });
    expect(result.monthly[2]).toMatchObject({
      date: '2026-03',
      cumulativeCashFlow: 6000000,
      projectedCashBalance: 16000000
    });
    expect(result.summary).toMatchObject({
      startingCash: 10000000,
      endingCash: 16000000,
      totalInflow: 15000000,
      totalOutflow: 9000000,
      netCashFlow: 6000000
    });
  });

  it('applies one-time events only in their specified months', () => {
    const result = projectMonthlyCashFlow({
      baselineCash: 0,
      monthlyIncome: 1000,
      monthlyExpenses: 500,
      horizonMonths: 4,
      startDate: '2026-01',
      events: [
        {
          description: 'Bonus',
          amount: 5000,
          date: '2026-03',
          recurrence: 'one_time',
          type: 'additional_income'
        },
        {
          description: 'Perbaikan rumah',
          amount: 2000,
          month: 2,
          recurrence: 'one_time',
          type: 'irregular_expense'
        }
      ]
    });

    expect(result.monthly.map(month => month.irregularInflow)).toEqual([0, 0, 5000, 0]);
    expect(result.monthly.map(month => month.irregularOutflow)).toEqual([0, 2000, 0, 0]);
    expect(result.summary.totalIrregularInflow).toBe(5000);
    expect(result.summary.totalIrregularOutflow).toBe(2000);
    expect(result.summary.endingCash).toBe(5000);
  });

  it('applies annual events every twelve months from the anchor month', () => {
    const result = projectMonthlyCashFlow({
      baselineCash: 1000,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      horizonMonths: 25,
      startDate: '2026-01',
      events: [
        {
          description: 'Premi tahunan',
          amount: 100,
          date: '2026-02',
          recurrence: 'annual',
          type: 'expense'
        }
      ]
    });

    const chargedMonths = result.monthly
      .filter(month => month.irregularOutflow > 0)
      .map(month => month.date);
    expect(chargedMonths).toEqual(['2026-02', '2027-02']);
    expect(result.summary.totalIrregularOutflow).toBe(200);
  });

  it('continues an annual event anchored before the projection', () => {
    const result = projectMonthlyCashFlow({
      baselineCash: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      horizonMonths: 14,
      startDate: '2026-01',
      events: [
        {
          description: 'Iuran tahunan',
          amount: 1200,
          date: '2025-03',
          recurrence: 'annual',
          type: 'expense'
        }
      ]
    });

    expect(result.monthly[2].date).toBe('2026-03');
    expect(result.monthly[2].irregularOutflow).toBe(1200);
    expect(result.summary.totalIrregularOutflow).toBe(1200);
  });

  it('distinguishes asset sales and purchases while remaining cash-flow-only', () => {
    const result = projectMonthlyCashFlow({
      baselineCash: 1000,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      horizonMonths: 2,
      events: [
        {
          description: 'Jual kendaraan',
          amount: 500,
          month: 1,
          recurrence: 'once',
          type: 'asset_sale'
        },
        {
          description: 'Beli surat berharga',
          amount: 300,
          month: 2,
          recurrence: 'once',
          type: 'asset_purchase'
        }
      ]
    });

    expect(result.monthly[0].irregularInflow).toBe(500);
    expect(result.monthly[1].irregularOutflow).toBe(300);
    expect(result.summary.endingCash).toBe(1200);
    expect(result.limitations.join(' ')).toContain('nilai tercatat aset tidak lengkap');
    expect(result.limitations.join(' ')).toContain('aset baru tidak ditambahkan');
  });

  it('does not invent a zero opening balance when extracted cash is missing', () => {
    const result = projectMonthlyCashFlow({
      monthlyIncome: 1000,
      monthlyExpenses: 600,
      horizonMonths: 2
    });

    expect(result.available).toBe(true);
    expect(result.hasBaselineCash).toBe(false);
    expect(result.baselineCash).toBeNull();
    expect(result.monthly[1].cumulativeCashFlow).toBe(800);
    expect(result.monthly[1].projectedCashBalance).toBeNull();
    expect(result.summary.endingCash).toBeNull();
    expect(result.warnings.map(warning => warning.code)).toContain('missing_baseline_cash');
  });

  it('preserves zero as a valid opening balance and regular input', () => {
    const result = projectMonthlyCashFlow({
      baselineCash: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      horizonYears: 1
    });

    expect(result.available).toBe(true);
    expect(result.hasBaselineCash).toBe(true);
    expect(result.monthly).toHaveLength(12);
    expect(result.summary.endingCash).toBe(0);
  });

  it('tracks negative projected balances safely', () => {
    const result = projectMonthlyCashFlow({
      baselineCash: 100,
      monthlyIncome: 0,
      monthlyExpenses: 75,
      horizonMonths: 3
    });

    expect(result.monthly.map(month => month.projectedCashBalance)).toEqual([25, -50, -125]);
    expect(result.summary.monthsBelowZero).toBe(2);
    expect(result.summary.lowestProjectedCash).toBe(-125);
  });

  it('supports the required 1, 3, 5, and 10 year horizons', () => {
    for (const years of [1, 3, 5, 10]) {
      const result = projectMonthlyCashFlow({
        baselineCash: 0,
        monthlyIncome: 0,
        monthlyExpenses: 0,
        horizonYears: years
      });
      expect(result.available).toBe(true);
      expect(result.monthly).toHaveLength(years * 12);
    }
  });

  it('returns structured failures for invalid horizons, amounts, and event lists', () => {
    const invalidHorizon = projectMonthlyCashFlow({
      baselineCash: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      horizonYears: 2
    });
    const invalidMoney = projectMonthlyCashFlow({
      baselineCash: -1,
      monthlyIncome: Number.POSITIVE_INFINITY,
      monthlyExpenses: -100,
      horizonMonths: 12
    });
    const invalidEvents = projectMonthlyCashFlow({
      baselineCash: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      horizonMonths: 12,
      events: 'not-an-array'
    });

    expect(invalidHorizon.available).toBe(false);
    expect(invalidHorizon.errors[0].code).toBe('invalid_horizon');
    expect(invalidMoney.available).toBe(false);
    expect(invalidMoney.errors.map(error => error.code)).toEqual(
      expect.arrayContaining([
        'invalid_baseline_cash',
        'invalid_monthly_income',
        'invalid_monthly_expenses'
      ])
    );
    expect(invalidEvents.available).toBe(false);
    expect(invalidEvents.errors[0].code).toBe('invalid_events');
  });
});

describe('expense-based FIRE calculation', () => {
  it('uses monthly expenses, annual recurring expenses, and the default 4% SWR', () => {
    const result = calculateFIRE({
      monthlyExpenses: 10000000,
      recurringAnnualIrregularExpenses: 12000000,
      assets: {
        kas_dan_setara_kas: 500000000,
        surat_berharga: 160000000
      }
    });

    expect(result.available).toBe(true);
    expect(result.safeWithdrawalRate).toBe(DEFAULT_SAFE_WITHDRAWAL_RATE);
    expect(result.annualExpenses).toBe(132000000);
    expect(result.fireNumber).toBe(3300000000);
    expect(result.investableAssets).toBe(660000000);
    expect(result.fireProgressPercent).toBeCloseTo(20);
  });

  it('accepts SWR as either a decimal rate or a UI percentage', () => {
    const decimal = calculateFIRE({
      monthlyExpenses: 100,
      safeWithdrawalRate: 0.05,
      cash: 0,
      securities: 0
    });
    const percentage = calculateFIRE({
      monthlyExpenses: 100,
      safeWithdrawalRate: 5,
      cash: 0,
      securities: 0
    });

    expect(decimal.safeWithdrawalRate).toBe(0.05);
    expect(percentage.safeWithdrawalRate).toBe(0.05);
    expect(decimal.fireNumber).toBe(24000);
    expect(percentage.fireNumber).toBe(24000);
  });

  it('includes only annual expense events and excludes one-time expenses', () => {
    const result = calculateFIRE({
      monthlyExpenses: 1000,
      cash: 0,
      securities: 0,
      events: [
        {
          description: 'Pajak tahunan',
          amount: 1200,
          month: 1,
          recurrence: 'annual',
          type: 'expense'
        },
        {
          description: 'Renovasi sekali',
          amount: 50000,
          month: 2,
          recurrence: 'one_time',
          type: 'expense'
        },
        {
          description: 'Bonus tahunan',
          amount: 999999,
          month: 3,
          recurrence: 'annual',
          type: 'income'
        }
      ]
    });

    expect(result.recurringAnnualIrregularExpenses).toBe(1200);
    expect(result.annualExpenses).toBe(13200);
    expect(result.fireNumber).toBe(330000);
    expect(result.assumptions.oneTimeExpensesAnnualized).toBe(false);
  });

  it('uses an explicit annual expense total without double-counting events', () => {
    const result = calculateFIRE({
      monthlyExpenses: 1000,
      recurringAnnualIrregularExpenses: 500,
      cash: 0,
      securities: 0,
      events: [
        {
          amount: 500,
          recurrence: 'annual',
          type: 'expense'
        }
      ]
    });

    expect(result.annualIrregularSource).toBe('explicit');
    expect(result.recurringAnnualIrregularExpenses).toBe(500);
    expect(result.annualExpenses).toBe(12500);
  });

  it('never substitutes income when monthly expenses are missing', () => {
    const result = calculateFIRE({
      monthlyIncome: 50000000,
      cash: 100000000,
      securities: 100000000
    });

    expect(result.available).toBe(false);
    expect(result.status).toBe('Belum dapat dihitung');
    expect(result.monthlyExpenses).toBeNull();
    expect(result.annualExpenses).toBeNull();
    expect(result.fireNumber).toBeNull();
    expect(result.progressAvailable).toBe(false);
  });

  it('preserves confirmed-zero cash and securities as complete data', () => {
    const result = calculateFIRE({
      monthlyExpenses: 1000,
      assets: {
        kas_dan_setara_kas: 0,
        surat_berharga: 0
      }
    });

    expect(result.investableAssets).toBe(0);
    expect(result.progressAvailable).toBe(true);
    expect(result.fireProgressPercent).toBe(0);
    expect(result.missingAssetCategories).toEqual([]);
  });

  it('makes progress unavailable when either investable category is missing', () => {
    const missingCash = calculateFIRE({
      monthlyExpenses: 1000,
      assets: { surat_berharga: 10000 }
    });
    const missingSecurities = calculateFIRE({
      monthlyExpenses: 1000,
      assets: { kas_dan_setara_kas: 10000 }
    });

    expect(missingCash.fireNumber).not.toBeNull();
    expect(missingCash.investableAssets).toBeNull();
    expect(missingCash.progressAvailable).toBe(false);
    expect(missingCash.missingAssetCategories).toEqual(['kas_dan_setara_kas']);
    expect(missingSecurities.progressAvailable).toBe(false);
    expect(missingSecurities.missingAssetCategories).toEqual(['surat_berharga']);
  });

  it('excludes property, vehicles, other assets, and net worth from investable assets', () => {
    const result = calculateFIRE({
      monthlyExpenses: 1000,
      assets: {
        kas_dan_setara_kas: 100,
        surat_berharga: 200,
        tanah_dan_bangunan: 999999,
        alat_transportasi_dan_mesin: 999999,
        harta_bergerak_lainnya: 999999,
        harta_lainnya: 999999,
        total_harta_kekayaan: 9999999
      }
    });

    expect(result.investableAssets).toBe(300);
  });

  it('avoids division by zero for a zero expense target', () => {
    const result = calculateFIRE({
      monthlyExpenses: 0,
      recurringAnnualIrregularExpenses: 0,
      cash: 100,
      securities: 100
    });

    expect(result.available).toBe(true);
    expect(result.annualExpenses).toBe(0);
    expect(result.fireNumber).toBe(0);
    expect(result.progressAvailable).toBe(false);
    expect(result.fireProgressPercent).toBeNull();
    expect(result.progressUnavailableReason).toBe('fire_number_zero');
  });

  it('rejects zero, negative, excessive, and non-finite SWR safely', () => {
    for (const safeWithdrawalRate of [0, -0.04, 101, Number.POSITIVE_INFINITY]) {
      const result = calculateFIRE({
        monthlyExpenses: 100,
        safeWithdrawalRate,
        cash: 0,
        securities: 0
      });

      expect(result.available).toBe(false);
      expect(result.fireNumber).toBeNull();
      expect(result.errors.map(error => error.code)).toContain('invalid_safe_withdrawal_rate');
    }
  });

  it('rejects invalid financial inputs without producing NaN or Infinity', () => {
    const result = calculateFIRE({
      monthlyExpenses: -1,
      recurringAnnualIrregularExpenses: Number.NaN,
      cash: -10,
      securities: Number.POSITIVE_INFINITY
    });

    expect(result.available).toBe(false);
    expect(result.annualExpenses).toBeNull();
    expect(result.fireNumber).toBeNull();
    expect(result.investableAssets).toBeNull();
    expect(result.fireProgressPercent).toBeNull();
    expect(JSON.stringify(result)).not.toContain('NaN');
    expect(JSON.stringify(result)).not.toContain('Infinity');
  });
});
