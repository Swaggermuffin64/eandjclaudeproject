import { useState } from 'react';
import { runPipelineStep } from '../api/client';
import type { PipelineStepResponse } from '@shared/types/pipeline';

export default function Audit() {
  const [result, setResult] = useState<PipelineStepResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const data = await runPipelineStep('audit');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Step 5: Audit</h1>
      <p className="text-gray-600 mb-4">
        Self-critique the evaluation for overconfidence or reasoning gaps.
      </p>
      <button
        onClick={handleRun}
        disabled={loading}
        className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Running...' : 'Run'}
      </button>
      {error && <p className="mt-4 text-red-600">{error}</p>}
      {result && (
        <pre className="mt-4 rounded bg-gray-100 p-4 text-sm overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
