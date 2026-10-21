/**
 * Darkens a colour by `factor` in `[0, 1]`: the Lambert term of the shape-mod
 * views. Only hex colours (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) can be
 * shaded, since there is no named-colour table in the package. A named colour,
 * `none` or `transparent` passes through unshaded. The default schemes are all
 * hex, and the outlines still separate the faces of a caller-supplied named
 * colour.
 */
export function shadeColor(color: string, factor: number): string {
  const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color);
  if (!match) return color;
  let hex = match[1]!;
  if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('');
  const channel = (i: number): string =>
    Math.round(Number.parseInt(hex.slice(i, i + 2), 16) * factor)
      .toString(16)
      .padStart(2, '0');
  const alpha = hex.length === 8 ? hex.slice(6, 8) : '';
  return `#${channel(0)}${channel(2)}${channel(4)}${alpha}`;
}
