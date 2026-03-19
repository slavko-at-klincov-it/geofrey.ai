// @ts-nocheck
/* geofrey.ai Freight Tracker — Dashboard */

(function () {
  "use strict";

  const TYPE_EMOJI = { ocean: "\ud83d\udea2", air: "\u2708\ufe0f", parcel: "\ud83d\udce6", road: "\ud83d\ude9b" };
  const STATUS_EMOJI = {
    pending: "\u23f3", in_transit: "\ud83d\ude9a", delivered: "\u2705",
    delayed: "\u26a0\ufe0f", exception: "\u274c", unknown: "\u2753",
  };
  const STATUS_LABELS = {
    pending: "Pending", in_transit: "In Transit", delivered: "Delivered",
    delayed: "Delayed", exception: "Exception", unknown: "Unknown",
  };

  // Init map
  const map = L.map("map").setView([50.1, 8.7], 5); // Frankfurt area default
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  const markers = new Map(); // id -> L.marker
  const vesselMarkers = new Map(); // mmsi -> L.marker

  // Custom icons
  function createIcon(emoji) {
    return L.divIcon({
      html: `<div style="font-size:24px;text-align:center;line-height:1">${emoji}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      className: "custom-marker",
    });
  }

  // Sidebar toggle
  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("toggleSidebar");
  toggleBtn.addEventListener("click", () => sidebar.classList.toggle("collapsed"));

  // Load shipments
  async function loadShipments() {
    try {
      const res = await fetch("/api/shipments");
      const data = await res.json();
      renderShipmentList(data);
      data.forEach((s) => updateMarker(s));
    } catch (err) {
      console.error("Failed to load shipments:", err);
    }
  }

  // Load vessels
  async function loadVessels() {
    try {
      const res = await fetch("/api/vessels");
      const data = await res.json();
      data.forEach((v) => updateVesselMarker(v));
    } catch (err) {
      console.error("Failed to load vessels:", err);
    }
  }

  function renderShipmentList(shipments) {
    const list = document.getElementById("shipmentList");
    if (!shipments.length) {
      list.innerHTML = '<div class="empty-state">No shipments tracked</div>';
      return;
    }
    list.innerHTML = shipments.map((s) => `
      <div class="shipment-card" data-id="${s.id}" onclick="window._focusShipment('${s.id}')">
        <div class="header">
          <span class="tracking-num">${TYPE_EMOJI[s.type] || "\ud83d\udce6"} ${s.trackingNumber}</span>
          <span class="type-badge">${s.type.toUpperCase()}</span>
        </div>
        <div class="status-row">
          <span class="status-${s.status}">${STATUS_EMOJI[s.status] || ""} ${STATUS_LABELS[s.status] || s.status}</span>
          ${s.carrier ? `<span>${s.carrier}</span>` : ""}
        </div>
      </div>
    `).join("");
  }

  function updateMarker(shipment) {
    if (!shipment.currentLat || !shipment.currentLon) return;

    const pos = [shipment.currentLat, shipment.currentLon];
    const emoji = TYPE_EMOJI[shipment.type] || "\ud83d\udce6";

    if (markers.has(shipment.id)) {
      markers.get(shipment.id).setLatLng(pos);
    } else {
      const marker = L.marker(pos, { icon: createIcon(emoji) })
        .addTo(map)
        .bindPopup(`
          <strong>${shipment.trackingNumber}</strong><br>
          Status: ${STATUS_LABELS[shipment.status] || shipment.status}<br>
          ${shipment.carrier ? `Carrier: ${shipment.carrier}<br>` : ""}
          Type: ${shipment.type}
        `);
      markers.set(shipment.id, marker);
    }
  }

  function updateVesselMarker(vessel) {
    const pos = [vessel.lat, vessel.lon];
    if (vesselMarkers.has(vessel.mmsi)) {
      vesselMarkers.get(vessel.mmsi).setLatLng(pos);
    } else {
      const marker = L.marker(pos, { icon: createIcon("\ud83d\udea2") })
        .addTo(map)
        .bindPopup(`
          <strong>${vessel.vesselName || vessel.mmsi}</strong><br>
          MMSI: ${vessel.mmsi}<br>
          Speed: ${vessel.speed ?? "?"} kn<br>
          Heading: ${vessel.heading ?? "?"}°
        `);
      vesselMarkers.set(vessel.mmsi, marker);
    }
  }

  // Focus on shipment marker
  window._focusShipment = function (id) {
    const marker = markers.get(id);
    if (marker) {
      map.setView(marker.getLatLng(), 10);
      marker.openPopup();
    }
    // Highlight card
    document.querySelectorAll(".shipment-card").forEach((c) => c.classList.remove("active"));
    const card = document.querySelector(`.shipment-card[data-id="${id}"]`);
    if (card) card.classList.add("active");
  };

  // SSE connection
  function connectSSE() {
    const connStatus = document.getElementById("connStatus");
    const evtSource = new EventSource("/api/events");

    evtSource.addEventListener("init", () => {
      connStatus.textContent = "Connected";
      connStatus.classList.add("connected");
    });

    evtSource.addEventListener("vessel", (e) => {
      const vessel = JSON.parse(e.data);
      updateVesselMarker(vessel);
    });

    evtSource.addEventListener("alert", () => {
      // Reload shipments on alert
      loadShipments();
    });

    evtSource.onerror = () => {
      connStatus.textContent = "Disconnected";
      connStatus.classList.remove("connected");
    };
  }

  // Init
  loadShipments();
  loadVessels();
  connectSSE();

  // Resize map on sidebar toggle
  new MutationObserver(() => setTimeout(() => map.invalidateSize(), 350))
    .observe(sidebar, { attributes: true, attributeFilter: ["class"] });
})();
