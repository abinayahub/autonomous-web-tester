// Minimal client-side router using the History API. Navigation uses <button>s
// (not <a href>), so routes are only discoverable by interacting with the page.
const routes = {
  '/app': () => '<h1>Web App</h1><p>Welcome to the Acme web app.</p>',
  '/app/reports': () => '<h1>Reports</h1><p>Monthly sales: 1,204 orders.</p>',
  '/app/settings': () =>
    '<h1>App settings</h1><label><input type="checkbox" id="dark-toggle"> Dark mode</label>',
};

function render() {
  const view = routes[location.pathname];
  const root = document.getElementById('spa-root');
  root.innerHTML = `
    <nav class="spa-nav" aria-label="App">
      <button class="btn btn-outline" data-route="/app">Overview</button>
      <button class="btn btn-outline" data-route="/app/reports">Reports</button>
      <button class="btn btn-outline" data-route="/app/settings">Settings</button>
      <!-- BUG:FX-021 SPA route that does not exist: renders a soft-404 with HTTP 200 -->
      <button class="btn btn-outline" data-route="/app/billing">Billing</button>
    </nav>
    <section id="spa-view">${view ? view() : '<h1>Route not found</h1><p>This page does not exist.</p>'}</section>`;
  root.querySelectorAll('[data-route]').forEach((b) =>
    b.addEventListener('click', () => {
      history.pushState({}, '', b.dataset.route);
      render();
    }),
  );
}

window.addEventListener('popstate', render);
render();
