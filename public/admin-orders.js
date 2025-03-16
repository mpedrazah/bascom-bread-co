const API_BASE = "bascom-bread-co-production.up.railway.app"; // Update with Render URL

async function fetchOrders() {
  try {
    const response = await fetch(`${API_BASE}/get-orders`);
    if (!response.ok) throw new Error("Failed to fetch orders");

    const orders = await response.json();
    displayOrders(orders);
  } catch (error) {
    console.error("❌ Error fetching orders:", error);
  }
}

function displayOrders(orders) {
  const ordersContainer = document.getElementById("orders-list");
  ordersContainer.innerHTML = "";

  orders.forEach(order => {
    const orderElement = document.createElement("div");
    orderElement.classList.add("order-card");
    orderElement.innerHTML = `
      <p><strong>Name:</strong> ${order.name}</p>
      <p><strong>Email:</strong> ${order.email}</p>
      <p><strong>Pickup Date:</strong> ${order.pickupDate}</p>
      <p><strong>Items:</strong> ${order.items}</p>
      <p><strong>Total:</strong> $${order.totalPrice}</p>
      <hr>
    `;
    ordersContainer.appendChild(orderElement);
  });
}

document.addEventListener("DOMContentLoaded", fetchOrders);
