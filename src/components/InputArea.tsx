import React, { useState } from 'react';
import { parseEpub, parseTxt } from '../utils/fileHelpers';
import { toast } from 'react-hot-toast';
import { devError } from '../utils/logger';
import './InputArea.css';

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
      devError(err);
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
          <h3 className="input-title">Input Text</h3>
          <div className="actions">
            <label className="btn-file">
              Upload Book
              <input
                type="file"
                accept=".txt,.epub"
                onChange={handleFileUpload}
                className="hidden-file-input"
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
    </div>
  );
};

export default InputArea;
