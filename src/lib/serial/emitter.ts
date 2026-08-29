/** Minimal typed listener set — avoids pulling an event-emitter dependency in. */
export class Listeners<T> {
  #listeners = new Set<(value: T) => void>();

  add(listener: (value: T) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  emit(value: T): void {
    for (const listener of [...this.#listeners]) {
      try {
        listener(value);
      } catch (error) {
        // A misbehaving subscriber must never break the read loop.
        console.error('[kiyro] listener threw', error);
      }
    }
  }

  clear(): void {
    this.#listeners.clear();
  }

  get size(): number {
    return this.#listeners.size;
  }
}
