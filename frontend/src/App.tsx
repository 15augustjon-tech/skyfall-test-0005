import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';
import axios from 'axios';
import './App.css';

const API_URL = 'http://localhost:5000';

type EnhancementMode = 'iphone17pro' | 'monaco' | 'full';

interface ProcessedImage {
  original: string;
  enhanced: string;
  style: string;
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ProcessedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EnhancementMode>('full');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      setPreview(URL.createObjectURL(file));
      setResult(null);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp']
    },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024
  });

  const processImage = async () => {
    if (!selectedFile) return;

    setProcessing(true);
    setError(null);

    const formData = new FormData();
    formData.append('image', selectedFile);

    try {
      const response = await axios.post(
        `${API_URL}/api/enhance/${mode}`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 180000 // 3 minute timeout
        }
      );

      setResult({
        original: `${API_URL}${response.data.original}`,
        enhanced: `${API_URL}${response.data.enhanced}`,
        style: response.data.style
      });
    } catch (err: any) {
      setError(err.response?.data?.details || err.message || 'Failed to process image');
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setSelectedFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Flex Photo</h1>
        <p>Transform your photos with iPhone 17 Pro quality & Monaco luxury vibes</p>
      </header>

      <main className="main">
        {!result ? (
          <>
            <div className="mode-selector">
              <h3>Choose Enhancement</h3>
              <div className="mode-buttons">
                <button
                  className={`mode-btn ${mode === 'iphone17pro' ? 'active' : ''}`}
                  onClick={() => setMode('iphone17pro')}
                >
                  <span className="mode-icon">iPhone</span>
                  <span className="mode-label">iPhone 17 Pro</span>
                  <span className="mode-desc">Color grading & quality</span>
                </button>
                <button
                  className={`mode-btn ${mode === 'monaco' ? 'active' : ''}`}
                  onClick={() => setMode('monaco')}
                >
                  <span className="mode-icon">Monaco</span>
                  <span className="mode-label">Monaco Supercar</span>
                  <span className="mode-desc">Luxury background</span>
                </button>
                <button
                  className={`mode-btn ${mode === 'full' ? 'active' : ''}`}
                  onClick={() => setMode('full')}
                >
                  <span className="mode-icon">Full</span>
                  <span className="mode-label">Full Flex</span>
                  <span className="mode-desc">Both enhancements</span>
                </button>
              </div>
            </div>

            <div
              {...getRootProps()}
              className={`dropzone ${isDragActive ? 'active' : ''} ${preview ? 'has-preview' : ''}`}
            >
              <input {...getInputProps()} />
              {preview ? (
                <div className="preview-container">
                  <img src={preview} alt="Preview" className="preview-image" />
                  <p className="preview-filename">{selectedFile?.name}</p>
                </div>
              ) : (
                <div className="dropzone-content">
                  <div className="dropzone-icon">Upload</div>
                  <p>Drag & drop your photo here</p>
                  <p className="dropzone-hint">or click to select</p>
                </div>
              )}
            </div>

            {preview && (
              <div className="actions">
                <button
                  className="btn btn-primary"
                  onClick={processImage}
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <span className="spinner"></span>
                      Processing...
                    </>
                  ) : (
                    `Apply ${mode === 'full' ? 'Full Flex' : mode === 'iphone17pro' ? 'iPhone 17 Pro' : 'Monaco'}`
                  )}
                </button>
                <button className="btn btn-secondary" onClick={reset} disabled={processing}>
                  Clear
                </button>
              </div>
            )}

            {error && (
              <div className="error">
                <p>Error: {error}</p>
              </div>
            )}
          </>
        ) : (
          <div className="result">
            <h2>{result.style} Applied</h2>

            <div className="compare-container">
              <ReactCompareSlider
                itemOne={
                  <ReactCompareSliderImage
                    src={result.original}
                    alt="Original"
                  />
                }
                itemTwo={
                  <ReactCompareSliderImage
                    src={result.enhanced}
                    alt="Enhanced"
                  />
                }
                style={{ width: '100%', height: '500px' }}
              />
              <div className="compare-labels">
                <span>Original</span>
                <span>Enhanced</span>
              </div>
            </div>

            <div className="result-actions">
              <a
                href={result.enhanced}
                download="flex-photo-enhanced.png"
                className="btn btn-primary"
              >
                Download Enhanced
              </a>
              <button className="btn btn-secondary" onClick={reset}>
                Process Another
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Powered by OpenAI GPT-4o | iPhone 17 Pro color science</p>
      </footer>
    </div>
  );
}

export default App;
