document.addEventListener("DOMContentLoaded", async function () {
    const ordersList = document.getElementById("orders-list");

    if (!ordersList) {
        console.error("❌ Element with ID 'orders-list' not found!");
        return;
    }

    try {
        const response = await fetch("/orders"); // Fetch orders from server
        const orders = await response.json();

        if (orders.length === 0) {
            ordersList.innerHTML = "<p>No orders found.</p>";
            return;
        }

        ordersList.innerHTML = ""; // Clear any previous content

        orders.forEach(order => {
            const orderDiv = document.createElement("div");
            orderDiv.classList.add("order-item");

            let orderDetails = `<h3>Order for: ${order.email}</h3>`;
            orderDetails += `<p><strong>Pickup:</strong> ${order.pickupDay} at ${order.pickupTime}</p>`;
            orderDetails += `<ul>`;

            order.cart.forEach(item => {
                orderDetails += `<li>${item.quantity} x ${item.name} - $${(item.price * item.quantity).toFixed(2)}</li>`;
            });

            orderDetails += `</ul>`;
            orderDetails += `<p><strong>Date Ordered:</strong> ${new Date(order.date).toLocaleString()}</p>`;

            orderDiv.innerHTML = orderDetails;
            ordersList.appendChild(orderDiv);
        });
    } catch (error) {
        console.error("❌ Error fetching orders:", error);
        ordersList.innerHTML = "<p>Error loading orders.</p>";
    }
});
