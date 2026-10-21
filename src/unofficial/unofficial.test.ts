import { describe, expect, it } from 'vitest';
import { isImplementedEvent } from '../index';
import type { WcaEventId } from '../core/types';
import {
  generateUnofficialScramble,
  generateUnofficialScrambles,
  InvalidUnofficialScrambleCountError,
  isImplementedUnofficialEvent,
  MAX_BATCH_COUNT,
  NOTATION_OF,
  prepareUnofficialEvent,
  UnimplementedUnofficialEventError,
  unofficialEvents,
  validateUnofficialScramble,
  type UnofficialEventId,
  type UnofficialScrambleQuality,
} from './index';

/**
 * Every member of `UnofficialEventId`, spelled out with its expected quality.
 * The ids are CubeManager's catalogue refs, verbatim, so a consumer can pass an
 * event ref straight through.
 */
const EXPECTED: Readonly<Record<UnofficialEventId, UnofficialScrambleQuality>> = {
  '888': 'random-moves',
  '999': 'random-moves',
  '1010': 'random-moves',
  '1111': 'random-moves',
  '1212': 'random-moves',
  '222bf': 'random-state',
  '666bf': 'random-moves',
  '777bf': 'random-moves',
  pyrambf: 'random-state',
  minxbf: 'random-moves',
  mirror: 'random-state-mechanism',
  axis: 'random-state-mechanism',
  fisher: 'random-state-mechanism',
  windmill: 'random-state-mechanism',
  ghost: 'random-state-mechanism',
  mastermorphix: 'random-state-mechanism',
};
const EVERY_EVENT = Object.keys(EXPECTED) as UnofficialEventId[];

describe('@cubesmith/scrambler/unofficial', () => {
  it('implements all sixteen events, in catalogue order', () => {
    expect(unofficialEvents()).toEqual(EVERY_EVENT);
    for (const event of EVERY_EVENT) expect(isImplementedUnofficialEvent(event)).toBe(true);
  });

  it('uses only ids of the shape a consumer may embed in an activity code', () => {
    for (const event of EVERY_EVENT) expect(event).toMatch(/^[a-z0-9]+$/);
  });

  it('🔴 leaves the main entry answering no for every unofficial id, with both entries loaded', () => {
    for (const event of EVERY_EVENT) {
      expect(isImplementedEvent(event as unknown as WcaEventId), event).toBe(false);
    }
  });

  it('reports the declared quality, and never calls a shape-mod scramble random-state', async () => {
    for (const event of EVERY_EVENT) {
      const result = await generateUnofficialScramble(event, { seed: `quality-${event}` });
      expect(result.event).toBe(event);
      expect(result.quality, event).toBe(EXPECTED[event]);
    }
  });

  it('is deterministic under a seed, and varies without one', async () => {
    const a = await generateUnofficialScramble('888', { seed: 42 });
    const b = await generateUnofficialScramble('888', { seed: 42 });
    const c = await generateUnofficialScramble('888');
    expect(a.moves).toBe(b.moves);
    expect(c.moves).not.toBe(a.moves);
  });

  it('writes every scramble in the notation it declares', async () => {
    for (const event of EVERY_EVENT) {
      const { moves } = await generateUnofficialScramble(event, { seed: `notation-${event}` });
      const validation = validateUnofficialScramble(event, moves);
      expect(validation.valid, `${event}: ${moves}`).toBe(true);
    }
  });

  it('validates against the base notation and reports its errors unchanged', () => {
    expect(NOTATION_OF.minxbf).toBe('minx');
    const megaminx = validateUnofficialScramble('minxbf', 'R++ D-- Q');
    expect(megaminx.valid).toBe(false);
    if (!megaminx.valid) expect(megaminx.notation).toBe('megaminx');
    const cube = validateUnofficialScramble('mirror', "R U (");
    expect(cube.valid).toBe(false);
    if (!cube.valid) expect(cube.notation).toBe('cube');
  });

  it('draws a reproducible batch from one seed, reporting progress', async () => {
    const seen: [number, number][] = [];
    const batch = await generateUnofficialScrambles('pyrambf', 3, {
      seed: 'batch',
      onProgress: (done, total) => {
        seen.push([done, total]);
      },
    });
    const again = await generateUnofficialScrambles('pyrambf', 3, { seed: 'batch' });
    expect(batch.map((r) => r.moves)).toEqual(again.map((r) => r.moves));
    expect(new Set(batch.map((r) => r.moves)).size).toBe(3);
    expect(seen).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('refuses a batch size outside 1..MAX_BATCH_COUNT', async () => {
    for (const count of [0, 1.5, MAX_BATCH_COUNT + 1]) {
      await expect(generateUnofficialScrambles('888', count)).rejects.toBeInstanceOf(
        InvalidUnofficialScrambleCountError,
      );
    }
  });

  it('throws its own error for an id it does not know', async () => {
    const unknown = 'nope' as UnofficialEventId;
    await expect(generateUnofficialScramble(unknown)).rejects.toBeInstanceOf(
      UnimplementedUnofficialEventError,
    );
    await expect(generateUnofficialScrambles(unknown, 1)).rejects.toBeInstanceOf(
      UnimplementedUnofficialEventError,
    );
    await expect(prepareUnofficialEvent(unknown)).rejects.toBeInstanceOf(
      UnimplementedUnofficialEventError,
    );
    expect(isImplementedUnofficialEvent(unknown)).toBe(false);
  });

  it('prepares every event without drawing a scramble', async () => {
    for (const event of EVERY_EVENT) await expect(prepareUnofficialEvent(event)).resolves.toBeUndefined();
  });
});
