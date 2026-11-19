// CONTROL: tabs filter the orders table. (#export-csv intentionally has no handler — FX-020.)
document.querySelectorAll('[role="tab"]').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    const filter = tab.dataset.tab;
    document.querySelectorAll('.orders tr').forEach((row) => {
      row.hidden = filter === 'open' && row.dataset.status !== 'open';
    });
  });
});
