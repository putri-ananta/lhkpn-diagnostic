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
  let lineHeight = 10;

  for (const item of sortedItems) {
    const itemHeight = Math.abs(item.height || 0);
    if (itemHeight > 0) lineHeight = Math.max(lineHeight, itemHeight);
    const sameLine = currentY === null || Math.abs(item.y - currentY) <= Math.max(3, lineHeight * 0.45);

    if (!sameLine) {
      lines.push(currentLine);
      currentLine = [];
    }

    currentLine.push(item);
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

  const needsOCR = enableOCR && pagesData.some((page) => page.text.replace(/\s/g, '').length < 40);

  if (needsOCR && typeof document !== 'undefined') {
    let worker;
    try {
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('ind', 1);
      for (let index = 0; index < pageTextCandidates.length; index++) {
        const candidate = pageTextCandidates[index];
        const shouldOCRPage = candidate.lines.join('').replace(/\s/g, '').length < 40;
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

/**
 * Extracts a money value by searching for keywords and finding nearby Rupiah currency patterns
 * @param {string[]} allLines
 * @param {RegExp[]} headingRegexes
 * @returns {{ value: number|null, rawText: string|null, confidence: string, isZero: boolean }}
 */
function extractCategoryValue(allLines, headingRegexes) {
  // Strategy 1: Find line matching heading, then inspect that line and next 5 lines
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    let isMatch = false;

    for (const regex of headingRegexes) {
      if (regex.test(line)) {
        isMatch = true;
        break;
      }
    }

    if (isMatch) {
      // Look for money patterns in current line and up to 5 subsequent lines
      const windowLines = allLines.slice(i, Math.min(allLines.length, i + 6));
      const joinedWindow = windowLines.join(' ');

      // Search for Rp pattern or dash pattern in window
      const moneyMatch = joinedWindow.match(/(?:Rp\.?\s*[\d\.\,----]+|Sub\s*Total\s*Rp\.?\s*[\d\.\,----]+|[\d]{1,3}(?:\.[\d]{3})+)/i);
      if (moneyMatch) {
        const rawStr = moneyMatch[0];
        const parsed = parseIndonesianMoney(rawStr);
        if (parsed.value !== null) {
          return {
            value: parsed.value,
            rawText: parsed.rawText,
            confidence: 'high',
            isZero: parsed.isZeroPattern || parsed.value === 0
          };
        }
      }

      // Check if explicitly 0 or dash
      if (/(?:----\s*|Rp\.?\s*----+|Rp\.?\s*0|0\s*$)/i.test(joinedWindow)) {
        return {
          value: 0,
          rawText: 'Rp. ----',
          confidence: 'high',
          isZero: true
        };
      }
    }
  }

  // Strategy 2: Global fullText regex match
  const fullText = allLines.join('\n');
  for (const regex of headingRegexes) {
    const match = fullText.match(new RegExp(regex.source + `[\\s\\S]{0,100}?(Rp\\.?\\s*[\\d\\.\\,----+]+|\\b\\d{1,3}(?:\\.\\d{3})+\\b)`, 'i'));
    if (match && match[1]) {
      const parsed = parseIndonesianMoney(match[1]);
      if (parsed.value !== null) {
        return {
          value: parsed.value,
          rawText: parsed.rawText,
          confidence: 'medium',
          isZero: parsed.isZeroPattern || parsed.value === 0
        };
      }
    }
  }

  return {
    value: null,
    rawText: null,
    confidence: 'low',
    isZero: false
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
    const fullText = allLines.join('\n');

    // -------------------------------------------------------------
    // 1. IDENTITY EXTRACTION
    // -------------------------------------------------------------
    addLog('Mengekstrak data identitas Penyelenggara Negara...');

    const getField = (patterns) => {
      for (const pat of patterns) {
        const match = fullText.match(pat);
        if (match && match[1]) {
          const res = match[1].trim();
          if (res && !res.startsWith('---')) return res;
        }
      }
      return null;
    };

    const nama = getField([
      /1\.\s*Nama\s*:\s*([^:\n\r]+?)(?=\s*2\.|\s*Jabatan|\s*NHK|$)/i,
      /Nama\s*:\s*([^:\n\r]+?)(?=\s*Jabatan|\s*NHK|\s*BIDANG|$)/i,
      /NAMA\s*:\s*([^\n\r]+)/i,
      /Nama\s*Penyelenggara\s*Negara\s*:\s*([^\n\r]+)/i
    ]);

    const jabatan = getField([
      /2\.\s*Jabatan\s*:\s*([^:\n\r]+?)(?=\s*3\.|\s*NHK|\s*BIDANG|$)/i,
      /Jabatan\s*:\s*([^:\n\r]+?)(?=\s*NHK|\s*BIDANG|\s*LEMBAGA|$)/i,
      /JABATAN\s*:\s*([^\n\r]+)/i
    ]);

    const nhk = getField([
      /3\.\s*NHK\s*:\s*([0-9A-Z\s-]+?)(?=\s*4\.|\s*BIDANG|\s*LEMBAGA|$)/i,
      /NHK\s*:\s*([0-9A-Z\s-]+?)(?=\s*BIDANG|\s*LEMBAGA|$)/i,
      /N\s*H\s*K\s*:\s*([0-9A-Z\s-]+)/i
    ]);

    const bidang = getField([
      /BIDANG\s*:\s*([^\n\r]+)/i,
      /Bidang\s*:\s*([^\n\r]+)/i
    ]);

    const lembaga = getField([
      /LEMBAGA\s*:\s*([^\n\r]+)/i,
      /Lembaga\s*:\s*([^\n\r]+)/i
    ]);

    const unit_kerja = getField([
      /UNIT KERJA\s*:\s*([^\n\r]+)/i,
      /Unit Kerja\s*:\s*([^\n\r]+)/i
    ]);

    const tanggal_penyampaian = getField([
      /TANGGAL PENYAMPAIAN\s*:\s*([^\n\r]+)/i,
      /Tanggal Penyampaian\s*:\s*([^\n\r]+)/i,
      /Tgl Penyampaian\s*:\s*([^\n\r]+)/i
    ]);

    const jenis_laporan = getField([
      /JENIS LAPORAN\s*:\s*([^\n\r]+)/i,
      /Jenis Laporan\s*:\s*([^\n\r]+)/i,
      /(Laporan Periodik|Laporan Khusus)/i
    ]);

    const tahun_laporan = getField([
      /TAHUN\s*:\s*(\d{4})/i,
      /Tahun Laporan\s*:\s*(\d{4})/i,
      /Tahun\s*:\s*(\d{4})/i,
      /Periodik\s*-\s*(\d{4})/i,
      /\b(20[1-2][0-9])\b/
    ]);

    const status_verifikasi = getField([
      /STATUS VERIFIKASI\s*:\s*([^\n\r]+)/i,
      /Status Verifikasi\s*:\s*([^\n\r]+)/i,
      /(Sudah Diverifikasi|Terverifikasi|Proses Verifikasi)/i
    ]);

    const identity = {
      nama: nama || fileName.replace(/\.pdf$/i, '').replace(/_/g, ' '),
      jabatan: jabatan || 'Penyelenggara Negara',
      nhk: nhk || '-',
      bidang: bidang || 'Eksekutif / Yudikatif / Legislatif',
      lembaga: lembaga || 'Instansi Pemerintah',
      unit_kerja: unit_kerja || '-',
      tanggal_penyampaian: tanggal_penyampaian || '-',
      jenis_laporan: jenis_laporan || 'Laporan Periodik',
      tahun_laporan: tahun_laporan || String(new Date().getFullYear()),
      status_verifikasi: status_verifikasi || 'Terverifikasi Lengkap'
    };

    // -------------------------------------------------------------
    // 2. FINANCIAL ASSET & LIABILITY CATEGORY EXTRACTION
    // -------------------------------------------------------------
    addLog('Mengekstrak kategori harta dan liabilitas...');

    const tanahObj = extractCategoryValue(allLines, [/TANAH\s*DAN\s*BANGUNAN/i, /A\.\s*TANAH/i]);
    const transportObj = extractCategoryValue(allLines, [/ALAT\s*TRANSPORTASI\s*DAN\s*MESIN/i, /B\.\s*ALAT\s*TRANSPORTASI/i]);
    const bergerakObj = extractCategoryValue(allLines, [/HARTA\s*BERGERAK\s*LAINNYA/i, /C\.\s*HARTA\s*BERGERAK/i]);
    const suratBerhargaObj = extractCategoryValue(allLines, [/SURAT\s*BERHARGA/i, /D\.\s*SURAT\s*BERHARGA/i]);
    const kasObj = extractCategoryValue(allLines, [/KAS\s*DAN\s*SETARA\s*KAS/i, /E\.\s*KAS/i]);
    const hartaLainnyaObj = extractCategoryValue(allLines, [/HARTA\s*LAINNYA/i, /F\.\s*HARTA\s*LAINNYA/i]);

    const subtotalObj = extractCategoryValue(allLines, [/Sub\s*Total\s*Harta/i, /Sub\s*Total\s*Aset/i, /Sub\s*Total/i, /SUB\s*TOTAL/i]);
    const hutangObj = extractCategoryValue(allLines, [/III\.\s*HUTANG/i, /HUTANG/i, /Liabilitas/i]);
    const totalObj = extractCategoryValue(allLines, [/IV\.\s*TOTAL\s*HARTA/i, /TOTAL\s*HARTA\s*KEKAYAAN/i, /TOTAL\s*HARTA/i]);

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
      if (availableCategoryValues.length > 0) {
        subtotalValue = availableCategoryValues.reduce((a, b) => a + b, 0);
        addLog(`Subtotal harta diturunkan dari jumlah kategori: Rp ${subtotalValue.toLocaleString('id-ID')}`, 'warning');
      }
    }

    let totalValue = totalObj.value;
    if ((totalValue === null || totalValue === undefined) && subtotalValue !== null) {
      totalValue = subtotalValue - (hutangObj.value || 0);
    }

    const assets = {
      tanah_dan_bangunan: tanahObj.value !== null ? tanahObj.value : 0,
      alat_transportasi_dan_mesin: transportObj.value !== null ? transportObj.value : 0,
      harta_bergerak_lainnya: bergerakObj.value !== null ? bergerakObj.value : 0,
      surat_berharga: suratBerhargaObj.value !== null ? suratBerhargaObj.value : 0,
      kas_dan_setara_kas: kasObj.value !== null ? kasObj.value : 0,
      harta_lainnya: hartaLainnyaObj.value !== null ? hartaLainnyaObj.value : 0,
      subtotal_harta: subtotalValue !== null && subtotalValue !== undefined ? subtotalValue : 0,
      hutang: hutangObj.value !== null ? hutangObj.value : 0,
      total_harta_kekayaan: totalValue !== null && totalValue !== undefined ? totalValue : 0
    };

    const categoryDetails = {
      tanah_dan_bangunan: tanahObj,
      alat_transportasi_dan_mesin: transportObj,
      harta_bergerak_lainnya: bergerakObj,
      surat_berharga: suratBerhargaObj,
      kas_dan_setara_kas: kasObj,
      harta_lainnya: hartaLainnyaObj,
      subtotal_harta: subtotalObj,
      hutang: hutangObj,
      total_harta_kekayaan: totalObj
    };

    const isSuccess = subtotalValue !== null && subtotalValue > 0;
    const statusLabel = isSuccess ? 'Selesai' : 'Perlu Ditinjau';

    if (!isSuccess) {
      addLog('Dokumen tidak memiliki struktur teks angka yang dapat terbaca otomatis.', 'warning');
    } else {
      addLog('Ekstraksi data LHKPN berhasil diselesaikan.');
    }

    return {
      fileName,
      isParsedSuccess: isSuccess,
      status: statusLabel,
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
      status: 'Perlu Ditinjau',
      errorReason: err.message,
      identity: {
        nama: fileName.replace(/\.pdf$/i, ''),
        jabatan: 'Dokumen Perlu Ditinjau',
        lembaga: 'Format PDF tidak standar / Scanned PDF',
        tahun_laporan: '-'
      },
      assets: {
        tanah_dan_bangunan: 0,
        alat_transportasi_dan_mesin: 0,
        harta_bergerak_lainnya: 0,
        surat_berharga: 0,
        kas_dan_setara_kas: 0,
        harta_lainnya: 0,
        subtotal_harta: 0,
        hutang: 0,
        total_harta_kekayaan: 0
      },
      logs: parsingLogs,
      parsedAt: new Date().toISOString()
    };
  }
}
