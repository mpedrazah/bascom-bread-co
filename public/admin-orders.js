const API_BASE = "https://www.bascombreadco.com"; // ✅ Fix missing https://

// ✅ Fetch Orders from Backend
async function fetchOrders() {
  try {
    console.log("📡 Fetching orders from backend...");
    const response = await fetch(`${API_BASE}/get-orders`);
    if (!response.ok) throw new Error(`Failed to fetch orders: ${response.statusText}`);

    const orders = await response.json();
    console.log("✅ Orders received:", orders);
    
    if (orders.length === 0) {
      document.getElementById("orders-list").innerHTML = "<p>No orders found.</p>";
      return;
    }

    displayOrders(orders);
  } catch (error) {
    console.error("❌ Error fetching orders:", error);
    document.getElementById("orders-list").innerHTML = "<p>Error loading orders. Please try again.</p>";
  }
}

// ✅ Display Orders in HTML
function displayOrders(orders) {
  const ordersContainer = document.getElementById("orders-list");
  ordersContainer.innerHTML = ""; // Clear existing content

  orders.forEach(order => {
    const orderElement = document.createElement("div");
    orderElement.classList.add("order-card");
    orderElement.innerHTML = `
      <p><strong>Email:</strong> ${order.email}</p>
      <p><strong>Pickup Date:</strong> ${order.pickup_day || "N/A"}</p>
      <p><strong>Items:</strong> ${order.items}</p>
      <p><strong>Total:</strong> ${order.total_price}</p>
      <p><strong>Payment Method:</strong> ${order.payment_method}</p> 
      <hr>
    `;
    ordersContainer.appendChild(orderElement);
  });
}


// ✅ Ensure the DOM is fully loaded before attaching event listeners
document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ DOM fully loaded. Initializing admin page...");

  // ✅ Check if the button exists before adding event listener
  const exportOrdersBtn = document.getElementById("export-orders-btn");
  if (exportOrdersBtn) {
    exportOrdersBtn.addEventListener("click", exportOrders);
  } else {
    console.warn("⚠️ Warning: #export-orders-btn not found in DOM.");
  }

  fetchOrders(); // Ensure orders are fetched when the page loads
});

// ✅ Export Orders as CSV
function exportOrders() {
  console.log("📤 Exporting orders...");
  window.location.href = `${API_BASE}/export-orders`;
}

// ✅ Handle recipe upload
document.getElementById("recipe-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const statusEl = document.getElementById("upload-status");
  statusEl.textContent = "Uploading...";

  try {
    const res = await fetch(`${API_BASE}/upload-recipe`, {
      method: "POST",
      body: formData,
    });

    const result = await res.json();
    if (result.success) {
      statusEl.textContent = "✅ Recipe uploaded successfully!";
      form.reset();
    } else {
      throw new Error(result.error || "Upload failed");
    }
  } catch (err) {
    console.error("❌ Upload error:", err);
    statusEl.textContent = `❌ ${err.message}`;
  }
});

document.getElementById('isBlogPost').addEventListener('change', (e) => {
  const isBlog = e.target.checked;
  document.querySelectorAll('.recipe-only').forEach(el => {
    el.style.display = isBlog ? 'none' : 'block';
  });
});

document.getElementById('delete-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('delete-id').value;

  const res = await fetch(`${API_BASE}/delete-recipe?id=${id}`, { method: 'DELETE' });

  const result = await res.json();

  const status = document.getElementById('delete-status');
  if (result.success) {
    status.textContent = "✅ Post deleted.";
    status.style.color = "green";
  } else {
    status.textContent = `❌ Error: ${result.error}`;
    status.style.color = "red";
  }
});
document.getElementById('delete-id').value = '';
setTimeout(() => status.textContent = '', 3000);
