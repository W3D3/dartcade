/**
 * Runs the tasks of one key strictly one after another, in the order they were queued;
 * different keys don't wait for each other. A task that fails fails only its own `run`:
 * the next one still runs. A key is forgotten once its last task has settled.
 */
export class KeyedQueue {
  private readonly tails = new Map<string, Promise<void>>()

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const run = (this.tails.get(key) ?? Promise.resolve()).then(task)
    const tail = run.then(
      () => undefined,
      () => undefined,
    )
    this.tails.set(key, tail)
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key)
    })
    return run
  }

  /** Resolves once every task queued for the key so far has settled. */
  async idle(key: string): Promise<void> {
    await this.tails.get(key)
  }

  /** Keys with a task queued or running. */
  get size(): number {
    return this.tails.size
  }
}
