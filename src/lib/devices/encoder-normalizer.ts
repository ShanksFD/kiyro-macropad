import type { EncoderDirection, EncoderIndex } from '../protocol/types';

export interface EncoderNormalizerOptions {
  /**
   * Raw firmware pulses that make up one logical detent.
   *
   * The reference firmware has been observed emitting more than one
   * `LEFT`/`RIGHT` per physical click, but the exact ratio is not established —
   * so the default is 1 (pass through) and nothing is silently swallowed.
   */
  pulsesPerStep?: number;
  /** Pulses older than this are discarded before counting, in milliseconds. */
  windowMs?: number;
}

export interface LogicalEncoderStep {
  encoder: EncoderIndex;
  direction: EncoderDirection;
  /** Number of logical detents produced by this pulse. Usually 0 or 1. */
  steps: number;
}

interface Accumulator {
  direction: EncoderDirection;
  pulses: number;
  lastAt: number;
}

/**
 * Converts the raw pulse stream into logical detents.
 *
 * Reversing direction resets the accumulator immediately so a quick back-and-forth
 * never produces a phantom step in the wrong direction.
 */
export class EncoderNormalizer {
  readonly #pulsesPerStep: number;
  readonly #windowMs: number;
  readonly #state = new Map<EncoderIndex, Accumulator>();

  constructor(options: EncoderNormalizerOptions = {}) {
    this.#pulsesPerStep = Math.max(1, Math.floor(options.pulsesPerStep ?? 1));
    this.#windowMs = options.windowMs ?? 250;
  }

  push(encoder: EncoderIndex, direction: EncoderDirection, at = Date.now()): LogicalEncoderStep {
    const previous = this.#state.get(encoder);
    const stale = previous !== undefined && at - previous.lastAt > this.#windowMs;

    const pulses =
      previous === undefined || stale || previous.direction !== direction ? 1 : previous.pulses + 1;

    if (pulses >= this.#pulsesPerStep) {
      this.#state.set(encoder, { direction, pulses: 0, lastAt: at });
      return { encoder, direction, steps: 1 };
    }

    this.#state.set(encoder, { direction, pulses, lastAt: at });
    return { encoder, direction, steps: 0 };
  }

  reset(): void {
    this.#state.clear();
  }
}
