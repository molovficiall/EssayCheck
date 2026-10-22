// Classic (blocking) script in <head>: sets the theme before first paint, no inline script needed (CSP-safe).
(() => {
  const KEY = 'atelier-theme', root = document.documentElement, mq = matchMedia('(prefers-color-scheme: dark)');
  const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const resolve = () => { const s = stored(); return s === 'dark' || s === 'light' ? s : mq.matches ? 'dark' : 'light'; };
  const apply = (t) => {
    root.dataset.theme = t;
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.content = t === 'dark' ? '#09141B' : '#EDF2F4';
    document.querySelectorAll('[data-theme-toggle]').forEach(b => b.setAttribute('aria-pressed', String(t === 'dark')));
  };
  apply(resolve());
  document.addEventListener('DOMContentLoaded', () => apply(root.dataset.theme));
  mq.addEventListener('change', () => { if (!stored()) apply(resolve()); });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-toggle]');
    if (!b) return;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch {}
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm) return apply(next);
    if (!document.startViewTransition) { // fallback: short colour fade
      root.classList.add('theme-fade'); apply(next);
      setTimeout(() => root.classList.remove('theme-fade'), 350);
      return;
    }
    const w = innerWidth, h = innerHeight, L = w + h;
    const t = document.startViewTransition(() => apply(next));
    t.ready.then(() => root.animate(
      { clipPath: [`polygon(${w}px 0, ${w}px 0, ${w}px 0)`, `polygon(${w}px 0, ${w - L}px 0, ${w}px ${L}px)`] },
      { duration: 560, easing: 'cubic-bezier(.2,.7,.1,1)', pseudoElement: '::view-transition-new(root)' }
    )).catch(() => {});
  });
})();
