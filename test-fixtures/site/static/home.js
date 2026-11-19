// CONTROL: "View promo details" opens a modal. (#subscribe-btn intentionally has no handler — FX-004.)
const modal = document.getElementById('promo-modal');
document.getElementById('promo-btn').addEventListener('click', () => {
  modal.hidden = false;
});
document.getElementById('promo-close').addEventListener('click', () => {
  modal.hidden = true;
});
