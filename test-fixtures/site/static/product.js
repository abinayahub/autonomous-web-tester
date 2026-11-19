// CONTROL: "Add to cart" works and updates a live region.
let count = 0;
document.getElementById('add-to-cart').addEventListener('click', () => {
  count += 1;
  document.getElementById('cart-status').textContent = `${count} item(s) in cart`;
});

// BUG:FX-015 uncaught runtime error on page load (reads a property of undefined).
const recommendations = window.__RECS__;
console.log(recommendations.items.length);
