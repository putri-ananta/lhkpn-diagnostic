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
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { alpha: false });

  await page.render({ canvasContext: context, viewport }).promise;
  const result = await worker.recognize(canvas);
  return result.data.text || '';
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
    !documentHasStructure || pagesData.some((page) => page.text.replace(/\s/g, '').length < 40)
  );

  if (needsOCR && typeof document !== 'undefined') {
    let worker;
    try {
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('ind', 1);
      for (let index = 0; index < pageTextCandidates.length; index++) {
        const candidate = pageTextCandidates[index];
        const shouldOCRPage = !documentHasStructure || candidate.lines.join('').replace(/\s/g, '').length < 40;
        if (shouldOCRPage) {
          const ocrText = await extractOCRText(candidate.page, worker);
          const ocrLines = ocrText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
          if (ocrLines.length > 0) {
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

const MONEY_TOKEN_SOURCE = String.raw`(?:R\s*[pP]\s*[.,:]?\s*(?:[-—–]{2,}|0|\d{1,3}(?:(?:\.|\s)\s*\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)|[-—–]{2,}|\d{1,3}(?:\.\s*\d{3})+(?:,\d{1,2})?)`;

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
  const tokenRegex = new RegExp(MONEY_TOKEN_SOURCE, 'gi');
  return [...text.matchAll(tokenRegex)]
    .map((match) => ({ match, parsed: parseIndonesianMoney(match[0]) }))
    .filter(({ parsed }) => parsed.value !== null);
}

/**
 * Extract a category total from the small area between its heading and its details.
 * Official KPK PDFs put the total on the heading line or the next two text lines.
 * Restricting the search to that area prevents item values and neighbouring totals
 * from being mistaken for the category total.
 * @param {string[]} allLines
 * @param {RegExp[]} headingRegexes
 * @param {string} categoryKey - For logging/debugging
 * @returns {{ value: number|null, rawText: string|null, confidence: string, isZero: boolean, matchedLine: string|null }}
 */
function extractCategoryValue(allLines, headingRegexes, categoryKey = 'unknown') {
  const headingIndexes = allLines
    .map((line, index) => matchesAny(line, headingRegexes) ? index : -1)
    .filter((index) => index >= 0);

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
      if (/^\s*\d+\s*[.)]\s+/.test(allLines[index])) {
        detailStart = index;
        break;
      }
    }

    const primaryEnd = Math.min(sectionEnd, detailStart, headingIndex + 5);
    const primaryLines = allLines.slice(headingIndex, primaryEnd);
    const tokens = findMoneyTokens(primaryLines.join(' '));
    if (tokens.length > 0) {
      const { parsed } = tokens[0];
      return {
        value: parsed.value,
        rawText: parsed.rawText,
        confidence: 'high',
        isZero: parsed.isZeroPattern || parsed.value === 0,
        matchedLine: allLines[headingIndex],
        matchedIndex: headingIndex,
        categoryKey
      };
    }

    // Some OCR output loses the "Rp" token but keeps a grouped number. Search a
    // few more lines inside the same section only, never across the next heading.
    const fallbackLines = allLines.slice(headingIndex, Math.min(sectionEnd, detailStart, headingIndex + 8));
    const fallbackTokens = findMoneyTokens(fallbackLines.join(' '));
    if (fallbackTokens.length > 0) {
      const { parsed } = fallbackTokens[0];
      return {
        value: parsed.value,
        rawText: parsed.rawText,
        confidence: 'medium',
        isZero: parsed.isZeroPattern || parsed.value === 0,
        matchedLine: allLines[headingIndex],
        matchedIndex: headingIndex,
        categoryKey
      };
    }
  }

  return {
    value: null,
    rawText: null,
    confidence: 'low',
    isZero: false,
    matchedLine: null,
    matchedIndex: null,
    categoryKey
  };
}

export function extractCategoryValuesFromLines(allLines) {
  return Object.fromEntries(
    Object.entries(SECTION_PATTERNS).map(([key, patterns]) => [key, extractCategoryValue(allLines, patterns, key)])
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

    const { isSuccess, missingFields } = assessFinancialCompleteness(assets);
    const statusLabel = isSuccess ? 'Selesai' : 'Perlu Ditinjau';

    if (!isSuccess) {
      addLog('Sebagian kategori atau nilai total dokumen tidak dapat dibaca dengan yakin.', 'warning');
    } else {
      addLog('Ekstraksi data LHKPN berhasil diselesaikan.');
    }

    return {
      fileName,
      isParsedSuccess: isSuccess,
      status: statusLabel,
      errorReason: !isSuccess
        ? `${missingFields.length} nilai keuangan tidak terbaca (${missingFields.join(', ')}).`
        : undefined,
      identity,
      assets,
      categoryDetails,
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
