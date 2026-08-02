/**
 * The project lifecycle, in one place.
 *
 * `Project.status` and `Project.statusStage` are two representations of the
 * same fact — the name of the stage, and its index. They were being written
 * independently from four different call sites, each with its own copy of
 * the stage list, which is exactly the setup where a project ends up
 * labelled "Build" with a progress bar showing Discovery. Deriving the
 * index from the name (never accepting both from a request) makes that
 * desync unrepresentable.
 */

export const PROJECT_STAGES = [
  'discovery',
  'design',
  'build',
  'launch',
  'complete',
] as const;

export type ProjectStatus = (typeof PROJECT_STAGES)[number];

export const PROJECT_STAGE_LABELS: Record<ProjectStatus, string> = {
  discovery: 'Discovery',
  design: 'Design',
  build: 'Build',
  launch: 'Launch',
  complete: 'Complete',
};

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === 'string' && (PROJECT_STAGES as readonly string[]).includes(value);
}

/** The canonical index for a status name. Never trust a client-supplied one. */
export function stageIndexFor(status: ProjectStatus): number {
  return PROJECT_STAGES.indexOf(status);
}

/** The status name for a (possibly out-of-range) stored index. */
export function statusForStageIndex(index: number): ProjectStatus {
  const clamped = Math.min(Math.max(index, 0), PROJECT_STAGES.length - 1);
  return PROJECT_STAGES[clamped];
}
