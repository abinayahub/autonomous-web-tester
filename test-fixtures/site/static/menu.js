// CONTROL: working dropdown menu (click toggles; links only visible when open).
document.querySelectorAll('.dropdown').forEach((dd) => {
  const toggle = dd.querySelector('.dropdown-toggle');
  const menu = dd.querySelector('.dropdown-menu');
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', () => {
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  });
});
