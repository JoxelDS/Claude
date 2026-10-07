// SDX Inspect mark + palette, taken from the app's own UI (src/App.css :root). No Sodexo swoosh/star.
export const C = { navy: '#2A295C', navyDeep: '#1e1d4a', blue: '#283897', red: '#EE0000', green: '#15803D', amber: '#D97706', bg: '#F4F6FB', ink: '#1B1A3D', muted: '#5E6283' };
// The SDX Inspect logo as the app shows it in its header (tools/video/logo-white.svg): a rounded box with a teal check.
// mark(size) = the icon only. onDark: white box on a navy tile; otherwise a navy tile is drawn behind it too (same icon everywhere).
export const TEAL = '#33C3B0';
export const mark = (size, { shadow = false, onDark = false } = {}) => `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle${shadow ? `;filter:drop-shadow(0 ${size / 14}px ${size / 7}px rgba(42,41,92,.35))` : ''}">
${onDark ? '' : `<rect width="100" height="100" rx="24" fill="${C.navy}"/>`}
<rect x="14" y="14" width="72" height="72" rx="19" fill="none" stroke="#fff" stroke-width="8.5"/>
<path d="M32 51 L45 64 L69 37" fill="none" stroke="${TEAL}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// full lockup: icon + SDX / INSPECT (light = white text for dark grounds, dark = navy text)
export const lockup = (h, tone = 'light') => `<span style="display:inline-flex;align-items:center;gap:${h * 0.18}px">${mark(h, { onDark: tone === 'light' })}<span style="display:inline-flex;flex-direction:column;line-height:.92"><span style="font-family:I,Arial;font-weight:800;font-size:${h * 0.62}px;letter-spacing:${h * 0.01}px;color:${tone === 'light' ? '#fff' : C.navy}">SDX</span><span style="font-family:I,Arial;font-weight:800;font-size:${h * 0.24}px;letter-spacing:${h * 0.07}px;color:${TEAL}">INSPECT</span></span></span>`;
export const fontCss = dir => `@font-face{font-family:I;font-weight:800;src:url(file://${dir}fonts/inter800.ttf)}@font-face{font-family:I;font-weight:600;src:url(file://${dir}fonts/inter600.woff2)}@font-face{font-family:I;font-weight:500;src:url(file://${dir}fonts/inter500.woff2)}`;
// colour the status words the way the app does: ✓ green, ✗ / TOO WARM / NO red
export const status = t => t.replace(/(TOO WARM[^<]*?)(?=$|—)/i, `<span style="color:${C.red}">$1</span>`).replace(/(✗\s*\w*)/g, `<span style="color:${C.red}">$1</span>`).replace(/(✓)/g, `<span style="color:${C.green}">$1</span>`);
