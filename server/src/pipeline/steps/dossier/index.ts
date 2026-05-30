import type { PipelineEmitter, DossierInput, DossierOutput } from '../../types.js';
import { emitTextDelta } from '../../types.js';
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

// ---------------------------------------------------------------------------
// Phase-boundary helper
// ---------------------------------------------------------------------------

function emitPhase(emitter: PipelineEmitter, label: string): void {
  emitTextDelta(emitter, 'dossier', `\n\n========== ${label} ==========\n\n`);
}

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
  emitPhase(emitter, 'Phase 1: Research Plan (R0)');
  const r0 = await timed('R0', () => runR0(filledTemplate, emitter));

  // Phase 2: R1 + R2 + R4a (parallel — all depend only on R0)
  emitPhase(emitter, 'Phase 2: R1 + R2 + R4a (parallel)');
  const [r1, r2, r4a] = await Promise.all([
    timed('R1', () => runR1(filledTemplate, r0, emitter)),
    timed('R2', () => runR2(filledTemplate, r0, emitter)),
    timed('R4a', () => runR4a(filledTemplate, r0, emitter)),
  ]);

  // Phase 3: R3 (sequential — needs R0 + R4a)
  emitPhase(emitter, 'Phase 3: Disqualifier Screen (R3)');
  const r3 = await timed('R3', () => runR3(filledTemplate, r0, r4a, emitter));

  // Phase 4: C1-C5 + C7 (parallel), then C6 (needs C2)
  emitPhase(emitter, 'Phase 4: Criterion Blocks (C1-C7)');
  const [c1, c2, c3, c4, c5, c7] = await Promise.all([
    timed('C1', () => runC1(filledTemplate, r4a, emitter)),
    timed('C2', () => runC2(filledTemplate, r0, emitter)),
    timed('C3', () => runC3(filledTemplate, r3, emitter)),
    timed('C4', () => runC4(filledTemplate, r2, emitter)),
    timed('C5', () => runC5(filledTemplate, r2, r3, emitter)),
    timed('C7', () => runC7(filledTemplate, r0, emitter)),
  ]);

  const c6 = await timed('C6', () => runC6(filledTemplate, r4a, c2, emitter));

  // Assemble R4b (criterion outputs) for R5
  const r4b = [c1, c2, c3, c4, c5, c6, c7].join('\n\n');

  // Phase 5: R5 (sequential — needs R3 + R4a + R4b)
  emitPhase(emitter, 'Phase 5: Cross-Validation (R5)');
  const r5 = await timed('R5', () => runR5(filledTemplate, r3, r4a, r4b, emitter));

  // Phase 6: R6-R8 (sequential — needs everything)
  emitPhase(emitter, 'Phase 6: Assembly & Handoff (R6-R8)');
  const allPriorBlocks = [r0, r1, r2, r3, r4a, r4b, r5].join('\n\n');
  const r6r7r8 = await timed('R6-R8', () => runR6R7R8(filledTemplate, allPriorBlocks, emitter));

  // Assemble the final dossier
  const dossier = [r0, r1, r2, r3, r4a, c1, c2, c3, c4, c5, c6, c7, r5, r6r7r8].join('\n\n');

  return { dossier };
}
