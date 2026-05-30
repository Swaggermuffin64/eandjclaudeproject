import { usePipeline } from './hooks/usePipeline';
import FileUpload from './components/FileUpload';
import StepStatus from './components/StepStatus';
import LiveFeed from './components/LiveFeed';
import DownloadButtons from './components/DownloadButtons';
import type { RubricType } from '@shared/types/pipeline';

export default function App() {
  const {
    files, rubric, status, stepStates, feedEvents,
    dossierContent, scoreContent, error,
    subcallStates, selectedStep, selectedSubcall,
    addFiles, setPrimary, removeFile, setRubric, start, reset,
    selectStep, selectSubcall,
  } = usePipeline();

  const isRunning = status === 'running';
  const canRun = files.some((f) => f.isPrimary) && !isRunning;

  return (
    <div className="flex h-screen">
      {/* Left Panel */}
      <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col p-6 gap-6 overflow-y-auto">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Research Pipeline</h1>
          <p className="text-xs text-gray-500 mt-1">Upload documents and run the full evaluation</p>
        </div>

        <FileUpload
          files={files}
          onAddFiles={addFiles}
          onSetPrimary={setPrimary}
          onRemoveFile={removeFile}
          disabled={isRunning}
        />

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
        ) : (
          <button
            onClick={start}
            disabled={!canRun}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? 'Running...' : 'Run Pipeline'}
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
