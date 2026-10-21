import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Calculator,
  Check,
  Info,
  Pencil,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
  X
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { formatCurrency } from '../utils/formatting';
import {
  ALLOWED_HORIZON_YEARS,
  calculateFIRE,
  projectMonthlyCashFlow,
  readEffectiveAssetValue,
  validateSimulationEvent
} from '../engine/simulationEngine';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

const EVENT_TYPES = [
  { value: 'income', label: 'Pendapatan tambahan', direction: 'Pemasukan' },
  { value: 'expense', label: 'Pengeluaran tidak rutin', direction: 'Pengeluaran' },
  { value: 'asset_sale', label: 'Penjualan aset', direction: 'Pemasukan' },
  { value: 'asset_purchase', label: 'Pembelian aset', direction: 'Pengeluaran' },
  { value: 'debt_payment', label: 'Pembayaran utang', direction: 'Pengeluaran' }
];

const EVENT_FREQUENCIES = [
  { value: 'once', label: 'Sekali' },
  { value: 'annual', label: 'Tahunan' }
];

const DEFAULT_EVENT = Object.freeze({
  description: '',
  amount: '',
  date: '',
  type: 'expense',
  frequency: 'once'
});

const MONEY_INPUT_PATTERN = /^\d+(?:[.,]\d+)?$/;
const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function toInputValue(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function toSWRInput(value) {
  if (value === null || value === undefined) return '4';
  if (typeof value === 'string') return value;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '4';
  return String(numeric <= 1 ? numeric * 100 : numeric);
}

function normalizeEvent(event, index) {
  return {
    id: event?.id || `initial-event-${index + 1}`,
    description: toInputValue(event?.description),
    amount: event?.amount === null || event?.amount === undefined || event?.amount === ''
      ? ''
      : Number.isFinite(Number(event.amount)) ? Number(event.amount) : event.amount,
    date: toInputValue(event?.date || event?.period || event?.yearMonth),
    type: EVENT_TYPES.some(({ value }) => value === event?.type) ? event.type : 'expense',
    frequency: EVENT_FREQUENCIES.some(({ value }) => value === (event?.frequency || event?.recurrence))
      ? (event.frequency || event.recurrence)
      : 'once'
  };
}

function normalizeInputs(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const horizon = Number(source.horizonYears ?? source.horizon ?? 1);
  const rawEvents = source.events ?? source.irregularEvents ?? [];

  return {
    monthlyIncome: toInputValue(source.monthlyIncome ?? source.regularMonthlyIncome),
    monthlyExpenses: toInputValue(source.monthlyExpenses ?? source.regularMonthlyExpenses),
    safeWithdrawalRate: toSWRInput(
      source.safeWithdrawalRate ?? source.withdrawalRate ?? source.swr ?? 4
    ),
    horizonYears: ALLOWED_HORIZON_YEARS.includes(horizon) ? horizon : 1,
    startDate: toInputValue(source.startDate ?? source.startMonth, currentYearMonth()),
    events: Array.isArray(rawEvents) ? rawEvents.map(normalizeEvent) : []
  };
}

function makePersistedPayload(inputs) {
  return {
    monthlyIncome: inputs.monthlyIncome,
    monthlyExpenses: inputs.monthlyExpenses,
    safeWithdrawalRate: inputs.safeWithdrawalRate,
    horizonYears: inputs.horizonYears,
    startDate: inputs.startDate,
    events: inputs.events.map((event) => ({ ...event }))
  };
}

function parseNonNegativeNumber(raw, label) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { missing: true, valid: true, value: null, message: null };
  }

  const normalized = String(raw)
    .trim()
    .replace(/^rp\.?\s*/i, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');

  if (!MONEY_INPUT_PATTERN.test(normalized)) {
    return {
      missing: false,
      valid: false,
      value: null,
      message: `${label} harus berupa angka nol atau lebih.`
    };
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    return {
      missing: false,
      valid: false,
      value: null,
      message: `${label} harus berupa angka nol atau lebih.`
    };
  }

  return { missing: false, valid: true, value, message: null };
}

function parsePositiveNumber(raw, label) {
  const result = parseNonNegativeNumber(raw, label);
  if (result.missing || (result.valid && result.value <= 0)) {
    return {
      missing: result.missing,
      valid: false,
      value: null,
      message: `${label} harus lebih besar dari nol.`
    };
  }
  return result;
}

function resolveEffectiveData(extractedData) {
  if (extractedData?.effective?.assets || extractedData?.effective?.identity) {
    return extractedData.effective;
  }
  if (extractedData?.record?.effective?.assets || extractedData?.record?.effective?.identity) {
    return extractedData.record.effective;
  }
  return extractedData || {};
}

function availableCurrency(value) {
  return Number.isFinite(value) ? formatCurrency(value) : 'Tidak tersedia';
}

function compactCurrency(value) {
  return Number.isFinite(Number(value)) ? formatCurrency(Number(value), true) : '—';
}

function displayIdentity(value) {
  return value === null || value === undefined || value === '' ? 'Tidak tersedia' : value;
}

function formatPeriod(value) {
  if (!YEAR_MONTH_PATTERN.test(value || '')) return value || '—';
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function uniqueMessages(items) {
  const messages = items
    .map((item) => (typeof item === 'string' ? item : item?.message))
    .filter(Boolean);
  return messages.filter((message, index) => messages.indexOf(message) === index);
}

function BaselineCard({ label, value, helper, accent = 'var(--keu-text-main)' }) {
  const available = Number.isFinite(value);
  return (
    <div
      style={{
        minWidth: 0,
        padding: '1rem',
        backgroundColor: 'var(--keu-bg-primary)',
        border: '1px solid var(--keu-border-subtle)',
        borderRadius: 'var(--keu-radius-md)'
      }}
    >
      <span
        style={{
          display: 'block',
          color: 'var(--keu-text-muted)',
          fontSize: '0.72rem',
          fontWeight: 700,
          letterSpacing: '0.045em'
        }}
      >
        {label}
      </span>
      <strong
        style={{
          display: 'block',
          marginTop: '0.35rem',
          color: available ? accent : 'var(--keu-text-muted)',
          fontSize: 'clamp(1rem, 2.2vw, 1.2rem)',
          lineHeight: 1.25,
          overflowWrap: 'anywhere'
        }}
      >
        {availableCurrency(value)}
      </strong>
      {helper && (
        <span style={{ display: 'block', marginTop: '0.25rem', color: 'var(--keu-text-dim)', fontSize: '0.72rem' }}>
          {helper}
        </span>
      )}
    </div>
  );
}

function ResultCard({ label, value, helper, accent = 'var(--keu-text-main)' }) {
  const available = Number.isFinite(value);
  return (
    <div className="keu-card" style={{ padding: '1rem 1.1rem', minWidth: 0 }}>
      <span style={{ display: 'block', color: 'var(--keu-text-muted)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em' }}>
        {label}
      </span>
      <strong
        style={{
          display: 'block',
          marginTop: '0.35rem',
          color: available ? accent : 'var(--keu-text-muted)',
          fontSize: 'clamp(1.05rem, 2.5vw, 1.3rem)',
          overflowWrap: 'anywhere'
        }}
      >
        {available ? formatCurrency(value) : 'Belum dapat dihitung'}
      </strong>
      {helper && (
        <span style={{ display: 'block', marginTop: '0.25rem', color: 'var(--keu-text-dim)', fontSize: '0.72rem' }}>
          {helper}
        </span>
      )}
    </div>
  );
}

function MoneyField({ id, label, value, onChange, helper, parsed }) {
  return (
    <div className="keu-field-group">
      <label className="keu-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className="keu-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Contoh: 10000000"
        aria-invalid={!parsed.valid}
        aria-describedby={`${id}-hint`}
      />
      <span
        id={`${id}-hint`}
        style={{
          color: parsed.valid ? 'var(--keu-text-dim)' : 'var(--keu-status-danger-text)',
          fontSize: '0.72rem'
        }}
      >
        {!parsed.valid
          ? parsed.message
          : parsed.missing
            ? helper
            : `${formatCurrency(parsed.value)} per bulan`}
      </span>
    </div>
  );
}

/**
 * Dedicated cash-flow simulation page for one effective LHKPN record.
 *
 * `initialInputs` seeds local state. For application-owned state, pass
 * `simulationState` and subscribe with `onSimulationStateChange`. The original
 * `onInputsChange` callback remains supported and receives the same payload.
 */
export function FinancialSimulationPage({
  extractedData,
  onBack,
  initialInputs,
  onInputsChange,
  simulationState,
  onSimulationStateChange
}) {
  const [localInputs, setLocalInputs] = useState(() => normalizeInputs(initialInputs));
  const [eventEditor, setEventEditor] = useState(null);
  const [eventIssues, setEventIssues] = useState([]);
  const controlledInputs = useMemo(
    () => normalizeInputs(simulationState),
    [simulationState]
  );
  const inputs = simulationState === undefined ? localInputs : controlledInputs;
  const nextEventId = useRef(inputs.events.length + 1);

  const commitInputs = (updater) => {
    const nextInputs = typeof updater === 'function' ? updater(inputs) : updater;
    if (simulationState === undefined) setLocalInputs(nextInputs);

    const payload = makePersistedPayload(nextInputs);
    onInputsChange?.(payload);
    if (onSimulationStateChange !== onInputsChange) {
      onSimulationStateChange?.(payload);
    }
  };

  const effectiveData = useMemo(() => resolveEffectiveData(extractedData), [extractedData]);
  const identity = effectiveData.identity || {};
  const totalAssets = readEffectiveAssetValue(effectiveData, 'subtotal_harta');
  const debt = readEffectiveAssetValue(effectiveData, 'hutang');
  const netWorth = readEffectiveAssetValue(effectiveData, 'total_harta_kekayaan');
  const baselineCash = readEffectiveAssetValue(effectiveData, 'kas_dan_setara_kas');
  const securities = readEffectiveAssetValue(effectiveData, 'surat_berharga');

  const monthlyIncome = useMemo(
    () => parseNonNegativeNumber(inputs.monthlyIncome, 'Pendapatan bulanan'),
    [inputs.monthlyIncome]
  );
  const monthlyExpenses = useMemo(
    () => parseNonNegativeNumber(inputs.monthlyExpenses, 'Pengeluaran bulanan'),
    [inputs.monthlyExpenses]
  );
  const swr = useMemo(
    () => parsePositiveNumber(inputs.safeWithdrawalRate, 'Safe Withdrawal Rate'),
    [inputs.safeWithdrawalRate]
  );
  const swrValid = swr.valid && swr.value <= 100;
  const swrMessage = swrValid ? null : 'Safe Withdrawal Rate harus lebih besar dari 0% dan maksimal 100%.';
  const startDateValid = YEAR_MONTH_PATTERN.test(inputs.startDate);

  const normalizedProjectionEvents = useMemo(
    () => inputs.events.map((event) => ({
      ...event,
      amount: Number(event.amount)
    })),
    [inputs.events]
  );

  const projection = useMemo(() => {
    const projectionInput = {
      horizonYears: inputs.horizonYears,
      startDate: startDateValid ? inputs.startDate : 'invalid',
      events: normalizedProjectionEvents
    };

    if (baselineCash !== null) projectionInput.baselineCash = baselineCash;
    if (!monthlyIncome.missing) {
      projectionInput.monthlyIncome = monthlyIncome.valid ? monthlyIncome.value : -1;
    }
    if (!monthlyExpenses.missing) {
      projectionInput.monthlyExpenses = monthlyExpenses.valid ? monthlyExpenses.value : -1;
    }

    return projectMonthlyCashFlow(projectionInput);
  }, [
    baselineCash,
    inputs.horizonYears,
    inputs.startDate,
    monthlyExpenses,
    monthlyIncome,
    normalizedProjectionEvents,
    startDateValid
  ]);

  const fire = useMemo(() => {
    const fireInput = {
      // The form is explicitly percentage-based (4 means 4%). Passing the
      // decimal avoids the engine's dual 4/0.04 convenience becoming
      // ambiguous for small, user-entered percentages such as 0.5%.
      safeWithdrawalRate: swrValid ? swr.value / 100 : -1,
      events: normalizedProjectionEvents
    };

    if (!monthlyExpenses.missing) {
      fireInput.monthlyExpenses = monthlyExpenses.valid ? monthlyExpenses.value : -1;
    }
    if (baselineCash !== null) fireInput.cash = baselineCash;
    if (securities !== null) fireInput.securities = securities;

    return calculateFIRE(fireInput);
  }, [baselineCash, monthlyExpenses, normalizedProjectionEvents, securities, swr.value, swrValid]);

  const fieldErrors = uniqueMessages([
    monthlyIncome.valid ? null : monthlyIncome.message,
    monthlyExpenses.valid ? null : monthlyExpenses.message,
    swrMessage,
    startDateValid ? null : 'Bulan awal simulasi harus berformat YYYY-MM.'
  ]);
  const calculationErrors = uniqueMessages([
    ...fieldErrors,
    ...(projection.errors || []),
    ...(fire.errors || [])
  ]);
  const calculationWarnings = uniqueMessages(projection.warnings || []);
  const limitations = uniqueMessages([
    ...(projection.limitations || []),
    ...(fire.limitations || []),
    'Saldo awal hanya menggunakan Kas dan Setara Kas yang terbaca pada LHKPN.',
    'Estimasi progres FIRE hanya menggunakan Kas dan Setara Kas serta Surat Berharga.',
    'Kejadian tahunan diulang setiap 12 bulan mulai dari bulan kejadian.'
  ]);

  const chartUsesBalance = projection.available && projection.hasBaselineCash;
  const chartData = useMemo(() => {
    const points = projection.monthly || [];
    return {
      labels: points.map((point) => formatPeriod(point.date || point.period)),
      datasets: [
        {
          label: chartUsesBalance ? 'Saldo kas proyeksi' : 'Arus kas kumulatif',
          data: points.map((point) => chartUsesBalance
            ? point.projectedCashBalance
            : point.cumulativeCashFlow),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.14)',
          pointBackgroundColor: '#60a5fa',
          pointBorderWidth: 0,
          pointRadius: points.length > 48 ? 0 : 2,
          pointHoverRadius: 4,
          borderWidth: 2.25,
          tension: 0.25,
          fill: true
        }
      ]
    };
  }, [chartUsesBalance, projection.monthly]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        align: 'end',
        labels: { color: '#94a3b8', usePointStyle: true, boxWidth: 8 }
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8', maxTicksLimit: 12, maxRotation: 0 }
      },
      y: {
        grid: { color: 'rgba(148, 163, 184, 0.14)' },
        ticks: {
          color: '#94a3b8',
          callback: (value) => compactCurrency(value)
        }
      }
    }
  }), []);

  const updateInput = (field, value) => {
    commitInputs((current) => ({ ...current, [field]: value }));
  };

  const openNewEvent = () => {
    setEventIssues([]);
    setEventEditor({
      mode: 'add',
      value: { ...DEFAULT_EVENT, date: startDateValid ? inputs.startDate : '' }
    });
  };

  const openEditEvent = (event) => {
    setEventIssues([]);
    setEventEditor({
      mode: 'edit',
      value: { ...event, amount: toInputValue(event.amount) }
    });
  };

  const closeEventEditor = () => {
    setEventEditor(null);
    setEventIssues([]);
  };

  const updateEventDraft = (field, value) => {
    setEventEditor((current) => ({
      ...current,
      value: { ...current.value, [field]: value }
    }));
  };

  const saveEvent = (event) => {
    event.preventDefault();
    const amount = parsePositiveNumber(eventEditor.value.amount, 'Nominal kejadian');
    if (!amount.valid) {
      setEventIssues([amount.message]);
      return;
    }

    const validation = validateSimulationEvent(
      { ...eventEditor.value, amount: amount.value },
      {
        startDate: startDateValid ? inputs.startDate : 'invalid',
        horizonMonths: inputs.horizonYears * 12
      }
    );

    if (!validation.valid) {
      setEventIssues(uniqueMessages(validation.errors));
      return;
    }

    let nextId = eventEditor.value.id;
    while (!nextId || inputs.events.some((item) => item.id === nextId)) {
      nextId = `simulation-event-${nextEventId.current++}`;
      if (eventEditor.mode === 'edit') break;
    }

    const savedEvent = {
      id: eventEditor.value.id || nextId,
      description: validation.event.description,
      amount: validation.event.amount,
      date: validation.event.date,
      type: validation.event.type,
      frequency: validation.event.frequency
    };

    commitInputs((current) => ({
      ...current,
      events: eventEditor.mode === 'edit'
        ? current.events.map((item) => item.id === savedEvent.id ? savedEvent : item)
        : [...current.events, savedEvent]
    }));
    closeEventEditor();
  };

  const removeEvent = (eventId) => {
    commitInputs((current) => ({
      ...current,
      events: current.events.filter((event) => event.id !== eventId)
    }));
    if (eventEditor?.value?.id === eventId) closeEventEditor();
  };

  const summary = projection.summary;
  const regularNet = monthlyIncome.valid && !monthlyIncome.missing
    && monthlyExpenses.valid && !monthlyExpenses.missing
    ? monthlyIncome.value - monthlyExpenses.value
    : null;
  const fireProgress = fire.progressAvailable ? fire.fireProgressPercent : null;
  const fireProgressWidth = Number.isFinite(fireProgress)
    ? `${Math.max(0, Math.min(100, fireProgress))}%`
    : '0%';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
          {onBack && (
            <button
              type="button"
              className="keu-btn keu-btn-outline keu-btn-sm"
              onClick={onBack}
              aria-label="Kembali ke hasil analisis"
            >
              <ArrowLeft size={16} />
              Kembali
            </button>
          )}
          <div>
            <span className="keu-badge keu-badge-info" style={{ marginBottom: '0.625rem' }}>
              <Calculator size={13} /> Perencanaan
            </span>
            <h1 style={{ fontSize: 'clamp(1.45rem, 4vw, 2rem)', lineHeight: 1.2, letterSpacing: '-0.025em' }}>
              Simulasi Keuangan
            </h1>
            <p style={{ marginTop: '0.4rem', color: 'var(--keu-text-muted)', fontSize: '0.875rem' }}>
              Proyeksikan arus kas tanpa mengunggah ulang dokumen LHKPN.
            </p>
          </div>
        </div>
        <span className="keu-badge keu-badge-neutral">Proyeksi, bukan jaminan hasil</span>
      </header>

      <section className="keu-card" aria-labelledby="simulation-baseline-heading">
        <div className="keu-card-header">
          <h2 id="simulation-baseline-heading" className="keu-card-title">
            <Wallet size={20} color="#60a5fa" />
            Baseline LHKPN
          </h2>
          <span className="keu-badge keu-badge-neutral">
            Tahun {displayIdentity(identity.tahun_laporan ?? extractedData?.reportingYear)}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: '0.875rem',
            marginBottom: '1rem'
          }}
        >
          <div
            style={{
              gridColumn: '1 / -1',
              padding: '0.8rem 1rem',
              backgroundColor: 'var(--keu-status-info-bg)',
              border: '1px solid var(--keu-status-info-border)',
              borderRadius: 'var(--keu-radius-md)'
            }}
          >
            <span className="keu-label">Nama Wajib Lapor</span>
            <strong style={{ display: 'block', marginTop: '0.2rem', color: 'var(--keu-text-main)' }}>
              {displayIdentity(identity.nama)}
            </strong>
          </div>
          <BaselineCard label="TOTAL ASET" value={totalAssets} />
          <BaselineCard label="TOTAL UTANG" value={debt} accent="#f87171" />
          <BaselineCard label="KEKAYAAN BERSIH" value={netWorth} accent="#60a5fa" />
          <BaselineCard
            label="KAS & SETARA KAS"
            value={baselineCash}
            accent="#34d399"
            helper={baselineCash === null ? 'Tidak diasumsikan sebagai nol' : 'Saldo awal proyeksi'}
          />
          <BaselineCard
            label="SURAT BERHARGA"
            value={securities}
            accent="#34d399"
            helper="Komponen aset investasi FIRE"
          />
        </div>

        {baselineCash === null && (
          <div className="keu-alert keu-alert-warning">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <strong>Kas awal tidak tersedia.</strong>{' '}
              Saldo kas proyeksi tidak dihitung. Grafik tetap menampilkan perubahan arus kas kumulatif tanpa menganggap kas awal bernilai nol.
            </div>
          </div>
        )}
      </section>

      <section className="keu-card" aria-labelledby="regular-input-heading">
        <div className="keu-card-header">
          <h2 id="regular-input-heading" className="keu-card-title">
            <CalendarDays size={20} color="#60a5fa" />
            Parameter Simulasi
          </h2>
          <span style={{ color: 'var(--keu-text-muted)', fontSize: '0.78rem' }}>Perubahan dihitung otomatis</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>
          <MoneyField
            id="simulation-monthly-income"
            label="Pendapatan bersih bulanan (Rp)"
            value={inputs.monthlyIncome}
            onChange={(value) => updateInput('monthlyIncome', value)}
            parsed={monthlyIncome}
            helper="Belum diisi; pendapatan rutin tidak diproyeksikan."
          />
          <MoneyField
            id="simulation-monthly-expenses"
            label="Pengeluaran bulanan (Rp)"
            value={inputs.monthlyExpenses}
            onChange={(value) => updateInput('monthlyExpenses', value)}
            parsed={monthlyExpenses}
            helper="Wajib diisi untuk menghitung target FIRE."
          />
          <div className="keu-field-group">
            <label className="keu-label" htmlFor="simulation-swr">Safe Withdrawal Rate (%)</label>
            <input
              id="simulation-swr"
              type="text"
              inputMode="decimal"
              className="keu-input"
              value={inputs.safeWithdrawalRate}
              onChange={(event) => updateInput('safeWithdrawalRate', event.target.value)}
              aria-invalid={!swrValid}
              aria-describedby="simulation-swr-hint"
            />
            <span
              id="simulation-swr-hint"
              style={{ color: swrValid ? 'var(--keu-text-dim)' : 'var(--keu-status-danger-text)', fontSize: '0.72rem' }}
            >
              {swrValid ? `Target FIRE menggunakan SWR ${swr.value}%` : swrMessage}
            </span>
          </div>
          <div className="keu-field-group">
            <label className="keu-label" htmlFor="simulation-horizon">Horizon waktu</label>
            <select
              id="simulation-horizon"
              className="keu-select"
              value={inputs.horizonYears}
              onChange={(event) => updateInput('horizonYears', Number(event.target.value))}
            >
              {ALLOWED_HORIZON_YEARS.map((year) => (
                <option key={year} value={year}>{year} tahun</option>
              ))}
            </select>
            <span style={{ color: 'var(--keu-text-dim)', fontSize: '0.72rem' }}>
              {inputs.horizonYears * 12} bulan proyeksi
            </span>
          </div>
          <div className="keu-field-group">
            <label className="keu-label" htmlFor="simulation-start-date">Bulan awal simulasi</label>
            <input
              id="simulation-start-date"
              type="month"
              className="keu-input"
              value={inputs.startDate}
              onChange={(event) => updateInput('startDate', event.target.value)}
              aria-invalid={!startDateValid}
            />
            <span style={{ color: startDateValid ? 'var(--keu-text-dim)' : 'var(--keu-status-danger-text)', fontSize: '0.72rem' }}>
              {startDateValid ? 'Menentukan waktu penerapan kejadian.' : 'Gunakan format YYYY-MM.'}
            </span>
          </div>
        </div>
      </section>

      <section className="keu-card" aria-labelledby="irregular-events-heading">
        <div className="keu-card-header" style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 id="irregular-events-heading" className="keu-card-title">
              <TrendingUp size={20} color="#60a5fa" />
              Kejadian Tidak Rutin
            </h2>
            <p style={{ marginTop: '0.35rem', color: 'var(--keu-text-muted)', fontSize: '0.78rem' }}>
              Tambahkan pemasukan atau pengeluaran di luar arus kas bulanan.
            </p>
          </div>
          <button type="button" className="keu-btn keu-btn-primary keu-btn-sm" onClick={openNewEvent}>
            <Plus size={16} /> Tambah Kejadian
          </button>
        </div>

        {eventEditor && (
          <form
            onSubmit={saveEvent}
            style={{
              padding: '1rem',
              marginBottom: '1rem',
              backgroundColor: 'var(--keu-bg-primary)',
              border: '1px solid var(--keu-status-info-border)',
              borderRadius: 'var(--keu-radius-md)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.875rem' }}>
              <strong style={{ fontSize: '0.9rem' }}>
                {eventEditor.mode === 'edit' ? 'Edit Kejadian' : 'Kejadian Baru'}
              </strong>
              <button
                type="button"
                className="keu-btn keu-btn-outline keu-btn-sm"
                onClick={closeEventEditor}
                aria-label="Tutup editor kejadian"
                style={{ padding: '0.35rem' }}
              >
                <X size={15} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.875rem' }}>
              <div className="keu-field-group" style={{ gridColumn: '1 / -1' }}>
                <label className="keu-label" htmlFor="event-description">Deskripsi</label>
                <input
                  id="event-description"
                  type="text"
                  className="keu-input"
                  value={eventEditor.value.description}
                  onChange={(event) => updateEventDraft('description', event.target.value)}
                  placeholder="Contoh: Bonus tahunan"
                />
              </div>
              <div className="keu-field-group">
                <label className="keu-label" htmlFor="event-amount">Nominal (Rp)</label>
                <input
                  id="event-amount"
                  type="text"
                  inputMode="decimal"
                  className="keu-input"
                  value={eventEditor.value.amount}
                  onChange={(event) => updateEventDraft('amount', event.target.value)}
                  placeholder="Contoh: 25000000"
                />
              </div>
              <div className="keu-field-group">
                <label className="keu-label" htmlFor="event-date">Bulan kejadian</label>
                <input
                  id="event-date"
                  type="month"
                  className="keu-input"
                  value={eventEditor.value.date}
                  onChange={(event) => updateEventDraft('date', event.target.value)}
                />
              </div>
              <div className="keu-field-group">
                <label className="keu-label" htmlFor="event-type">Jenis kejadian</label>
                <select
                  id="event-type"
                  className="keu-select"
                  value={eventEditor.value.type}
                  onChange={(event) => updateEventDraft('type', event.target.value)}
                >
                  {EVENT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div className="keu-field-group">
                <label className="keu-label" htmlFor="event-frequency">Frekuensi</label>
                <select
                  id="event-frequency"
                  className="keu-select"
                  value={eventEditor.value.frequency}
                  onChange={(event) => updateEventDraft('frequency', event.target.value)}
                >
                  {EVENT_FREQUENCIES.map((frequency) => (
                    <option key={frequency.value} value={frequency.value}>{frequency.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {eventIssues.length > 0 && (
              <div className="keu-alert keu-alert-warning" role="alert" style={{ marginTop: '0.875rem' }}>
                <AlertTriangle size={17} />
                <div>{eventIssues.join(' ')}</div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button type="button" className="keu-btn keu-btn-outline keu-btn-sm" onClick={closeEventEditor}>
                Batal
              </button>
              <button type="submit" className="keu-btn keu-btn-primary keu-btn-sm">
                <Check size={15} /> Simpan Kejadian
              </button>
            </div>
          </form>
        )}

        {inputs.events.length === 0 ? (
          <div
            style={{
              padding: '1.25rem',
              textAlign: 'center',
              color: 'var(--keu-text-muted)',
              backgroundColor: 'var(--keu-bg-primary)',
              border: '1px dashed var(--keu-border-strong)',
              borderRadius: 'var(--keu-radius-md)',
              fontSize: '0.85rem'
            }}
          >
            Belum ada kejadian tidak rutin. Simulasi hanya memakai pendapatan dan pengeluaran bulanan.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {inputs.events.map((event) => {
              const eventType = EVENT_TYPES.find((type) => type.value === event.type);
              const isInflow = event.type === 'income' || event.type === 'asset_sale';
              return (
                <article
                  key={event.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    flexWrap: 'wrap',
                    padding: '0.875rem 1rem',
                    backgroundColor: 'var(--keu-bg-primary)',
                    border: '1px solid var(--keu-border-subtle)',
                    borderRadius: 'var(--keu-radius-md)'
                  }}
                >
                  <div style={{ minWidth: 0, flex: '1 1 280px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong style={{ overflowWrap: 'anywhere' }}>{event.description}</strong>
                      <span className={`keu-badge ${isInflow ? 'keu-badge-success' : 'keu-badge-warning'}`}>
                        {eventType?.direction}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.35rem', color: 'var(--keu-text-muted)', fontSize: '0.76rem', flexWrap: 'wrap' }}>
                      <span>{eventType?.label}</span>
                      <span>• {formatPeriod(event.date)}</span>
                      <span>• {event.frequency === 'annual' ? 'Tahunan' : 'Sekali'}</span>
                    </div>
                  </div>
                  <strong style={{ color: isInflow ? 'var(--keu-status-success-text)' : 'var(--keu-status-warning-text)' }}>
                    {isInflow ? '+' : '−'}{formatCurrency(Number(event.amount))}
                  </strong>
                  <div style={{ display: 'flex', gap: '0.45rem' }}>
                    <button
                      type="button"
                      className="keu-btn keu-btn-outline keu-btn-sm"
                      onClick={() => openEditEvent(event)}
                      aria-label={`Edit ${event.description}`}
                      style={{ padding: '0.45rem' }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="keu-btn keu-btn-danger keu-btn-sm"
                      onClick={() => removeEvent(event.id)}
                      aria-label={`Hapus ${event.description}`}
                      style={{ padding: '0.45rem' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {(calculationErrors.length > 0 || calculationWarnings.length > 0) && (
        <section aria-label="Pesan validasi" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {calculationErrors.length > 0 && (
            <div className="keu-alert keu-alert-warning">
              <AlertTriangle size={18} aria-hidden="true" />
              <div>
                <strong>Beberapa hasil belum dapat dihitung.</strong>
                <ul style={{ margin: '0.4rem 0 0 1rem' }}>
                  {calculationErrors.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </div>
            </div>
          )}
          {calculationWarnings.length > 0 && (
            <div className="keu-alert keu-alert-info">
              <Info size={18} aria-hidden="true" />
              <div>
                <strong>Catatan simulasi.</strong>
                <ul style={{ margin: '0.4rem 0 0 1rem' }}>
                  {calculationWarnings.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </div>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="projection-heading">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '1rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
          <div>
            <h2 id="projection-heading" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
              <TrendingUp size={19} color="#60a5fa" />
              Proyeksi Arus Kas
            </h2>
            <p style={{ marginTop: '0.25rem', color: 'var(--keu-text-muted)', fontSize: '0.78rem' }}>
              Bukan proyeksi kekayaan bersih dan tidak menjamin hasil keuangan di masa depan.
            </p>
          </div>
          <span className="keu-badge keu-badge-info">{inputs.horizonYears} tahun</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))', gap: '0.875rem', marginBottom: '1rem' }}>
          <ResultCard
            label="ARUS KAS RUTIN / BULAN"
            value={regularNet}
            accent={regularNet !== null && regularNet < 0 ? '#f87171' : '#34d399'}
            helper="Pendapatan dikurangi pengeluaran rutin"
          />
          <ResultCard
            label={`ARUS KAS BERSIH ${inputs.horizonYears} TAHUN`}
            value={summary?.netCashFlow ?? null}
            accent={summary?.netCashFlow < 0 ? '#f87171' : '#34d399'}
            helper="Termasuk seluruh kejadian dalam horizon"
          />
          <ResultCard
            label={projection.hasBaselineCash ? 'SALDO KAS AKHIR' : 'ARUS KAS KUMULATIF'}
            value={projection.hasBaselineCash ? summary?.endingCash ?? null : summary?.cumulativeCashFlow ?? null}
            accent={(projection.hasBaselineCash ? summary?.endingCash : summary?.cumulativeCashFlow) < 0 ? '#f87171' : '#60a5fa'}
            helper={projection.hasBaselineCash ? 'Kas awal ditambah arus kas bersih' : 'Kas awal tidak tersedia'}
          />
          <ResultCard
            label="PENGELUARAN TIDAK RUTIN"
            value={summary?.totalIrregularOutflow ?? null}
            accent="#fbbf24"
            helper="Total kejadian pengeluaran dalam horizon"
          />
        </div>

        <div className="keu-card">
          <div className="keu-card-header">
            <div>
              <h3 className="keu-card-title">
                {chartUsesBalance ? 'Saldo Kas Proyeksi' : 'Arus Kas Kumulatif'}
              </h3>
              <p style={{ marginTop: '0.3rem', color: 'var(--keu-text-muted)', fontSize: '0.76rem' }}>
                {chartUsesBalance
                  ? `Berawal dari kas LHKPN sebesar ${formatCurrency(baselineCash)}.`
                  : 'Ditampilkan sebagai perubahan kumulatif karena saldo kas awal tidak terbaca.'}
              </p>
            </div>
          </div>
          {projection.available && projection.monthly.length > 0 ? (
            <div style={{ position: 'relative', width: '100%', height: 'clamp(280px, 42vw, 390px)' }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--keu-text-muted)' }}>
              Perbaiki input yang ditandai untuk menampilkan grafik.
            </div>
          )}
        </div>
      </section>

      <section className="keu-card" aria-labelledby="fire-heading">
        <div className="keu-card-header">
          <div>
            <h2 id="fire-heading" className="keu-card-title">
              <Target size={20} color="#34d399" />
              Estimasi FIRE
            </h2>
            <p style={{ marginTop: '0.3rem', color: 'var(--keu-text-muted)', fontSize: '0.76rem' }}>
              Berdasarkan pengeluaran, bukan pendapatan.
            </p>
          </div>
          <span className={`keu-badge ${fire.available ? 'keu-badge-success' : 'keu-badge-warning'}`}>
            {fire.status || 'Belum dapat dihitung'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))', gap: '0.875rem' }}>
          <ResultCard
            label="PENGELUARAN TAHUNAN"
            value={fire.annualExpenses}
            helper="12× pengeluaran bulanan + kejadian tahunan"
          />
          <ResultCard
            label={`TARGET FIRE (SWR ${swrValid ? swr.value : '—'}%)`}
            value={fire.fireNumber}
            accent="#34d399"
            helper="Pengeluaran tahunan ÷ SWR"
          />
          <ResultCard
            label="ASET INVESTASI"
            value={fire.investableAssets}
            accent="#60a5fa"
            helper="Kas dan setara kas + surat berharga"
          />
        </div>

        <div
          style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: 'var(--keu-bg-primary)',
            border: '1px solid var(--keu-border-subtle)',
            borderRadius: 'var(--keu-radius-md)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--keu-text-muted)', fontSize: '0.8rem', fontWeight: 700 }}>PROGRES MENUJU TARGET FIRE</span>
            <strong style={{ color: fire.progressAvailable ? '#34d399' : 'var(--keu-text-muted)', fontSize: '1.1rem' }}>
              {fire.progressAvailable
                ? `${fireProgress.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`
                : 'Belum dapat dihitung'}
            </strong>
          </div>
          <div className="keu-metric-bar-track" style={{ marginTop: '0.625rem' }}>
            <div className="keu-metric-bar-fill success" style={{ width: fireProgressWidth }} />
          </div>
          {!fire.progressAvailable && (
            <p style={{ marginTop: '0.55rem', color: 'var(--keu-text-muted)', fontSize: '0.76rem' }}>
              {fire.progressUnavailableReason === 'investable_asset_categories_incomplete'
                ? 'Kas atau surat berharga belum terbaca lengkap; nilai yang hilang tidak dianggap nol.'
                : 'Lengkapi pengeluaran dan SWR yang valid untuk menghitung progres.'}
            </p>
          )}
        </div>
      </section>

      <section
        className="keu-card"
        aria-labelledby="assumptions-heading"
        style={{ backgroundColor: 'var(--keu-bg-primary)' }}
      >
        <div className="keu-card-header">
          <h2 id="assumptions-heading" className="keu-card-title">
            <Info size={19} color="#fbbf24" />
            Asumsi dan Batasan
          </h2>
          <span className="keu-badge keu-badge-warning">Baca sebelum menggunakan hasil</span>
        </div>
        <ul style={{ display: 'grid', gap: '0.6rem', margin: '0 0 0 1.1rem', color: 'var(--keu-text-muted)', fontSize: '0.82rem' }}>
          {limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
        </ul>
      </section>
    </div>
  );
}

export default FinancialSimulationPage;
