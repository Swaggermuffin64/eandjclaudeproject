import type { PipelineStepName } from '@shared/types/pipeline';
import type { StepState, SubcallInfo } from '../hooks/usePipeline';

interface StepStatusProps {
  stepStates: Record<PipelineStepName, StepState>;
  subcallStates: Record<string, SubcallInfo>;
  selectedStep: PipelineStepName | null;
  selectedSubcall: string | null;
  onSelectStep: (step: PipelineStepName | null) => void;
  onSelectSubcall: (subcall: string, step: PipelineStepName) => void;
}

const STEPS: { key: PipelineStepName; label: string }[] = [
  { key: 'template', label: '1. Template' },
  { key: 'dossier', label: '2. Dossier' },
  { key: 'score', label: '3. Score' },
];

const stateConfig: Record<StepState, { icon: string; color: string }> = {
  pending: { icon: '○', color: 'text-gray-400' },
  running: { icon: '◉', color: 'text-blue-500' },
  done: { icon: '●', color: 'text-green-500' },
  error: { icon: '✗', color: 'text-red-500' },
};

export default function StepStatus({
  stepStates,
  subcallStates,
  selectedStep,
  selectedSubcall,
  onSelectStep,
  onSelectSubcall,
}: StepStatusProps) {
  const subcallsForStep = (step: PipelineStepName) =>
    Object.entries(subcallStates)
      .filter(([, info]) => info.step === step)
      .map(([name, info]) => ({ name, ...info }));

  const isAllSelected = !selectedStep && !selectedSubcall;

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Progress</label>
      <div className="space-y-0.5">
        {/* "All" row */}
        <button
          type="button"
          onClick={() => onSelectStep(null)}
          className={`flex items-center gap-2 text-sm py-1 px-2 w-full text-left rounded transition-colors ${
            isAllSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span>All</span>
        </button>

        {STEPS.map(({ key, label }) => {
          const state = stepStates[key];
          const { icon, color } = stateConfig[state];
          const isStepSelected = selectedStep === key && !selectedSubcall;
          const subcalls = subcallsForStep(key);

          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => onSelectStep(key)}
                className={`flex items-center gap-2 text-sm py-1 px-2 w-full text-left rounded transition-colors ${
                  isStepSelected ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-100'
                } ${isStepSelected ? 'text-blue-700' : color}`}
              >
                <span className={state === 'running' ? 'animate-pulse' : ''}>{icon}</span>
                <span>{label}</span>
                {state === 'done' && <span className="text-xs text-gray-400 ml-auto">done</span>}
                {state === 'running' && <span className="text-xs text-blue-400 ml-auto">running</span>}
              </button>

              {/* Nested subcalls */}
              {subcalls.length > 0 && (
                <div className="ml-6 space-y-0.5">
                  {subcalls.map(({ name, state: scState }) => {
                    const scConfig = stateConfig[scState];
                    const isSubcallSelected = selectedSubcall === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => onSelectSubcall(name, key)}
                        className={`flex items-center gap-2 text-xs py-0.5 px-2 w-full text-left rounded transition-colors ${
                          isSubcallSelected ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-100'
                        } ${isSubcallSelected ? 'text-blue-700' : scConfig.color}`}
                      >
                        <span className={scState === 'running' ? 'animate-pulse' : ''}>{scConfig.icon}</span>
                        <span>{name}</span>
                        {scState === 'done' && <span className="text-xs text-gray-400 ml-auto">done</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
