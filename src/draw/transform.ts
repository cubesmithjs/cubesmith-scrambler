/**
 * The 2x3 affine transform TNoodle's `Transform` is, applied eagerly.
 *
 * TNoodle attaches a `Transform` to each shape and lets the SVG renderer apply
 * it. This layer bakes it into the coordinates instead, for one reason that
 * matters: {@link ScrambleImage} promises absolute coordinates in TNoodle's unit
 * space, and a `transform` attribute would make "every shape lies inside
 * `0..width`" — the invariant that actually catches a transposed offset —
 * uncheckable without reimplementing matrix composition inside the test.
 *
 * Column-major like `java.awt.geom.AffineTransform`:
 * `x' = a*x + c*y + e`, `y' = b*x + d*y + f`.
 */
export interface Transform2D {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export const IDENTITY: Transform2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** `outer` applied *after* `inner` — the order `t.translate(...)` then `t.rotate(...)` means in AWT. */
export function compose(outer: Transform2D, inner: Transform2D): Transform2D {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

export function translate(t: Transform2D, dx: number, dy: number): Transform2D {
  return compose(t, { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy });
}

/** `radians` clockwise on screen, matching AWT's y-down convention. */
export function rotate(t: Transform2D, radians: number): Transform2D {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return compose(t, { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 });
}

export function apply(t: Transform2D, x: number, y: number): [number, number] {
  return [t.a * x + t.c * y + t.e, t.b * x + t.d * y + t.f];
}

export function translation(dx: number, dy: number): Transform2D {
  return translate(IDENTITY, dx, dy);
}
