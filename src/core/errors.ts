import type { WcaEventId } from './types';

/**
 * Thrown by `generateScramble()` for any event not yet registered. An
 * honest, typed failure — never a fake or placeholder scramble — for the
 * events this package doesn't implement yet.
 */
export class UnimplementedEventError extends Error {
  readonly event: WcaEventId;

  constructor(event: WcaEventId) {
    super(`@cube/scrambler: no scrambler is registered for event "${event}" yet`);
    this.name = 'UnimplementedEventError';
    this.event = event;
  }
}
