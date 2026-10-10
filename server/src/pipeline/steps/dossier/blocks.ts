import type { DependentTask } from '../../dependency-scheduler.js';
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
  type DossierBlockRunner,
} from './sub-steps.js';

/**
 * One Claude call of the dossier step: the block it produces, the blocks whose finished
 * text it must be given, and the function that makes the call.
 */
export interface DossierBlock extends DependentTask {
  run: DossierBlockRunner;
}

const CRITERION_BLOCK_IDS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'] as const;

/**
 * Every dossier block and the earlier blocks it depends on.
 *
 * A block starts as soon as all of its dependencies have finished, and receives their
 * text (in the order listed) as its prior research context. A block must list every block
 * whose findings the template tells it to use — a block that is not listed is not visible
 * to that call at all.
 *
 * Every block after R0 depends on R0 because R0 is the research plan: it holds the entity
 * list and the search commitments each later block is expected to honor.
 */
export const DOSSIER_BLOCKS: readonly DossierBlock[] = [
  // Research plan and floor commitments.
  { id: 'R0', dependsOn: [], run: runR0 },

  // Entity identification, capital position, per-founder profiles.
  { id: 'R1', dependsOn: ['R0'], run: runR1 },
  { id: 'R2', dependsOn: ['R0'], run: runR2 },
  { id: 'R4a', dependsOn: ['R0'], run: runR4a },

  // Disqualifier screen: searches court/USPTO/SEC records under the legal entity locked in
  // R1, and screens founders using the identities locked in R4a.
  { id: 'R3', dependsOn: ['R0', 'R1', 'R4a'], run: runR3 },

  // C1 Team: built entirely from the founder profiles.
  { id: 'C1', dependsOn: ['R0', 'R4a'], run: runC1 },
  // C2 Market: its AI tier classification uses research-lab pedigree from R4a.
  { id: 'C2', dependsOn: ['R0', 'R4a'], run: runC2 },
  // C3 Product/Traction: wholesale customer fabrication is cross-referenced to R3.
  { id: 'C3', dependsOn: ['R0', 'R3'], run: runC3 },
  // C4 Capital Efficiency: headcount from R1, stage and raise history from R2.
  { id: 'C4', dependsOn: ['R0', 'R1', 'R2'], run: runC4 },
  // C5 Cap Table: lead investor and accelerators from R2, IP assignment finding from R3.
  { id: 'C5', dependsOn: ['R0', 'R2', 'R3'], run: runC5 },
  // C6 Moat: references (does not re-run) the force tests from C2; founder model-work history from R4a.
  { id: 'C6', dependsOn: ['R0', 'R4a', 'C2'], run: runC6 },
  // C7 Exit: exit pattern depends on the AI tier classification from C2; timeline baseline on the stage note in R2.
  { id: 'C7', dependsOn: ['R0', 'R2', 'C2'], run: runC7 },

  // Cross-validation: re-verifies claims surfaced in R3, R4a and the criterion blocks,
  // searching under the legal entity from R1.
  { id: 'R5', dependsOn: ['R0', 'R1', 'R3', 'R4a', ...CRITERION_BLOCK_IDS], run: runR5 },

  // Assembly, completion gate and handoff: audits the whole dossier.
  {
    id: 'R6-R8',
    dependsOn: ['R0', 'R1', 'R2', 'R3', 'R4a', ...CRITERION_BLOCK_IDS, 'R5'],
    run: runR6R7R8,
  },
];

/** The order blocks appear in the finished dossier (the template's own order). */
export const DOSSIER_ASSEMBLY_ORDER: readonly string[] = [
  'R0', 'R1', 'R2', 'R3', 'R4a', ...CRITERION_BLOCK_IDS, 'R5', 'R6-R8',
];
