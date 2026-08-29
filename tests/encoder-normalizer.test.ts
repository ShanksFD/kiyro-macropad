import { describe, expect, it } from 'vitest';
import { EncoderNormalizer } from '@/lib/devices/encoder-normalizer';

describe('EncoderNormalizer', () => {
  it('passes every pulse through by default', () => {
    const normalizer = new EncoderNormalizer();
    expect(normalizer.push(1, 'cw', 0).steps).toBe(1);
    expect(normalizer.push(1, 'cw', 10).steps).toBe(1);
  });

  it('collapses several pulses into one detent when configured', () => {
    const normalizer = new EncoderNormalizer({ pulsesPerStep: 4 });
    const steps = [0, 10, 20, 30].map((at) => normalizer.push(1, 'cw', at).steps);
    expect(steps).toEqual([0, 0, 0, 1]);
  });

  it('restarts counting when the direction reverses', () => {
    const normalizer = new EncoderNormalizer({ pulsesPerStep: 3 });
    normalizer.push(1, 'cw', 0);
    normalizer.push(1, 'cw', 10);
    expect(normalizer.push(1, 'ccw', 20).steps).toBe(0);
    normalizer.push(1, 'ccw', 30);
    expect(normalizer.push(1, 'ccw', 40).steps).toBe(1);
  });

  it('keeps encoders independent', () => {
    const normalizer = new EncoderNormalizer({ pulsesPerStep: 2 });
    expect(normalizer.push(1, 'cw', 0).steps).toBe(0);
    expect(normalizer.push(2, 'cw', 1).steps).toBe(0);
    expect(normalizer.push(1, 'cw', 2).steps).toBe(1);
    expect(normalizer.push(2, 'cw', 3).steps).toBe(1);
  });

  it('discards pulses older than the window', () => {
    const normalizer = new EncoderNormalizer({ pulsesPerStep: 2, windowMs: 100 });
    expect(normalizer.push(1, 'cw', 0).steps).toBe(0);
    expect(normalizer.push(1, 'cw', 5_000).steps).toBe(0);
  });
});
