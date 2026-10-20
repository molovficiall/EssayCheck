const root = document.documentElement;
const media = matchMedia('(prefers-color-scheme: dark)');
const themeColor = document.querySelector('meta[name="theme-color"]');

function currentTheme() {
  const saved = localStorage.getItem('idek-theme');
  return saved === 'light' || saved === 'dark'
    ? saved
    : media.matches
      ? 'dark'
      : 'light';
}

function updateTheme(theme) {
  root.dataset.theme = theme;
  if (themeColor) themeColor.content = theme === 'dark' ? '#0A1218' : '#F3F6F8';
  document.querySelectorAll('.theme-toggle').forEach((button) => {
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    button.setAttribute(
      'aria-label',
      `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
    );
  });
}

async function setTheme(theme, button) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const apply = () => {
    localStorage.setItem('idek-theme', theme);
    updateTheme(theme);
  };
  if (reduced) {
    apply();
    return;
  }
  if (document.startViewTransition) {
    const transition = document.startViewTransition(apply);
    await transition.finished;
    return;
  }
  root.classList.add('theme-animating');
  apply();
  if (button) button.dataset.themeAnimating = 'true';
  setTimeout(() => {
    root.classList.remove('theme-animating');
    if (button) delete button.dataset.themeAnimating;
  }, 300);
}

updateTheme(currentTheme());
document.querySelectorAll('.theme-toggle').forEach((button) => {
  button.addEventListener(
    'click',
    () =>
      void setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', button),
  );
});
media.addEventListener('change', () => {
  if (!localStorage.getItem('idek-theme')) updateTheme(currentTheme());
});
