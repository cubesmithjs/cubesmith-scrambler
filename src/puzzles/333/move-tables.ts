import { deriveBaseMoveTable, type BaseMoveTable } from './geometry';
import { AMOUNTS, FACES, type Amount, type FaceMove } from '../../notation/move';

export type { Amount, FaceMove };

export interface MoveTable extends FaceMove {
  readonly cornerDestination: readonly number[];
  readonly cornerTwist: readonly number[];
  readonly edgeDestination: readonly number[];
  readonly edgeFlip: readonly number[];
}

export { AMOUNTS, FACES };

/**
 * Composes a base (quarter-turn) table with itself `times` times — deriving
 * the half-turn and counterclockwise-quarter-turn tables from the single
 * geometrically-derived quarter turn, rather than re-deriving (and
 * re-risking a transcription error for) all 18 moves independently.
 */
function composeSelf(base: BaseMoveTable, times: 1 | 2 | 3): MoveTable {
  let cornerDestination = [...base.cornerDestination];
  let cornerTwist: number[] = base.cornerDestination.map(() => 0);
  let edgeDestination = [...base.edgeDestination];
  let edgeFlip: number[] = base.edgeDestination.map(() => 0);

  // Start from identity and apply the base move `times` times.
  for (let i = 0; i < base.cornerDestination.length; i += 1) {
    cornerDestination[i] = i;
  }
  for (let i = 0; i < base.edgeDestination.length; i += 1) {
    edgeDestination[i] = i;
  }

  for (let t = 0; t < times; t += 1) {
    const nextCornerDestination = cornerDestination.map(() => 0);
    const nextCornerTwist = cornerTwist.map(() => 0);
    for (let i = 0; i < cornerDestination.length; i += 1) {
      const mid = cornerDestination[i]!;
      const dest = base.cornerDestination[mid]!;
      nextCornerDestination[i] = dest;
      nextCornerTwist[i] = (cornerTwist[i]! + base.cornerTwist[mid]!) % 3;
    }
    cornerDestination = nextCornerDestination;
    cornerTwist = nextCornerTwist;

    const nextEdgeDestination = edgeDestination.map(() => 0);
    const nextEdgeFlip = edgeFlip.map(() => 0);
    for (let i = 0; i < edgeDestination.length; i += 1) {
      const mid = edgeDestination[i]!;
      const dest = base.edgeDestination[mid]!;
      nextEdgeDestination[i] = dest;
      nextEdgeFlip[i] = (edgeFlip[i]! + base.edgeFlip[mid]!) % 2;
    }
    edgeDestination = nextEdgeDestination;
    edgeFlip = nextEdgeFlip;
  }

  return {
    face: base.face,
    amount: times,
    cornerDestination,
    cornerTwist,
    edgeDestination,
    edgeFlip,
  };
}

function buildMoveTables(): ReadonlyMap<string, MoveTable> {
  const tables = new Map<string, MoveTable>();
  for (const face of FACES) {
    const base = deriveBaseMoveTable(face);
    for (const amount of AMOUNTS) {
      const table = composeSelf(base, amount);
      tables.set(moveKey({ face, amount }), table);
    }
  }
  return tables;
}

export function moveKey(move: FaceMove): string {
  return `${move.face}${move.amount}`;
}

/** Every one of the 18 quarter/half/counterclockwise-quarter face moves, keyed by `${face}${amount}`. */
export const MOVE_TABLES: ReadonlyMap<string, MoveTable> = buildMoveTables();

export function getMoveTable(move: FaceMove): MoveTable {
  const table = MOVE_TABLES.get(moveKey(move));
  if (!table) {
    throw new Error(`move-tables: no table for move ${moveKey(move)}`);
  }
  return table;
}

export function allFaceMoves(): readonly FaceMove[] {
  const moves: FaceMove[] = [];
  for (const face of FACES) {
    for (const amount of AMOUNTS) moves.push({ face, amount });
  }
  return moves;
}
