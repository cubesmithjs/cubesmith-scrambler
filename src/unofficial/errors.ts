import type { UnofficialEventId } from './types';

/** Thrown by the unofficial entry for an event it has no scrambler for. */
export class UnimplementedUnofficialEventError extends Error {
  readonly event: UnofficialEventId;

  constructor(event: UnofficialEventId) {
    super(`@cubesmith/scrambler/unofficial: no scrambler is registered for event "${event}"`);
    this.name = 'UnimplementedUnofficialEventError';
    this.event = event;
  }
}

/** Thrown by `generateUnofficialScrambles` for a batch size outside `1..MAX_BATCH_COUNT`. */
export class InvalidUnofficialScrambleCountError extends Error {
  readonly event: UnofficialEventId;
  readonly count: number;

  constructor(event: UnofficialEventId, count: number, reason: string) {
    super(
      `@cubesmith/scrambler/unofficial: count ${count} is not valid for event "${event}" — ${reason}`,
    );
    this.name = 'InvalidUnofficialScrambleCountError';
    this.event = event;
    this.count = count;
  }
}
