import { useCallback, useRef } from 'react';
import type { UploadedFile } from '../hooks/usePipeline';

interface FileUploadProps {
  files: UploadedFile[];
  onAddFiles: (files: File[]) => void;
  onSetPrimary: (index: number) => void;
  onRemoveFile: (index: number) => void;
  disabled: boolean;
}

export default function FileUpload({ files, onAddFiles, onSetPrimary, onRemoveFile, disabled }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (disabled) return;
      const pdfFiles = Array.from(e.dataTransfer.files).filter((f) => f.type === 'application/pdf');
      if (pdfFiles.length > 0) onAddFiles(pdfFiles);
    },
    [disabled, onAddFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleBrowse = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const pdfFiles = Array.from(e.target.files || []).filter((f) => f.type === 'application/pdf');
      if (pdfFiles.length > 0) onAddFiles(pdfFiles);
      e.target.value = '';
    },
    [onAddFiles],
  );

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Documents</label>

      {!disabled && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={handleBrowse}
          className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 transition-colors mb-3"
        >
          <p className="text-sm font-medium text-gray-600">Drop PDFs here or click to browse</p>
          <p className="text-xs text-gray-400 mt-1">Primary deck + supplementary docs</p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            multiple
            onChange={handleInputChange}
            className="hidden"
          />
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div
              key={`${f.file.name}-${i}`}
              className="flex items-center justify-between bg-white border border-gray-200 rounded px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-gray-400 flex-shrink-0">📄</span>
                <span className="truncate text-gray-700">{f.file.name}</span>
                {f.isPrimary && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                    Primary
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!f.isPrimary && !disabled && (
                  <button
                    onClick={() => onSetPrimary(i)}
                    className="text-xs text-gray-400 hover:text-blue-600 px-1"
                    title="Set as primary"
                  >
                    Set primary
                  </button>
                )}
                {!disabled && (
                  <button
                    onClick={() => onRemoveFile(i)}
                    className="text-gray-400 hover:text-red-500 px-1"
                    title="Remove"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
