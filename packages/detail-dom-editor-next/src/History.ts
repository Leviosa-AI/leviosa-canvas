export class History<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(private present: T, private readonly clone: (value: T) => T = structuredClone) {}

  current(): T {
    return this.clone(this.present);
  }

  push(next: T): void {
    this.past.push(this.clone(this.present));
    this.present = this.clone(next);
    this.future = [];
  }

  replace(next: T): void {
    this.present = this.clone(next);
    this.past = [];
    this.future = [];
  }

  replacePresent(next: T): void {
    this.present = this.clone(next);
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): T {
    const previous = this.past.pop();
    if (!previous) return this.current();
    this.future.push(this.clone(this.present));
    this.present = previous;
    return this.current();
  }

  redo(): T {
    const next = this.future.pop();
    if (!next) return this.current();
    this.past.push(this.clone(this.present));
    this.present = next;
    return this.current();
  }
}
