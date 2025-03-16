// ✅ Modify `payWithVenmo` to Use Firestore
const API_BASE = "https://bascom-bread-co-production.up.railway.app"; // Update with Render URL

let cart = JSON.parse(localStorage.getItem("cart")) || [];
let pickupSlots = {};


let discountAmount = 0; // Stores the applied discount
const discountCodes = {
  "ICON10": 0.10,  // 10% off
  "VENMO10": 0.10,  // 10% off
  "BREAD5": 0.05, // 5% off
  "TEST90": 0.50 // 50% off for test purposes
};


// ✅ Fetch Pickup Slots from Google Sheets
async function fetchPickupSlotsFromGoogleSheets() {
  const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRLeiHAcr4m4Q_4yFuZXtxlj_kqc6V8ZKaPOgsZS0HHCZReMr-vTX2KEXOB8qqgduHPZLsbIF281YoA/pub?output=csv";

  try {
    const response = await fetch(sheetURL);
    if (!response.ok) throw new Error("Failed to fetch Google Sheets data");

    const csvText = await response.text();
    parsePickupSlotsData(csvText);
  } catch (error) {
    console.error("❌ Error fetching pickup slots:", error);
  }
}

// ✅ Save Order to Backend CSV
async function saveOrderToCSV(orderData) {
  console.log("📤 Sending order to backend CSV:", orderData);

  try {
    const response = await fetch(`${API_BASE}/save-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderData),
    });

    const responseData = await response.json();
    if (!responseData.success) throw new Error(responseData.error);
    console.log("✅ Order saved successfully!");
  } catch (error) {
    console.error("❌ Order submission failed:", error);
    alert("Error saving order. Please try again.");
  }
}

// ✅ Pay with Venmo (Now Saves Order to Backend)
async function payWithVenmo() {
  if (cart.length === 0) {
    alert("Your cart is empty!");
    return;
  }

  const email = document.getElementById("email")?.value.trim();
  const pickupDay = document.getElementById("pickup-day")?.value;

  console.log("🛠 Debug: PickupDay Before Sending:", pickupDay); // ✅ Log pickup day

  if (!email || !pickupDay) {
    alert("Please enter your email and select a pickup date.");
    return;
  }

  let orderData = {
    name: email.split("@")[0],
    email,
    pickupDay,  // ✅ Ensure this is NOT null
    items: cart.map(item => `${item.name} (x${item.quantity})`).join(", "),
    totalPrice: parseFloat(cart.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)), // Ensure float
    paymentMethod: "Venmo"
  };

  console.log("📤 Sending Venmo order:", orderData);

  try {
    const response = await fetch(`${API_BASE}/save-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderData),
    });

    const result = await response.json();
    if (!result.success) throw new Error("Failed to save order");

    console.log("✅ Venmo order saved successfully!");

    const venmoDeepLink = `venmo://paycharge?txn=pay&recipients=Margaret-Smillie&amount=${orderData.totalPrice.toFixed(2)}&note=Bascom%20Bread%20Order%20-%20Pickup%20on%20${encodeURIComponent(pickupDay)}`;
    window.location.href = venmoDeepLink;

  } catch (error) {
    console.error("❌ Venmo order submission failed:", error);
    alert("There was an error processing your Venmo payment.");
  }
}






window.payWithVenmo = payWithVenmo;
document.addEventListener("DOMContentLoaded", fetchPickupSlotsFromGoogleSheets);



// Convert CSV into JavaScript Object
function parsePickupSlotsData(csvText) {
  const rows = csvText.trim().split("\n").slice(1); // Skip header row
  pickupSlots = {}; // Reset slots

  rows.forEach(row => {
    const [date, available, booked] = row.split(","); // Extract columns
    if (date && available) {
      pickupSlots[date] = {
        available: parseInt(available),
        booked: parseInt(booked) || 0
      };
    }
  });

  console.log("✅ Processed Pickup Slots:", pickupSlots);
  populatePickupDayDropdown();
}

// Call this function when the page loads
document.addEventListener("DOMContentLoaded", fetchPickupSlotsFromGoogleSheets);

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

  const email = document.getElementById("email")?.value.trim();
  const pickupDay = document.getElementById("pickup-day")?.value;

  if (!email || !pickupDay) {
    alert("Please enter your email and select a pickup date.");
    return;
  }

  let orderData = {
    name: email.split("@")[0], // Use email prefix as name
    email,
    pickupDate: pickupDay,
    items: cart.map(item => `${item.name} (x${item.quantity})`).join(", "),
    totalPrice: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    paymentMethod: "Venmo"
  };

  console.log("📤 Sending Venmo order to server:", orderData);

  try {
    // ✅ Send order to backend
    const response = await fetch(`${API_BASE}/save-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderData),
    });

    const result = await response.json();
    if (!result.success) throw new Error("Failed to save order");

    console.log("✅ Order saved successfully to CSV!");

    // ✅ Redirect user to Venmo
    let totalPrice = orderData.totalPrice;
    const venmoLink = `venmo://paycharge?txn=pay&recipients=Margaret-Smillie&amount=${totalPrice.toFixed(2)}&note=Bascom%20Bread%20Order%20-%20Pickup%20on%20${encodeURIComponent(pickupDay)}`;
    
    window.location.href = venmoLink;
    setTimeout(() => {
      window.location.href = `https://venmo.com/Margaret-Smillie?txn=pay&amount=${totalPrice.toFixed(2)}&note=Bascom%20Bread%20Order%20-%20Pickup%20on%20${encodeURIComponent(pickupDay)}`;
    }, 2000);

    // ✅ Clear cart after successful order
    localStorage.removeItem("cart");
    updateCartCount();

  } catch (error) {
    console.error("❌ Venmo order submission failed:", error);
    alert("There was an error processing your Venmo payment. Please try again.");
  }
}

// ✅ Make function globally accessible
window.payWithVenmo = payWithVenmo;

async function checkout() {
  const email = document.getElementById("email")?.value.trim();
  const pickupDay = document.getElementById("pickup-day")?.value;
  const emailOptIn = document.getElementById("email-opt-in")?.checked || false;
  const discountCode = document.getElementById("discount-code")?.value.trim().toUpperCase() || null;

  console.log("🛠 Debug: PickupDay Before Sending:", pickupDay);

  if (!email || !pickupDay) {
    alert("Please enter your email and select a pickup date.");
    return;
  }

  let orderData = {
    name: email.split("@")[0],
    email,
    pickupDay,  // ✅ Ensure this is NOT null
    items: cart.map(item => `${item.name} (x${item.quantity})`).join(", "),
    totalPrice: parseFloat(cart.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)), // Ensure float
    paymentMethod: "Stripe",
    emailOptIn,
    discountCode
  };

  console.log("📤 Sending Stripe order to Railway Backend:", orderData);

  try {
    const response = await fetch(`${API_BASE}/save-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderData),
    });

    const result = await response.json();
    if (!result.success) throw new Error("Failed to save order");

    console.log("✅ Order saved, redirecting to payment!");

    const stripeResponse = await fetch(`${API_BASE}/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderData),
    });

    const stripeData = await stripeResponse.json();
    if (stripeData.url) {
      window.location.href = stripeData.url; // Redirect to Stripe payment
    } else {
      alert("Error: " + stripeData.error);
    }
  } catch (error) {
    console.error("❌ Checkout process failed:", error);
    alert("There was an error processing your order.");
  }
}




// ✅ Make function globally accessible
window.checkout = checkout;


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
  if (cart.length === 0) {
      alert("Your cart is empty!");
      return;
  }

  const email = document.getElementById("email")?.value.trim();
  const pickupDay = document.getElementById("pickup-day")?.value;
  const emailOptIn = document.getElementById("email-opt-in")?.checked || false;
  const discountCode = document.getElementById("discount-code")?.value.trim().toUpperCase() || null;

  if (!email || !pickupDay) {
      alert("Please enter your email and select a pickup date.");
      return;
  }

  // ✅ Apply discounts if available
  let totalDiscountedAmount = 0;
  let updatedCart = cart.map(item => {
      let discountedPrice = item.price;

      // ✅ Apply discount if a valid code is entered
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

  // ✅ Construct order data
  let orderData = {
      name: email.split("@")[0], // Extract name from email
      email,
      pickupDate: pickupDay,
      items: updatedCart.map(item => `${item.name} (x${item.quantity})`).join(", "),
      totalPrice: totalDiscountedAmount.toFixed(2),
      paymentMethod: "Stripe",
      emailOptIn,
      discountCode
  };

  console.log("📤 Sending Stripe order to Railway Backend:", orderData);

  try {
      const response = await fetch(`${API_BASE}/save-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderData)
      });

      const result = await response.json();
      if (!result.success) {
          throw new Error("Failed to save order.");
      }

      console.log("✅ Order saved successfully!");

      // ✅ Proceed with Stripe payment
      const stripeResponse = await fetch(`${API_BASE}/create-checkout-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
              cart: updatedCart,
              email,
              pickupDay,
              emailOptIn,
              discountCode,
              totalAmount: totalDiscountedAmount,
              paymentMethod: "Stripe"
          })
      });

      const stripeData = await stripeResponse.json();
      if (stripeData.url) {
          window.location.href = stripeData.url;
      } else {
          alert("Error processing payment: " + stripeData.error);
      }

  } catch (error) {
      console.error("❌ Checkout process failed:", error);
      alert("There was an error processing your payment. Please try again.");
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
      setTimeout(updateCartCount, 5000);  // Retry after 100ms
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
  fetchPickupSlotsFromGoogleSheets().then(() => {
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
