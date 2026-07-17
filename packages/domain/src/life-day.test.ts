import { describe, expect, it } from 'vitest';
import {
  canCloseLifeDay,
  decideLifeDayStart,
  type LifeDay,
  type LifeDayId,
  type Revision,
  type UserId,
} from './index';

const activeLifeDay: LifeDay = {
  id: '00000000-0000-4000-8000-000000000001' as LifeDayId,
  userId: '00000000-0000-4000-8000-000000000010' as UserId,
  operationalDate: '2026-07-17' as LifeDay['operationalDate'],
  timezone: 'Asia/Karachi' as LifeDay['timezone'],
  wokeAt: '2026-07-17T18:30:00.000Z' as LifeDay['wokeAt'],
  sleptAt: null,
  revision: 1 as Revision,
};

describe('Life Day start rules', () => {
  it('requires repair when a previous Life Day remains open', () => {
    expect(decideLifeDayStart(activeLifeDay)).toEqual({
      kind: 'repair_required',
      activeLifeDayId: activeLifeDay.id,
    });
  });

  it('keeps a Life Day open when midnight passes', () => {
    const afterMidnight = {
      ...activeLifeDay,
      wokeAt: '2026-07-17T18:30:00.000Z' as LifeDay['wokeAt'],
    };

    expect(decideLifeDayStart(afterMidnight).kind).toBe('repair_required');
  });

  it('allows only the first of two simultaneous wake decisions', () => {
    const first = decideLifeDayStart(null);
    const second = decideLifeDayStart(activeLifeDay);

    expect(first.kind).toBe('start_allowed');
    expect(second.kind).toBe('repair_required');
  });

  it('requires unfinished tasks to be explicitly resolved before sleep', () => {
    expect(canCloseLifeDay(['planned', 'overdue'])).toBe(false);
    expect(canCloseLifeDay(['completed', 'overdue', 'cancelled'])).toBe(true);
  });
});
