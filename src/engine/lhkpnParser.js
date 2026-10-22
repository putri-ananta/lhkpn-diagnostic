/**
 * Enhanced LHKPN PDF Parser Engine
 * Uses pdfjs-dist for pure client-side PDF parsing and multi-strategy text anchor extraction.
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseIndonesianMoney } from '../utils/formatting';

// Set up pdf.js worker URL using Vite local bundler import (no external CDN required!)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Extracts page-by-page text items grouped into clean lines
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<Array<{ pageNum: number, text: string, lines: string[] }>>}
 */
export function groupTextItemsIntoLines(items) {
  const sortedItems = items
    .filter((item) => item.str && item.str.trim())
    .sort((a, b) => {
      const yDifference = b.y - a.y;
      return Math.abs(yDifference) > 2 ? yDifference : a.x - b.x;
    });

  const lines = [];
  let currentLine = [];
  let currentY = null;
  let currentLineHeight = 0;

  for (const item of sortedItems) {
    const itemHeight = Math.abs(item.height || 0);
    const comparisonHeight = Math.max(6, Math.min(18, currentLineHeight || itemHeight || 10));
    const sameLine = currentY === null || Math.abs(item.y - currentY) <= Math.max(2, comparisonHeight * 0.3);

    if (!sameLine) {
      lines.push(currentLine);
      currentLine = [];
      currentLineHeight = 0;
    }

    currentLine.push(item);
    currentLineHeight = Math.max(currentLineHeight, itemHeight);
    currentY = currentY === null || !sameLine ? item.y : (currentY + item.y) / 2;
  }

  if (currentLine.length > 0) lines.push(currentLine);

  return lines
    .map((line) => line
      .sort((a, b) => a.x - b.x)
      .map((item) => item.str.trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean);
}

async function extractOCRText(page, worker) {
  // A slightly denser render materially improves recognition of separators and
  // repeated zeroes without making every upload prohibitively slow.
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { alpha: false });

  await page.render({ canvasContext: context, viewport }).promise;
  const result = await worker.recognize(canvas);
  return result.data.text || '';
}

function scoreExtractedPage(lines) {
  const text = lines.join('\n');
  const structureCount = [
    /DATA\s+PRIBADI/i,
    /DATA\s+HARTA/i,
    /TANAH\s+DAN\s+BANGUNAN/i,
    /TOTAL\s+HARTA/i,
    /(?:HUTANG|UTANG|LIABILITAS)/i
  ].filter((pattern) => pattern.test(text)).length;
  const moneyCount = findMoneyTokens(text).length;
  const replacementCharacterCount = (text.match(/[�□]/g) || []).length;

  return (structureCount * 25) + (Math.min(moneyCount, 12) * 8)
    + Math.min(text.replace(/\s/g, '').length / 100, 10)
    - (replacementCharacterCount * 5);
}

function pageNeedsOCR(lines) {
  const text = lines.join('\n');
  const compactLength = text.replace(/\s/g, '').length;
  const hasFinancialSection = /(?:DATA\s+HARTA|TANAH\s+DAN\s+BANGUNAN|TOTAL\s+HARTA|HUTANG|UTANG)/i.test(text);
  const moneyCount = findMoneyTokens(text).length;
  return compactLength < 40
    || /[�□]/.test(text)
    || (hasFinancialSection && moneyCount < 2);
}

/**
 * Extracts page text from the native PDF text layer and falls back to OCR for scanned pages.
 * @param {ArrayBuffer} arrayBuffer
 * @param {{ enableOCR?: boolean, onProgress?: (progress: number) => void }} options
 */
export async function extractPDFTextPages(arrayBuffer, options = {}) {
  const { enableOCR = true, onProgress } = options;
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;

  const pagesData = [];
  const pageTextCandidates = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();

    const items = textContent.items.map((item) => {
      const transform = item.transform || [];
      const x = transform[4] || 0;
      const y = transform[5] || 0;
      return { str: item.str, x, y, height: Math.abs(transform[3] || 0) };
    });

    const lines = groupTextItemsIntoLines(items);
    pageTextCandidates.push({ page, lines });
    pagesData.push({ pageNum: i, text: lines.join('\n'), lines, usedOCR: false });
  }

  const nativeDocumentText = pagesData.map((page) => page.text).join('\n');
  const structureMarkers = [
    /DATA\s+PRIBADI/i,
    /DATA\s+HARTA/i,
    /TANAH\s+DAN\s+BANGUNAN/i,
    /TOTAL\s+HARTA/i
  ].filter((marker) => marker.test(nativeDocumentText)).length;
  const documentHasStructure = structureMarkers >= 2;
  const needsOCR = enableOCR && (
    !documentHasStructure || pagesData.some((page) => pageNeedsOCR(page.lines))
  );

  if (needsOCR && typeof document !== 'undefined') {
    let worker;
    try {
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('ind', 1);
      await worker.setParameters?.({ preserve_interword_spaces: '1' });
      for (let index = 0; index < pageTextCandidates.length; index++) {
        const candidate = pageTextCandidates[index];
        const shouldOCRPage = !documentHasStructure || pageNeedsOCR(candidate.lines);
        if (shouldOCRPage) {
          const ocrText = await extractOCRText(candidate.page, worker);
          const ocrLines = ocrText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
          const nativeScore = scoreExtractedPage(candidate.lines);
          const ocrScore = scoreExtractedPage(ocrLines);
          const nativeIsUnreadable = candidate.lines.join('').replace(/\s/g, '').length < 40;
          if (ocrLines.length > 0 && (nativeIsUnreadable || ocrScore > nativeScore)) {
            pagesData[index].text = ocrLines.join('\n');
            pagesData[index].lines = ocrLines;
            pagesData[index].usedOCR = true;
          }
        }
        onProgress?.((index + 1) / pageTextCandidates.length);
      }
    } catch (ocrError) {
      // Keep the native text layer when OCR assets or browser canvas support are unavailable.
      console.warn('OCR fallback tidak tersedia:', ocrError);
    } finally {
      await worker?.terminate();
    }
  }

  return pagesData;
}

const OCR_DIGIT_SOURCE = String.raw`[0-9OoQIl|!]`;
const GROUPED_MONEY_SOURCE = String.raw`${OCR_DIGIT_SOURCE}{1,3}(?:(?:\s*[.,'’]\s*|\s+)${OCR_DIGIT_SOURCE}{3})+(?:\s*[,.]\s*${OCR_DIGIT_SOURCE}{1,2})?`;
const MONEY_NUMBER_SOURCE = String.raw`(?:${GROUPED_MONEY_SOURCE}|${OCR_DIGIT_SOURCE}+)`;

const SECTION_PATTERNS = {
  tanah_dan_bangunan: [
    /^\s*(?:(?:II|2)\s*[.)]?\s*)?A\s*[.)]?\s*TANAH\s+DAN\s+BANGUNAN\b/i,
    /^\s*TANAH\s+DAN\s+BANGUNAN(?:\s+R\s*p\b.*)?\s*$/i
  ],
  alat_transportasi_dan_mesin: [
    /^\s*B\s*[.)]?\s*ALAT\s+TRANSPORTASI(?:\s+DAN\s+MESIN)?\b/i,
    /^\s*ALAT\s+TRANSPORTASI\s+DAN\s+MESIN(?:\s+R\s*p\b.*)?\s*$/i
  ],
  harta_bergerak_lainnya: [
    /^\s*C\s*[.)]?\s*HARTA\s+BERGERAK\s+LAINNYA\b/i,
    /^\s*HARTA\s+BERGERAK\s+LAINNYA(?:\s+R\s*p\b.*)?\s*$/i
  ],
  surat_berharga: [
    /^\s*D\s*[.)]?\s*SURAT\s+BERHARGA\b/i,
    /^\s*SURAT\s+BERHARGA(?:\s+R\s*p\b.*)?\s*$/i
  ],
  kas_dan_setara_kas: [
    /^\s*E\s*[.)]?\s*KAS\s+DAN\s+SETARA\s+KAS\b/i,
    /^\s*KAS\s+DAN\s+SETARA\s+KAS(?:\s+R\s*p\b.*)?\s*$/i
  ],
  harta_lainnya: [
    /^\s*F\s*[.)]?\s*HARTA\s+LAINNYA\b/i,
    /^\s*HARTA\s+LAINNYA(?:\s+R\s*p\b.*)?\s*$/i
  ],
  subtotal_harta: [
    /^\s*SUB\s*TOTAL(?:\s+(?:HARTA|ASET))?\b/i
  ],
  hutang: [
    /^\s*(?:(?:III|3)\s*[.)]?\s*)?(?:HUTANG|UTANG|LIABILITAS)\b/i
  ],
  total_harta_kekayaan: [
    /^\s*(?:(?:IV|4)\s*[.)]?\s*)?TOTAL\s+HARTA(?:\s+KEKAYAAN)?\b/i
  ]
};

function matchesAny(line, patterns) {
  return patterns.some((pattern) => pattern.test(line));
}

function isSectionHeading(line) {
  return Object.values(SECTION_PATTERNS).some((patterns) => matchesAny(line, patterns));
}

function findMoneyTokens(text) {
  const patterns = [
    new RegExp(String.raw`R\s*[pP]\s*[.,:]?\s*(?:[-—–_]+|${OCR_DIGIT_SOURCE}(?:[0-9OoQIl|!.,'’\s]{0,80}${OCR_DIGIT_SOURCE})?)`, 'gi'),
    new RegExp(String.raw`R\s*[pP]\s*[.,:]?\s*(?:[-—–_]+|${MONEY_NUMBER_SOURCE})`, 'gi'),
    new RegExp(String.raw`(?:[-—–_]{2,}|${GROUPED_MONEY_SOURCE})`, 'gi')
  ];
  const results = [];

  const standaloneParsed = parseIndonesianMoney(text);
  if (standaloneParsed.value !== null) {
    const start = Math.max(0, text.search(/\S/));
    results.push({
      match: null,
      parsed: standaloneParsed,
      start,
      end: text.length
    });
  }

  patterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      const parsed = parseIndonesianMoney(match[0]);
      if (parsed.value === null) continue;
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const overlapsExisting = results.some((token) => start < token.end && end > token.start);
      if (overlapsExisting) continue;
      results.push({ match, parsed, start, end });
    }
  });

  return results.sort((a, b) => a.start - b.start);
}

function candidateConfidence(score) {
  if (score >= 100) return 'high';
  if (score >= 75) return 'medium';
  return 'low';
}

function collectCategoryCandidates(allLines, headingRegexes, categoryKey = 'unknown') {
  const headingIndexes = allLines
    .map((line, index) => matchesAny(line, headingRegexes) ? index : -1)
    .filter((index) => index >= 0);
  const candidates = [];

  for (const headingIndex of headingIndexes) {
    let sectionEnd = allLines.length;
    for (let index = headingIndex + 1; index < allLines.length; index++) {
      if (isSectionHeading(allLines[index])) {
        sectionEnd = index;
        break;
      }
    }

    let detailStart = sectionEnd;
    for (let index = headingIndex + 1; index < sectionEnd; index++) {
      if (/^\s*\d+\s*[.)](?:\s+[A-Za-zÀ-ÿ]|\s*$)/.test(allLines[index])) {
        detailStart = index;
        break;
      }
    }

    for (let lineIndex = headingIndex; lineIndex < sectionEnd; lineIndex++) {
      const line = allLines[lineIndex];
      const tokens = findMoneyTokens(line);
      const explicitTotal = /\b(?:SUB\s*TOTAL|TOTAL|JUMLAH|NILAI)\b/i.test(line);
      const isItemArea = lineIndex >= detailStart;
      const isItemLine = /^\s*\d+\s*[.)](?:\s+[A-Za-zÀ-ÿ]|\s*$)/.test(line);
      const distance = lineIndex - headingIndex;

      tokens.forEach(({ parsed, start }, tokenIndex) => {
        let score;
        let strategy;

        if (lineIndex === headingIndex) {
          score = 120 - (tokenIndex * 8);
          strategy = 'heading-line';
        } else if (explicitTotal) {
          score = 118 - Math.min(distance, 12);
          strategy = 'explicit-total';
        } else if (!isItemArea && distance <= 6) {
          score = 110 - (distance * 4) - (tokenIndex * 5);
          strategy = 'before-details';
        } else {
          const textOutsideToken = `${line.slice(0, start)} ${line.slice(start + parsed.rawText.length)}`
            .replace(/[\s:()=.,-]/g, '');
          const isStandaloneAmount = textOutsideToken.length === 0;
          const nearSectionEnd = lineIndex >= sectionEnd - 3;

          if (isStandaloneAmount && nearSectionEnd) {
            score = 82;
            strategy = 'section-tail';
          } else if (isStandaloneAmount) {
            score = 62;
            strategy = 'standalone-in-details';
          } else {
            score = 42;
            strategy = 'detail-line';
          }
          if (isItemLine) score -= 15;
        }

        candidates.push({
          value: parsed.value,
          rawText: parsed.rawText,
          isZero: parsed.isZeroPattern || parsed.value === 0,
          matchedLine: allLines[headingIndex],
          extractedLine: line,
          matchedIndex: lineIndex,
          headingIndex,
          categoryKey,
          strategy,
          score,
          confidence: candidateConfidence(score)
        });
      });
    }
  }

  const seen = new Set();
  return candidates
    .sort((a, b) => b.score - a.score || a.matchedIndex - b.matchedIndex)
    .filter((candidate) => {
      const fingerprint = `${candidate.headingIndex}:${candidate.matchedIndex}:${candidate.value}:${candidate.rawText}`;
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    });
}

const ASSET_CATEGORY_KEYS = [
  'tanah_dan_bangunan',
  'alat_transportasi_dan_mesin',
  'harta_bergerak_lainnya',
  'surat_berharga',
  'kas_dan_setara_kas',
  'harta_lainnya'
];

function reconcileCategorySubtotal(selected, candidatesByKey) {
  const currentCandidates = [...ASSET_CATEGORY_KEYS, 'subtotal_harta'].map((key) => selected[key]);
  if (currentCandidates.some((candidate) => !candidate)) return;

  const currentSum = ASSET_CATEGORY_KEYS.reduce((sum, key) => sum + selected[key].value, 0);
  if (Math.abs(currentSum - selected.subtotal_harta.value) <= 1) return;

  const candidateLists = [...ASSET_CATEGORY_KEYS, 'subtotal_harta']
    .map((key) => candidatesByKey[key].slice(0, 3));
  if (candidateLists.some((list) => list.length === 0)) return;

  const currentQuality = currentCandidates.reduce((sum, candidate) => sum + candidate.score, 0);
  let bestExact = null;

  const visit = (depth, combination) => {
    if (depth === candidateLists.length) {
      const categorySum = combination.slice(0, ASSET_CATEGORY_KEYS.length)
        .reduce((sum, candidate) => sum + candidate.value, 0);
      const subtotalCandidate = combination.at(-1);
      if (Math.abs(categorySum - subtotalCandidate.value) > 1) return;
      const quality = combination.reduce((sum, candidate) => sum + candidate.score, 0);
      if (!bestExact || quality > bestExact.quality) bestExact = { combination: [...combination], quality };
      return;
    }
    candidateLists[depth].forEach((candidate) => visit(depth + 1, [...combination, candidate]));
  };

  visit(0, []);
  if (!bestExact || bestExact.quality < currentQuality - 45) return;

  [...ASSET_CATEGORY_KEYS, 'subtotal_harta'].forEach((key, index) => {
    const candidate = bestExact.combination[index];
    if (selected[key] !== candidate) selected[key] = { ...candidate, reconciledBy: 'subtotal' };
  });
}

function reconcileSubtotalDebtTotal(selected, candidatesByKey) {
  const keys = ['subtotal_harta', 'hutang', 'total_harta_kekayaan'];
  if (keys.some((key) => !selected[key])) return;
  if (Math.abs(selected.subtotal_harta.value - selected.hutang.value - selected.total_harta_kekayaan.value) <= 1) return;

  const candidateLists = keys.map((key) => candidatesByKey[key].slice(0, 4));
  const currentQuality = keys.reduce((sum, key) => sum + selected[key].score, 0);
  let bestExact = null;

  candidateLists[0].forEach((subtotalCandidate) => {
    candidateLists[1].forEach((debtCandidate) => {
      candidateLists[2].forEach((totalCandidate) => {
        if (Math.abs(subtotalCandidate.value - debtCandidate.value - totalCandidate.value) > 1) return;
        const combination = [subtotalCandidate, debtCandidate, totalCandidate];
        const quality = combination.reduce((sum, candidate) => sum + candidate.score, 0);
        if (!bestExact || quality > bestExact.quality) bestExact = { combination, quality };
      });
    });
  });

  if (!bestExact || bestExact.quality < currentQuality - 35) return;
  keys.forEach((key, index) => {
    const candidate = bestExact.combination[index];
    if (selected[key] !== candidate) selected[key] = { ...candidate, reconciledBy: 'net-worth' };
  });
}

function materializeCategoryResult(candidate, alternatives, categoryKey) {
  if (!candidate) {
    return {
      value: null,
      rawText: null,
      confidence: 'low',
      isZero: false,
      matchedLine: null,
      extractedLine: null,
      matchedIndex: null,
      categoryKey,
      strategy: 'not-found',
      alternatives: []
    };
  }

  return {
    ...candidate,
    confidence: candidate.reconciledBy ? 'medium' : candidate.confidence,
    alternatives: alternatives
      .filter((alternative) => !(
        alternative.matchedIndex === candidate.matchedIndex
        && alternative.value === candidate.value
        && alternative.rawText === candidate.rawText
      ))
      .slice(0, 3)
      .map(({ value, rawText, extractedLine, confidence, strategy }) => ({
        value,
        rawText,
        extractedLine,
        confidence,
        strategy
      }))
  };
}

export function extractCategoryValuesFromLines(allLines) {
  const candidatesByKey = Object.fromEntries(
    Object.entries(SECTION_PATTERNS)
      .map(([key, patterns]) => [key, collectCategoryCandidates(allLines, patterns, key)])
  );
  const selected = Object.fromEntries(
    Object.entries(candidatesByKey).map(([key, candidates]) => [key, candidates[0] || null])
  );

  reconcileCategorySubtotal(selected, candidatesByKey);
  reconcileSubtotalDebtTotal(selected, candidatesByKey);

  return Object.fromEntries(
    Object.keys(SECTION_PATTERNS)
      .map((key) => [key, materializeCategoryResult(selected[key], candidatesByKey[key], key)])
  );
}

const NEXT_IDENTITY_LABEL = /\s+(?=(?:BIDANG|LEMBAGA|UNIT\s+KERJA|NAMA|JABATAN|NHK|TANGGAL\s+PENYAMPAIAN|JENIS\s+LAPORAN|STATUS\s+VERIFIKASI)\s*:)/i;

function cleanIdentityValue(value) {
  return value
    ?.replace(/^\s*:\s*/, '')
    .split(NEXT_IDENTITY_LABEL)[0]
    .trim() || null;
}

function getLabeledField(lines, labelSource) {
  const labelRegex = new RegExp(`^\\s*(?:\\d+\\s*[.)]?\\s*)?${labelSource}\\s*(?::\\s*(.*))?$`, 'i');

  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(labelRegex);
    if (!match) continue;

    const sameLineValue = cleanIdentityValue(match[1]);
    if (sameLineValue) return sameLineValue;

    for (let offset = 1; offset <= 2 && index + offset < lines.length; offset++) {
      const candidate = cleanIdentityValue(lines[index + offset]);
      if (!candidate || candidate === ':') continue;
      if (isSectionHeading(candidate) || /^(?:I|II)\s*[.)]?\s*DATA\b/i.test(candidate)) break;
      return candidate;
    }
  }

  return null;
}

export function extractIdentityFromLines(allLines) {
  const fullText = allLines.join('\n');
  const flattenedText = fullText.replace(/\s+/g, ' ');
  const headerMatch = flattenedText.match(
    /Tanggal\s+Penyampaian\s*\/\s*Jenis\s+Laporan\s*-\s*Tahun\s*:\s*([^/]+?)\s*\/\s*([^-]+?)\s*-\s*((?:19|20)\d{2})\b/i
  );
  const statusMatch = flattenedText.match(
    /Status\s+Verifikasi(?:\s+Administratif)?\s*:?\s*(Belum\s+Lengkap|Tidak\s+Lengkap|Lengkap|Terverifikasi|Proses\s+Verifikasi)\b/i
  );

  const nama = getLabeledField(allLines, 'NAMA');
  const jabatan = getLabeledField(allLines, 'JABATAN');
  const nhk = getLabeledField(allLines, 'N\\s*H\\s*K');
  const bidang = getLabeledField(allLines, 'BIDANG');
  const lembaga = getLabeledField(allLines, 'LEMBAGA');
  const unitKerja = getLabeledField(allLines, 'UNIT\\s+KERJA');

  return {
    nama: nama || null,
    jabatan: jabatan || null,
    nhk: nhk || null,
    bidang: bidang || null,
    lembaga: lembaga || null,
    unit_kerja: unitKerja || null,
    tanggal_penyampaian: headerMatch?.[1]?.trim() || getLabeledField(allLines, 'TANGGAL\\s+PENYAMPAIAN') || null,
    jenis_laporan: headerMatch?.[2]?.trim() || getLabeledField(allLines, 'JENIS\\s+LAPORAN') || null,
    tahun_laporan: headerMatch?.[3] || flattenedText.match(/(?:Periodik|Khusus)\s*-\s*((?:19|20)\d{2})\b/i)?.[1] || null,
    status_verifikasi: statusMatch
      ? `Administratif ${statusMatch[1].replace(/\s+/g, ' ').trim()}`
      : null
  };
}

/** Determine whether every financial field was actually read; zero is valid. */
export function assessFinancialCompleteness(assets) {
  const missingFields = Object.entries(assets || {})
    .filter(([, value]) => value === null || value === undefined)
    .map(([field]) => field);
  return {
    isSuccess: missingFields.length === 0,
    missingFields
  };
}

/** Catch plausible-looking OCR values that do not satisfy the report totals. */
export function assessFinancialConsistency(assets) {
  const issues = [];
  const categoryValues = ASSET_CATEGORY_KEYS.map((key) => assets?.[key]);
  const hasAllCategories = categoryValues.every((value) => value !== null && value !== undefined);

  if (hasAllCategories && assets?.subtotal_harta !== null && assets?.subtotal_harta !== undefined) {
    const categorySum = categoryValues.reduce((sum, value) => sum + value, 0);
    if (Math.abs(categorySum - assets.subtotal_harta) > 1) {
      issues.push({
        code: 'subtotal-mismatch',
        message: `Jumlah enam kategori (Rp ${categorySum.toLocaleString('id-ID')}) tidak sama dengan subtotal (Rp ${assets.subtotal_harta.toLocaleString('id-ID')}).`
      });
    }
  }

  const hasNetWorthInputs = ['subtotal_harta', 'hutang', 'total_harta_kekayaan']
    .every((key) => assets?.[key] !== null && assets?.[key] !== undefined);
  if (hasNetWorthInputs) {
    const calculatedTotal = assets.subtotal_harta - assets.hutang;
    if (Math.abs(calculatedTotal - assets.total_harta_kekayaan) > 1) {
      issues.push({
        code: 'net-worth-mismatch',
        message: `Subtotal dikurangi hutang (Rp ${calculatedTotal.toLocaleString('id-ID')}) tidak sama dengan total harta kekayaan (Rp ${assets.total_harta_kekayaan.toLocaleString('id-ID')}).`
      });
    }
  }

  return { isConsistent: issues.length === 0, issues };
}

/**
 * Main function to parse an LHKPN PDF file ArrayBuffer
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} fileName
 * @returns {Promise<Object>} Extracted LHKPN data structure
 */
export async function parseLHKPNPDF(arrayBuffer, fileName = 'LHKPN.pdf') {
  const parsingLogs = [];
  const addLog = (msg, level = 'info') => parsingLogs.push({ time: new Date().toISOString(), msg, level });

  addLog(`Mulai membaca dokumen: ${fileName}`);

  try {
    const pages = await extractPDFTextPages(arrayBuffer);
    addLog(`Dokumen berhasil dibaca. Total halaman: ${pages.length}`);

    if (pages.some((page) => page.usedOCR)) {
      addLog('Text layer PDF tidak lengkap. OCR Bahasa Indonesia digunakan untuk membaca halaman hasil scan.', 'warning');
    }

    const allLines = pages.flatMap(p => p.lines);
    // -------------------------------------------------------------
    // 1. IDENTITY EXTRACTION
    // -------------------------------------------------------------
    addLog('Mengekstrak data identitas Penyelenggara Negara...');
    const identity = extractIdentityFromLines(allLines);

    // -------------------------------------------------------------
    // 2. FINANCIAL ASSET & LIABILITY CATEGORY EXTRACTION
    // -------------------------------------------------------------
    addLog('Mengekstrak kategori harta dan liabilitas...');

    const extractedCategories = extractCategoryValuesFromLines(allLines);
    const reconciledFields = Object.entries(extractedCategories)
      .filter(([, detail]) => detail.reconciledBy)
      .map(([key, detail]) => `${key} (${detail.reconciledBy})`);
    if (reconciledFields.length > 0) {
      addLog(`Kandidat angka ambigu diselesaikan dengan pemeriksaan aritmetika: ${reconciledFields.join(', ')}.`, 'warning');
    }
    const tanahObj = extractedCategories.tanah_dan_bangunan;
    const transportObj = extractedCategories.alat_transportasi_dan_mesin;
    const bergerakObj = extractedCategories.harta_bergerak_lainnya;
    const suratBerhargaObj = extractedCategories.surat_berharga;
    const kasObj = extractedCategories.kas_dan_setara_kas;
    const hartaLainnyaObj = extractedCategories.harta_lainnya;
    const subtotalObj = extractedCategories.subtotal_harta;
    const hutangObj = extractedCategories.hutang;
    const totalObj = extractedCategories.total_harta_kekayaan;

    // Add context lines for debugging transparency
    const addContextLines = (obj, key) => {
      if (obj.value === null) {
        return { ...obj, contextLines: [], guidance: `Heading "${key}" tidak ditemukan di dokumen. Coba koreksi nilai secara manual.` };
      }
      const idx = obj.matchedIndex ?? -1;
      const contextStart = Math.max(0, idx - 2);
      const contextEnd = Math.min(allLines.length, idx + 10);
      return { ...obj, contextLines: allLines.slice(contextStart, contextEnd) };
    };

    const tanah = addContextLines(tanahObj, 'tanah_dan_bangunan');
    const transport = addContextLines(transportObj, 'alat_transportasi_dan_mesin');
    const bergerak = addContextLines(bergerakObj, 'harta_bergerak_lainnya');
    const surat = addContextLines(suratBerhargaObj, 'surat_berharga');
    const kas = addContextLines(kasObj, 'kas_dan_setara_kas');
    const hartaLain = addContextLines(hartaLainnyaObj, 'harta_lainnya');
    const subtotal = addContextLines(subtotalObj, 'subtotal_harta');
    const hutang = addContextLines(hutangObj, 'hutang');
    const total = addContextLines(totalObj, 'total_harta_kekayaan');

    // Calculate fallback sum of extracted categories if subtotal is missing
    const availableCategoryValues = [
      tanahObj.value,
      transportObj.value,
      bergerakObj.value,
      suratBerhargaObj.value,
      kasObj.value,
      hartaLainnyaObj.value
    ].filter((v) => v !== null && v !== undefined);

    let subtotalValue = subtotalObj.value;
    if (subtotalValue === null || subtotalValue === undefined) {
      if (availableCategoryValues.length === 6) {
        subtotalValue = availableCategoryValues.reduce((a, b) => a + b, 0);
        addLog(`Subtotal harta diturunkan dari jumlah kategori: Rp ${subtotalValue.toLocaleString('id-ID')}`, 'warning');
      } else {
        addLog(`Subtotal tidak dapat diturunkan karena hanya ${availableCategoryValues.length} dari 6 kategori yang terbaca.`, 'warning');
      }
    }

    let totalValue = totalObj.value;
    if ((totalValue === null || totalValue === undefined) && subtotalValue !== null && hutangObj.value !== null) {
      totalValue = subtotalValue - hutangObj.value;
      addLog(`Total harta kekayaan diturunkan dari subtotal dikurangi hutang: Rp ${totalValue.toLocaleString('id-ID')}`, 'warning');
    }

    const assets = {
      tanah_dan_bangunan: tanahObj.value,
      alat_transportasi_dan_mesin: transportObj.value,
      harta_bergerak_lainnya: bergerakObj.value,
      surat_berharga: suratBerhargaObj.value,
      kas_dan_setara_kas: kasObj.value,
      harta_lainnya: hartaLainnyaObj.value,
      subtotal_harta: subtotalValue,
      hutang: hutangObj.value,
      total_harta_kekayaan: totalValue
    };

    const categoryDetails = {
      tanah_dan_bangunan: tanah,
      alat_transportasi_dan_mesin: transport,
      harta_bergerak_lainnya: bergerak,
      surat_berharga: surat,
      kas_dan_setara_kas: kas,
      harta_lainnya: hartaLain,
      subtotal_harta: subtotal,
      hutang: hutang,
      total_harta_kekayaan: total
    };

    const { isSuccess: isComplete, missingFields } = assessFinancialCompleteness(assets);
    const { isConsistent, issues: consistencyIssues } = assessFinancialConsistency(assets);
    const isSuccess = isComplete && isConsistent;
    const statusLabel = isSuccess ? 'Selesai' : 'Perlu Ditinjau';

    consistencyIssues.forEach((issue) => addLog(issue.message, 'warning'));
    if (!isComplete) {
      addLog('Sebagian kategori atau nilai total dokumen tidak dapat dibaca dengan yakin.', 'warning');
    } else if (!isConsistent) {
      addLog('Semua nilai terbaca, tetapi hasilnya tidak lolos pemeriksaan aritmetika. Dokumen perlu ditinjau.', 'warning');
    } else {
      addLog('Ekstraksi data LHKPN berhasil diselesaikan.');
    }

    return {
      fileName,
      isParsedSuccess: isSuccess,
      status: statusLabel,
      errorReason: !isComplete
        ? `${missingFields.length} nilai keuangan tidak terbaca (${missingFields.join(', ')}).`
        : !isConsistent
          ? consistencyIssues.map((issue) => issue.message).join(' ')
          : undefined,
      identity,
      assets,
      categoryDetails,
      consistencyIssues,
      logs: parsingLogs,
      parsedAt: new Date().toISOString()
    };
  } catch (err) {
    addLog(`Gagal memproses file PDF: ${err.message}`, 'error');
    return {
      fileName,
      isParsedSuccess: false,
      status: 'Gagal',
      fatalError: true,
      errorReason: err.message,
      identity: {
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
      },
      assets: {
        tanah_dan_bangunan: null,
        alat_transportasi_dan_mesin: null,
        harta_bergerak_lainnya: null,
        surat_berharga: null,
        kas_dan_setara_kas: null,
        harta_lainnya: null,
        subtotal_harta: null,
        hutang: null,
        total_harta_kekayaan: null
      },
      categoryDetails: {},
      logs: parsingLogs,
      parsedAt: new Date().toISOString()
    };
  }
}
