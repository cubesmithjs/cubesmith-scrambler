import { describe, expect, it } from 'vitest';
import {
  AMOUNTS,
  FACES,
  inverseMove,
  inverseMoves,
  moveToString,
  movesToString,
  parseMove,
  type FaceMove,
} from './move';

describe('moveToString', () => {
  it('renders a quarter turn with no suffix', () => {
    expect(moveToString({ face: 'R', amount: 1 })).toBe('R');
  });

  it('renders a half turn with a "2" suffix', () => {
    expect(moveToString({ face: 'U', amount: 2 })).toBe('U2');
  });

  it("renders a counterclockwise quarter turn with a prime suffix", () => {
    expect(moveToString({ face: 'F', amount: 3 })).toBe("F'");
  });
});

describe('parseMove', () => {
  it('round-trips every face/amount combination through moveToString', () => {
    for (const face of FACES) {
      for (const amount of AMOUNTS) {
        const move: FaceMove = { face, amount };
        expect(parseMove(moveToString(move))).toEqual(move);
      }
    }
  });

  it('throws on an invalid token', () => {
    expect(() => parseMove('X')).toThrow();
    expect(() => parseMove('R3')).toThrow();
    expect(() => parseMove('')).toThrow();
  });
});

describe('movesToString', () => {
  it('space-separates a move sequence', () => {
    const moves: FaceMove[] = [
      { face: 'R', amount: 1 },
      { face: 'U', amount: 3 },
      { face: 'R', amount: 3 },
    ];
    expect(movesToString(moves)).toBe("R U' R'");
  });

  it('renders an empty sequence as an empty string', () => {
    expect(movesToString([])).toBe('');
  });
});

describe('inverseMove', () => {
  it('inverts a quarter turn to the opposite quarter turn', () => {
    expect(inverseMove({ face: 'R', amount: 1 })).toEqual({ face: 'R', amount: 3 });
    expect(inverseMove({ face: 'R', amount: 3 })).toEqual({ face: 'R', amount: 1 });
  });

  it('a half turn is its own inverse', () => {
    expect(inverseMove({ face: 'U', amount: 2 })).toEqual({ face: 'U', amount: 2 });
  });

  it('is a true involution for every face/amount', () => {
    for (const face of FACES) {
      for (const amount of AMOUNTS) {
        const move: FaceMove = { face, amount };
        expect(inverseMove(inverseMove(move))).toEqual(move);
      }
    }
  });
});

describe('inverseMoves', () => {
  it('reverses order and inverts each move', () => {
    const moves: FaceMove[] = [
      { face: 'R', amount: 1 },
      { face: 'U', amount: 1 },
    ];
    expect(inverseMoves(moves)).toEqual([
      { face: 'U', amount: 3 },
      { face: 'R', amount: 3 },
    ]);
  });

  it('does not mutate the input array', () => {
    const moves: FaceMove[] = [{ face: 'R', amount: 1 }];
    const original = [...moves];
    inverseMoves(moves);
    expect(moves).toEqual(original);
  });
});
