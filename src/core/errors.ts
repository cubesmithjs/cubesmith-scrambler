import type { WcaEventId } from './types';

/**
 * Thrown by `generateScramble()` for any event not yet registered. An
 * honest, typed failure — never a fake or placeholder scramble — for the
 * events this package doesn't implement yet.
 */
export class UnimplementedEventError extends Error {
  readonly event: WcaEventId;

  constructor(event: WcaEventId) {
    super(`@cubesmith/scrambler: no scrambler is registered for event "${event}" yet`);
    this.name = 'UnimplementedEventError';
    this.event = event;
  }
}

/**
 * Thrown by `generateScramble()` when `options.count` is not usable for the
 * event asked for.
 *
 * Two distinct causes, deliberately sharing one error: the event does not do
 * multi-scramble at all, or the number itself is out of range. Both mean "this
 * call cannot be answered as written", and both are caller mistakes rather
 * than a missing feature — which is why `count` on `333` is an error and not a
 * silently ignored option. Ignoring it would let a caller believe they had
 * asked for ten scrambles and received one.
 */
export class InvalidScrambleCountError extends Error {
  readonly event: WcaEventId;
  readonly count: number;

  constructor(event: WcaEventId, count: number, reason: string) {
    super(`@cubesmith/scrambler: count ${count} is not valid for event "${event}" — ${reason}`);
    this.name = 'InvalidScrambleCountError';
    this.event = event;
    this.count = count;
  }
}
