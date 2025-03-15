//const API_BASE = "https://bascom-bread-co-production.up.railway.app";
const API_BASE = "https://safe-feline-evident.ngrok-free.app"; // ✅ Use Local Server Instead of Railway
// Predefined discount codes
const discountCodes = {
  "ICON10": 0.10,  // 10% off
  "VENMO10": 0.10,  // 10% off
  "BREAD5": 0.05, // 5% off
  "TEST90": 0.50 // 50% off for test purposes
};

let cart = JSON.parse(localStorage.getItem("cart")) || [];
let pickupSlots = {}; // Define pickupSlots to avoid reference errors


let discountAmount = 0; // Stores the applied discount

// Fetch and parse CSV data
async function fetchPickupSlotsCSV() {
  try {
    const response = await fetch('/pickupSlots.csv');  
    if (!response.ok) throw new Error("Failed to fetch pickup slots");

    const csvText = await response.text();
    const rows = csvText.trim().split('\n').slice(1); // Skip header row

    rows.forEach(row => {
      const [date, amount, booked] = row.split(','); // Extract all three columns

      if (!pickupSlots[date]) {
        pickupSlots[date] = { 
          available: parseInt(amount), 
          booked: parseInt(booked) || 0  // Ensure booked count is properly assigned
        };
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

function populatePickupDayDropdown() {
  const pickupDayElement = document.getElementById("pickup-day");
  if (!pickupDayElement) return;

  pickupDayElement.innerHTML = ""; // Clear existing options

  Object.keys(pickupSlots).forEach(date => {
    const slot = pickupSlots[date];
    if (!slot) return; // Skip if slot data is missing

    const remainingSlots = slot.available - slot.booked;
    const option = document.createElement("option");
    option.value = date;
    option.textContent = remainingSlots < 6 ? `${date} - ${remainingSlots} slots left` : date;

    pickupDayElement.appendChild(option);
  });

  pickupDayElement.addEventListener("change", checkCartAvailability);
}



// ✅ Call this function when the checkout page loads
document.addEventListener("DOMContentLoaded", populatePickupDayDropdown);


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


async function payWithVenmo() {
  if (cart.length === 0) {
      alert("Your cart is empty!");
      return;
  }

  const email = document.getElementById("email").value.trim();
  const pickupDay = document.getElementById("pickup-day").value;

  if (!email || !pickupDay) {
      alert("Please enter your email and select a pickup date.");
      return;
  }

  // Apply $1 discount per item
  let discountAmount = cart.reduce((total, item) => total + item.quantity, 0); 

  // Create discounted cart
  let discountedCart = cart.map(item => ({
      ...item,
      price: item.price - 1  // Apply $1 discount per item
  }));

  // Calculate new total
  let totalPrice = discountedCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  try {
      // Log the order before redirecting to Venmo
      const response = await fetch(`${API_BASE}/log-venmo-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cart: discountedCart, email, pickupDay, discountCode: "VENMO_DISCOUNT", totalAmount: totalPrice }),
      });

      const result = await response.json();
      if (result.success) {
          // Venmo Payment URL
          const venmoDeepLink = `venmo://paycharge?txn=pay&recipients=Margaret-Smillie&amount=${totalPrice.toFixed(2)}&note=Bascom%20Bread%20Order%20-%20Pickup%20on%20${encodeURIComponent(pickupDay)}`;
          const venmoWebProfile = `https://venmo.com/Margaret-Smillie?txn=pay&amount=${totalPrice.toFixed(2)}&note=Bascom%20Bread%20Order%20-%20Pickup%20on%20${encodeURIComponent(pickupDay)}`;

          // Detect mobile device
          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

          if (isMobile) {
              // Try to open Venmo app
              window.location.href = venmoDeepLink;

              // Set a fallback in case Venmo app doesn't open
              setTimeout(() => {
                  window.location.href = venmoWebProfile;
              }, 2000); // Wait 2 seconds before falling back to web
          } else {
              // If on desktop, open Venmo web profile
              window.open(venmoWebProfile, "_blank");
          }
      } else {
          alert("Failed to process Venmo payment.");
      }
  } catch (error) {
      console.error("Venmo payment error:", error);
      alert("There was an issue processing your Venmo payment.");
  }
}


// ✅ Make function accessible globally
window.payWithVenmo = payWithVenmo;

let paymentMethod = "Stripe"; // Default to Stripe

// Function to set payment method
function setPaymentMethod(method) {
    paymentMethod = method;
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
  const email = document.getElementById("email").value;
  const pickupDay = document.getElementById("pickup-day").value;
  const emailOptIn = document.getElementById("email-opt-in").checked;
  const discountCode = document.getElementById("discount-code") ? document.getElementById("discount-code").value.trim().toUpperCase() : null;

  let totalDiscountedAmount = 0;
  let updatedCart = cart.map(item => {
      let discountedPrice = item.price;

      // ✅ Apply $1 discount per item if paying with Venmo
      if (paymentMethod === "Venmo") {
          discountedPrice = Math.max(0, item.price - 1);
      }

      // ✅ Apply additional discount if discount code is used
      if (discountCodes[discountCode]) {
          discountedPrice = discountedPrice - (discountedPrice * discountCodes[discountCode]);
      }

      totalDiscountedAmount += discountedPrice * item.quantity;

      return {
          name: item.name,
          price: discountedPrice, // ✅ Send discounted price
          quantity: item.quantity
      };
  });

  try {
      const response = await fetch(`${API_BASE}/create-checkout-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
              cart: updatedCart, // ✅ Send updated cart with discount applied
              email,
              pickupDay,
              emailOptIn,
              discountCode,
              totalAmount: totalDiscountedAmount, // ✅ Send total after discount
              paymentMethod // ✅ Send selected payment method
          })
      });

      const data = await response.json();
      if (data.url) {
          window.location.href = data.url;
      } else {
          alert("Error: " + data.error);
      }
  } catch (error) {
      console.error("❌ Stripe Checkout Error:", error);
      alert("Payment failed. Please try again.");
  }
}



function updateCartCount() {
  console.log("🔄 Running updateCartCount()...");

  let cart = JSON.parse(localStorage.getItem("cart")) || [];
  let totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  
  let cartCountElement = document.getElementById("cart-count");

  if (cartCountElement) {
      cartCountElement.textContent = totalCount;
      console.log("✅ Cart count updated:", totalCount);
  } else {
      console.warn("❌ `#cart-count` element not found. Retrying in 100ms...");
      setTimeout(updateCartCount, 100);  // Retry after 100ms
  }
}

// ✅ Ensure the function runs after the page loads
document.addEventListener("DOMContentLoaded", function () {
  console.log("✅ DOM fully loaded. Updating cart count...");
  updateCartCount();  // Run once when page loads

  setInterval(updateCartCount, 3000);  // ✅ Ensure it updates every 3 seconds
});



// ✅ Ensure the cart count updates after DOM is fully loaded
document.addEventListener("DOMContentLoaded", function () {
  setTimeout(updateCartCount, 100); // Small delay to ensure elements are available
});


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


document.addEventListener("DOMContentLoaded", function () {
  console.log("✅ DOM fully loaded. Running updateCartCount()...");

  // Ensure cart count is updated when the page loads
  updateCartCount();

  // Debugging logs
  console.log("🛒 Cart on load:", localStorage.getItem("cart"));
  console.log("🔄 Cart count updated to:", document.getElementById("cart-count")?.textContent);

  // Ensure cart buttons exist before adding event listeners
  const stripeButton = document.getElementById("stripe-button");
  const venmoButton = document.getElementById("venmo-button");

  if (stripeButton) {
      stripeButton.addEventListener("click", function () {
          setPaymentMethod("Stripe");
          checkout();
      });
  } else {
      console.warn("⚠️ `#stripe-button` not found on this page.");
  }

  if (venmoButton) {
      venmoButton.addEventListener("click", function () {
          setPaymentMethod("Venmo");
          checkout();
      });
  } else {
      console.warn("⚠️ `#venmo-button` not found on this page.");
  }
});

// Ensure updateCartCount() works globally
function updateCartCount() {
  console.log("🔄 Running updateCartCount()...");

  let cart = JSON.parse(localStorage.getItem("cart")) || [];
  let totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  
  const cartCountElement = document.getElementById("cart-count");
  if (cartCountElement) {
      cartCountElement.textContent = totalCount;
      console.log("✅ Cart count updated:", totalCount);
  } else {
      console.warn("❌ `#cart-count` element not found.");
  }
}

document.addEventListener("DOMContentLoaded", function () {
  console.log("✅ cart.js has loaded!");

  updateCartCount();  // Ensure cart count updates

  // 🔍 Get button elements
  const stripeButton = document.getElementById("stripe-button");
  const venmoButton = document.getElementById("venmo-button");

  // ✅ Add event listener only if element exists
  if (stripeButton) {
      stripeButton.addEventListener("click", function () {
          setPaymentMethod("Stripe");
          checkout();
      });
  } else {
      console.warn("⚠️ `#stripe-button` not found on this page. Skipping event listener.");
  }

  if (venmoButton) {
      venmoButton.addEventListener("click", function () {
          setPaymentMethod("Venmo");
          checkout();
      });
  } else {
      console.warn("⚠️ `#venmo-button` not found on this page. Skipping event listener.");
  }

  // Debugging logs
  console.log("🛒 Cart on load:", localStorage.getItem("cart"));
  console.log("🔄 Running updateCartCount()...");
});
