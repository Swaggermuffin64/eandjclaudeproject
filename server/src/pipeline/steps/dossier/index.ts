import type { PipelineEmitter, DossierInput, DossierOutput } from '../../types.js';
import { emitSubcallStart, emitSubcallComplete } from '../../types.js';
import { runTasksInDependencyOrder } from '../../dependency-scheduler.js';
import { DOSSIER_BLOCKS, DOSSIER_ASSEMBLY_ORDER } from './blocks.js';

function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  console.log(`[dossier] ▶ ${label}`);
  return fn().then(result => {
    console.log(`[dossier] ✓ ${label} (${((Date.now() - start) / 1000).toFixed(1)}s)`);
    return result;
  });
}

// ---------------------------------------------------------------------------
// Dossier orchestrator
// ---------------------------------------------------------------------------

/**
 * Produces the research dossier by running every block in DOSSIER_BLOCKS.
 *
 * Each block is its own Claude call. A block waits until every block it depends on has
 * finished, is given their text as prior research context, and otherwise runs in parallel
 * with the rest. The finished blocks are then joined in the template's order.
 */
export async function runDossier(
  input: DossierInput,
  emitter: PipelineEmitter,
): Promise<DossierOutput> {
  const { filledTemplate } = input;

  const blockOutputs = await runTasksInDependencyOrder(
    DOSSIER_BLOCKS,
    async (block, dependencyOutputs: ReadonlyMap<string, string>): Promise<string> => {
      const priorContext = [...dependencyOutputs.values()].join('\n\n');

      emitSubcallStart(emitter, 'dossier', block.id);
      const output = await timed(block.id, () => block.run(filledTemplate, priorContext, emitter));
      emitSubcallComplete(emitter, 'dossier', block.id);
      return output;
    },
  );

  const dossier = DOSSIER_ASSEMBLY_ORDER.map((blockId) => blockOutputs.get(blockId)).join('\n\n');

  return { dossier };
}
