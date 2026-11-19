/**
 * Browser-side helpers, installed with context.addInitScript() as window.__awt.
 * Written as plain JavaScript in a string so nothing from the TypeScript build leaks into the page.
 */
export const INPAGE_SCRIPT = String.raw`
(() => {
  if (window.__awt) return;
  const vis = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    let n = el;
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || parseFloat(s.opacity) < 0.05) return false;
      if (n.getAttribute('aria-hidden') === 'true' && n !== document.body) return false;
      n = n.parentElement;
    }
    return true;
  };
  const txt = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const cssPath = (el) => {
    if (!(el instanceof Element)) return '';
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id) && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
    for (const a of ['data-testid', 'data-test', 'data-qa']) {
      const v = el.getAttribute(a);
      if (v && document.querySelectorAll('[' + a + '="' + CSS.escape(v) + '"]').length === 1) return '[' + a + '="' + CSS.escape(v) + '"]';
    }
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.documentElement) {
      let part = n.tagName.toLowerCase();
      if (n.id && /^[A-Za-z][\w-]*$/.test(n.id)) { parts.unshift('#' + CSS.escape(n.id)); break; }
      const name = n.getAttribute('name');
      if (name && /^(input|select|textarea|button|form)$/.test(part)) part += '[name="' + CSS.escape(name) + '"]';
      const p = n.parentElement;
      if (p) {
        const same = [...p.children].filter((c) => c.tagName === n.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
      }
      parts.unshift(part);
      const sel = parts.join(' > ');
      try { if (document.querySelectorAll(sel).length === 1) return sel; } catch (e) {}
      n = p;
    }
    return parts.join(' > ');
  };
  const nameOf = (el) => {
    if (!el) return '';
    const al = el.getAttribute('aria-label');
    if (al) return txt(al);
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map((e) => e.innerText).join(' '); if (txt(t)) return txt(t); }
    if (el.labels && el.labels.length) return txt([...el.labels].map((l) => l.innerText).join(' '));
    if (el.tagName === 'IMG') return txt(el.getAttribute('alt'));
    if (el.tagName === 'INPUT' && /^(submit|button|reset)$/i.test(el.type)) return txt(el.value);
    const t = txt(el.innerText || el.textContent);
    if (t) return t.slice(0, 120);
    return txt(el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('value') || '');
  };
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
  const ownText = (el) => [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim().length > 1);

  const inventory = () => {
    const links = [...document.querySelectorAll('a[href]')].map((a) => {
      const raw = a.getAttribute('href') || '';
      const hash = raw.startsWith('#') ? decodeURIComponent(raw.slice(1)) : '';
      return {
        href: a.href, raw, text: nameOf(a).slice(0, 120), selector: cssPath(a), visible: vis(a),
        inNav: !!a.closest('nav,header,[role=navigation],[role=menubar],[role=menu]'), inFooter: !!a.closest('footer,[role=contentinfo]'),
        target: a.getAttribute('target') || '', rel: a.getAttribute('rel') || '', download: a.hasAttribute('download'),
        hashTarget: hash ? !!(document.getElementById(hash) || document.getElementsByName(hash).length) : null, hash,
      };
    });
    const isBtn = (el) => el.matches('button,[role=button],input[type=button],input[type=submit],input[type=reset],input[type=image],summary');
    const buttons = [...document.querySelectorAll('button,[role=button],input[type=button],input[type=submit],input[type=reset],input[type=image],summary,a:not([href])[onclick],a[href="#"],a[href^="javascript:"]')]
      .filter((el) => vis(el)).map((el) => {
        const form = el.closest('form');
        const type = (el.getAttribute('type') || (el.tagName === 'BUTTON' ? 'submit' : '')).toLowerCase();
        return {
          selector: cssPath(el), tag: el.tagName.toLowerCase(), text: nameOf(el).slice(0, 120), type, role: el.getAttribute('role') || '',
          disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true'), inForm: !!form, isFormSubmit: !!form && isBtn(el) && (type === 'submit' || type === 'image'),
          ariaExpanded: el.getAttribute('aria-expanded'), dataRoute: el.getAttribute('data-route') || el.getAttribute('data-href') || '',
          inChrome: !!el.closest('header,nav,footer,[role=navigation],[role=banner],[role=contentinfo]'),
          // Sidebars and menus: single-page apps often navigate with <button>s here instead of <a href>.
          inNav: !!el.closest('nav,aside,[role=navigation],[role=menubar],[role=menu],[role=tablist]'),
          hasOnclick: el.hasAttribute('onclick'), box: box(el),
        };
      });
    const forms = [...document.querySelectorAll('form')].filter((f) => vis(f)).map((f) => {
      const fields = [...f.querySelectorAll('input,select,textarea')].filter((i) => !/^(hidden|submit|button|reset|image)$/i.test(i.type || '')).map((i) => ({
        selector: cssPath(i), tag: i.tagName.toLowerCase(), type: (i.getAttribute('type') || i.tagName).toLowerCase(), name: i.getAttribute('name') || '',
        id: i.id || '', label: nameOf(i).slice(0, 120), placeholder: i.getAttribute('placeholder') || '', autocomplete: i.getAttribute('autocomplete') || '',
        required: i.required || i.getAttribute('aria-required') === 'true', minLength: i.minLength > 0 ? i.minLength : null, maxLength: i.maxLength > 0 ? i.maxLength : null,
        min: i.getAttribute('min'), max: i.getAttribute('max'), pattern: i.getAttribute('pattern'), visible: vis(i), disabled: i.disabled, readOnly: !!i.readOnly,
        describedBy: txt((i.getAttribute('aria-describedby') || '').split(/\s+/).map((id) => (document.getElementById(id) || {}).innerText || '').join(' ')),
        options: i.tagName === 'SELECT' ? [...i.options].map((o) => o.value).slice(0, 8) : null,
      }));
      const submit = f.querySelector('button[type=submit],input[type=submit],button:not([type]),input[type=image]');
      return {
        selector: cssPath(f), action: f.action, method: (f.getAttribute('method') || 'get').toLowerCase(), noValidate: f.noValidate,
        text: txt(f.innerText).slice(0, 600), id: f.id || '', name: f.getAttribute('name') || '', fields,
        submitSelector: submit ? cssPath(submit) : '', submitText: submit ? nameOf(submit) : '',
      };
    });
    const images = [...document.querySelectorAll('img')].map((img) => ({
      selector: cssPath(img), src: img.currentSrc || img.src, hasAlt: img.hasAttribute('alt'), alt: img.getAttribute('alt'),
      broken: img.complete && img.naturalWidth === 0 && !!(img.currentSrc || img.src), visible: vis(img), decorative: img.getAttribute('role') === 'presentation',
    }));
    const inputsNoLabel = [...document.querySelectorAll('input,select,textarea')].filter((i) => vis(i) && !/^(hidden|submit|button|reset|image)$/i.test(i.type || '') && !nameOf(i))
      .map((i) => ({ selector: cssPath(i), type: i.type || i.tagName.toLowerCase(), name: i.getAttribute('name') || '' }));
    const buttonsNoName = [...document.querySelectorAll('button,[role=button],a[href]')].filter((b) => vis(b) && !nameOf(b) && !b.querySelector('img[alt]:not([alt=""]),svg title'))
      .map((b) => ({ selector: cssPath(b), tag: b.tagName.toLowerCase() }));
    const h1 = [...document.querySelectorAll('h1')].filter(vis).map((h) => txt(h.innerText)).slice(0, 3);
    return {
      url: location.href, title: txt(document.title), metaDescription: (document.querySelector('meta[name="description" i]') || {}).content || null,
      lang: document.documentElement.getAttribute('lang') || '', h1, bodyText: txt(document.body ? document.body.innerText : '').slice(0, 1500),
      hasPassword: !!document.querySelector('input[type=password]'), links, buttons, forms, images, inputsNoLabel, buttonsNoName,
      domSize: document.getElementsByTagName('*').length,
    };
  };

  // ── Layout analysis ──
  const layout = (opts) => {
    const vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight;
    const docW = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
    const out = { vw, docW, overflow: [], overlaps: [], misaligned: [], spacing: [] };
    if (docW > vw + 2) {
      const offenders = [...document.body.querySelectorAll('*')].filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.right <= vw + 2 || r.left >= vw) return false;
        const pos = getComputedStyle(el).position;
        if (pos === 'fixed') return false;
        return vis(el);
      });
      const roots = offenders.filter((el) => { const p = el.parentElement; return !p || el.getBoundingClientRect().right > p.getBoundingClientRect().right + 2 || !offenders.includes(p); });
      out.overflow = roots.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right).slice(0, 5)
        .map((el) => ({ selector: cssPath(el), tag: el.tagName.toLowerCase(), text: nameOf(el).slice(0, 80), right: Math.round(el.getBoundingClientRect().right), width: Math.round(el.getBoundingClientRect().width) }));
    }
    // Overlaps between distinct content elements (text / controls), confirmed with elementFromPoint.
    const SEL = 'h1,h2,h3,h4,h5,h6,p,a,button,label,input,select,textarea,li,span,strong,em,small,[class*=badge],[class*=logo],[class*=brand]';
    const cands = [...document.querySelectorAll(SEL)].filter((el) => {
      if (!vis(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 40) return false;
      return ownText(el) || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName) || el.getAttribute('class')?.match(/logo|brand/);
    }).slice(0, 500);
    // Elements inside a fixed/sticky layer (e.g. a sticky header) float over the content once the page is scrolled —
    // that is intended. Such a layer is compared with page content only at the top of the page, where it sits in place.
    const layerOf = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return n; } return null; };
    const layers = cands.map(layerOf);
    const seen = new Set();
    const steps = Math.min(6, Math.ceil(document.documentElement.scrollHeight / vh));
    for (let s = 0; s < steps; s++) {
      scrollTo(0, s * vh);
      const rects = cands.map((el) => el.getBoundingClientRect());
      for (let i = 0; i < cands.length; i++) {
        const a = cands[i], ra = rects[i];
        if (ra.bottom < 0 || ra.top > vh) continue;
        for (let j = i + 1; j < cands.length; j++) {
          const b = cands[j], rb = rects[j];
          if (rb.bottom < 0 || rb.top > vh) continue;
          if (a.contains(b) || b.contains(a)) continue;
          if (s > 0 && layers[i] !== layers[j]) continue; // floating layer over scrolled content: by design
          const pair = [a.tagName, b.tagName].sort().join();
          if (/LABEL/.test(pair) && /INPUT|SELECT|TEXTAREA/.test(pair)) continue; // floating labels
          const ix = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
          const iy = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
          if (ix < 6 || iy < 6) continue;
          const area = ix * iy, minArea = Math.min(ra.width * ra.height, rb.width * rb.height);
          if (area < Math.max(64, 0.2 * minArea)) continue;
          const cx = Math.max(ra.left, rb.left) + ix / 2, cy = Math.max(ra.top, rb.top) + iy / 2;
          if (cy < 0 || cy > vh || cx < 0 || cx > vw) continue;
          const top = document.elementFromPoint(cx, cy);
          if (!top) continue;
          const aTop = a.contains(top), bTop = b.contains(top);
          if (!aTop && !bTop) continue; // something else is on top (e.g. an overlay) — not this pair
          const key = cssPath(a) + '|' + cssPath(b);
          if (seen.has(key)) continue;
          seen.add(key);
          const covered = aTop ? b : a, cover = aTop ? a : b;
          const landmark = (el) => { const l = el.closest('header,nav,footer,aside,main,[role=navigation],[role=banner]'); return l ? l.tagName.toLowerCase() : ''; };
          out.overlaps.push({ cover: { selector: cssPath(cover), tag: cover.tagName.toLowerCase(), text: nameOf(cover).slice(0, 60), landmark: landmark(cover) }, covered: { selector: cssPath(covered), tag: covered.tagName.toLowerCase(), text: nameOf(covered).slice(0, 60), landmark: landmark(covered) }, overlapPx: Math.round(area), overlapPct: Math.round((area / minArea) * 100) });
          if (out.overlaps.length >= 10) break;
        }
        if (out.overlaps.length >= 10) break;
      }
    }
    scrollTo(0, 0);
    if (opts && opts.rows) {
      const parents = [...document.querySelectorAll('body *')].filter((p) => p.children.length >= 3 && vis(p)).slice(0, 400);
      for (const p of parents) {
        const kids = [...p.children].filter((k) => { if (!vis(k)) return false; const r = k.getBoundingClientRect(); return r.width >= 60 && r.height >= 40 && r.left >= -1 && r.right <= vw + 1; });
        if (kids.length < 3) continue;
        const w0 = kids[0].getBoundingClientRect().width;
        const same = kids.filter((k) => Math.abs(k.getBoundingClientRect().width - w0) <= 3);
        if (same.length < 3 || same.length !== kids.length) continue;
        const rows = [];
        for (const k of same.sort((x, y) => x.getBoundingClientRect().left - y.getBoundingClientRect().left)) {
          const r = k.getBoundingClientRect();
          let row = rows.find((rw) => Math.abs(rw.top - r.top) <= 40 && !rw.items.some((it) => Math.abs(it.r.left - r.left) < 5));
          if (!row) { row = { top: r.top, items: [] }; rows.push(row); }
          row.items.push({ el: k, r });
        }
        for (const row of rows) {
          if (row.items.length < 3) continue;
          const tops = row.items.map((it) => Math.round(it.r.top + scrollY));
          const freq = {};
          tops.forEach((t) => { freq[t] = (freq[t] || 0) + 1; });
          const [mode, count] = Object.entries(freq).sort((x, y) => y[1] - x[1])[0];
          if (count >= 2) row.items.forEach((it, i) => {
            const d = tops[i] - Number(mode);
            if (Math.abs(d) >= 8) out.misaligned.push({ selector: cssPath(it.el), text: nameOf(it.el).slice(0, 60), offsetPx: d, rowTop: Number(mode), siblings: row.items.length, container: cssPath(p) });
          });
          const items = row.items.slice().sort((x, y) => x.r.left - y.r.left);
          const gaps = [];
          for (let i = 0; i + 1 < items.length; i++) gaps.push(Math.round(items[i + 1].r.left - items[i].r.right));
          if (gaps.length >= 2 && Math.min(...gaps) >= 0 && Math.max(...gaps) - Math.min(...gaps) >= 12) {
            const iMin = gaps.indexOf(Math.min(...gaps));
            out.spacing.push({ container: cssPath(p), gaps, between: [cssPath(items[iMin].el), cssPath(items[iMin + 1].el)], text: nameOf(items[iMin].el).slice(0, 40) + ' / ' + nameOf(items[iMin + 1].el).slice(0, 40) });
          }
        }
      }
    }
    return out;
  };

  // ── Text contrast (WCAG) ──
  const parseColor = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const contrast = () => {
    const res = [];
    const els = [...document.querySelectorAll('p,span,a,li,h1,h2,h3,h4,h5,h6,label,button,td,th,small,strong,em,div')].filter((el) => ownText(el) && vis(el)).slice(0, 600);
    for (const el of els) {
      const s = getComputedStyle(el);
      const fg = parseColor(s.color);
      if (!fg || fg.a < 0.5) continue;
      let bg = null, n = el, img = false;
      while (n && n.nodeType === 1) {
        const ns = getComputedStyle(n);
        if (ns.backgroundImage && ns.backgroundImage !== 'none') { img = true; break; }
        const c = parseColor(ns.backgroundColor);
        if (c && c.a >= 0.95) { bg = c; break; }
        if (c && c.a > 0.05) { img = true; break; } // semi-transparent layer: can't compute reliably
        n = n.parentElement;
      }
      if (img) continue;
      if (!bg) bg = { r: 255, g: 255, b: 255, a: 1 };
      const L1 = lum(fg), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(s.fontSize), bold = parseInt(s.fontWeight, 10) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const need = large ? 3 : 4.5;
      if (ratio < need) res.push({ selector: cssPath(el), text: txt(el.innerText).slice(0, 60), ratio: Math.round(ratio * 100) / 100, required: need, color: s.color, background: 'rgb(' + bg.r + ', ' + bg.g + ', ' + bg.b + ')', fontSize: size });
      if (res.length >= 15) break;
    }
    return res;
  };

  // ── Interaction observer ──
  let mut = 0;
  const observer = new MutationObserver((ms) => { for (const m of ms) { if (m.target && m.target.id === '__awt_highlight') continue; mut += m.type === 'childList' ? m.addedNodes.length + m.removedNodes.length || 1 : 1; } });
  const startObs = () => { if (document.documentElement) observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObs); else startObs();
  // visible: how many content/controls are visible — catches CSS-only reactions (e.g. :focus-within dropdowns) that change no DOM.
  const visibleCount = () => [...document.querySelectorAll('a,button,input,select,textarea,li,img,p,h1,h2,h3,h4,[role=menu],[role=menuitem],[role=dialog],[role=tabpanel]')].filter(vis).length;
  const snapshot = () => ({ mutations: mut, url: location.href, scrollY: Math.round(scrollY), active: document.activeElement ? cssPath(document.activeElement) : '', text: txt(document.body ? document.body.innerText : '').length, visible: visibleCount() });
  const errorsVisible = () => [...document.querySelectorAll('[role=alert],.error,.errors,.invalid-feedback,.field-error,.form-error,.help-block,.text-danger,.alert-danger,[class*=error],[class*=invalid]')]
    .filter((e) => vis(e) && txt(e.innerText)).map((e) => txt(e.innerText).slice(0, 160)).slice(0, 8);
  const invalidFields = () => [...document.querySelectorAll('input,select,textarea')].filter((i) => i.matches(':invalid') || i.getAttribute('aria-invalid') === 'true')
    .map((i) => ({ selector: cssPath(i), message: i.validationMessage || '', ariaInvalid: i.getAttribute('aria-invalid') === 'true' })).slice(0, 10);

  window.__awt = { inventory, layout, contrast, snapshot, errorsVisible, invalidFields, cssPath, nameOf, vis };
})();
`;
