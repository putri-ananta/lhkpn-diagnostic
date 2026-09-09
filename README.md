# LHKPN Financial Diagnostic

A web application for financial health diagnosis based on LHKPN (Laporan Harta Possesi Pejabat Negara) asset declarations. This tool analyzes Indonesian official asset reports to compute key financial ratios and provide diagnostic insights.

## Features

- **Single File Analysis** — Upload a single LHKPN PDF for instant diagnosis
- **Batch Processing** — Analyze multiple LHKPN documents simultaneously
- **PDF Parsing** — Client-side PDF parsing using pdf.js (no server required)
- **OCR Fallback** — Tesseract.js integration for scanned PDF documents
- **Financial Metrics** — Calculates DAR, CAR, Property Concentration, Depreciating Asset Ratio, and Productive Asset Ratio
- **Light/Dark Mode** — Theme toggle with system preference detection and localStorage persistence

## How It Works

1. Upload an LHKPN PDF file (or use sample data for testing)
2. The parser extracts asset values from the document
3. The financial engine computes diagnostic ratios
4. Results are displayed with color-coded status indicators

## Stack

- React 19 + Vite
- pdf.js v6.3.289 for PDF parsing
- tesseract.js v7.0.0 for OCR fallback
- Pure CSS design system (keu-ui)

## Installation

```bash
npm install
npm run dev
```

## License

MIT
