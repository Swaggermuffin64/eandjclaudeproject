import type { PipelineStepName } from '@shared/types/pipeline';
import type { StepState } from '../hooks/usePipeline';

interface StepStatusProps {
  stepStates: Record<PipelineStepName, StepState>;
}

const STEPS: { key: PipelineStepName; label: string }[] = [
  { key: 'ingest', label: '1. Ingest' },
  { key: 'template', label: '2. Template' },
  { key: 'dossier', label: '3. Dossier' },
  { key: 'score', label: '4. Score' },
];

const stateConfig: Record<StepState, { icon: string; color: string }> = {
  pending: { icon: '○', color: 'text-gray-400' },
  running: { icon: '◉', color: 'text-blue-500' },
  done: { icon: '●', color: 'text-green-500' },
  error: { icon: '✗', color: 'text-red-500' },
};

export default function StepStatus({ stepStates }: StepStatusProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Progress</label>
      <div className="space-y-1">
        {STEPS.map(({ key, label }) => {
          const state = stepStates[key];
          const { icon, color } = stateConfig[state];
          return (
            <div
              key={key}
              className={`flex items-center gap-2 text-sm py-1 ${color}`}
            >
              <span className={state === 'running' ? 'animate-pulse' : ''}>{icon}</span>
              <span>{label}</span>
              {state === 'done' && <span className="text-xs text-gray-400 ml-auto">done</span>}
              {state === 'running' && <span className="text-xs text-blue-400 ml-auto">running</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
