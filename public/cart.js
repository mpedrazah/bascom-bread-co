//const API_BASE = "https://bascom-bread-co-production.up.railway.app";
const API_BASE = "https://safe-feline-evident.ngrok-free.app"; // ✅ Use Local Server Instead of Railway
let cart = JSON.parse(localStorage.getItem("cart")) || [];
let pickupSlots = {}; // Define pickupSlots to avoid reference errors
// Predefined discount codes
const discountCodes = {
  "ICON10": 0.10,  // 10% off
  "VENMO10": 0.10,  // 10% off
  "BREAD5": 0.05 // 5% off
};

let discountAmount = 0; // Stores the applied discount

// Fetch and parse CSV data
// Function to fetch pickup slots from CSV and store them in memory
// Function to fetch pickup slots from CSV and store them in memory
async function fetchPickupSlotsCSV() {
  try {
    const response = await fetch('/pickupSlots.csv');  // Ensure correct path
    if (!response.ok) throw new Error("Failed to fetch pickup slots");

    const csvText = await response.text();
    const rows = csvText.trim().split('\n').slice(1); // Skip the header row
    rows.forEach(row => {
      const [date, _, amount] = row.split(','); // Ignore time, only use date and amount
      if (!pickupSlots[date]) {
        pickupSlots[date] = { available: parseInt(amount), booked: 0 };
      }
    });
    console.log("✅ Pickup slots loaded:", pickupSlots); // Debugging log
  } catch (error) {
    console.error("❌ Error loading pickup slots:", error);
  }
}

// Load pickup slots on page load
fetchPickupSlotsCSV().then(() => {
  console.log("✅ Pickup slots loaded successfully");
  populatePickupDayDropdown(); // Ensure dropdown updates with fetched slots
  checkCartAvailability(); // Ensure warning message updates when slots load
});

// Function to populate the Pickup Day dropdown
// Function to populate the Pickup Day dropdown
function populatePickupDayDropdown() {
  const pickupDayElement = document.getElementById("pickup-day");
  if (!pickupDayElement) return;

  pickupDayElement.innerHTML = ''; // Clear existing options

  Object.keys(pickupSlots).forEach(date => {
    const remainingSlots = pickupSlots[date]?.available - pickupSlots[date]?.booked || 0;
    const option = document.createElement("option");
    option.value = date;
    option.textContent = `${date} - ${remainingSlots} slots available`;
    pickupDayElement.appendChild(option);
  });

  pickupDayElement.addEventListener("change", checkCartAvailability);
}


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
  const imageSrc = document.querySelector(`img[alt='${name}']`)?.src || 'images/freshmillloaf.jpg';
  const existingItem = cart.find(item => item.name === name);
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({ name, price, quantity: 1, image: imageSrc });
  }
  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartCount();
  showToast(`${name} added to cart!`);
}


// ✅ Ensure it's globally accessible
window.showToast = showToast;


function applyDiscount() {
  const discountInput = document.getElementById("discount-code").value.trim().toUpperCase();
  const discountMessage = document.getElementById("discount-message");

  if (discountCodes[discountInput]) {
    discountAmount = discountCodes[discountInput]; // Store discount percentage
    discountMessage.innerText = `✅ Discount applied: ${discountAmount * 100}% off!`;
    discountMessage.style.color = "green";
  } else {
    discountAmount = 0;
    discountMessage.innerText = "❌ Invalid discount code.";
    discountMessage.style.color = "red";
  }

  renderCartItems(); // Update total price after discount
}

// ✅ Renders Cart Items with Image Support and Discount Application
function renderCartItems() {
  const cartContainer = document.getElementById("cart-items");
  const totalContainer = document.getElementById("cart-total");

  if (!cartContainer || !totalContainer) return;

  cartContainer.innerHTML = "";
  let total = 0;

  cart.forEach((item, index) => {
    const imageUrl = item.image && item.image !== "undefined" ? item.image : "images/freshmillloaf.jpg";
    total += item.price * item.quantity;

    cartContainer.innerHTML += `
      <div class="cart-item">
        <div class="item-info">
          <img src="${imageUrl}" alt="${item.name}" onerror="this.onerror=null;this.src='images/freshmillloaf.jpg';">
          <div>
            <h4>${item.name}</h4>
            <p>Price: $${item.price.toFixed(2)}</p>
          </div>
        </div>
        <input type="number" value="${item.quantity}" min="1" onchange="updateQuantity(${index}, this.value)" />
        <button onclick="removeFromCart(${index})">Remove</button>
      </div>
    `;
  });

  // Apply Discount if Available
  if (discountAmount > 0) {
    total = total - (total * discountAmount);
  }

  totalContainer.innerText = `Total: $${total.toFixed(2)}`;

  if (typeof checkCartAvailability === "function") checkCartAvailability();
}

// ✅ Ensures Global Accessibility
window.renderCartItems = renderCartItems;
window.applyDiscount = applyDiscount;


// Checkout function
// Ensure the checkbox state is remembered
document.addEventListener("DOMContentLoaded", function () {
  const emailOptIn = document.getElementById("email-opt-in");
  const emailInput = document.getElementById("email");

  // Load stored preference when the email field changes
  emailInput.addEventListener("input", () => {
      const savedPreference = localStorage.getItem(`email-opt-in-${emailInput.value}`);
      if (savedPreference !== null) {
          emailOptIn.checked = JSON.parse(savedPreference);
      }
  });

  // Save preference when checkbox is clicked
  emailOptIn.addEventListener("change", () => {
      if (emailInput.value.trim()) {
          localStorage.setItem(`email-opt-in-${emailInput.value}`, emailOptIn.checked);
      }
  });
});

// Checkout function with email opt-in
async function checkout() {
  if (cart.length === 0) {
      alert("Your cart is empty!");
      return;
  }

  const email = document.getElementById("email").value.trim();
  const pickupDay = document.getElementById("pickup-day").value;
  const emailOptIn = document.getElementById("email-opt-in").checked; // ✅ Capture opt-in value

  if (!email || !pickupDay) {
      alert("Please enter your email and select pickup date.");
      return;
  }

  try {
      const response = await fetch(`${API_BASE}/create-checkout-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cart, email, pickupDay, emailOptIn }), // ✅ Send opt-in data
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


function updateCartCount() {
  const cartCountElem = document.getElementById("cart-count");
  if (cartCountElem) {
    cartCountElem.innerText = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  }
}

// ✅ Update Quantity for a Cart Item
function updateQuantity(index, newQuantity) {
  cart[index].quantity = parseInt(newQuantity);
  localStorage.setItem("cart", JSON.stringify(cart));
  renderCartItems();
  updateCartCount();
}

// ✅ Remove Item from Cart
function removeFromCart(index) {
  cart.splice(index, 1);
  localStorage.setItem("cart", JSON.stringify(cart));
  renderCartItems();
  updateCartCount();
}

// Function to check cart availability against pickup slots
function checkCartAvailability() {
  const pickupDayElem = document.getElementById("pickup-day");
  const warningMessage = document.getElementById("warning-message");
  
  if (!pickupDayElem || !warningMessage) return;
  
  const pickupDay = pickupDayElem.value;
  const totalQuantity = cart.reduce((total, item) => total + item.quantity, 0);
  const remainingSlots = pickupSlots[pickupDay]?.available - pickupSlots[pickupDay]?.booked || 0;
  
  console.log(`Checking availability: Pickup Day = ${pickupDay}, Total Quantity = ${totalQuantity}, Remaining Slots = ${remainingSlots}`);
  
  if (pickupDay && totalQuantity > remainingSlots) {
    warningMessage.style.display = "block";
    warningMessage.innerText = `You have ${totalQuantity} items in your cart, but only ${remainingSlots} slots are available. Please update your cart quantity.`;
  } else {
    warningMessage.style.display = "none";
  }
}
// Load cart on page load
document.addEventListener("DOMContentLoaded", () => {
  renderCartItems();
  updateCartCount();
  fetchPickupSlotsCSV().then(() => {
    populatePickupDayDropdown();
    checkCartAvailability();
  });
});

// Ensure functions are accessible globally
window.renderCartItems = renderCartItems;
window.updateQuantity = updateQuantity;
window.removeFromCart = removeFromCart;
window.updateCartCount = updateCartCount;
window.checkCartAvailability = checkCartAvailability;
window.addToCart = addToCart;
window.fetchPickupSlotsCSV = fetchPickupSlotsCSV;
