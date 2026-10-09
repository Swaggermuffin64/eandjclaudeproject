import { usePipeline } from './hooks/usePipeline';
import FileUpload from './components/FileUpload';
import StepStatus from './components/StepStatus';
import LiveFeed from './components/LiveFeed';
import DownloadButtons from './components/DownloadButtons';
import type { RubricType } from '@shared/types/pipeline';
import type { PipelineMode } from './hooks/usePipeline';

export default function App() {
  const {
    mode, files, dossierFile, rubric, status, stepStates, feedEvents,
    dossierContent, scoreContent, error,
    subcallStates, selectedStep, selectedSubcall,
    setMode, addFiles, setPrimary, removeFile, setDossierFile, setRubric,
    start, startScore, reset,
    selectStep, selectSubcall,
  } = usePipeline();

  const isRunning = status === 'running';
  const canRunFull = files.some((f) => f.isPrimary) && !isRunning;
  const canRunScore = !!dossierFile && !isRunning;

  return (
    <div className="flex h-screen">
      {/* Left Panel */}
      <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col p-6 gap-6 overflow-y-auto">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Research Pipeline</h1>
          <p className="text-xs text-gray-500 mt-1">Upload documents and run the full evaluation</p>
        </div>

        {/* Mode Toggle */}
        {status === 'idle' && (
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setMode('full')}
              className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${
                mode === 'full'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              Full Pipeline
            </button>
            <button
              onClick={() => setMode('score-only')}
              className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${
                mode === 'score-only'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              Score Only
            </button>
          </div>
        )}

        {/* Full Pipeline: PDF uploads */}
        {mode === 'full' && status === 'idle' && (
          <FileUpload
            files={files}
            onAddFiles={addFiles}
            onSetPrimary={setPrimary}
            onRemoveFile={removeFile}
            disabled={isRunning}
          />
        )}

        {/* Score Only: Dossier text file upload */}
        {mode === 'score-only' && status === 'idle' && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Dossier File</label>
            {dossierFile ? (
              <div className="flex items-center justify-between bg-white border border-gray-300 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-700 truncate">{dossierFile.name}</span>
                <button
                  onClick={() => setDossierFile(null)}
                  className="text-gray-400 hover:text-gray-600 ml-2 text-sm"
                >
                  x
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:border-blue-400 transition-colors">
                <span className="text-sm text-gray-500">Upload dossier .txt file</span>
                <input
                  type="file"
                  accept=".txt,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setDossierFile(file);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Rubric</label>
          <select
            value={rubric}
            onChange={(e) => setRubric(e.target.value as RubricType)}
            disabled={isRunning}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50"
          >
            <option value="technology">Technology</option>
            <option value="life-sciences">Life Sciences</option>
          </select>
        </div>

        {status === 'complete' || status === 'error' ? (
          <button
            onClick={reset}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
          >
            Run Again
          </button>
        ) : mode === 'full' ? (
          <button
            onClick={start}
            disabled={!canRunFull}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? 'Running...' : 'Run Pipeline'}
          </button>
        ) : (
          <button
            onClick={startScore}
            disabled={!canRunScore}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? 'Running...' : 'Run Score'}
          </button>
        )}

        {status !== 'idle' && (
          <StepStatus
            stepStates={stepStates}
            subcallStates={subcallStates}
            selectedStep={selectedStep}
            selectedSubcall={selectedSubcall}
            onSelectStep={selectStep}
            onSelectSubcall={selectSubcall}
          />
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      {/* Right Panel */}
      <div className="flex-1 bg-gray-900 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="text-sm font-semibold text-gray-300">Live Output</span>
          <DownloadButtons dossierContent={dossierContent} scoreContent={scoreContent} />
        </div>
        <LiveFeed
          events={feedEvents}
          selectedStep={selectedStep}
          selectedSubcall={selectedSubcall}
        />
      </div>
    </div>
  );
}
