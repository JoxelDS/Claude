// WCAG 2.x contrast + a fixer that keeps the hue and moves lightness until the pair passes (build time).
export const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const lum = h => { const [r, g, b] = hex2rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rgb2hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h / 6, s, l]; };
const hsl2hex = ([h, s, l]) => { const f = n => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join(''); };
// returns fg (unchanged if it already passes), else the closest same-hue colour that reaches `min` against bg
export function fixFg(fg, bg, min = 4.5) {
  if (ratio(fg, bg) >= min) return fg;
  const hsl = rgb2hsl(hex2rgb(fg)); const darker = lum(bg) > 0.18;
  for (let i = 1; i <= 100; i++) { const l = Math.max(0, Math.min(1, hsl[2] + (darker ? -i : i) / 100)); const c = hsl2hex([hsl[0], hsl[1], l]); if (ratio(c, bg) >= min) return c; }
  return darker ? '#000000' : '#ffffff';
}
// button: keep the brand fill, choose white/black ink by contrast; if neither reaches 4.5, shift the FILL (keeps hue)
export function fixButton(fill, ink) {
  if (ratio(ink, fill) >= 4.5) return { fill, ink };
  const best = ratio('#ffffff', fill) >= ratio('#111111', fill) ? '#ffffff' : '#111111';
  if (ratio(best, fill) >= 4.5) return { fill, ink: best };
  return { fill: fixFg(fill, best, 4.5), ink: best };
}
