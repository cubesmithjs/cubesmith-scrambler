import { describe, expect, it } from 'vitest';
import { CLOCK_DEFAULT_SCHEME, CLOCK_IMAGE_HEIGHT, CLOCK_IMAGE_WIDTH } from './clock';
import { MEGAMINX_DEFAULT_SCHEME, MEGAMINX_FACE_NAMES } from './megaminx';
import { PYRAMINX_DEFAULT_SCHEME } from './pyraminx';
import { SKEWB_DEFAULT_SCHEME } from './skewb';
import { SQUARE1_DEFAULT_SCHEME } from './square1';
import { drawScramble } from './index';
import { corpusFor } from './__tests__/corpus';
import {
  colourMultiset,
  differingIndices,
  faceCounts,
  fillSequence,
  hasContiguousFaceRuns,
  square1SideRing,
  withinBounds,
} from './__tests__/invariants';

/**
 * 🔴 This file imports **no scrambler** — see `cube.test.ts`'s note and
 * `__tests__/corpus.ts` for why. Eight Square-1 scrambles cost nothing to *draw* and
 * would have cost a two-phase search each to *generate*; the generating version of
 * this suite timed out at 180 s under `--coverage`.
 */

const solvedFills = (event: Parameters<typeof drawScramble>[0]): string =>
  fillSequence(drawScramble(event, ''));

describe('Clock', () => {
  it('sizes the image from TNoodle\'s formula, computed here', () => {
    const radius = 70;
    const gap = 5;
    const image = drawScramble('clock', '');
    expect(image.width).toBe(4 * (radius + gap));
    expect(image.height).toBe(2 * (radius + gap));
    expect([image.width, image.height]).toEqual([CLOCK_IMAGE_WIDTH, CLOCK_IMAGE_HEIGHT]);
  });

  it('draws both sides: two panels of nine dials, each with twelve ticks, plus the hands and pins', () => {
    const image = drawScramble('clock', '');
    // Per panel: 4 corner outlines + 1 panel disc + 4 inner discs + 9 dial faces +
    // 9*12 ticks = 126. Two panels, 18 hands drawn as four shapes each, 8 pins.
    expect(image.shapes).toHaveLength(2 * 126 + 18 * 4 + 8);
    expect(withinBounds(image)).toBe(true);
  });

  it('draws a solved clock in the scheme\'s own dial colours', () => {
    const counts = faceCounts(drawScramble('clock', ''));
    // Nine dial faces and 9*11 ordinary ticks per side wear `…Clock`; the twelve
    // o'clock tick of each dial wears `…TopClock`, which is how a reader tells which
    // way up a dial is.
    expect(counts.FrontClock).toBe(9 + 9 * 11);
    expect(counts.FrontTopClock).toBe(9);
    expect(counts.BackClock).toBe(9 + 9 * 11);
    expect(counts.BackTopClock).toBe(9);
    expect(counts.FrontPin).toBe(4);
    expect(counts.BackPin).toBe(4);
  });

  it('overrides only the keys it is given', () => {
    const image = drawScramble('clock', '', { FrontTopClock: '#abcdef' });
    const fills = new Set(image.shapes.map((s) => s.fill));
    expect(fills.has('#abcdef')).toBe(true);
    expect(fills.has(CLOCK_DEFAULT_SCHEME.FrontTopClock!)).toBe(false);
    expect(fills.has(CLOCK_DEFAULT_SCHEME.BackTopClock!)).toBe(true);
  });

  it('returns to the solved picture under a scramble and its inverse', () => {
    expect(fillSequence(drawScramble('clock', 'UR3+ DR2- y2 ALL1+ ALL1- y2 DR2+ UR3-'))).toBe(
      solvedFills('clock'),
    );
  });

  it('🔴 swaps which panel is which side when the scramble ends flipped', () => {
    // TNoodle's left panel is whichever side faces the solver when the scramble
    // ends, and an official Clock scramble contains exactly one `y2`. This package's
    // state normalises to the front frame instead, so the flip count is the one bit
    // the drawing has to recover — dropping it draws the two sides swapped on every
    // real scramble.
    const unflipped = drawScramble('clock', 'UR1+');
    const flipped = drawScramble('clock', 'UR1+ y2');
    expect(fillSequence(flipped)).not.toBe(fillSequence(unflipped));
    // A double flip is back to the original frame, and a `y2 y2` moves nothing.
    expect(fillSequence(drawScramble('clock', 'UR1+ y2 y2'))).toBe(fillSequence(unflipped));
  });

  it('ignores pin positions, exactly as TNoodle does', () => {
    // TNoodle's `ClockState` is eighteen dial readings and carries no pin positions,
    // so each panel's four pins take one colour that says which side you are looking
    // at. This package *does* model `pinsUp`, and the drawing deliberately does not
    // show it — drawing it would be a picture no official sheet shows.
    expect(fillSequence(drawScramble('clock', 'UR'))).toBe(solvedFills('clock'));
  });

  it('keeps the colour multiset invariant under a real scramble', () => {
    for (const scramble of corpusFor('clock')) {
      expect(colourMultiset(drawScramble('clock', scramble)), scramble).toBe(
        colourMultiset(drawScramble('clock', '')),
      );
      expect(fillSequence(drawScramble('clock', scramble)), scramble).not.toBe(solvedFills('clock'));
      expect(withinBounds(drawScramble('clock', scramble)), scramble).toBe(true);
    }
  });

  /**
   * 🔴 The drawing is unchanged by the 0.14 format change.
   *
   * The corpus was captured while the scrambler still appended trailing pin
   * names, so every clock entry in it is a scramble in the old format — which
   * makes it exactly the fixture this needs. Stripping the tail gives the string
   * the scrambler emits today, and the two must draw the same picture, because
   * the drawing reads dials and the flip count and nothing else.
   */
  it('draws the fifteen-token form identically to the old pins-included one', () => {
    const withoutTrailingPins = (scramble: string): string =>
      scramble.replace(/(?: (?:UR|DR|DL|UL))+$/, '');

    const legacy = corpusFor('clock').filter((s) => withoutTrailingPins(s) !== s);
    expect(legacy.length, 'the clock corpus no longer holds an old-format scramble').toBeGreaterThan(
      0,
    );
    for (const scramble of legacy) {
      expect(fillSequence(drawScramble('clock', withoutTrailingPins(scramble))), scramble).toBe(
        fillSequence(drawScramble('clock', scramble)),
      );
    }
  });
});

describe('Pyraminx', () => {
  it('sizes the image from TNoodle\'s formula, computed here', () => {
    const pieceSize = 30;
    const gap = 5;
    const image = drawScramble('pyram', '');
    expect(image.width).toBe(2 * 3 * pieceSize + 4 * gap);
    expect(image.height).toBe(Math.trunc(2 * 1.5 * Math.sqrt(3) * pieceSize + 3 * gap));
  });

  it('draws 36 stickers — four faces of nine, tips included', () => {
    // 🔴 36, not 40. Each face's nine regions are three tip, three axial and three
    // edge stickers; the tips live *inside* the nine-per-face count, which is what
    // `02-tnoodle-drawing-spec.md` §4 means by "tips are drawn as part of the corner
    // regions". Task 05's acceptance arithmetic (`4*9 + 4`) double-counts them.
    expect(drawScramble('pyram', '').shapes).toHaveLength(36);
  });

  it('draws the empty scramble as four single-coloured faces, in its own scheme', () => {
    expect(faceCounts(drawScramble('pyram', ''))).toEqual({ F: 9, D: 9, L: 9, R: 9 });
    for (const shape of drawScramble('pyram', '').shapes) {
      expect(shape.fill).toBe(PYRAMINX_DEFAULT_SCHEME[shape.face!]);
    }
  });

  it('🔴 draws the tips, so a tip-only scramble changes exactly the tip stickers', () => {
    // Most Pyraminx scrambles end in tip moves, so a picture that ignored them would
    // be wrong for nearly every real scramble — and wrong in a way that still looks
    // like a Pyraminx.
    const differing = differingIndices(drawScramble('pyram', ''), drawScramble('pyram', 'l r b'));
    expect(differing).toHaveLength(9);
    // Region index within a face: 0, 3 and 6 are the three corner (tip) regions.
    expect(differing.every((i) => [0, 3, 6].includes(i % 9))).toBe(true);
  });

  it('returns to the solved picture under a scramble and its inverse, over the whole corpus', () => {
    for (const scramble of corpusFor('pyram')) {
      expect(
        fillSequence(drawScramble('pyram', `${scramble} ${invertPyraminx(scramble)}`)),
        scramble,
      ).toBe(solvedFills('pyram'));
      expect(colourMultiset(drawScramble('pyram', scramble)), scramble).toBe(
        colourMultiset(drawScramble('pyram', '')),
      );
      expect(fillSequence(drawScramble('pyram', scramble)), scramble).not.toBe(solvedFills('pyram'));
    }
  });

  it('keeps every sticker inside the image', () => {
    for (const scramble of corpusFor('pyram')) {
      expect(withinBounds(drawScramble('pyram', scramble)), scramble).toBe(true);
    }
  });
});

describe('Skewb', () => {
  it('sizes the image from TNoodle\'s formula, computed here', () => {
    const pieceSize = 30;
    const gap = 3;
    const sq3d2 = Math.sqrt(3) / 2;
    const image = drawScramble('skewb', '');
    expect(image.width).toBe(Math.ceil((3 * gap + 8 * pieceSize + 1) * sq3d2));
    expect(image.height).toBe(Math.ceil(2 * gap + 6 * pieceSize + 1));
  });

  it('draws 30 stickers — six faces of five', () => {
    expect(drawScramble('skewb', '').shapes).toHaveLength(30);
    expect(faceCounts(drawScramble('skewb', ''))).toEqual({ U: 5, R: 5, F: 5, D: 5, L: 5, B: 5 });
  });

  it('🔴 uses its OWN colours, not the cube\'s — pinned so a "consistency" cleanup fails', () => {
    expect(SKEWB_DEFAULT_SCHEME).toEqual({
      U: '#ffffff',
      R: '#0000ff',
      F: '#ff0000',
      D: '#ffff00',
      L: '#00ff00',
      B: '#ff8000',
    });
  });

  it('🔴 moves exactly the stickers a physical Skewb\'s R move moves, by named slot', () => {
    // A Skewb `R` turns the half of the puzzle around one corner, so it carries
    // three face centres with it — and TNoodle's own `turn(axis=0)` names them: the
    // centres of F, D and R. Nothing else's centre moves.
    const solved = drawScramble('skewb', '');
    const turned = drawScramble('skewb', 'R');
    const centreOf = (image: typeof solved, faceIndex: number): string =>
      image.shapes[faceIndex * 5]!.face!;
    // Faces are drawn in `U R F D L B` order, five shapes each, centre first.
    const names = ['U', 'R', 'F', 'D', 'L', 'B'];
    const movedCentres = names.filter((_, i) => centreOf(solved, i) !== centreOf(turned, i));
    expect(movedCentres.sort()).toEqual(['D', 'F', 'R']);
    // U, L and B keep their own centre colour.
    for (const face of ['U', 'L', 'B']) {
      expect(centreOf(turned, names.indexOf(face)), face).toBe(face);
    }
  });

  it('returns to the solved picture under a scramble and its inverse, over the whole corpus', () => {
    for (const scramble of corpusFor('skewb')) {
      expect(
        fillSequence(drawScramble('skewb', `${scramble} ${invertSkewb(scramble)}`)),
        scramble,
      ).toBe(solvedFills('skewb'));
      expect(colourMultiset(drawScramble('skewb', scramble)), scramble).toBe(
        colourMultiset(drawScramble('skewb', '')),
      );
      expect(fillSequence(drawScramble('skewb', scramble)), scramble).not.toBe(solvedFills('skewb'));
    }
  });

  it('keeps every sticker inside the image, and no two identical polygons', () => {
    for (const scramble of corpusFor('skewb')) {
      const image = drawScramble('skewb', scramble);
      expect(withinBounds(image), scramble).toBe(true);
      const outlines = new Set(
        image.shapes.map((s) => (s.kind === 'polygon' ? JSON.stringify(s.points) : 'other')),
      );
      expect(outlines.size, scramble).toBe(30);
    }
  });
});

describe('Megaminx', () => {
  it('sizes the image from TNoodle\'s trigonometric formula, computed here', () => {
    const gap = 2;
    const minxRad = 30;
    const unfoldHeight = 2 + 3 * Math.sin(0.3 * Math.PI) + Math.sin(0.1 * Math.PI);
    const unfoldWidth = 4 * Math.cos(0.1 * Math.PI) + 2 * Math.cos(0.3 * Math.PI);
    const image = drawScramble('minx', '');
    expect(image.width).toBe(Math.trunc(unfoldWidth * 2 * minxRad + 3 * gap));
    expect(image.height).toBe(Math.trunc(unfoldHeight * minxRad + 2 * gap));
  });

  it('draws 132 regions — twelve faces of eleven', () => {
    expect(drawScramble('minx', '').shapes).toHaveLength(12 * 11);
  });

  it('🔴 exposes the exact twelve-key colour-scheme key set, which is public contract', () => {
    expect(Object.keys(MEGAMINX_DEFAULT_SCHEME).sort()).toEqual([...MEGAMINX_FACE_NAMES].sort());
    expect(MEGAMINX_FACE_NAMES).toEqual([
      'U', 'BL', 'BR', 'R', 'F', 'L', 'D', 'DR', 'DBR', 'B', 'DBL', 'DL',
    ]);
  });

  it('draws the empty scramble as twelve single-coloured faces', () => {
    const counts = faceCounts(drawScramble('minx', ''));
    expect(Object.keys(counts).sort()).toEqual([...MEGAMINX_FACE_NAMES].sort());
    expect(Object.values(counts)).toEqual(Array.from({ length: 12 }, () => 11));
    for (const shape of drawScramble('minx', '').shapes) {
      expect(shape.fill).toBe(MEGAMINX_DEFAULT_SCHEME[shape.face!]);
    }
  });

  it('🔴 changes only the U face\'s outer regions and its five neighbours\' adjacent runs, on a U token', () => {
    // A `U` turn moves the U layer: U's ten outer regions rotate, its centre does
    // not, and each of the five neighbours has exactly its three U-adjacent stickers
    // replaced. That is 5*3 = 15 recoloured neighbour stickers, and U's own ten stay
    // one colour — so only the neighbours change colour at all.
    const differing = differingIndices(drawScramble('minx', ''), drawScramble('minx', 'U'));
    expect(differing).toHaveLength(15);
    // None of them is on the U face (shapes 0..10) and none is a centre (index % 11 === 10).
    expect(differing.every((i) => i >= 11)).toBe(true);
    expect(differing.every((i) => i % 11 !== 10)).toBe(true);
    expect(fillSequence(drawScramble('minx', "U U'"))).toBe(solvedFills('minx'));
  });

  it('returns to the solved picture under a scramble and its inverse, over the whole corpus', () => {
    for (const scramble of corpusFor('minx')) {
      const label = scramble.slice(0, 24);
      expect(
        fillSequence(drawScramble('minx', `${scramble} ${invertMegaminx(scramble)}`)),
        label,
      ).toBe(solvedFills('minx'));
      expect(colourMultiset(drawScramble('minx', scramble)), label).toBe(
        colourMultiset(drawScramble('minx', '')),
      );
      expect(fillSequence(drawScramble('minx', scramble)), label).not.toBe(solvedFills('minx'));
    }
  });

  it('keeps every region inside the image', () => {
    for (const scramble of corpusFor('minx')) {
      expect(withinBounds(drawScramble('minx', scramble)), scramble.slice(0, 24)).toBe(true);
    }
  });
});

describe('Square-1', () => {
  it('sizes the image from TNoodle\'s formula, computed here', () => {
    const radius = 32;
    const radiusMultiplier = Math.SQRT2 * Math.cos((15 * Math.PI) / 180);
    const multiplier = 1.4;
    const image = drawScramble('sq1', '');
    expect(image.width).toBe(Math.trunc(2 * radiusMultiplier * multiplier * radius));
    expect(image.height).toBe(Math.trunc(4 * radiusMultiplier * multiplier * radius));
    // Two stacked layer views, so it is the one portrait picture in the set.
    expect(image.height).toBe(2 * image.width);
  });

  it('draws the two layer views plus the middle bar', () => {
    const image = drawScramble('sq1', '');
    // Per layer: four corners at three polygons each and four edges at two = 20.
    // Plus the middle bar's two filled rectangles and two stroked outlines.
    expect(image.shapes).toHaveLength(4 + 20 + 20);
    expect(image.shapes.filter((s) => s.kind === 'rect')).toHaveLength(4);
  });

  it('🔴 uses its own scheme — U yellow and D white, the reverse of the cube net', () => {
    expect(SQUARE1_DEFAULT_SCHEME.U).toBe('#ffff00');
    expect(SQUARE1_DEFAULT_SCHEME.D).toBe('#ffffff');
    expect(SQUARE1_DEFAULT_SCHEME.R).toBe('#00ff00');
    expect(SQUARE1_DEFAULT_SCHEME.L).toBe('#0000ff');
  });

  it('shows each layer\'s face colour on the solved puzzle', () => {
    const counts = faceCounts(drawScramble('sq1', ''));
    // Per layer: four corner face polygons and four edge face polygons wear the
    // layer's colour.
    expect(counts.U).toBe(8);
    expect(counts.D).toBe(8);
    // Twenty-four side stickers across both layers, plus the middle bar's two fills
    // (both front, because a solved slice is not flipped).
    expect(counts.L! + counts.B! + counts.R! + counts.F!).toBe(24 + 2);
  });

  it('🔴 keeps every face on ONE contiguous arc while the layers stay intact', () => {
    // A face is a flat side of the puzzle, so as long as no `/` has mixed the two
    // rings, each face's stickers are angularly adjacent within its layer. Nothing
    // that reads the shape list in paint order can see this: a ring walked in the
    // wrong direction, or with a corner's two side stickers swapped, emits exactly
    // the right faces in exactly the right counts and merely puts them in the wrong
    // wedges. `square1SideRing` reads where a sticker actually landed.
    //
    // 🔴 The claim stops at the first `/`, and that is the puzzle, not a hedge: a
    // slice exchanges half of one ring with a *reflected* half of the other, so a
    // face's stickers genuinely do end up scattered around a layer afterwards.
    // `RRBFLLLBBFFR` is the upper ring after a single slice, and it is correct.
    //
    // This is what the lower layer failed for the whole of 0.13–0.14: drawn forwards
    // when it is a mirror view and therefore has to be walked backwards, its wedges
    // read `FLFBLBRBRFRF` on a **solved** puzzle — a plausible-looking ring of
    // colours that is not any state of any Square-1.
    for (const scramble of ['', '(1,0)', '(0,1)', '(6,6)', '(-4,5)', '(3,-2)']) {
      const image = drawScramble('sq1', scramble);
      for (const layer of ['u', 'l'] as const) {
        const ring = square1SideRing(image, layer);
        expect(ring.filter((face) => face !== ''), `${layer} ${scramble}`).toHaveLength(12);
        expect(hasContiguousFaceRuns(ring), `${layer} ${scramble} — ${ring.join('')}`).toBe(true);
      }
    }
  });

  it('🔴 turns each ring rigidly, in the direction that layer is drawn', () => {
    // The general form of the check above, and the one that survives a slice: whatever
    // the state, `(a, b)` must rotate the upper ring `a` wedges and the lower ring `b`
    // wedges, both **clockwise on screen**. Same sign for both, because the lower view
    // is mirrored — which is exactly the fact the lower layer used to get wrong, and
    // it shows up here as a `b` that rotates the wrong way.
    const ringsOf = (scramble: string) => ({
      u: square1SideRing(drawScramble('sq1', scramble), 'u'),
      l: square1SideRing(drawScramble('sq1', scramble), 'l'),
    });
    const rotatedBy = (after: readonly string[], before: readonly string[], by: number) =>
      after.every((face, i) => face === before[(((i - by) % 12) + 12) % 12]);

    for (const base of ['', '(1,0)', '(3,0) / (0,3)', '(-3,2) / (4,-2) / (-1,2)']) {
      const before = ringsOf(base);
      for (const [top, bottom] of [[1, 0], [0, 1], [3, -2], [-4, 5]] as const) {
        const after = ringsOf(`${base ? `${base} ` : ''}(${top},${bottom})`);
        expect(rotatedBy(after.u, before.u, top), `upper ${base} (${top},${bottom})`).toBe(true);
        expect(rotatedBy(after.l, before.l, bottom), `lower ${base} (${top},${bottom})`).toBe(true);
      }
    }
  });

  it('🔴 draws the lower layer as a MIRROR of the upper, not a second copy of it', () => {
    // The upper view looks down at `U`; the lower one looks up at `D`, so it is the
    // same angular frame reflected about the picture's horizontal axis. Wedge `b`
    // spans `[15 + 30b, 45 + 30b)`, and reflecting `a -> -a` sends it to wedge
    // `10 - b`. On a solved puzzle — a cube, corner directly above corner — that
    // reflection is the entire relationship between the two rings.
    const image = drawScramble('sq1', '');
    const upper = square1SideRing(image, 'u');
    const lower = square1SideRing(image, 'l');
    for (let b = 0; b < 12; b += 1) {
      expect(lower[(10 - b + 12) % 12], `wedge ${b}`).toBe(upper[b]);
    }
    // Which puts `F` at the bottom of the upper view and at the top of the lower one,
    // with `L` and `R` staying put — the puzzle tipped towards you, the convention
    // every official sheet uses.
    expect(upper.slice(1, 4)).toEqual(['F', 'F', 'F']);
    expect(lower.slice(7, 10)).toEqual(['F', 'F', 'F']);
    expect(upper.slice(4, 7)).toEqual(['L', 'L', 'L']);
    expect(lower.slice(4, 7)).toEqual(['L', 'L', 'L']);
  });

  it('🔴 puts the cut plane where the middle bar says it is', () => {
    // The bar draws the `F` face split at one corner's width, so it claims the cut
    // bisects `F` — vertical on screen, with the half a `/` moves on the right. That
    // is a claim about the *layer* pictures, and it is only true if the face labels
    // and the start angle agree with `CUT_BOUNDARIES`. Turn the labels a quarter turn
    // without turning the picture back and the solved layer still looks perfect;
    // one `/` later it exchanges the wrong six wedges.
    //
    // Asserted as the exchange itself rather than as "these wedges changed": a slice
    // can land the same colour back in a wedge by chance, so counting what differs
    // understates it. `MOVING_HALF` is the upper's six wedges; the lower's are those
    // reflected, and the slice reflects again, so upper `s` trades with lower `s - 1`.
    const moving = [9, 10, 11, 0, 1, 2];
    const stationary = [3, 4, 5, 6, 7, 8];
    for (const base of ['', '(1,0)', '(3,0) / (0,3)', '(-3,2) / (4,-2) / (-1,2)']) {
      const at = (scramble: string) => ({
        u: square1SideRing(drawScramble('sq1', scramble), 'u'),
        l: square1SideRing(drawScramble('sq1', scramble), 'l'),
      });
      const before = at(base);
      const after = at(`${base ? `${base} ` : ''}/`);
      for (const s of moving) {
        expect(after.u[s], `upper ${s} after ${base} /`).toBe(before.l[(s + 11) % 12]);
        expect(after.l[(s + 11) % 12], `lower ${(s + 11) % 12} after ${base} /`).toBe(before.u[s]);
      }
      for (const s of stationary) {
        expect(after.u[s], `upper ${s} held ${base}`).toBe(before.u[s]);
        expect(after.l[10 - s], `lower ${10 - s} held ${base}`).toBe(before.l[10 - s]);
      }
    }
  });

  it('🔴 draws the slice-parity bit, which a picture can otherwise silently drop', () => {
    // `middleFlipped` is the `x2` in `3678 x 8! x 8! x 2` — the one piece of Square-1
    // state a drawing can lose without looking wrong, and losing it makes two
    // genuinely different states draw identically.
    //
    // Asserted on the middle bar directly rather than by finding two states that
    // differ *only* in the bit: an odd number of slices necessarily moves pieces too,
    // so "differs only in slice parity" is not something a short scramble can be.
    // What the bar shows is the whole claim.
    const solved = drawScramble('sq1', '');
    const sliced = drawScramble('sq1', '/');

    expect(solved.shapes[0]!.face).toBe('F');
    expect(sliced.shapes[0]!.face).toBe('B');
    // And the bar is narrower when the slice is not solved — TNoodle draws the right
    // rectangle as `2*corner_width + edge_width` when solved and
    // `corner_width + edge_width` when not.
    const solvedBar = solved.shapes[0]!;
    const slicedBar = sliced.shapes[0]!;
    if (solvedBar.kind !== 'rect' || slicedBar.kind !== 'rect') throw new Error('expected rects');
    expect(slicedBar.w).toBeLessThan(solvedBar.w);

    // Two slices restore both the pieces and the bit.
    expect(fillSequence(drawScramble('sq1', '/ /'))).toBe(fillSequence(solved));
    expect(differingIndices(solved, sliced).length).toBeGreaterThan(0);
  });

  it('draws a scramble that ends in a slash and one that does not', () => {
    expect(() => drawScramble('sq1', '(-3,-4) / (6,3) /')).not.toThrow();
    expect(() => drawScramble('sq1', '(-3,-4) / (6,3)')).not.toThrow();
    // And both comma spellings draw, since 0.13.0 narrowed only what it *emits*.
    expect(fillSequence(drawScramble('sq1', '(-3,-4) / (6,3)'))).toBe(
      fillSequence(drawScramble('sq1', '(-3, -4) / (6, 3)')),
    );
  });

  it('returns to the solved picture under a scramble and its inverse, over the whole corpus', () => {
    for (const scramble of corpusFor('sq1')) {
      expect(
        fillSequence(drawScramble('sq1', `${scramble} ${invertSquare1(scramble)}`)),
        scramble,
      ).toBe(solvedFills('sq1'));
    }
  });

  it('keeps the piece polygons\' colour multiset invariant — the middle bar excepted, on purpose', async () => {
    // 🔴 Square-1 is the one puzzle where the whole-picture multiset is *not*
    // invariant, and that is a fact about the puzzle rather than a gap in the check.
    // The middle bar is not a sticker that gets permuted: it is one rectangle whose
    // colour is read from `middleFlipped`, so an odd number of slices genuinely
    // repaints it from front to back. Excluding the four bar rectangles and asserting
    // over the forty piece polygons keeps the permutation check exact — and the bar
    // has its own test above.
    const pieceMultiset = (scramble: string): string => {
      const image = drawScramble('sq1', scramble);
      return colourMultiset({ ...image, shapes: image.shapes.filter((s) => s.kind !== 'rect') });
    };
    for (const scramble of corpusFor('sq1')) {
      expect(pieceMultiset(scramble), scramble).toBe(pieceMultiset(''));
    }
  });

  it('always draws forty piece polygons, however the shape changes', () => {
    // A shape-changing puzzle moves pieces between layers, so a *layer* holds a
    // different mix of corners and edges after a scramble. The total is still eight
    // corners at three polygons and eight edges at two — which is also the assertion
    // that caught the double-drawn corner: it read 41 before the walk was fixed.
    for (const scramble of corpusFor('sq1')) {
      const image = drawScramble('sq1', scramble);
      expect(image.shapes.filter((s) => s.kind === 'polygon'), scramble).toHaveLength(8 * 3 + 8 * 2);
      expect(image.shapes.filter((s) => s.kind === 'rect'), scramble).toHaveLength(4);
    }
  });

  it('keeps every piece inside the image', () => {
    for (const scramble of corpusFor('sq1')) {
      expect(withinBounds(drawScramble('sq1', scramble)), scramble).toBe(true);
    }
  });
});

/**
 * Inverses written from each notation's own rules, in the test rather than pulled
 * from the package.
 *
 * Deliberate: a round trip that used the package's own inverter would pass even if
 * *both* the inverter and the drawer shared a mistake about what a move does. These
 * four are three lines each and derive from the notation, not from an implementation.
 */
function invertPyraminx(scramble: string): string {
  return scramble
    .split(/\s+/)
    .filter(Boolean)
    .reverse()
    .map((token) => (token.endsWith("'") ? token.slice(0, -1) : `${token}'`))
    .join(' ');
}

const invertSkewb = invertPyraminx;

function invertMegaminx(scramble: string): string {
  return scramble
    .split(/\s+/)
    .filter(Boolean)
    .reverse()
    .map((token) => {
      if (token.endsWith('++')) return `${token.slice(0, -2)}--`;
      if (token.endsWith('--')) return `${token.slice(0, -2)}++`;
      if (token.endsWith("'")) return token.slice(0, -1);
      return `${token}'`;
    })
    .join(' ');
}

function invertSquare1(scramble: string): string {
  const tokens = scramble.match(/\(-?\d+,\s*-?\d+\)|\//g) ?? [];
  return tokens
    .reverse()
    .map((token) => {
      if (token === '/') return '/'; // a slice is a 180 degree turn, its own inverse
      const [, top, bottom] = /\((-?\d+),\s*(-?\d+)\)/.exec(token)!;
      return `(${-Number(top)},${-Number(bottom)})`;
    })
    .join(' ');
}
