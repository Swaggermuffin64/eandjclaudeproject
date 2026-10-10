import {
  assertTasksAreRunnable,
  runTasksInDependencyOrder,
  type DependentTask,
} from '../dependency-scheduler.js';

/** A promise plus the function that resolves it, so a test decides when a task finishes. */
function createControllableTask() {
  let finish!: (result: string) => void;
  const promise = new Promise<string>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}

/** Lets every already-resolved promise callback run before the test continues. */
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('assertTasksAreRunnable', () => {
  it('accepts tasks with no dependencies', () => {
    expect(() => assertTasksAreRunnable([{ id: 'a', dependsOn: [] }])).not.toThrow();
  });

  it('accepts a dependency declared after the task that needs it', () => {
    const tasks = [
      { id: 'b', dependsOn: ['a'] },
      { id: 'a', dependsOn: [] },
    ];
    expect(() => assertTasksAreRunnable(tasks)).not.toThrow();
  });

  it('rejects a dependency on a task that does not exist', () => {
    const tasks = [{ id: 'a', dependsOn: ['missing'] }];
    expect(() => assertTasksAreRunnable(tasks)).toThrow('Task "a" depends on unknown task "missing"');
  });

  it('rejects duplicate task ids', () => {
    const tasks = [
      { id: 'a', dependsOn: [] },
      { id: 'a', dependsOn: [] },
    ];
    expect(() => assertTasksAreRunnable(tasks)).toThrow('Duplicate task id "a"');
  });

  it('rejects a task that depends on itself', () => {
    const tasks = [{ id: 'a', dependsOn: ['a'] }];
    expect(() => assertTasksAreRunnable(tasks)).toThrow('Circular task dependency: a -> a');
  });

  it('rejects a cycle and names the tasks in it', () => {
    const tasks = [
      { id: 'a', dependsOn: ['c'] },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['b'] },
    ];
    expect(() => assertTasksAreRunnable(tasks)).toThrow('Circular task dependency: a -> c -> b -> a');
  });
});

describe('runTasksInDependencyOrder', () => {
  it('returns every result keyed by task id', async () => {
    const tasks = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
    ];
    const results = await runTasksInDependencyOrder(tasks, async (task) => `${task.id}-result`);

    expect([...results.entries()]).toEqual([['a', 'a-result'], ['b', 'b-result']]);
  });

  it('gives a task the results of exactly its dependencies, in declared order', async () => {
    const tasks = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
      { id: 'unrelated', dependsOn: [] },
      { id: 'c', dependsOn: ['b', 'a'] },
    ];
    const received = new Map<string, Array<[string, string]>>();

    await runTasksInDependencyOrder<DependentTask, string>(tasks, async (task, dependencyResults) => {
      received.set(task.id, [...dependencyResults.entries()]);
      return `${task.id}-result`;
    });

    expect(received.get('c')).toEqual([['b', 'b-result'], ['a', 'a-result']]);
    expect(received.get('a')).toEqual([]);
  });

  it('starts independent tasks together without waiting for each other', async () => {
    const tasks = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
    ];
    const controls: Record<string, ReturnType<typeof createControllableTask>> = {
      a: createControllableTask(),
      b: createControllableTask(),
    };
    const started: string[] = [];

    const run = runTasksInDependencyOrder(tasks, (task) => {
      started.push(task.id);
      return controls[task.id].promise;
    });
    await flushPromises();

    expect(started).toEqual(['a', 'b']);
    controls.a.finish('a');
    controls.b.finish('b');
    await run;
  });

  it('does not start a task until every one of its dependencies has finished', async () => {
    const tasks = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
      { id: 'c', dependsOn: ['a', 'b'] },
    ];
    const controls: Record<string, ReturnType<typeof createControllableTask>> = {
      a: createControllableTask(),
      b: createControllableTask(),
      c: createControllableTask(),
    };
    const started: string[] = [];

    const run = runTasksInDependencyOrder(tasks, (task) => {
      started.push(task.id);
      return controls[task.id].promise;
    });

    await flushPromises();
    expect(started).toEqual(['a', 'b']);

    controls.a.finish('a');
    await flushPromises();
    expect(started).toEqual(['a', 'b']); // still waiting on b

    controls.b.finish('b');
    await flushPromises();
    expect(started).toEqual(['a', 'b', 'c']);

    controls.c.finish('c');
    await run;
  });

  it('starts a task as soon as its own dependencies finish, even while unrelated tasks run', async () => {
    const tasks = [
      { id: 'slow', dependsOn: [] },
      { id: 'fast', dependsOn: [] },
      { id: 'needsFast', dependsOn: ['fast'] },
    ];
    const controls: Record<string, ReturnType<typeof createControllableTask>> = {
      slow: createControllableTask(),
      fast: createControllableTask(),
      needsFast: createControllableTask(),
    };
    const started: string[] = [];

    const run = runTasksInDependencyOrder(tasks, (task) => {
      started.push(task.id);
      return controls[task.id].promise;
    });

    controls.fast.finish('fast');
    await flushPromises();
    expect(started).toEqual(['slow', 'fast', 'needsFast']);

    controls.slow.finish('slow');
    controls.needsFast.finish('needsFast');
    await run;
  });

  it('runs each task exactly once when several tasks share a dependency', async () => {
    const tasks = [
      { id: 'shared', dependsOn: [] },
      { id: 'x', dependsOn: ['shared'] },
      { id: 'y', dependsOn: ['shared'] },
      { id: 'z', dependsOn: ['x', 'y', 'shared'] },
    ];
    const runCounts: Record<string, number> = {};

    await runTasksInDependencyOrder(tasks, async (task) => {
      runCounts[task.id] = (runCounts[task.id] ?? 0) + 1;
      return task.id;
    });

    expect(runCounts).toEqual({ shared: 1, x: 1, y: 1, z: 1 });
  });

  it('rejects and never starts dependents when a dependency fails', async () => {
    const tasks = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
    ];
    const started: string[] = [];

    const run = runTasksInDependencyOrder(tasks, async (task) => {
      started.push(task.id);
      throw new Error(`${task.id} failed`);
    });

    await expect(run).rejects.toThrow('a failed');
    expect(started).toEqual(['a']);
  });

  it('refuses to start anything when the tasks contain a cycle', async () => {
    const tasks: DependentTask[] = [
      { id: 'a', dependsOn: ['b'] },
      { id: 'b', dependsOn: ['a'] },
    ];
    const started: string[] = [];

    const run = runTasksInDependencyOrder(tasks, async (task) => {
      started.push(task.id);
      return task.id;
    });

    await expect(run).rejects.toThrow('Circular task dependency');
    expect(started).toEqual([]);
  });
});
