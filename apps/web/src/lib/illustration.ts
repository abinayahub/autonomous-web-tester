/**
 * Generates SVG wireframe "screenshots" for DEMONSTRATION DATA ONLY.
 * Every image carries a visible "DEMO ILLUSTRATION" watermark so it can never be
 * mistaken for a real capture of a real website.
 */

export type Layout = 'home' | 'product' | 'form' | 'login' | 'cart' | 'docs' | 'error';

export interface IllustrationOptions {
  site: string;
  path: string;
  layout: Layout;
  mobile?: boolean;
  accent?: string;
  highlight?: { x: number; y: number; w: number; h: number; label: string };
  /** Variant tweaks for before/after pairs. */
  state?: 'before' | 'after';
  /** Extra marker drawn for a specific bug: overlap, overflow, broken-image, toast. */
  defect?: 'overlap' | 'overflow' | 'broken-image' | 'dead-button' | 'error-page' | 'misaligned' | 'console';
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function rect(x: number, y: number, w: number, h: number, fill: string, r = 6, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
}
function text(x: number, y: number, s: string, size: number, fill: string, weight = 400, anchor = 'start') {
  return `<text x="${x}" y="${y}" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
}
const lines = (x: number, y: number, w: number, n: number, gap = 16, fill = '#e2e8f0') =>
  Array.from({ length: n }, (_, i) => rect(x, y + i * gap, i === n - 1 ? w * 0.6 : w, 8, fill, 4)).join('');

function body(o: IllustrationOptions, W: number, accent: string): string {
  const m = !!o.mobile;
  const pad = m ? 20 : 64;
  const inner = W - pad * 2;
  const out: string[] = [];
  switch (o.layout) {
    case 'home': {
      out.push(rect(pad, 110, inner, m ? 220 : 260, '#eef2ff', 14));
      out.push(text(pad + 32, m ? 170 : 180, 'Summer collection', m ? 24 : 38, '#1e293b', 700));
      out.push(lines(pad + 32, m ? 195 : 210, m ? inner - 64 : 420, 2));
      out.push(rect(pad + 32, m ? 260 : 270, 150, 42, accent, 8));
      out.push(text(pad + 107, m ? 286 : 296, 'Shop now', 15, '#fff', 600, 'middle'));
      const cols = m ? 1 : 3;
      const cw = (inner - (cols - 1) * 24) / cols;
      for (let i = 0; i < (m ? 2 : 3); i++) {
        const x = pad + (i % cols) * (cw + 24);
        const y = (m ? 360 : 410) + Math.floor(i / cols) * 230;
        out.push(rect(x, y, cw, 200, '#fff', 12, 'stroke="#e2e8f0"'));
        const broken = o.defect === 'broken-image' && i === 1;
        out.push(rect(x + 16, y + 16, cw - 32, 110, broken ? '#f8fafc' : '#dbeafe', 8, broken ? 'stroke="#94a3b8" stroke-dasharray="6 5"' : ''));
        if (broken) out.push(text(x + cw / 2, y + 76, 'image failed to load', 13, '#64748b', 500, 'middle'));
        out.push(lines(x + 16, y + 142, cw - 32, 2));
      }
      if (o.defect === 'overlap') {
        out.push(rect(pad + (m ? 40 : 300), m ? 300 : 300, m ? 220 : 260, 46, '#f59e0b', 8, 'opacity="0.92"'));
        out.push(text(pad + (m ? 150 : 430), m ? 329 : 329, 'Free shipping over $50', 14, '#fff', 600, 'middle'));
      }
      break;
    }
    case 'product': {
      const imgW = m ? inner : inner * 0.5;
      out.push(rect(pad, 110, imgW, m ? 260 : 420, '#e0f2fe', 14));
      const x = m ? pad : pad + imgW + 40;
      const y = m ? 400 : 130;
      out.push(text(x, y + 20, 'Wireless headphones', m ? 22 : 30, '#1e293b', 700));
      out.push(text(x, y + 60, '$129.00', 22, accent, 700));
      out.push(lines(x, y + 90, m ? inner : inner * 0.42, 4));
      const bx = o.defect === 'misaligned' ? x + 37 : x;
      out.push(rect(bx, y + 170, 180, 46, accent, 8));
      out.push(text(bx + 90, y + 199, 'Add to cart', 15, '#fff', 600, 'middle'));
      out.push(rect(x, y + 226, 180, 46, '#fff', 8, 'stroke="#cbd5e1"'));
      out.push(text(x + 90, y + 255, 'Save for later', 15, '#334155', 500, 'middle'));
      if (o.state === 'after' && o.defect === 'dead-button') {
        out.push(text(x, y + 300, 'Cart: 0 items (unchanged)', 14, '#64748b', 500));
      }
      break;
    }
    case 'form':
    case 'login': {
      const fw = m ? inner : 460;
      const x = (W - fw) / 2;
      out.push(rect(x, 110, fw, o.layout === 'login' ? 360 : 470, '#fff', 14, 'stroke="#e2e8f0"'));
      out.push(text(x + 28, 156, o.layout === 'login' ? 'Sign in' : 'Create your account', 24, '#1e293b', 700));
      const fields = o.layout === 'login' ? ['Email', 'Password'] : ['Full name', 'Email', 'Password', 'Confirm password'];
      fields.forEach((f, i) => {
        const fy = 185 + i * 70;
        out.push(text(x + 28, fy + 8, f, 13, '#475569', 500));
        const val = f === 'Email' && o.defect ? 'not-an-email' : f.includes('assword') ? '••••' : '';
        out.push(rect(x + 28, fy + 16, fw - 56, 38, '#f8fafc', 6, 'stroke="#cbd5e1"'));
        if (val) out.push(text(x + 40, fy + 40, val, 14, '#0f172a', 500));
      });
      const by = 185 + fields.length * 70 + 4;
      out.push(rect(x + 28, by, fw - 56, 44, accent, 8));
      out.push(text(W / 2, by + 28, o.layout === 'login' ? 'Sign in' : 'Create account', 15, '#fff', 600, 'middle'));
      if (o.state === 'after') {
        out.push(rect(x + 28, by + 58, fw - 56, 40, '#dcfce7', 6));
        out.push(text(x + 44, by + 83, 'Account created successfully', 14, '#166534', 600));
      }
      break;
    }
    case 'cart': {
      for (let i = 0; i < 3; i++) {
        const y = 120 + i * 96;
        out.push(rect(pad, y, m ? inner : inner * 0.62, 80, '#fff', 10, 'stroke="#e2e8f0"'));
        out.push(rect(pad + 14, y + 14, 52, 52, '#e0e7ff', 8));
        out.push(lines(pad + 84, y + 24, m ? inner - 120 : 300, 2));
      }
      if (!m) {
        const x = pad + inner * 0.62 + 32;
        out.push(rect(x, 120, inner * 0.38 - 32, 260, '#fff', 12, 'stroke="#e2e8f0"'));
        out.push(text(x + 24, 160, 'Order summary', 18, '#1e293b', 700));
        out.push(lines(x + 24, 185, inner * 0.38 - 80, 4, 22));
        out.push(rect(x + 24, 300, inner * 0.38 - 80, 46, accent, 8));
        out.push(text(x + (inner * 0.38 - 32) / 2, 329, 'Checkout', 15, '#fff', 600, 'middle'));
      }
      if (o.defect === 'overflow') out.push(rect(W - 30, 420, 120, 60, '#fecaca', 6));
      break;
    }
    case 'docs': {
      if (!m) {
        out.push(rect(pad, 110, 220, 520, '#f8fafc', 10));
        for (let i = 0; i < 9; i++) out.push(rect(pad + 18, 134 + i * 34, 150 - (i % 3) * 25, 9, '#cbd5e1', 4));
      }
      const x = m ? pad : pad + 260;
      out.push(text(x, 150, 'Getting started', m ? 24 : 32, '#1e293b', 700));
      out.push(lines(x, 180, m ? inner : inner - 260, 6, 20));
      out.push(rect(x, 320, m ? inner : inner - 260, 140, '#0f172a', 10));
      out.push(lines(x + 20, 345, m ? inner - 80 : 400, 4, 22, '#334155'));
      break;
    }
    case 'error': {
      out.push(text(W / 2, 300, o.defect === 'console' ? '500' : '404', m ? 80 : 120, '#cbd5e1', 800, 'middle'));
      out.push(text(W / 2, 350, o.defect === 'console' ? 'Something went wrong' : 'Page not found', 22, '#334155', 600, 'middle'));
      out.push(rect(W / 2 - 90, 380, 180, 44, accent, 8));
      out.push(text(W / 2, 408, 'Back to home', 15, '#fff', 600, 'middle'));
      break;
    }
  }
  if (o.defect === 'console') {
    const cy = m ? 640 : 640;
    out.push(rect(0, cy, W, m ? 204 : 160, '#0f172a', 0));
    out.push(text(16, cy + 28, '✕ Uncaught TypeError: Cannot read properties of undefined (reading "price")', m ? 11 : 14, '#fca5a5', 500));
    out.push(text(16, cy + 54, '✕ GET /api/recommendations 500 (Internal Server Error)', m ? 11 : 14, '#fca5a5', 500));
  }
  return out.join('');
}

export function illustration(o: IllustrationOptions): { src: string; width: number; height: number } {
  const W = o.mobile ? 390 : 1280;
  const H = o.mobile ? 844 : 800;
  const accent = o.accent ?? '#4f46e5';
  const m = !!o.mobile;
  const parts: string[] = [];
  parts.push(rect(0, 0, W, H, '#ffffff', 0));
  // Site header
  parts.push(rect(0, 0, W, 64, '#ffffff', 0));
  parts.push(`<line x1="0" y1="64" x2="${W}" y2="64" stroke="#e2e8f0"/>`);
  parts.push(rect(m ? 20 : 64, 20, 24, 24, accent, 6));
  parts.push(text(m ? 54 : 98, 38, o.site, 17, '#0f172a', 700));
  if (!m) ['Shop', 'Deals', 'About', 'Account'].forEach((n, i) => parts.push(text(W - 380 + i * 82, 38, n, 14, '#475569', 500)));
  else parts.push(rect(W - 44, 24, 22, 3, '#334155', 1) + rect(W - 44, 31, 22, 3, '#334155', 1) + rect(W - 44, 38, 22, 3, '#334155', 1));
  parts.push(text(m ? 20 : 64, 90, o.path, 12, '#94a3b8', 500));
  parts.push(body(o, W, accent));
  if (o.highlight) {
    const h = o.highlight;
    parts.push(`<rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" rx="6" fill="#ef4444" fill-opacity="0.07" stroke="#dc2626" stroke-width="3" stroke-dasharray="10 6"/>`);
    const lw = Math.min(W - 16, h.label.length * 7.4 + 24);
    const ly = h.y > 40 ? h.y - 34 : h.y + h.h + 8;
    const lx = Math.max(8, Math.min(h.x, W - lw - 8));
    parts.push(rect(lx, ly, lw, 26, '#dc2626', 5));
    parts.push(text(lx + 12, ly + 18, h.label, 13, '#fff', 600));
  }
  // Watermark — always present on demo illustrations.
  parts.push(
    `<g transform="translate(${W / 2} ${H / 2}) rotate(-24)" opacity="0.10">${text(0, 0, 'DEMO ILLUSTRATION', m ? 40 : 96, '#0f172a', 800, 'middle')}</g>`,
  );
  parts.push(rect(W - (m ? 150 : 200), H - 34, m ? 140 : 190, 26, '#f59e0b', 5));
  parts.push(text(W - (m ? 80 : 105), H - 16, 'DEMO · NOT A REAL CAPTURE', m ? 10 : 12, '#1c1917', 700, 'middle'));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width: W, height: H };
}
