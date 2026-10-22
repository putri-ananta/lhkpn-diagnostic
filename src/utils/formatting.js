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

  // OCR frequently separates "Rp" and confuses O/0 or I/1. Repairs are only
  // applied after the currency marker has been removed and only when the rest
  // of the token is money-shaped, so ordinary words are never rewritten.
  let moneyText = rawText
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/R\s*p\s*[.,:]?/gi, '')
    .trim();

  const dashCandidate = moneyText.replace(/[.\s_]/g, '');
  if (/^[-—–]+$/.test(dashCandidate)) {
    return { value: 0, rawText, isZeroPattern: true };
  }

  if (!/^[0-9OoQIl|!.,'’\s]+$/.test(moneyText)) {
    return { value: null, rawText, isZeroPattern: false };
  }

  moneyText = moneyText
    .replace(/[OoQ]/g, '0')
    .replace(/[Il|!]/g, '1')
    .replace(/['’]/g, '.')
    .replace(/\s+/g, '');

  if (!/^\d+(?:[.,]\d+)*$/.test(moneyText)) {
    return { value: null, rawText, isZeroPattern: false };
  }

  const separators = [...moneyText.matchAll(/[.,]/g)];
  let normalizedNumber = moneyText;

  if (separators.length > 0) {
    const groups = moneyText.split(/[.,]/);
    const lastSeparator = separators.at(-1)?.[0];
    const lastGroup = groups.at(-1) || '';
    const earlierGroups = groups.slice(1, -1);
    const allThousands = groups.slice(1).every((group) => group.length === 3);
    const hasDecimalTail = lastGroup.length <= 2
      && (lastSeparator === ',' || earlierGroups.every((group) => group.length === 3));

    if (allThousands) {
      normalizedNumber = groups.join('');
    } else if (hasDecimalTail) {
      const integerPart = groups.slice(0, -1).join('');
      normalizedNumber = `${integerPart}.${lastGroup}`;
    } else {
      return { value: null, rawText, isZeroPattern: false };
    }
  }

  const num = Number(normalizedNumber);
  if (!Number.isFinite(num) || !Number.isSafeInteger(Math.round(num))) {
    return { value: null, rawText, isZeroPattern: false };
  }

  return {
    value: num,
    rawText,
    isZeroPattern: num === 0 && /^0+(?:[.,]0+)*$/.test(moneyText)
  };
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
