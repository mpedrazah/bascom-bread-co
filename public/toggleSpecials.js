document.addEventListener("DOMContentLoaded", function () {
    const specialsBanner = document.getElementById("specials-banner");
    const seasonalSpecials = document.getElementById("seasonal-specials");
    const easterSpecials = document.getElementById("mardigras-specials"); // Easter section
    const stPatricksSpecials = document.getElementById("stpatricks-specials"); // St. Patrick's section

    // ✅ Toggle these manually (true to show, false to hide)
    const isEasterActive = false;  // Set to true when Easter is active
    const isStPatricksActive = false; // Set to true when St. Patrick's is active

    let specialsActive = false;

    // 🚀 Reset classes and explicitly force hidden elements to display: none;
    easterSpecials.classList.add("hidden");
    easterSpecials.style.display = "none";
    
    stPatricksSpecials.classList.add("hidden");
    stPatricksSpecials.style.display = "none";

    // ✅ Apply toggles correctly
    if (isEasterActive) {
        easterSpecials.classList.remove("hidden");
        easterSpecials.style.display = "block"; // Force visibility
        specialsActive = true;
    }

    if (isStPatricksActive) {
        stPatricksSpecials.classList.remove("hidden");
        stPatricksSpecials.style.display = "block"; // Force visibility
        specialsActive = true;
    }

    // ✅ Show the specials section & banner if any special is active
    if (specialsActive) {
        seasonalSpecials.classList.remove("hidden");
        specialsBanner.classList.remove("hidden");
    } else {
        seasonalSpecials.classList.add("hidden");
        specialsBanner.classList.add("hidden");
        seasonalSpecials.style.display = "none"; // Ensure it's hidden
        specialsBanner.style.display="none";
    }

    // 🔍 Debugging logs
    console.log("After:", {
        easterClassList: easterSpecials.classList,
        stPatricksClassList: stPatricksSpecials.classList,
        easterDisplay: easterSpecials.style.display,
        stPatricksDisplay: stPatricksSpecials.style.display
    });


});
