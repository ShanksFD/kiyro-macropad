import { describe, expect, it } from 'vitest';
import { actionsEqual, describeAction, formatHotkey } from '@/lib/actions/format';
import { sortModifiers } from '@/lib/actions/keys';
import { actionSchema } from '@/lib/actions/schema';
import { defaultActionOfType, categoryOfAction, ACTION_AVAILABILITY } from '@/lib/actions/catalog';
import type { ActionType } from '@/lib/actions/types';

describe('action labels', () => {
  it('renders keys and shortcuts consistently', () => {
    expect(describeAction({ type: 'keyboard', key: 'KeyA' }).full).toBe('Keyboard · A');
    expect(formatHotkey(['Shift', 'Control'], 'KeyS')).toBe('Ctrl + Shift + S');
  });

  it('normalises modifier order', () => {
    expect(sortModifiers(['Meta', 'Shift', 'Control', 'Shift'])).toEqual([
      'Control',
      'Shift',
      'Meta',
    ]);
  });

  it('truncates long text for the key cap but keeps the full description', () => {
    const label = describeAction({ type: 'text', text: 'a'.repeat(60) });
    expect(label.primary.length).toBeLessThanOrEqual(18);
    expect(label.secondary).toBe('Text');
  });

  it('compares actions structurally', () => {
    expect(
      actionsEqual(
        { type: 'scroll', direction: 'up', amount: 3 },
        { type: 'scroll', direction: 'up', amount: 3 },
      ),
    ).toBe(true);
    expect(actionsEqual({ type: 'none' }, undefined)).toBe(true);
    expect(
      actionsEqual(
        { type: 'scroll', direction: 'up', amount: 3 },
        { type: 'scroll', direction: 'up', amount: 5 },
      ),
    ).toBe(false);
  });
});

describe('action catalogue', () => {
  const types = Object.keys(ACTION_AVAILABILITY) as ActionType[];

  it('provides a valid default for every action type', () => {
    for (const type of types) {
      const action = defaultActionOfType(type);
      expect(action.type).toBe(type);
      expect(actionSchema.safeParse(action).success).toBe(true);
    }
  });

  it('places every non-empty action in a category', () => {
    for (const type of types.filter((candidate) => candidate !== 'none')) {
      expect(categoryOfAction(defaultActionOfType(type))).not.toBeNull();
    }
  });

  it('rejects malformed actions', () => {
    expect(actionSchema.safeParse({ type: 'keyboard' }).success).toBe(false);
    expect(actionSchema.safeParse({ type: 'keyboard', key: 'Key A;' }).success).toBe(false);
    expect(actionSchema.safeParse({ type: 'scroll', direction: 'up', amount: 0 }).success).toBe(
      false,
    );
  });
});
