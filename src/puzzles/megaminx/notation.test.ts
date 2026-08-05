import { describe, expect, it } from 'vitest';
import {
  allMovesMegaminx,
  inverseMegaminxMove,
  inverseMegaminxMoves,
  MEGAMINX_MOVE_KINDS,
  megaminxMovesToString,
  megaminxMoveToString,
  parseMegaminxMove,
  type MegaminxMove,
} from './notation';

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
