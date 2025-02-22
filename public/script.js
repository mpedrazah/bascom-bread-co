document.getElementById("checkout-button").addEventListener("click", function() {
    console.log("Checkout button clicked!"); // Debugging log

    fetch("http://localhost:3000/create-checkout-session", { 
        method: "POST",
        headers: { "Content-Type": "application/json" }
    })
    .then(response => response.json())
    .then(session => {
        console.log("Session URL:", session.url);
        window.location.href = session.url; // Redirect to Stripe Checkout
    })
    .catch(error => console.error("Error:", error));
});

