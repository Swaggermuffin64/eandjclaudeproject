interface DownloadButtonsProps {
  dossierContent: string | null;
  scoreContent: string | null;
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DownloadButtons({ dossierContent, scoreContent }: DownloadButtonsProps) {
  if (!dossierContent && !scoreContent) return null;

  return (
    <div className="flex gap-2">
      {dossierContent && (
        <button
          onClick={() => downloadFile(dossierContent, 'research-dossier.txt')}
          className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs px-3 py-1.5 rounded transition-colors"
        >
          Download Dossier
        </button>
      )}
      {scoreContent && (
        <button
          onClick={() => downloadFile(scoreContent, 'evaluation-score.txt')}
          className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs px-3 py-1.5 rounded transition-colors"
        >
          Download Score
        </button>
      )}
    </div>
  );
}
