import type { PipelineEmitter, DossierInput, DossierOutput } from '../../types.js';
import { emitSubcallStart, emitSubcallComplete } from '../../types.js';
import {
  runR0,
  runR1,
  runR2,
  runR4a,
  runR3,
  runC1,
  runC2,
  runC3,
  runC4,
  runC5,
  runC6,
  runC7,
  runR5,
  runR6R7R8,
} from './sub-steps.js';

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

export async function runDossier(
  input: DossierInput,
  emitter: PipelineEmitter,
): Promise<DossierOutput> {
  const { filledTemplate } = input;

  // Phase 1: R0 (sequential — everything else depends on it)
  emitSubcallStart(emitter, 'dossier', 'R0');
  const r0 = await timed('R0', () => runR0(filledTemplate, emitter));
  emitSubcallComplete(emitter, 'dossier', 'R0');

  // Phase 2: R1 + R2 + R4a (parallel — all depend only on R0)
  emitSubcallStart(emitter, 'dossier', 'R1');
  emitSubcallStart(emitter, 'dossier', 'R2');
  emitSubcallStart(emitter, 'dossier', 'R4a');
  const [r1, r2, r4a] = await Promise.all([
    timed('R1', () => runR1(filledTemplate, r0, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'R1'); return r; }),
    timed('R2', () => runR2(filledTemplate, r0, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'R2'); return r; }),
    timed('R4a', () => runR4a(filledTemplate, r0, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'R4a'); return r; }),
  ]);

  // Phase 3: R3 (sequential — needs R0 + R4a)
  emitSubcallStart(emitter, 'dossier', 'R3');
  const r3 = await timed('R3', () => runR3(filledTemplate, r0, r4a, emitter));
  emitSubcallComplete(emitter, 'dossier', 'R3');

  // Phase 4: C1-C5 + C7 (parallel), then C6 (needs C2)
  emitSubcallStart(emitter, 'dossier', 'C1');
  emitSubcallStart(emitter, 'dossier', 'C2');
  emitSubcallStart(emitter, 'dossier', 'C3');
  emitSubcallStart(emitter, 'dossier', 'C4');
  emitSubcallStart(emitter, 'dossier', 'C5');
  emitSubcallStart(emitter, 'dossier', 'C7');
  const [c1, c2, c3, c4, c5, c7] = await Promise.all([
    timed('C1', () => runC1(filledTemplate, r4a, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'C1'); return r; }),
    timed('C2', () => runC2(filledTemplate, r0, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'C2'); return r; }),
    timed('C3', () => runC3(filledTemplate, r3, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'C3'); return r; }),
    timed('C4', () => runC4(filledTemplate, r2, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'C4'); return r; }),
    timed('C5', () => runC5(filledTemplate, r2, r3, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'C5'); return r; }),
    timed('C7', () => runC7(filledTemplate, r0, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'C7'); return r; }),
  ]);

  emitSubcallStart(emitter, 'dossier', 'C6');
  const c6 = await timed('C6', () => runC6(filledTemplate, r4a, c2, emitter));
  emitSubcallComplete(emitter, 'dossier', 'C6');

  // Assemble R4b (criterion outputs) for R5
  const r4b = [c1, c2, c3, c4, c5, c6, c7].join('\n\n');

  // Phase 5: R5 (sequential — needs R3 + R4a + R4b)
  emitSubcallStart(emitter, 'dossier', 'R5');
  const r5 = await timed('R5', () => runR5(filledTemplate, r3, r4a, r4b, emitter));
  emitSubcallComplete(emitter, 'dossier', 'R5');

  // Phase 6: R6-R8 (sequential — needs everything)
  const allPriorBlocks = [r0, r1, r2, r3, r4a, r4b, r5].join('\n\n');
  emitSubcallStart(emitter, 'dossier', 'R6-R8');
  const r6r7r8 = await timed('R6-R8', () => runR6R7R8(filledTemplate, allPriorBlocks, emitter));
  emitSubcallComplete(emitter, 'dossier', 'R6-R8');

  // Assemble the final dossier
  const dossier = [r0, r1, r2, r3, r4a, c1, c2, c3, c4, c5, c6, c7, r5, r6r7r8].join('\n\n');

  return { dossier };
}
