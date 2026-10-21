/**
 * Financial simulation and FIRE planning engine.
 *
 * This module intentionally projects cash flow, not net worth. LHKPN asset
 * categories other than cash and securities are not assumed to be liquid and
 * no investment return, inflation, appreciation, or debt amortisation is
 * applied implicitly.
 */

export const DEFAULT_SAFE_WITHDRAWAL_RATE = 0.04;
export const ALLOWED_HORIZON_YEARS = Object.freeze([1, 3, 5, 10]);

export const SIMULATION_EVENT_TYPES = Object.freeze({
  INCOME: 'income',
  ADDITIONAL_INCOME: 'income',
  ASSET_SALE: 'asset_sale',
  EXPENSE: 'expense',
  IRREGULAR_EXPENSE: 'expense',
  ASSET_PURCHASE: 'asset_purchase',
  DEBT_PAYMENT: 'debt_payment'
});

export const SIMULATION_EVENT_RECURRENCES = Object.freeze({
  ONCE: 'once',
  ONE_TIME: 'once',
  ANNUAL: 'annual'
});

const CASH_FLOW_ONLY_LIMITATION =
  'Hasil ini adalah proyeksi arus kas, bukan proyeksi kekayaan bersih.';
const ASSUMPTION_LIMITATION =
  'Proyeksi tidak mengasumsikan imbal hasil investasi, inflasi, apresiasi aset, atau amortisasi utang.';
const FIRE_LIMITATION =
  'FIRE adalah estimasi perencanaan sederhana, bukan hasil atau tingkat keberhasilan yang dijamin.';

const EVENT_TYPE_ALIASES = Object.freeze({
  income: SIMULATION_EVENT_TYPES.ADDITIONAL_INCOME,
  ordinary_income: SIMULATION_EVENT_TYPES.ADDITIONAL_INCOME,
  irregular_income: SIMULATION_EVENT_TYPES.ADDITIONAL_INCOME,
  additional_income: SIMULATION_EVENT_TYPES.ADDITIONAL_INCOME,
  pendapatan: SIMULATION_EVENT_TYPES.ADDITIONAL_INCOME,
  pemasukan: SIMULATION_EVENT_TYPES.ADDITIONAL_INCOME,
  asset_sale: SIMULATION_EVENT_TYPES.ASSET_SALE,
  sale: SIMULATION_EVENT_TYPES.ASSET_SALE,
  penjualan_aset: SIMULATION_EVENT_TYPES.ASSET_SALE,
  expense: SIMULATION_EVENT_TYPES.IRREGULAR_EXPENSE,
  ordinary_expense: SIMULATION_EVENT_TYPES.IRREGULAR_EXPENSE,
  irregular_expense: SIMULATION_EVENT_TYPES.IRREGULAR_EXPENSE,
  pengeluaran: SIMULATION_EVENT_TYPES.IRREGULAR_EXPENSE,
  asset_purchase: SIMULATION_EVENT_TYPES.ASSET_PURCHASE,
  purchase: SIMULATION_EVENT_TYPES.ASSET_PURCHASE,
  pembelian_aset: SIMULATION_EVENT_TYPES.ASSET_PURCHASE,
  debt_payment: SIMULATION_EVENT_TYPES.DEBT_PAYMENT,
  pembayaran_utang: SIMULATION_EVENT_TYPES.DEBT_PAYMENT
});

const EVENT_RECURRENCE_ALIASES = Object.freeze({
  one_time: SIMULATION_EVENT_RECURRENCES.ONE_TIME,
  'one-time': SIMULATION_EVENT_RECURRENCES.ONE_TIME,
  once: SIMULATION_EVENT_RECURRENCES.ONE_TIME,
  sekali: SIMULATION_EVENT_RECURRENCES.ONE_TIME,
  annual: SIMULATION_EVENT_RECURRENCES.ANNUAL,
  yearly: SIMULATION_EVENT_RECURRENCES.ANNUAL,
  tahunan: SIMULATION_EVENT_RECURRENCES.ANNUAL
});

const INFLOW_TYPES = new Set([
  SIMULATION_EVENT_TYPES.ADDITIONAL_INCOME,
  SIMULATION_EVENT_TYPES.ASSET_SALE
]);

const OUTFLOW_TYPES = new Set([
  SIMULATION_EVENT_TYPES.IRREGULAR_EXPENSE,
  SIMULATION_EVENT_TYPES.ASSET_PURCHASE,
  SIMULATION_EVENT_TYPES.DEBT_PAYMENT
]);

function isMissing(value) {
  return value === null || value === undefined || value === '';
}

function toFiniteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function nonNegativeNumber(value) {
  const parsed = toFiniteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

/**
 * Read an asset from either the unified effective model or a legacy parser
 * result without collapsing an explicitly cleared value into numeric zero.
 */
export function readEffectiveAssetValue(data, field) {
  const rawValue = data?.assets?.[field];
  const provenance = data?.provenance?.[`assets.${field}`];

  if (provenance) {
    if (provenance === 'missing' || isMissing(rawValue)) return null;
    return toFiniteNumber(rawValue);
  }

  const detail = data?.categoryDetails?.[field];
  if (detail && Object.prototype.hasOwnProperty.call(detail, 'value')) {
    if (isMissing(detail.value)) {
      return detail.isZero === true || detail.isZeroPattern === true ? 0 : null;
    }
    const detailedValue = toFiniteNumber(detail.value);
    if (detailedValue !== null) return detailedValue;
    if (detail.isZero === true || detail.isZeroPattern === true) return 0;
    return null;
  }

  if (isMissing(rawValue)) return null;
  const value = toFiniteNumber(rawValue);
  if (value === null) return null;

  // Legacy failed extractions may expose a zero-filled fallback object. A zero
  // without extraction evidence is not a confirmed value.
  if (data?.isParsedSuccess === false && value === 0) return null;
  return value;
}

function parseYearMonth(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { year: value.getFullYear(), month: value.getMonth() + 1 };
  }

  if (typeof value !== 'string') return null;

  const match = value.trim().match(/^(\d{4})-(0?[1-9]|1[0-2])(?:-\d{1,2})?$/);
  if (!match) return null;

  return { year: Number(match[1]), month: Number(match[2]) };
}

function formatYearMonth(year, month) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function addMonths(yearMonth, monthOffset) {
  const absoluteMonth = yearMonth.year * 12 + yearMonth.month - 1 + monthOffset;
  const year = Math.floor(absoluteMonth / 12);
  const month = ((absoluteMonth % 12) + 12) % 12 + 1;
  return { year, month, value: formatYearMonth(year, month) };
}

function monthDifference(from, to) {
  return (to.year - from.year) * 12 + to.month - from.month;
}

function firstDefined(object, keys) {
  if (!object || typeof object !== 'object') return undefined;

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) return object[key];
  }

  return undefined;
}

function normalizeHorizon(input) {
  const suppliedMonths = firstDefined(input, ['horizonMonths', 'durationMonths']);
  if (!isMissing(suppliedMonths)) {
    const months = toFiniteNumber(suppliedMonths);
    if (!Number.isInteger(months) || months < 1 || months > 120) {
      return {
        valid: false,
        months: null,
        years: null,
        error: 'Horizon bulan harus berupa bilangan bulat antara 1 dan 120.'
      };
    }

    return {
      valid: true,
      months,
      years: months / 12,
      error: null
    };
  }

  const rawYears = firstDefined(input, ['horizonYears', 'horizon']);
  const years = isMissing(rawYears) ? 1 : toFiniteNumber(rawYears);
  if (!ALLOWED_HORIZON_YEARS.includes(years)) {
    return {
      valid: false,
      months: null,
      years: null,
      error: `Horizon tahun harus salah satu dari ${ALLOWED_HORIZON_YEARS.join(', ')} tahun.`
    };
  }

  return { valid: true, months: years * 12, years, error: null };
}

function normalizeEventType(type) {
  if (typeof type !== 'string') return null;
  return EVENT_TYPE_ALIASES[type.trim().toLowerCase()] ?? null;
}

function normalizeEventRecurrence(recurrence) {
  if (typeof recurrence !== 'string') return null;
  return EVENT_RECURRENCE_ALIASES[recurrence.trim().toLowerCase()] ?? null;
}

function resolveEventMonthIndex(event, startYearMonth) {
  const explicitIndex = firstDefined(event, ['monthIndex', 'offsetMonth']);
  if (!isMissing(explicitIndex)) {
    const parsedIndex = toFiniteNumber(explicitIndex);
    return Number.isInteger(parsedIndex) ? parsedIndex : null;
  }

  const periodValue = firstDefined(event, ['date', 'period', 'yearMonth']);
  if (!isMissing(periodValue)) {
    const parsedPeriod = parseYearMonth(periodValue);
    if (!parsedPeriod || !startYearMonth) return null;
    return monthDifference(startYearMonth, parsedPeriod);
  }

  const year = toFiniteNumber(event?.year);
  const month = toFiniteNumber(event?.month);
  if (Number.isInteger(year) && Number.isInteger(month)) {
    if (!startYearMonth || month < 1 || month > 12) return null;
    return monthDifference(startYearMonth, { year, month });
  }

  if (!isMissing(event?.month)) {
    const projectionMonth = toFiniteNumber(event.month);
    return Number.isInteger(projectionMonth) ? projectionMonth - 1 : null;
  }

  return null;
}

function eventDirection(type) {
  if (INFLOW_TYPES.has(type)) return 'inflow';
  if (OUTFLOW_TYPES.has(type)) return 'outflow';
  return null;
}

function issue(code, message, field = null) {
  return { code, message, field };
}

/**
 * Validate and normalize one irregular simulation event.
 *
 * Timing supports a zero-based `monthIndex`, a one-based numeric `month`, or
 * an absolute `YYYY-MM` in `date`, `period`, or `yearMonth`. Absolute dates
 * require the simulation's `startDate`/`startMonth` in the validation context.
 */
export function validateSimulationEvent(event, options = {}) {
  const errors = [];
  const warnings = [];

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return {
      valid: false,
      errors: [issue('invalid_event', 'Event harus berupa objek.')],
      warnings,
      event: null
    };
  }

  const description = typeof event.description === 'string' ? event.description.trim() : '';
  if (!description) {
    errors.push(issue('missing_description', 'Deskripsi event wajib diisi.', 'description'));
  }

  const amount = toFiniteNumber(event.amount);
  if (amount === null || amount <= 0) {
    errors.push(issue('invalid_amount', 'Nominal event harus lebih besar dari nol.', 'amount'));
  }

  const type = normalizeEventType(event.type);
  if (!type) {
    errors.push(issue('invalid_type', 'Jenis event tidak dikenali.', 'type'));
  }

  const frequencyValue = firstDefined(event, ['frequency', 'recurrence']);
  const frequency = normalizeEventRecurrence(frequencyValue);
  if (!frequency) {
    errors.push(issue('invalid_frequency', 'Frekuensi event harus sekali atau tahunan.', 'frequency'));
  }

  const suppliedStart = firstDefined(options, ['startDate', 'startMonth']);
  const startYearMonth = isMissing(suppliedStart) ? null : parseYearMonth(suppliedStart);
  if (!isMissing(suppliedStart) && !startYearMonth) {
    errors.push(issue('invalid_start_date', 'Bulan awal simulasi harus berformat YYYY-MM.', 'startDate'));
  }

  const monthIndex = resolveEventMonthIndex(event, startYearMonth);
  if (monthIndex === null || !Number.isInteger(monthIndex)) {
    errors.push(
      issue(
        'invalid_event_date',
        'Event memerlukan monthIndex, nomor bulan proyeksi, atau tanggal berformat YYYY-MM.',
        'date'
      )
    );
  }

  const horizonMonths = toFiniteNumber(options.horizonMonths);
  if (Number.isInteger(monthIndex) && Number.isInteger(horizonMonths)) {
    if (frequency === SIMULATION_EVENT_RECURRENCES.ONE_TIME && monthIndex < 0) {
      warnings.push(issue('event_before_horizon', 'Event sekali terjadi sebelum periode proyeksi.', 'date'));
    } else if (monthIndex >= horizonMonths) {
      warnings.push(issue('event_after_horizon', 'Event berada di luar periode proyeksi.', 'date'));
    }
  }

  let carryingValue = null;
  if (!isMissing(event.carryingValue)) {
    carryingValue = nonNegativeNumber(event.carryingValue);
    if (carryingValue === null) {
      errors.push(
        issue('invalid_carrying_value', 'Nilai tercatat aset tidak boleh negatif.', 'carryingValue')
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings, event: null };
  }

  return {
    valid: true,
    errors,
    warnings,
    event: {
      id: event.id ?? null,
      description,
      amount,
      type,
      direction: eventDirection(type),
      frequency,
      recurrence: frequency,
      monthIndex,
      date: startYearMonth ? addMonths(startYearMonth, monthIndex).value : null,
      carryingValue,
      affectsNonCashAsset:
        type === SIMULATION_EVENT_TYPES.ASSET_SALE ||
        type === SIMULATION_EVENT_TYPES.ASSET_PURCHASE
    }
  };
}

/** Validate and normalize all events without throwing on malformed input. */
export function validateSimulationEvents(events, options = {}) {
  if (isMissing(events)) {
    return { valid: true, events: [], errors: [], warnings: [] };
  }

  if (!Array.isArray(events)) {
    return {
      valid: false,
      events: [],
      errors: [
        {
          index: null,
          ...issue('invalid_events', 'Daftar event harus berupa array.', 'events')
        }
      ],
      warnings: []
    };
  }

  const normalizedEvents = [];
  const errors = [];
  const warnings = [];

  events.forEach((event, index) => {
    const result = validateSimulationEvent(event, options);
    if (result.event) normalizedEvents.push(result.event);
    errors.push(...result.errors.map(item => ({ index, ...item })));
    warnings.push(...result.warnings.map(item => ({ index, ...item })));
  });

  return {
    valid: errors.length === 0,
    events: normalizedEvents,
    errors,
    warnings
  };
}

function eventOccursInMonth(event, monthIndex) {
  if (event.frequency === SIMULATION_EVENT_RECURRENCES.ONE_TIME) {
    return event.monthIndex === monthIndex;
  }

  if (event.frequency === SIMULATION_EVENT_RECURRENCES.ANNUAL) {
    return monthIndex >= Math.max(0, event.monthIndex) && (monthIndex - event.monthIndex) % 12 === 0;
  }

  return false;
}

function projectionFailure({ errors, warnings = [], limitations = [] }) {
  return {
    available: false,
    label: 'Proyeksi Arus Kas',
    isCashFlowOnly: true,
    monthly: [],
    points: [],
    summary: null,
    errors,
    warnings,
    limitations: [CASH_FLOW_ONLY_LIMITATION, ASSUMPTION_LIMITATION, ...limitations]
  };
}

/**
 * Project monthly cash flow.
 *
 * Missing baseline cash is never converted to zero: cash-flow deltas remain
 * available, while projected balance fields remain null.
 */
export function projectMonthlyCashFlow(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return projectionFailure({
      errors: [issue('invalid_input', 'Input simulasi harus berupa objek.')]
    });
  }

  const errors = [];
  const warnings = [];
  const limitations = [];
  const horizon = normalizeHorizon(input);
  if (!horizon.valid) errors.push(issue('invalid_horizon', horizon.error, 'horizon'));

  const suppliedStart = firstDefined(input, ['startDate', 'startMonth']);
  const startYearMonth = isMissing(suppliedStart) ? null : parseYearMonth(suppliedStart);
  if (!isMissing(suppliedStart) && !startYearMonth) {
    errors.push(issue('invalid_start_date', 'Bulan awal simulasi harus berformat YYYY-MM.', 'startDate'));
  }

  const baselineValue = firstDefined(input, ['baselineCash', 'startingCash', 'cash']);
  const hasBaselineCash = !isMissing(baselineValue);
  const baselineCash = hasBaselineCash ? nonNegativeNumber(baselineValue) : null;
  if (hasBaselineCash && baselineCash === null) {
    errors.push(issue('invalid_baseline_cash', 'Saldo kas awal tidak boleh negatif.', 'baselineCash'));
  } else if (!hasBaselineCash) {
    warnings.push(
      issue(
        'missing_baseline_cash',
        'Kas awal tidak tersedia; saldo kas proyeksi tidak dapat dihitung.',
        'baselineCash'
      )
    );
    limitations.push('Saldo kas proyeksi tidak tersedia karena kas awal tidak terbaca.');
  }

  const monthlyIncomeValue = firstDefined(input, ['monthlyIncome', 'regularMonthlyIncome']);
  const monthlyExpensesValue = firstDefined(input, ['monthlyExpenses', 'regularMonthlyExpenses']);
  const hasMonthlyIncome = !isMissing(monthlyIncomeValue);
  const hasMonthlyExpenses = !isMissing(monthlyExpensesValue);
  const monthlyIncome = hasMonthlyIncome ? nonNegativeNumber(monthlyIncomeValue) : 0;
  const monthlyExpenses = hasMonthlyExpenses ? nonNegativeNumber(monthlyExpensesValue) : 0;

  if (hasMonthlyIncome && monthlyIncome === null) {
    errors.push(issue('invalid_monthly_income', 'Pendapatan bulanan tidak boleh negatif.', 'monthlyIncome'));
  }
  if (hasMonthlyExpenses && monthlyExpenses === null) {
    errors.push(issue('invalid_monthly_expenses', 'Pengeluaran bulanan tidak boleh negatif.', 'monthlyExpenses'));
  }

  if (!hasMonthlyIncome) {
    warnings.push(
      issue('missing_monthly_income', 'Pendapatan bulanan belum diisi dan tidak diproyeksikan.', 'monthlyIncome')
    );
  }
  if (!hasMonthlyExpenses) {
    warnings.push(
      issue('missing_monthly_expenses', 'Pengeluaran bulanan belum diisi dan tidak diproyeksikan.', 'monthlyExpenses')
    );
  }

  if (errors.length > 0) return projectionFailure({ errors, warnings, limitations });

  const rawEvents = firstDefined(input, ['events', 'irregularEvents']);
  const validation = validateSimulationEvents(rawEvents ?? [], {
    startDate: startYearMonth ? formatYearMonth(startYearMonth.year, startYearMonth.month) : null,
    horizonMonths: horizon.months
  });
  errors.push(...validation.errors);
  warnings.push(...validation.warnings);

  if (!validation.valid) return projectionFailure({ errors, warnings, limitations });

  const hasAssetSale = validation.events.some(
    event => event.type === SIMULATION_EVENT_TYPES.ASSET_SALE
  );
  const hasAssetPurchase = validation.events.some(
    event => event.type === SIMULATION_EVENT_TYPES.ASSET_PURCHASE
  );
  const assetSaleWithoutBookValue = validation.events.some(
    event => event.type === SIMULATION_EVENT_TYPES.ASSET_SALE && event.carryingValue === null
  );

  if (hasAssetSale) {
    limitations.push(
      assetSaleWithoutBookValue
        ? 'Hasil penjualan aset menambah kas, tetapi perubahan kekayaan bersih tidak dihitung karena nilai tercatat aset tidak lengkap.'
        : 'Hasil penjualan aset menambah kas; nilai tercatat aset disimpan sebagai konteks, tetapi engine ini tidak memproyeksikan kekayaan bersih.'
    );
  }
  if (hasAssetPurchase) {
    limitations.push(
      'Pembelian aset mengurangi kas, tetapi aset baru tidak ditambahkan ke proyeksi kekayaan bersih.'
    );
  }

  let cumulativeCashFlow = 0;
  const monthly = [];

  for (let monthIndex = 0; monthIndex < horizon.months; monthIndex += 1) {
    const monthEvents = validation.events.filter(event => eventOccursInMonth(event, monthIndex));
    const irregularInflow = monthEvents
      .filter(event => event.direction === 'inflow')
      .reduce((sum, event) => sum + event.amount, 0);
    const irregularOutflow = monthEvents
      .filter(event => event.direction === 'outflow')
      .reduce((sum, event) => sum + event.amount, 0);
    const totalInflow = monthlyIncome + irregularInflow;
    const totalOutflow = monthlyExpenses + irregularOutflow;
    const netCashFlow = totalInflow - totalOutflow;
    const startingCash = baselineCash === null ? null : baselineCash + cumulativeCashFlow;
    cumulativeCashFlow += netCashFlow;
    const projectedCashBalance = baselineCash === null ? null : baselineCash + cumulativeCashFlow;
    const date = startYearMonth ? addMonths(startYearMonth, monthIndex).value : null;

    monthly.push({
      monthIndex,
      monthNumber: monthIndex + 1,
      date,
      period: date ?? `Bulan ${monthIndex + 1}`,
      startingCash,
      regularInflow: monthlyIncome,
      regularOutflow: monthlyExpenses,
      monthlyIncome,
      monthlyExpenses,
      irregularInflow,
      irregularOutflow,
      totalInflow,
      totalOutflow,
      netCashFlow,
      cumulativeCashFlow,
      projectedCashBalance,
      events: monthEvents.map(event => ({ ...event }))
    });
  }

  const totalRegularInflow = monthlyIncome * horizon.months;
  const totalRegularOutflow = monthlyExpenses * horizon.months;
  const totalIrregularInflow = monthly.reduce((sum, point) => sum + point.irregularInflow, 0);
  const totalIrregularOutflow = monthly.reduce((sum, point) => sum + point.irregularOutflow, 0);
  const totalInflow = totalRegularInflow + totalIrregularInflow;
  const totalOutflow = totalRegularOutflow + totalIrregularOutflow;
  const netCashFlow = totalInflow - totalOutflow;
  const knownBalances = monthly
    .map(point => point.projectedCashBalance)
    .filter(balance => balance !== null);

  const summary = {
    startingCash: baselineCash,
    endingCash: baselineCash === null ? null : baselineCash + netCashFlow,
    totalRegularInflow,
    totalRegularOutflow,
    totalIrregularInflow,
    totalIrregularOutflow,
    totalInflow,
    totalOutflow,
    netCashFlow,
    cumulativeCashFlow: netCashFlow,
    lowestProjectedCash: knownBalances.length > 0 ? Math.min(...knownBalances) : null,
    highestProjectedCash: knownBalances.length > 0 ? Math.max(...knownBalances) : null,
    monthsBelowZero:
      baselineCash === null
        ? null
        : monthly.filter(point => point.projectedCashBalance < 0).length
  };

  const uniqueLimitations = [
    CASH_FLOW_ONLY_LIMITATION,
    ASSUMPTION_LIMITATION,
    ...limitations
  ].filter((value, index, values) => values.indexOf(value) === index);

  return {
    available: true,
    label: 'Proyeksi Arus Kas',
    isCashFlowOnly: true,
    hasBaselineCash,
    baselineCash,
    monthlyIncome,
    monthlyExpenses,
    horizonYears: horizon.years,
    horizonMonths: horizon.months,
    startDate: startYearMonth
      ? formatYearMonth(startYearMonth.year, startYearMonth.month)
      : null,
    assumptions: {
      investmentReturnRate: null,
      inflationRate: null,
      assetAppreciationRate: null,
      debtAmortisation: null
    },
    monthly,
    points: monthly,
    summary,
    errors,
    warnings,
    limitations: uniqueLimitations
  };
}

function normalizeSafeWithdrawalRate(value) {
  if (isMissing(value)) return DEFAULT_SAFE_WITHDRAWAL_RATE;
  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed <= 0) return null;

  // Form controls commonly expose `4` for 4%; calculation callers commonly
  // expose `0.04`. Supporting both avoids an accidental 100x target error.
  const normalized = parsed > 1 ? parsed / 100 : parsed;
  return normalized > 0 && normalized <= 1 ? normalized : null;
}

function recurringAnnualExpensesFromEvents(events) {
  if (isMissing(events)) return { value: 0, errors: [] };
  if (!Array.isArray(events)) {
    return {
      value: null,
      errors: [issue('invalid_events', 'Daftar event FIRE harus berupa array.', 'events')]
    };
  }

  let value = 0;
  const errors = [];

  events.forEach((event, index) => {
    if (!event || typeof event !== 'object') {
      errors.push({ index, ...issue('invalid_event', 'Event FIRE harus berupa objek.') });
      return;
    }

    const recurrence = normalizeEventRecurrence(firstDefined(event, ['frequency', 'recurrence']));
    const type = normalizeEventType(event.type);
    const amount = toFiniteNumber(event.amount);

    if (!recurrence || !type || amount === null || amount < 0) {
      errors.push({
        index,
        ...issue('invalid_event', 'Event FIRE memiliki jenis, perulangan, atau nominal yang tidak valid.')
      });
      return;
    }

    // One-time expenses and all inflows are deliberately excluded from FIRE.
    if (recurrence === SIMULATION_EVENT_RECURRENCES.ANNUAL && OUTFLOW_TYPES.has(type)) {
      value += amount;
    }
  });

  return { value: errors.length > 0 ? null : value, errors };
}

function resolveAssetValue(input, keys) {
  const direct = firstDefined(input, keys);
  if (!isMissing(direct)) return direct;
  return firstDefined(input?.assets, keys);
}

/**
 * Calculate an expense-based FIRE target and estimated progress.
 *
 * FIRE progress deliberately uses only cash plus securities. If either asset
 * category is missing/unread, progress is unavailable instead of partial.
 */
export function calculateFIRE(input = {}) {
  const errors = [];
  const limitations = [FIRE_LIMITATION];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      available: false,
      progressAvailable: false,
      annualExpenses: null,
      fireNumber: null,
      fireTarget: null,
      investableAssets: null,
      fireProgressPercent: null,
      fireProgress: null,
      safeWithdrawalRate: DEFAULT_SAFE_WITHDRAWAL_RATE,
      errors: [issue('invalid_input', 'Input FIRE harus berupa objek.')],
      limitations
    };
  }

  const monthlyExpensesValue = firstDefined(input, ['monthlyExpenses', 'monthlyExpenditure']);
  const hasMonthlyExpenses = !isMissing(monthlyExpensesValue);
  const monthlyExpenses = hasMonthlyExpenses ? nonNegativeNumber(monthlyExpensesValue) : null;
  if (!hasMonthlyExpenses) {
    errors.push(
      issue('missing_monthly_expenses', 'Pengeluaran bulanan belum tersedia.', 'monthlyExpenses')
    );
  } else if (monthlyExpenses === null) {
    errors.push(
      issue('invalid_monthly_expenses', 'Pengeluaran bulanan tidak boleh negatif.', 'monthlyExpenses')
    );
  }

  const safeWithdrawalRateValue = firstDefined(input, [
    'safeWithdrawalRate',
    'withdrawalRate',
    'swr'
  ]);
  const safeWithdrawalRate = normalizeSafeWithdrawalRate(safeWithdrawalRateValue);
  if (safeWithdrawalRate === null) {
    errors.push(
      issue(
        'invalid_safe_withdrawal_rate',
        'Safe Withdrawal Rate harus lebih besar dari 0% dan maksimal 100%.',
        'safeWithdrawalRate'
      )
    );
  }

  const annualIrregularValue = firstDefined(input, [
    'recurringAnnualIrregularExpenses',
    'annualIrregularExpenses'
  ]);
  let recurringAnnualIrregularExpenses;
  let annualIrregularSource;

  if (!isMissing(annualIrregularValue)) {
    recurringAnnualIrregularExpenses = nonNegativeNumber(annualIrregularValue);
    annualIrregularSource = 'explicit';
    if (recurringAnnualIrregularExpenses === null) {
      errors.push(
        issue(
          'invalid_annual_irregular_expenses',
          'Pengeluaran tidak rutin tahunan tidak boleh negatif.',
          'recurringAnnualIrregularExpenses'
        )
      );
    }
  } else {
    const eventResult = recurringAnnualExpensesFromEvents(
      firstDefined(input, ['events', 'irregularEvents'])
    );
    recurringAnnualIrregularExpenses = eventResult.value;
    annualIrregularSource = 'events';
    errors.push(...eventResult.errors);
  }

  const calculationAvailable =
    monthlyExpenses !== null &&
    recurringAnnualIrregularExpenses !== null &&
    safeWithdrawalRate !== null;
  const annualExpenses = calculationAvailable
    ? monthlyExpenses * 12 + recurringAnnualIrregularExpenses
    : null;
  const fireNumber = calculationAvailable ? annualExpenses / safeWithdrawalRate : null;

  const cashValue = resolveAssetValue(input, ['cash', 'cashAndCashEquivalents', 'kas_dan_setara_kas']);
  const securitiesValue = resolveAssetValue(input, ['securities', 'suratBerharga', 'surat_berharga']);
  const hasCash = !isMissing(cashValue);
  const hasSecurities = !isMissing(securitiesValue);
  const cash = hasCash ? nonNegativeNumber(cashValue) : null;
  const securities = hasSecurities ? nonNegativeNumber(securitiesValue) : null;

  if (hasCash && cash === null) {
    errors.push(issue('invalid_cash', 'Kas dan setara kas tidak boleh negatif.', 'cash'));
  }
  if (hasSecurities && securities === null) {
    errors.push(issue('invalid_securities', 'Surat berharga tidak boleh negatif.', 'securities'));
  }

  const missingAssetCategories = [];
  if (!hasCash) missingAssetCategories.push('kas_dan_setara_kas');
  if (!hasSecurities) missingAssetCategories.push('surat_berharga');
  const assetsComplete = hasCash && hasSecurities && cash !== null && securities !== null;
  const investableAssets = assetsComplete ? cash + securities : null;
  const progressAvailable =
    calculationAvailable && fireNumber !== null && fireNumber > 0 && assetsComplete;
  const fireProgressPercent = progressAvailable
    ? (investableAssets / fireNumber) * 100
    : null;

  let progressUnavailableReason = null;
  if (!calculationAvailable) {
    progressUnavailableReason = 'fire_number_unavailable';
  } else if (fireNumber === 0) {
    progressUnavailableReason = 'fire_number_zero';
  } else if (!assetsComplete) {
    progressUnavailableReason = 'investable_asset_categories_incomplete';
  }

  if (!assetsComplete) {
    limitations.push(
      'Progres FIRE tidak tersedia karena kategori kas atau surat berharga belum terbaca lengkap.'
    );
  }

  return {
    available: calculationAvailable,
    status: calculationAvailable ? 'Tersedia' : 'Belum dapat dihitung',
    monthlyExpenses,
    recurringAnnualIrregularExpenses,
    annualIrregularSource,
    annualExpenses,
    safeWithdrawalRate,
    fireNumber,
    fireTarget: fireNumber,
    cash,
    securities,
    investableAssets,
    progressAvailable,
    progressUnavailableReason,
    fireProgressPercent,
    fireProgress: fireProgressPercent,
    missingAssetCategories,
    assumptions: {
      investableAssetCategories: ['kas_dan_setara_kas', 'surat_berharga'],
      oneTimeExpensesAnnualized: false,
      expenseBased: true
    },
    errors,
    limitations
  };
}

// Friendly aliases for callers that prefer noun- or action-oriented names.
export const runCashFlowProjection = projectMonthlyCashFlow;
export const calculateFireMetrics = calculateFIRE;
export const calculateFire = calculateFIRE;

