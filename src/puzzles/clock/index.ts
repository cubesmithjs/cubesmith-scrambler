/**
 * Internal barrel for the Rubik's Clock module. `registerClockScrambler()` is
 * the intentional bridge to the public API.
 */
export {
  CLOCK_CORNERS,
  CLOCK_HOURS,
  CLOCK_PIN_SETS,
  clockAmountToString,
  clockTokensToString,
  clockTokenToString,
  parseClockAmount,
  parseClockScramble,
  PIN_SET_CORNERS,
  type ClockCorner,
  type ClockPinSet,
  type ClockToken,
} from './notation';
export { drivenSlots, drivenSlotsForPinSet, normalizeHours } from './mechanics';
export {
  applyClockDial,
  applyClockTokens,
  applyClockTurn,
  CLOCK_DIMENSION,
  clockStatesEqual,
  cornerReadingsConsistent,
  fromClockVector,
  isSolvedClock,
  mirrorCorner,
  SOLVED_CLOCK_STATE,
  toClockVector,
  type ClockState,
} from './state';
export { clockSolveDistanceCappedAtTwo, randomClockState } from './random-state';
export {
  TEMPLATE_DETERMINANT,
  TEMPLATE_LENGTH,
  TEMPLATE_MATRIX,
  templateAmountsFor,
  templateAmountsToSolve,
  templateTokens,
} from './template';
export {
  clockScrambleTokens,
  closingPinDeclaration,
  generateClockScramble,
  MIN_CLOCK_SOLVE_DISTANCE,
  registerClockScrambler,
  solveClock,
} from './solve';
