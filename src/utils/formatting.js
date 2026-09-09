/**
 * Utility functions for Indonesian financial and number formatting
 */

/**
 * Parses Indonesian currency strings into a number or null.
 * Handles formats like:
 * - "Rp. 8.645.951.000" -> 8645951000
 * - "Rp 400.000.000" -> 400000000
 * - "Rp. ----" or "----" -> 0
 * - "0" -> 0
 * - "" / null / undefined -> null
 *
 * @param {string|number|null} raw
 * @returns {{ value: number|null, rawText: string, isZeroPattern: boolean }}
 */
export function parseIndonesianMoney(raw) {
  if (raw === null || raw === undefined) {
    return { value: null, rawText: '', isZeroPattern: false };
  }

  const rawText = String(raw).trim();

  if (!rawText) {
    return { value: null, rawText, isZeroPattern: false };
  }

  // Check for dash/zero patterns like "----", "Rp. ----", "Rp ----", "0", "-"
  const strippedDashes = rawText.replace(/Rp\.?/gi, '').replace(/\s+/g, '');
  if (/^[-—–]+$/.test(strippedDashes) || strippedDashes === '0') {
    return { value: 0, rawText, isZeroPattern: true };
  }

  // Extract digits
  // Indonesian format uses '.' as thousands separator and ',' as decimal separator
  // Remove Rp., dots, spaces
  let cleaned = rawText
    .replace(/Rp\.?/gi, '')
    .replace(/\./g, '')
    .replace(/\s+/g, '')
    .replace(/,/g, '.');

  const num = parseFloat(cleaned);
  if (isNaN(num)) {
    return { value: null, rawText, isZeroPattern: false };
  }

  return { value: num, rawText, isZeroPattern: false };
}

/**
 * Formats a number as Indonesian Rupiah currency.
 * @param {number|null|undefined} value
 * @param {boolean} compact - If true, formats as Rp17,6 miliar / Rp500 juta / etc.
 * @returns {string}
 */
export function formatCurrency(value, compact = false) {
  if (value === null || value === undefined || isNaN(value)) {
    return 'Rp 0';
  }

  const num = Number(value);

  if (compact) {
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (abs >= 1e12) {
      return `${sign}Rp ${(abs / 1e12).toLocaleString('id-ID', { maximumFractionDigits: 1 })} triliun`;
    }
    if (abs >= 1e9) {
      return `${sign}Rp ${(abs / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} miliar`;
    }
    if (abs >= 1e6) {
      return `${sign}Rp ${(abs / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} juta`;
    }
    if (abs >= 1e3) {
      return `${sign}Rp ${(abs / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 1 })} ribu`;
    }
  }

  return 'Rp ' + Math.round(num).toLocaleString('id-ID');
}

/**
 * Formats a decimal ratio into a Indonesian percentage string (e.g. 0.47115 -> "47,1%")
 * @param {number|null|undefined} ratio
 * @param {number} decimals
 * @returns {string}
 */
export function formatPercent(ratio, decimals = 1) {
  if (ratio === null || ratio === undefined || isNaN(ratio)) {
    return '-';
  }
  const pct = ratio * 100;
  return pct.toLocaleString('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }) + '%';
}
