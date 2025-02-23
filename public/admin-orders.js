document.addEventListener("DOMContentLoaded", async function () {
    const ordersList = document.getElementById("orders-list");

    if (!ordersList) {
        console.error("❌ Element with ID 'orders-list' not found!");
        return;
    }

    try {
        const response = await fetch("/orders");
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const orders = await response.json();

        if (!Array.isArray(orders) || orders.length === 0) {
            ordersList.innerHTML = "<p>No orders found.</p>";
            return;
        }

        ordersList.innerHTML = ""; // Clear placeholder content

        orders.forEach(order => {
            const orderDiv = document.createElement("div");
            orderDiv.classList.add("order-item");

            let orderDetails = `
                <h3>Order for: <span class="order-email">${order.email}</span></h3>
                <p><strong>Pickup:</strong> ${order.pickupDay || "N/A"}</p>
                <ul class="order-items-list">`;

            order.cart.forEach(item => {
                orderDetails += `
                    <li>${item.quantity} x ${item.name} - <strong>$${(item.price * item.quantity).toFixed(2)}</strong></li>`;
            });

            orderDetails += `</ul>
                <p><strong>Date Ordered:</strong> ${order.date ? new Date(order.date).toLocaleString() : "N/A"}</p>
                <hr>`;

            orderDiv.innerHTML = orderDetails;
            ordersList.appendChild(orderDiv);
        });

    } catch (error) {
        console.error("❌ Error fetching orders:", error);
        ordersList.innerHTML = "<p>Error loading orders. Please try again later.</p>";
    }
});
