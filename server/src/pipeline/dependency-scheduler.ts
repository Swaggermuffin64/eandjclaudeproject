/**
 * Runs named tasks where some tasks need the finished output of others.
 *
 * Both the dossier step (research blocks) and the score step (rubric criteria) are made of
 * many Claude calls. Each call declares which other calls it depends on; this scheduler
 * starts a call the moment all of its dependencies have finished and hands it their results.
 * Calls with no unmet dependencies run in parallel.
 */

/** One unit of work and the ids of the tasks whose results it needs before it can start. */
export interface DependentTask {
  id: string;
  dependsOn: readonly string[];
}

/**
 * Throws if the tasks cannot all run: a duplicate id, a dependency on an id that is not in
 * the list, or a cycle (which would leave tasks waiting on each other forever).
 */
export function assertTasksAreRunnable(tasks: readonly DependentTask[]): void {
  const tasksById = new Map<string, DependentTask>();
  for (const task of tasks) {
    if (tasksById.has(task.id)) {
      throw new Error(`Duplicate task id "${task.id}"`);
    }
    tasksById.set(task.id, task);
  }

  for (const task of tasks) {
    for (const dependencyId of task.dependsOn) {
      if (!tasksById.has(dependencyId)) {
        throw new Error(`Task "${task.id}" depends on unknown task "${dependencyId}"`);
      }
    }
  }

  const finished = new Set<string>();
  const inProgressPath: string[] = [];

  const visit = (task: DependentTask): void => {
    if (finished.has(task.id)) return;
    if (inProgressPath.includes(task.id)) {
      const cycle = [...inProgressPath.slice(inProgressPath.indexOf(task.id)), task.id];
      throw new Error(`Circular task dependency: ${cycle.join(' -> ')}`);
    }
    inProgressPath.push(task.id);
    task.dependsOn.forEach((dependencyId) => visit(tasksById.get(dependencyId)!));
    inProgressPath.pop();
    finished.add(task.id);
  };

  tasks.forEach(visit);
}

/**
 * Runs every task, starting each one as soon as all of its dependencies have finished.
 *
 * `runTask` receives the task and the results of exactly the tasks it depends on, keyed by
 * id in the order `dependsOn` lists them. Returns every task's result keyed by id.
 * If any task fails, the returned promise rejects and tasks that depend on it never start.
 */
export async function runTasksInDependencyOrder<TTask extends DependentTask, TResult>(
  tasks: readonly TTask[],
  runTask: (task: TTask, dependencyResults: ReadonlyMap<string, TResult>) => Promise<TResult>,
): Promise<Map<string, TResult>> {
  assertTasksAreRunnable(tasks);

  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const startedTasks = new Map<string, Promise<TResult>>();

  const startOnce = (task: TTask): Promise<TResult> => {
    const alreadyStarted = startedTasks.get(task.id);
    if (alreadyStarted) return alreadyStarted;

    const dependencyPromises = task.dependsOn.map((id) => startOnce(tasksById.get(id)!));
    const taskPromise = Promise.all(dependencyPromises).then((results) => {
      const dependencyResults = new Map(task.dependsOn.map((id, index) => [id, results[index]]));
      return runTask(task, dependencyResults);
    });

    startedTasks.set(task.id, taskPromise);
    return taskPromise;
  };

  const results = await Promise.all(tasks.map(startOnce));
  return new Map(tasks.map((task, index) => [task.id, results[index]]));
}
