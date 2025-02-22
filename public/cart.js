// Function to add item to cart
function addToCart(name, price) {
  console.log("Adding to cart:", name, price); // Debugging log
  const existingItem = cart.find(item => item.name === name);
  
  if (existingItem) {
    existingItem.quantity = (existingItem.quantity || 1) + 1;
  } else {
    cart.push({ name, price, quantity: 1 });
  }

  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartCount();
  showToast(`${name} added to cart!`);
}

// Toast Notification Function
function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerText = message;
  document.body.appendChild(toast);

  // Trigger fade in
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

// Ensure the function is globally accessible
window.addToCart = addToCart;


// --- Cart Functionality ---
let cart = JSON.parse(localStorage.getItem("cart")) || [];
console.log("Initial cart:", cart);

function updateCartCount() {
  const cartCountElem = document.getElementById("cart-count");
  if (cartCountElem) {
    cartCountElem.innerText = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  }
}

function renderCartItems() {
  const cartContainer = document.getElementById("cart-items");
  const totalContainer = document.getElementById("cart-total");
  if (!cartContainer || !totalContainer) return;
  cartContainer.innerHTML = "";
  let total = 0;
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
  totalContainer.innerText = `Total: $${total.toFixed(2)}`;
}

function updateQuantity(index, newQuantity) {
  cart[index].quantity = parseInt(newQuantity);
  localStorage.setItem("cart", JSON.stringify(cart));
  renderCartItems();
  updateCartCount();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  localStorage.setItem("cart", JSON.stringify(cart));
  renderCartItems();
  updateCartCount();
}

async function checkout() {
  try {
    if (cart.length === 0) {
      alert("Your cart is empty!");
      return;
    }
    // Get email from textbox on checkout page
    const emailInput = document.getElementById("email");
    const email = emailInput ? emailInput.value.trim() : "";
    if (!email) {
      alert("Please enter your email for order confirmation.");
      return;
    }
    // Get pickup day and time from the scheduler
    const pickupDaySelect = document.getElementById("pickup-day");
    const pickupTimeSelect = document.getElementById("pickup-time");
    const pickupDay = pickupDaySelect ? pickupDaySelect.value : "";
    const pickupTime = pickupTimeSelect ? pickupTimeSelect.value : "";
    if (!pickupDay || !pickupTime) {
      alert("Please select a pickup day and time.");
      return;
    }
    
    const response = await fetch("http://localhost:3000/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cart, email, pickupDay, pickupTime }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const session = await response.json();
    if (session.url) {
      window.location.href = session.url; // Redirect to Stripe
    } else {
      console.error("Stripe session failed:", session);
    }
  } catch (error) {
    console.error("Checkout Error:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Re-read localStorage on page load
  cart = JSON.parse(localStorage.getItem("cart")) || [];
  updateCartCount();
  renderCartItems();
});

// --- Pickup Scheduler Functionality ---
const scheduleOptions = {
  "2025-02-25": ["10:00 AM", "12:00 PM", "02:00 PM"],
  "2025-02-26": ["11:00 AM", "01:00 PM", "03:00 PM"],
  "2025-02-27": ["09:00 AM", "11:00 AM", "01:00 PM"],
};

const daySelect = document.getElementById("pickup-day");
const timeSelect = document.getElementById("pickup-time");

function populateDays() {
  if (!daySelect) return;
  daySelect.innerHTML = "";
  Object.keys(scheduleOptions).forEach(day => {
    const option = document.createElement("option");
    option.value = day;
    option.textContent = day;
    daySelect.appendChild(option);
  });
}

function populateTimes(selectedDay) {
  if (!timeSelect) return;
  timeSelect.innerHTML = "";
  if (scheduleOptions[selectedDay]) {
    scheduleOptions[selectedDay].forEach(time => {
      const option = document.createElement("option");
      option.value = time;
      option.textContent = time;
      timeSelect.appendChild(option);
    });
  }
}

if (daySelect) {
  daySelect.addEventListener("change", function () {
    populateTimes(this.value);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (daySelect) {
    populateDays();
    if (daySelect.value) {
      populateTimes(daySelect.value);
    }
  }
});
