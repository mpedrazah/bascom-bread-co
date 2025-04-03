document.addEventListener("DOMContentLoaded", function () {
    const specialsBanner = document.getElementById("specials-banner");
    const seasonalSpecials = document.getElementById("seasonal-specials");
    const easterSpecials = document.getElementById("easter-specials");
    const stPatricksSpecials = document.getElementById("stpatricks-specials");

    // ✅ Toggle these manually (true to show, false to hide)
    const isEasterActive = true;         // ✅ Enable Easter & Divine Mercy specials
    const isStPatricksActive = false;

    let specialsActive = false;

    // ⛔ Ensure all are hidden by default
    if (easterSpecials) {
        easterSpecials.classList.add("hidden");
        easterSpecials.style.display = "none";
    }

    if (stPatricksSpecials) {
        stPatricksSpecials.classList.add("hidden");
        stPatricksSpecials.style.display = "none";
    }

    // ✅ Show Easter specials
    if (isEasterActive && easterSpecials) {
        easterSpecials.classList.remove("hidden");
        easterSpecials.style.display = "block";
        specialsActive = true;
    }

    // ✅ Show St. Patrick's specials if active
    if (isStPatricksActive && stPatricksSpecials) {
        stPatricksSpecials.classList.remove("hidden");
        stPatricksSpecials.style.display = "block";
        specialsActive = true;
    }

    // ✅ Show seasonal section and banner if anything is active
    if (specialsActive) {
        seasonalSpecials.classList.remove("hidden");
        specialsBanner?.classList.remove("hidden");
    } else {
        seasonalSpecials.classList.add("hidden");
        specialsBanner?.classList.add("hidden");
        seasonalSpecials.style.display = "none";
        specialsBanner.style.display = "none";
    }

    // 🪵 Debug logs
    console.log("✅ Specials toggled:", {
        easterVisible: isEasterActive,
        stPatricksVisible: isStPatricksActive
    });
});