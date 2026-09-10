export class SerialTaskQueue {
  private pending: Promise<void> = Promise.resolve();

  schedule(operation: () => Promise<void>): Promise<void> {
    const scheduled = this.pending.then(operation, operation);
    this.pending = scheduled.catch(() => undefined);
    return scheduled;
  }
}
