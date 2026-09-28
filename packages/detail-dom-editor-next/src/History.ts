// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
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

  // 커서를 옮기지 않고 undo/redo 대상 상태를 본다.
  peek(direction: "undo" | "redo"): T | null {
    const stack = direction === "undo" ? this.past : this.future;
    const target = stack.at(-1);
    return target === undefined ? null : this.clone(target);
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
