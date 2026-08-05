import {
  integerDeterminant,
  invertMatrixMod12,
  multiplyMatrixVectorMod,
} from '../../utils/mod-matrix';
import { CLOCK_HOURS, type ClockPinSet, type ClockToken } from './notation';
import { normalizeHours } from './mechanics';
import {
  applyClockDial,
  CLOCK_DIMENSION,
  SOLVED_CLOCK_STATE,
  toClockVector,
  type ClockState,
} from './state';

/**
 * The official fourteen-token scramble template, and the linear algebra that
 * makes it a coordinate system.
 *
 * Nine dial tokens are performed on the near side, then `y2` turns the
 * puzzle over and five more are performed on the far side. The far side only
 * needs five because the four corner clocks pass through the puzzle and were
 * already set by the first four tokens — which is exactly why the template
 * has fourteen amounts for fourteen independent dials.
 *
 * Each token's effect vector is *measured* by applying it to a solved
 * puzzle, not written down: `TEMPLATE_MATRIX` is built by running each token
 * through `applyClockDial` and reading off the result. So the matrix can
 * only be wrong if the mechanical model in `state.ts` is, and
 * `template.test.ts` then checks the matrix against the puzzle's published
 * facts rather than against itself.
 */

export const FRONT_TEMPLATE: readonly ClockPinSet[] = [
  'UR',
  'DR',
  'DL',
  'UL',
  'U',
  'R',
  'D',
  'L',
  'ALL',
];

export const BACK_TEMPLATE: readonly ClockPinSet[] = ['U', 'R', 'D', 'L', 'ALL'];

export const TEMPLATE_LENGTH = FRONT_TEMPLATE.length + BACK_TEMPLATE.length; // 14

/** `TEMPLATE_MATRIX[i]` is the state vector one hour of template token `i` produces from solved. */
export const TEMPLATE_MATRIX: readonly (readonly number[])[] = [
  ...FRONT_TEMPLATE.map((pins) => toClockVector(applyClockDial(SOLVED_CLOCK_STATE, pins, 1, false))),
  ...BACK_TEMPLATE.map((pins) => toClockVector(applyClockDial(SOLVED_CLOCK_STATE, pins, 1, true))),
];

/**
 * The determinant of the template's effect matrix. It comes out ±1 — the
 * template is *unimodular*, so it is a basis over the integers and therefore
 * over `Z12` too. Every one of the 12^14 states is reachable, by exactly one
 * choice of the fourteen amounts.
 */
export const TEMPLATE_DETERMINANT = integerDeterminant(TEMPLATE_MATRIX);

let inverse: number[][] | null = null;

function templateInverse(): number[][] {
  return (inverse ??= invertMatrixMod12(TEMPLATE_MATRIX));
}

/**
 * The fourteen amounts that reproduce `state` from solved.
 *
 * A scramble applies `Σ amountᵢ · rowᵢ`, so the state vector is
 * `TEMPLATE_MATRIXᵀ · amounts` and recovering the amounts is one multiply by
 * the transpose's inverse.
 */
export function templateAmountsFor(state: ClockState): number[] {
  const transposeInverse = transpose(templateInverse());
  return multiplyMatrixVectorMod(transposeInverse, toClockVector(state), CLOCK_HOURS);
}

/** The amounts that take `state` back to solved — the negation of the ones that produce it. */
export function templateAmountsToSolve(state: ClockState): number[] {
  return templateAmountsFor(state).map((amount) => normalizeHours(-amount));
}

function transpose(matrix: readonly (readonly number[])[]): number[][] {
  return matrix[0]!.map((_, j) => matrix.map((row) => row[j]!));
}

/** The template rendered as tokens with the given amounts, `y2` in its place. */
export function templateTokens(amounts: readonly number[]): ClockToken[] {
  if (amounts.length !== TEMPLATE_LENGTH) {
    throw new Error(`clock-template: expected ${TEMPLATE_LENGTH} amounts, got ${amounts.length}`);
  }
  const tokens: ClockToken[] = FRONT_TEMPLATE.map((pins, i) => ({
    kind: 'dial' as const,
    pins,
    amount: normalizeHours(amounts[i]!),
  }));
  tokens.push({ kind: 'flip' });
  BACK_TEMPLATE.forEach((pins, i) => {
    tokens.push({
      kind: 'dial',
      pins,
      amount: normalizeHours(amounts[FRONT_TEMPLATE.length + i]!),
    });
  });
  return tokens;
}

export { CLOCK_DIMENSION };
