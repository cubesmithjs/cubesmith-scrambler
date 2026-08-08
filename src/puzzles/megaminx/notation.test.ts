import { describe, expect, it } from 'vitest';
import { ScrambleSyntaxError } from '../../core/scramble-errors';
import { createRandomSource } from '../../random/random-source';
import {
  allMovesMegaminx,
  inverseMegaminxMove,
  inverseMegaminxMoves,
  MEGAMINX_MOVE_KINDS,
  megaminxMovesToString,
  megaminxMoveToString,
  parseMegaminxMove,
  parseMegaminxScramble,
  type MegaminxMove,
} from './notation';
import { generateMegaminxScramble } from './solve';

const ALL = allMovesMegaminx();

describe('megaminxMoveToString', () => {
  it('renders U with a prime but R and D with ++ / --', () => {
    expect(megaminxMoveToString({ kind: 'U', direction: 1 })).toBe('U');
    expect(megaminxMoveToString({ kind: 'U', direction: 2 })).toBe("U'");
    expect(megaminxMoveToString({ kind: 'R', direction: 1 })).toBe('R++');
    expect(megaminxMoveToString({ kind: 'R', direction: 2 })).toBe('R--');
    expect(megaminxMoveToString({ kind: 'D', direction: 1 })).toBe('D++');
    expect(megaminxMoveToString({ kind: 'D', direction: 2 })).toBe('D--');
  });

  it('joins a sequence with single spaces', () => {
    expect(
      megaminxMovesToString([
        { kind: 'R', direction: 1 },
        { kind: 'D', direction: 2 },
        { kind: 'U', direction: 2 },
      ]),
    ).toBe("R++ D-- U'");
  });
});

describe('parseMegaminxMove', () => {
  it('round-trips all six tokens', () => {
    expect(ALL).toHaveLength(6);
    for (const move of ALL) {
      expect(parseMegaminxMove(megaminxMoveToString(move))).toEqual(move);
    }
  });

  it('rejects anything that is not one of the six', () => {
    // Notably `U++` and `R'` are both wrong: `U` turns one layer by one fifth
    // and takes a prime, while `R` turns the bulk by two fifths and takes ++/--.
    for (const bad of ['', 'U++', "R'", 'R+', 'R+++', 'R2', 'F++', 'u', ' U', 'D']) {
      expect(() => parseMegaminxMove(bad)).toThrow();
    }
  });
});

describe('inversion', () => {
  it('is an involution that keeps the kind', () => {
    for (const move of ALL) {
      const inverted = inverseMegaminxMove(move);
      expect(inverted.kind).toBe(move.kind);
      expect(inverted.direction).not.toBe(move.direction);
      expect(inverseMegaminxMove(inverted)).toEqual(move);
    }
  });

  it('reverses a sequence as well as each move', () => {
    expect(
      megaminxMovesToString(
        inverseMegaminxMoves([
          { kind: 'R', direction: 1 },
          { kind: 'D', direction: 2 },
          { kind: 'U', direction: 1 },
        ] satisfies MegaminxMove[]),
      ),
    ).toBe("U' D++ R--");
  });
});

describe('allMovesMegaminx', () => {
  it('is exactly the three kinds in both directions', () => {
    expect(MEGAMINX_MOVE_KINDS).toEqual(['U', 'R', 'D']);
    expect(new Set(ALL.map(megaminxMoveToString))).toEqual(
      new Set(['U', "U'", 'R++', 'R--', 'D++', 'D--']),
    );
  });
});

describe('parseMegaminxScramble', () => {
  it('reads a scramble the package itself generated', () => {
    const scramble = generateMegaminxScramble(createRandomSource('validate-minx'));
    const moves = parseMegaminxScramble(scramble);
    expect(moves).toHaveLength(scramble.split(' ').length);
    // Nothing dropped, and nothing re-spelled: the package's own output is
    // already canonical, so it must come back byte-identical.
    expect(megaminxMovesToString(moves)).toBe(scramble);
  });

  it('agrees with the cube path that empty input is an empty scramble', () => {
    expect(parseMegaminxScramble('')).toEqual([]);
    expect(parseMegaminxScramble('   ')).toEqual([]);
  });

  it('is tolerant about separators, since a pasted scramble may wrap', () => {
    expect(parseMegaminxScramble('R++\tD--\n U')).toEqual([
      { kind: 'R', direction: 1 },
      { kind: 'D', direction: 2 },
      { kind: 'U', direction: 1 },
    ] satisfies MegaminxMove[]);
  });

  /** `X++` names a move that does not exist. */
  it('reports megaminx-not-a-move with the offset, the span and the character', () => {
    const error = expectMegaminxFailure('R++ X++ U');
    expect(error.reason).toBe('megaminx-not-a-move');
    expect(error.offset).toBe(4);
    expect(error.length).toBe(3);
    expect(error.char).toBe('X');
    expect(error.token).toBe('X++');
    expect(error.notation).toBe('megaminx');
    expect(error.input).toBe('R++ X++ U');
  });

  /** `R+++` names one that does, and spells its direction wrong. */
  it('reports megaminx-bad-direction separately, which the single English sentence could not', () => {
    const error = expectMegaminxFailure('R+++');
    expect(error.reason).toBe('megaminx-bad-direction');
    expect(error.offset).toBe(0);
    expect(error.length).toBe(4);
    expect(error.token).toBe('R+++');

    // `U` takes a prime and `R`/`D` take ++/--, so each spelled with the
    // other's direction is the same mistake.
    expect(expectMegaminxFailure('U++').reason).toBe('megaminx-bad-direction');
    expect(expectMegaminxFailure("R'").reason).toBe('megaminx-bad-direction');
  });

  /**
   * A parser that reported 0 for everything would pass a single-token test, so
   * the offset is asserted in the middle of a real-length scramble and at its
   * end.
   */
  it('reports the offset of the offending token, not of the first one', () => {
    const scramble = 'R++ D-- U R-- D++ Z U';
    expect(expectMegaminxFailure(scramble).offset).toBe(18);
    expect(scramble.slice(18, 19)).toBe('Z');

    // Leading whitespace must not shift it either.
    expect(expectMegaminxFailure('  Z').offset).toBe(2);
  });
});

function expectMegaminxFailure(text: string): ScrambleSyntaxError {
  try {
    parseMegaminxScramble(text);
  } catch (error) {
    expect(error).toBeInstanceOf(ScrambleSyntaxError);
    return error as ScrambleSyntaxError;
  }
  throw new Error(`expected "${text}" to be rejected`);
}
