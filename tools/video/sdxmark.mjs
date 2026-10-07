// SDX Inspect mark + palette, taken from the app's own UI (src/App.css :root). No Sodexo swoosh/star.
export const C = { navy: '#2A295C', navyDeep: '#1e1d4a', blue: '#283897', red: '#EE0000', green: '#15803D', amber: '#D97706', bg: '#F4F6FB', ink: '#1B1A3D', muted: '#5E6283' };
// size in px; font family 'I' (Inter 800) must be loaded by the page
export const mark = (size, { shadow = false, onDark = false } = {}) => `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle${shadow ? `;filter:drop-shadow(0 ${size / 14}px ${size / 7}px rgba(42,41,92,.35))` : ''}">
<rect width="100" height="100" rx="24" fill="${onDark ? '#3D3C86' : C.navy}"${onDark ? ' stroke="rgba(255,255,255,.35)" stroke-width="3"' : ''}/>
<text x="50" y="52" text-anchor="middle" font-family="I, Inter, Arial" font-weight="800" font-size="33" letter-spacing="-1" fill="#fff">SDX</text>
<path d="M37 67 L46 76 L64 58" stroke="${C.red}" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const fontCss = dir => `@font-face{font-family:I;font-weight:800;src:url(file://${dir}fonts/inter800.ttf)}@font-face{font-family:I;font-weight:600;src:url(file://${dir}fonts/inter600.woff2)}@font-face{font-family:I;font-weight:500;src:url(file://${dir}fonts/inter500.woff2)}`;
// colour the status words the way the app does: ✓ green, ✗ / TOO WARM / NO red
export const status = t => t.replace(/(TOO WARM[^<]*?)(?=$|—)/i, `<span style="color:${C.red}">$1</span>`).replace(/(✗\s*\w*)/g, `<span style="color:${C.red}">$1</span>`).replace(/(✓)/g, `<span style="color:${C.green}">$1</span>`);
