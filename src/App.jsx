import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { LHKPNUploader } from './components/LHKPNUploader';
import { ParsingProgress } from './components/ParsingProgress';
import { FinancialDiagnosis } from './components/FinancialDiagnosis';
import { BatchSummaryTable } from './components/BatchSummaryTable';
import { ThemeToggle } from './components/ThemeToggle';
import { parseLHKPNPDF } from './engine/lhkpnParser';
import { SAMPLE_LHKPN_LIST } from './fixtures/sampleLHKPNData';

const THEME_KEY = 'lhkpn-theme';

function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || 'system';
}

export function App() {
  const [activeTab, setActiveTab] = useState('single');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProcessingFile, setCurrentProcessingFile] = useState('LHKPN.pdf');
  const [theme, setTheme] = useState(getStoredTheme);

  const [singleResult, setSingleResult] = useState(null);
  const [batchResults, setBatchResults] = useState(null);

  useEffect(() => {
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', systemTheme);
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme]);

  // Handle uploading real PDF files
  const handleProcessFiles = async (files) => {
    setIsProcessing(true);

    if (activeTab === 'single') {
      const file = files[0];
      setCurrentProcessingFile(file.name);
      const arrayBuffer = await file.arrayBuffer();
      const extracted = await parseLHKPNPDF(arrayBuffer, file.name);
      setSingleResult(extracted);
      setBatchResults(null);
    } else {
      const parsedBatch = [];
      for (const file of files) {
        setCurrentProcessingFile(file.name);
        const arrayBuffer = await file.arrayBuffer();
        const extracted = await parseLHKPNPDF(arrayBuffer, file.name);
        parsedBatch.push(extracted);
      }
      setBatchResults(parsedBatch);
      setSingleResult(null);
    }
  };

  // Handle quick sample dataset loading
  const handleLoadSampleData = () => {
    setIsProcessing(true);

    if (activeTab === 'single') {
      setCurrentProcessingFile(SAMPLE_LHKPN_LIST[0].fileName);
      setSingleResult(SAMPLE_LHKPN_LIST[0]);
      setBatchResults(null);
    } else {
      setCurrentProcessingFile('Batch (5 Dokumen Simulasi)');
      setBatchResults(SAMPLE_LHKPN_LIST);
      setSingleResult(null);
    }
  };

  const handleReset = () => {
    setSingleResult(null);
    setBatchResults(null);
    setIsProcessing(false);
  };

  return (
    <div className="keu-app-container">
      <Header
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          handleReset();
        }}
        onLoadSampleData={handleLoadSampleData}
        theme={theme}
        onThemeChange={setTheme}
      />

      <main className="keu-main-content">
        {isProcessing ? (
          <ParsingProgress
            currentFileName={currentProcessingFile}
            onComplete={() => setIsProcessing(false)}
          />
        ) : singleResult ? (
          <FinancialDiagnosis
            extractedData={singleResult}
            onBack={handleReset}
          />
        ) : batchResults ? (
          <BatchSummaryTable
            batchData={batchResults}
            onResetBatch={handleReset}
          />
        ) : (
          <LHKPNUploader
            isBatchMode={activeTab === 'batch'}
            onProcessFiles={handleProcessFiles}
            onLoadSampleData={handleLoadSampleData}
          />
        )}
      </main>
    </div>
  );
}

export default App;
