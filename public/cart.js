const API_BASE = "https://your-railway-app.up.railway.app";

// Fetch and parse CSV data
async function fetchPickupSlotsCSV() {
  const response = await fetch('/pickupSlots.csv');
  const csvText = await response.text();

  const rows = csvText.trim().split('\n').slice(1); // Skip header row
  const slots = {};

  rows.forEach(row => {
      const [date, time] = row.split(',');
      if (!slots[date]) slots[date] = [];
      slots[date].push(time.trim());
  });

  return slots;
}

// Populate Day Dropdown
async function populateDays() {
  const daySelect = document.getElementById("pickup-day");
  if (!daySelect) return;

  const slots = await fetchPickupSlotsCSV();
  daySelect.innerHTML = "";  // Clear previous options

  Object.keys(slots).forEach(day => {
      const option = document.createElement("option");
      option.value = day;
      option.textContent = day;
      daySelect.appendChild(option);
  });

  populateTimes(daySelect.value, slots);

  daySelect.addEventListener("change", () => {
      populateTimes(daySelect.value, slots);
  });
}

// Populate Time Dropdown based on selected day
function populateTimes(selectedDay, slots) {
  const timeSelect = document.getElementById("pickup-time");
  if (!timeSelect) return;

  timeSelect.innerHTML = ""; // Clear previous options

  slots[selectedDay].forEach(time => {
      const option = document.createElement("option");
      option.value = time;
      option.textContent = time;
      timeSelect.appendChild(option);
  });
}

// Initialize Dropdowns on Page Load
document.addEventListener("DOMContentLoaded", populateDays);


// ✅ Toast Notification Function
function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerText = message;
  document.body.appendChild(toast);

  // Trigger fade-in
  setTimeout(() => {
      toast.classList.add("visible");
  }, 100);

  // Fade out and remove after 3 seconds
  setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => {
          document.body.removeChild(toast);
      }, 500);
  }, 3000);
}


// Function to add item to cart
function addToCart(name, price) {
    const existingItem = cart.find(item => item.name === name);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ name, price, quantity: 1 });
    }

    localStorage.setItem("cart", JSON.stringify(cart));
    updateCartCount();
    showToast(`${name} added to cart!`);
}

function updateCartCount() {
  const cartCountElem = document.getElementById("cart-count");
  if (cartCountElem) {
      cartCountElem.innerText = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  }
}

// Ensure it's globally accessible
window.updateCartCount = updateCartCount;


// ✅ Ensure it's globally accessible
window.showToast = showToast;

function renderCartItems() {
  const cartContainer = document.getElementById("cart-items");
  const totalContainer = document.getElementById("cart-total");

  if (!cartContainer || !totalContainer) {
      console.error("❌ Cart elements not found!");
      return;
  }

  cartContainer.innerHTML = "";
  let total = 0;

  console.log("🛒 Rendering Cart Items:", cart); // ✅ Debugging log

  cart.forEach((item, index) => {
      total += item.price * item.quantity;
      cartContainer.innerHTML += `
          <div class="cart-item">
              <p>${item.name} - $${item.price.toFixed(2)}</p>
              <input type="number" min="1" value="${item.quantity}" onchange="updateQuantity(${index}, this.value)">
              <button onclick="removeFromCart(${index})">Remove</button>
          </div>
      `;
  });

  console.log("🛒 Cart Total:", total); // ✅ Debugging log
  totalContainer.innerText = `Total: $${total.toFixed(2)}`;
}

// ✅ Ensure it's globally accessible
window.renderCartItems = renderCartItems;


// Checkout function
async function checkout() {
    if (cart.length === 0) {
        alert("Your cart is empty!");
        return;
    }

    const email = document.getElementById("email").value.trim();
    const pickupDay = document.getElementById("pickup-day").value;
    const pickupTime = document.getElementById("pickup-time").value;

    if (!email || !pickupDay || !pickupTime) {
        alert("Please enter your email and select pickup time.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/create-checkout-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cart, email, pickupDay, pickupTime }),
        });

        const session = await response.json();
        if (session.url) {
            window.location.href = session.url;
        } else {
            console.error("Stripe session failed:", session);
        }
    } catch (error) {
        console.error("Checkout Error:", error);
    }
}



document.addEventListener("DOMContentLoaded", () => {
  cart = JSON.parse(localStorage.getItem("cart")) || [];
  console.log("📦 Loaded Cart from Local Storage:", cart); // ✅ Debugging log
  updateCartCount();
  renderCartItems();
});

function updateCartCount() {
    const cartCountElem = document.getElementById("cart-count");
    if (cartCountElem) {
        cartCountElem.innerText = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    }
}

// Ensure it's globally accessible
window.updateCartCount = updateCartCount;
