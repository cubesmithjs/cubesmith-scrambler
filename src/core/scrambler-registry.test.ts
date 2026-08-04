import { afterEach, describe, expect, it } from 'vitest';
import { createRandomSource } from '../random/random-source';
import {
  _resetRegistryForTests,
  getScrambler,
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
    const scrambler = () => 'R U F';
    registerScrambler('333', scrambler);
    expect(isImplementedEvent('333')).toBe(true);
    expect(getScrambler('333')).toBe(scrambler);
  });

  it('registering one event does not affect another', () => {
    registerScrambler('333', () => 'R');
    expect(isImplementedEvent('222')).toBe(false);
  });

  it('re-registering an event replaces the previous scrambler', () => {
    registerScrambler('333', () => 'first');
    registerScrambler('333', () => 'second');
    expect(getScrambler('333')?.(noopRandom, {})).toBe('second');
  });
});
