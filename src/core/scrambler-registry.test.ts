import { afterEach, describe, expect, it } from 'vitest';
import { createRandomSource } from '../random/random-source';
import {
  _resetRegistryForTests,
  getScrambler,
  implementedEvents,
  isImplementedEvent,
  registerScrambler,
} from './scrambler-registry';

const noopRandom = createRandomSource(1);

afterEach(() => {
  _resetRegistryForTests();
});

describe('scrambler-registry', () => {
  it('an unregistered event is not implemented', () => {
    expect(isImplementedEvent('333')).toBe(false);
    expect(getScrambler('333')).toBeUndefined();
  });

  it('registering an event makes it implemented and retrievable', () => {
    const scramble = () => 'R U F';
    registerScrambler('333', scramble);
    expect(isImplementedEvent('333')).toBe(true);
    expect(getScrambler('333')?.scramble).toBe(scramble);
  });

  it('registering one event does not affect another', () => {
    registerScrambler('333', () => 'R');
    expect(isImplementedEvent('222')).toBe(false);
  });

  it('re-registering an event replaces the previous scrambler', () => {
    registerScrambler('333', () => 'first');
    registerScrambler('333', () => 'second');
    expect(getScrambler('333')?.scramble(noopRandom, {})).toBe('second');
  });

  /**
   * Quality is per-event because it genuinely differs: WCA Regulation 4b3e
   * specifies random-*moves* for 5x5x5, 6x6x6, 7x7x7 and Megaminx. Defaulting
   * to random-state keeps every other registration honest without repetition,
   * but the random-moves events must say so or `generateScramble` would
   * report a stronger claim than was actually made.
   */
  it('defaults quality to random-state and carries an explicit one through', () => {
    registerScrambler('333', () => 'R');
    expect(getScrambler('333')?.quality).toBe('random-state');

    registerScrambler('minx', () => 'R++', 'random-moves');
    expect(getScrambler('minx')?.quality).toBe('random-moves');
  });

  it('implementedEvents lists exactly what is registered, in registration order', () => {
    expect(implementedEvents()).toEqual([]);
    registerScrambler('333', () => 'R');
    registerScrambler('222', () => 'U');
    expect(implementedEvents()).toEqual(['333', '222']);
  });
});
