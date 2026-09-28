// Complaints / investigations Google Sheet layer, heatmap and exact file-number search.
const COMPLAINTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_FSgVpGsiBFfky2PsQtQkkv2rQYq5ElDEELxGw0CqrNQ27LmqSAXXzGQe1-8B_NdTVMhIrgo7jENd/pub?output=csv";

window.allComplaintsData = [];
let complaintsMarkers = null;
let complaintsHeatLayer = null;
let complaintsCurrentView = "none";
let complaintSearchMarker = null;

function escapeComplaintHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function buildComplaintPopupHTML(item) {
  const fileNumber = escapeComplaintHTML(
    item["COMPLAINT FILE NUMBER"] || "Complaint / Investigation"
  );
  const dateCreated = escapeComplaintHTML(
    item["DATE TICKET WAS CREATED"] || "N/A"
  );
  const nature = escapeComplaintHTML(
    item["NATURE OF COMPLAINT"] || "N/A"
  );
  const location = escapeComplaintHTML(item["LOCATION"] || "N/A");
  const status = escapeComplaintHTML(item["STATUS"] || "N/A");
  const comments = escapeComplaintHTML(item["COMMENTS"] || "N/A");

  return `
    <div class="cec-popup complaint-popup">
      <div class="cec-popup__header complaint-popup__header">
        <div class="cec-popup__head-left">
          <div class="cec-popup__eyebrow">Complaint / Investigation</div>
          <div class="cec-popup__title complaint-popup__title">${fileNumber}</div>
        </div>

        <div class="cec-popup__head-right">
          <span class="status-badge complaint-status-badge">${status}</span>
        </div>
      </div>

      <div class="cec-popup__meta">
        <span><strong>Date Created:</strong> ${dateCreated}</span>
      </div>

      <div class="cec-popup__grid">
        <div class="cec-popup__row">
          <div class="cec-popup__k">Nature</div>
          <div class="cec-popup__v">${nature}</div>
        </div>

        <div class="cec-popup__row">
          <div class="cec-popup__k">Location</div>
          <div class="cec-popup__v">${location}</div>
        </div>
      </div>

      <div class="cec-popup__section">
        <div class="cec-popup__label complaint-popup__label">Comments</div>
        <div class="cec-popup__text">${comments}</div>
      </div>

      <div class="cec-popup__coords">
        <span><strong>UTM:</strong> E ${escapeComplaintHTML(item.EASTING ?? "—")} / N ${escapeComplaintHTML(item.NORTHING ?? "—")}</span>
      </div>
    </div>
  `;
}

function rebuildComplaintsLayers() {
  if (complaintsMarkers && map.hasLayer(complaintsMarkers)) map.removeLayer(complaintsMarkers);
  if (complaintsHeatLayer && map.hasLayer(complaintsHeatLayer)) map.removeLayer(complaintsHeatLayer);

  complaintsMarkers = L.markerClusterGroup({
    showCoverageOnHover: false,
    iconCreateFunction(cluster) {
      return L.divIcon({
        html: `<div><span>${cluster.getChildCount()}</span></div>`,
        className: "complaints-cluster",
        iconSize: L.point(40, 40)
      });
    }
  });

  const heatPoints = [];
  const converter = window.convertUTMToLatLonSmart || window.convertUTMToLatLon;

  window.allComplaintsData.forEach(item => {
    if (!Number.isFinite(item.EASTING) || !Number.isFinite(item.NORTHING) || !converter) return;
    const [lat, lon] = converter(item.EASTING, item.NORTHING);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const marker = L.circleMarker([lat, lon], {
      radius: 7, color: "#6b21a8", weight: 2,
      fillColor: "#a855f7", fillOpacity: 0.88
    }).bindPopup(buildComplaintPopupHTML(item), {
      maxWidth: 380,
      minWidth: 340,
      className: "complaint-popup-wrapper"
    });

    complaintsMarkers.addLayer(marker);
    heatPoints.push([lat, lon, 0.7]);
  });

  complaintsHeatLayer = L.heatLayer(heatPoints, {
    radius: 20, blur: 15, maxZoom: 17,
    gradient: {0.2: "#e9d5ff", 0.5: "#a855f7", 0.8: "#7e22ce", 1: "#581c87"}
  });

  switchComplaintsView(complaintsCurrentView);
}

function switchComplaintsView(mode) {
  if (complaintsMarkers && map.hasLayer(complaintsMarkers)) map.removeLayer(complaintsMarkers);
  if (complaintsHeatLayer && map.hasLayer(complaintsHeatLayer)) map.removeLayer(complaintsHeatLayer);
  complaintsCurrentView = mode;
  if (mode === "cluster" && complaintsMarkers) map.addLayer(complaintsMarkers);
  if (mode === "heatmap" && complaintsHeatLayer) map.addLayer(complaintsHeatLayer);
}
window.switchComplaintsView = switchComplaintsView;

function setupComplaintSearch() {
  const input = document.getElementById("complaintFileInput");
  const searchBtn = document.getElementById("complaintSearchBtn");
  const clearBtn = document.getElementById("complaintClearBtn");
  if (!input || !searchBtn || !clearBtn) return;

  function clearSearch() {
    input.value = "";
    if (complaintSearchMarker && map.hasLayer(complaintSearchMarker)) map.removeLayer(complaintSearchMarker);
    complaintSearchMarker = null;
  }

  function search() {
    const query = input.value.trim().toUpperCase();
    if (!query) return;
    const match = window.allComplaintsData.find(row =>
      String(row["COMPLAINT FILE NUMBER"] ?? "").trim().toUpperCase() === query
    );
    if (!match) { alert("No exact matching Complaint File Number was found."); return; }
    if (!Number.isFinite(match.EASTING) || !Number.isFinite(match.NORTHING)) {
      alert("The matching complaint does not have valid Easting and Northing coordinates."); return;
    }
    const converter = window.convertUTMToLatLonSmart || window.convertUTMToLatLon;
    const [lat, lon] = converter(match.EASTING, match.NORTHING);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { alert("The complaint coordinates could not be converted."); return; }
    if (complaintSearchMarker && map.hasLayer(complaintSearchMarker)) map.removeLayer(complaintSearchMarker);
    complaintSearchMarker = L.circleMarker([lat, lon], {
      radius: 10, color: "#581c87", weight: 3, fillColor: "#c084fc", fillOpacity: 0.9
    }).addTo(map).bindPopup(buildComplaintPopupHTML(match), {
      maxWidth: 380,
      minWidth: 340,
      className: "complaint-popup-wrapper"
    }).openPopup();
    map.setView([lat, lon], 16);
  }

  searchBtn.addEventListener("click", search);
  clearBtn.addEventListener("click", clearSearch);
  input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); search(); } });
}

function setupComplaintsData() {
  setupComplaintSearch();
  const bust = `${COMPLAINTS_CSV_URL}${COMPLAINTS_CSV_URL.includes("?") ? "&" : "?"}t=${Date.now()}`;
  fetch(bust, {cache: "no-store"})
    .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.text(); })
    .then(text => {
      const parsed = Papa.parse(text, {header: true, skipEmptyLines: true, transformHeader: h => h.trim()});
      window.allComplaintsData = parsed.data.map(row => ({
        ...row,
        EASTING: Number.isFinite(parseFloat(String(row.EASTING ?? "").replace(/,/g, ""))) ? parseFloat(String(row.EASTING).replace(/,/g, "")) : null,
        NORTHING: Number.isFinite(parseFloat(String(row.NORTHING ?? "").replace(/,/g, ""))) ? parseFloat(String(row.NORTHING).replace(/,/g, "")) : null
      }));
      rebuildComplaintsLayers();
      document.getElementById("complaintsDataViewGroup")?.classList.remove("disabled");
    })
    .catch(err => console.error("Error loading complaints CSV:", err));
}
window.setupComplaintsData = setupComplaintsData;
