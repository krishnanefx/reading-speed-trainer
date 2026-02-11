import React, { useState } from 'react';
import { parseEpub, parseTxt } from '../utils/fileHelpers';
import { toast } from 'react-hot-toast';

interface InputAreaProps {
  onTextSubmit: (text: string) => void;
  initialText?: string;
}

const InputArea: React.FC<InputAreaProps> = ({ onTextSubmit, initialText = '' }) => {
  const [text, setText] = useState(initialText);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onTextSubmit(text);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      let content = '';
      if (file.name.endsWith('.epub')) {
        const result = await parseEpub(file);
        content = result.text;
      } else if (file.name.endsWith('.txt')) {
        content = await parseTxt(file);
      } else {
        toast.error('Unsupported file type. Please use .txt or .epub.');
        setIsLoading(false);
        return;
      }

      if (!content || content.length < 50) {
        toast.error('Could not extract text from this file.');
      } else {
        setText(content);
        onTextSubmit(content);
        toast.success('Text loaded.');
      }
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Unknown parser error';
      toast.error(`Error parsing file: ${message}`);
    } finally {
      setIsLoading(false);
      // Reset input so same file can be selected again if needed
      e.target.value = '';
    }
  };

  return (
    <div className="input-container">
      <form onSubmit={handleSubmit}>
        <div className="header">
          <h3>Input Text</h3>
          <div className="actions">
            <label className="btn-file">
              Upload Book
              <input
                type="file"
                accept=".txt,.epub"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
            <button type="button" className="btn-text" onClick={() => setText('')}>Clear</button>
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isLoading ? "Loading book..." : "Paste your text or upload a book to start reading..."}
          rows={10}
          disabled={isLoading}
        />
        <button type="submit" className="btn-submit" disabled={!text.trim() || isLoading}>
          {isLoading ? 'Processing...' : 'Load Text'}
        </button>
      </form>

      <style>{`
        .input-container {
          background: var(--color-surface);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 1.5rem;
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-glass);
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        
        .actions {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        h3 {
          margin: 0;
          font-size: 1.125rem;
        }

        textarea {
          width: 100%;
          background: rgba(0,0,0,0.2);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: var(--radius-sm);
          padding: 1rem;
          font-size: 1rem;
          margin-bottom: 1rem;
          resize: vertical;
          min-height: 150px;
          color: var(--color-text);
        }

        textarea:focus {
          border-color: var(--color-primary);
        }

        .btn-submit {
          width: 100%;
          padding: 0.75rem;
          background: var(--color-primary);
          color: white;
          border-radius: var(--radius-sm);
          font-weight: 600;
          transition: var(--transition-normal);
        }

        .btn-submit:hover:not(:disabled) {
          background: var(--color-primary-hover);
        }

        .btn-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-text {
          font-size: 0.875rem;
          color: var(--color-text-secondary);
        }
        
        .btn-text:hover {
          color: var(--color-accent);
        }
        
        .btn-file {
          background: rgba(255,255,255,0.1);
          padding: 0.25rem 0.75rem;
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
          cursor: pointer;
          transition: var(--transition-normal);
        }
        
        .btn-file:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</style>
    </div>
  );
};

export default InputArea;
