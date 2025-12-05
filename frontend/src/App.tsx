import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import './App.css';

const API_URL = 'http://localhost:5000';

interface PhotoState {
  file: File | null;
  preview: string | null;
}

function App() {
  const [photo1, setPhoto1] = useState<PhotoState>({ file: null, preview: null });
  const [photo2, setPhoto2] = useState<PhotoState>({ file: null, preview: null });
  const [prompt, setPrompt] = useState('');
  const [processing, setProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop1 = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setPhoto1({ file, preview: URL.createObjectURL(file) });
      setResultUrl(null);
      setError(null);
    }
  }, []);

  const onDrop2 = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setPhoto2({ file, preview: URL.createObjectURL(file) });
      setResultUrl(null);
      setError(null);
    }
  }, []);

  const dropzoneConfig = {
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024
  };

  const dropzone1 = useDropzone({ onDrop: onDrop1, ...dropzoneConfig });
  const dropzone2 = useDropzone({ onDrop: onDrop2, ...dropzoneConfig });

  const createPolaroid = async () => {
    if (!photo1.file || !photo2.file || !prompt.trim()) return;

    setProcessing(true);
    setError(null);

    const formData = new FormData();
    formData.append('images', photo1.file);
    formData.append('images', photo2.file);
    formData.append('prompt', prompt);

    try {
      const response = await axios.post(
        `${API_URL}/api/create`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 180000 // 3 minute timeout
        }
      );

      setResultUrl(`${API_URL}${response.data.result}`);
    } catch (err: any) {
      setError(err.response?.data?.details || err.message || 'Failed to create image');
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setPhoto1({ file: null, preview: null });
    setPhoto2({ file: null, preview: null });
    setPrompt('');
    setResultUrl(null);
    setError(null);
  };

  const canCreate = photo1.file && photo2.file && prompt.trim().length > 0;

  return (
    <div className="app">
      <header className="header">
        <h1>Polaroid Creator</h1>
        <p>Upload 2 photos. Describe what they're doing. Get a realistic Polaroid.</p>
      </header>

      <main className="main">
        {!resultUrl ? (
          <>
            <div className="photo-uploads">
              <div
                {...dropzone1.getRootProps()}
                className={`dropzone small ${dropzone1.isDragActive ? 'active' : ''} ${photo1.preview ? 'has-preview' : ''}`}
              >
                <input {...dropzone1.getInputProps()} />
                {photo1.preview ? (
                  <img src={photo1.preview} alt="Person 1" className="preview-image" />
                ) : (
                  <div className="dropzone-content">
                    <p>Person 1</p>
                    <p className="dropzone-hint">Drop photo</p>
                  </div>
                )}
              </div>

              <div
                {...dropzone2.getRootProps()}
                className={`dropzone small ${dropzone2.isDragActive ? 'active' : ''} ${photo2.preview ? 'has-preview' : ''}`}
              >
                <input {...dropzone2.getInputProps()} />
                {photo2.preview ? (
                  <img src={photo2.preview} alt="Person 2" className="preview-image" />
                ) : (
                  <div className="dropzone-content">
                    <p>Person 2</p>
                    <p className="dropzone-hint">Drop photo</p>
                  </div>
                )}
              </div>
            </div>

            <div className="prompt-section">
              <textarea
                className="prompt-input"
                placeholder="What are they doing? (e.g., 'Having coffee at a Paris cafe', 'At a concert together', 'On a beach at sunset')"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
              />
            </div>

            <div className="actions">
              <button
                className="btn btn-primary"
                onClick={createPolaroid}
                disabled={processing || !canCreate}
              >
                {processing ? (
                  <>
                    <span className="spinner"></span>
                    Creating Polaroid...
                  </>
                ) : (
                  'Create Polaroid'
                )}
              </button>
              <button className="btn btn-secondary" onClick={reset} disabled={processing}>
                Clear
              </button>
            </div>

            {error && (
              <div className="error">
                <p>Error: {error}</p>
              </div>
            )}
          </>
        ) : (
          <div className="result">
            <h2>Your Polaroid</h2>

            <div className="result-image-container">
              <img src={resultUrl} alt="Generated Polaroid" className="result-image" />
            </div>

            <div className="result-actions">
              <a
                href={resultUrl}
                download="polaroid.png"
                className="btn btn-primary"
              >
                Download
              </a>
              <button className="btn btn-secondary" onClick={reset}>
                Create Another
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Powered by GPT-4o</p>
      </footer>
    </div>
  );
}

export default App;
