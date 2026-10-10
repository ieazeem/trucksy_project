// Initialize main dashboard map
const map = L.map('map').setView([26.0667, 50.5577], 10); // Bahrain center
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let driverMarkers = {};

// Fetch all drivers and plot on map + table
async function loadDrivers() {
    const res = await fetch('/api/drivers/status/all/');
    const drivers = await res.json();

    const tbody = document.querySelector('#drivers-table tbody');
    tbody.innerHTML = ''; // clear table

    drivers.forEach(driver => {
        // Add to table
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${driver.id}</td>
            <td><a href="#" class="driver-link" data-id="${driver.id}">${driver.name}</a></td>
            <td>${driver.phone || ''}</td>
            <td>${driver.truck_id || ''}</td>
            <td>${driver.active ? 'Yes' : 'No'}</td>
        `;
        tbody.appendChild(tr);

        // Add marker if location exists
        if(driver.latitude && driver.longitude){
            if(driverMarkers[driver.id]) map.removeLayer(driverMarkers[driver.id]);

            const marker = L.marker([driver.latitude, driver.longitude])
                .addTo(map)
                .bindPopup(`<b>${driver.name}</b><br>${driver.truck_id || ''}`);
            driverMarkers[driver.id] = marker;
        }
    });

    // Driver click -> show history
    document.querySelectorAll('.driver-link').forEach(link => {
        link.addEventListener('click', function(e){
            e.preventDefault();
            const driverId = this.dataset.id;
            showDriverHistory(driverId);
        });
    });
}

// ---------------------------
// Modal & History Map
// ---------------------------
const modal = document.getElementById('historyModal');
const closeBtn = modal.querySelector('.close');
closeBtn.onclick = () => modal.style.display = 'none';

// Show history modal for a driver
async function showDriverHistory(driverId){
    modal.style.display = 'block';

    // Clear existing map if any
    if(window.historyMap) window.historyMap.remove();

    // Create new map
    window.historyMap = L.map('historyMap').setView([26.0667, 50.5577], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(window.historyMap);

    // Fetch driver history
    const res = await fetch(`/api/drivers/${driverId}/history/`);
    const locations = await res.json();

    const latlngs = [];
    locations.forEach(loc => {
        if(loc.latitude && loc.longitude){
            latlngs.push([loc.latitude, loc.longitude]);
            L.circleMarker([loc.latitude, loc.longitude], {
                radius: 5,
                color: 'blue'
            }).addTo(window.historyMap)
            .bindPopup(`Time: ${loc.timestamp}<br>Weight: ${loc.weight || ''}`);
        }
    });

    if(latlngs.length) {
        const bounds = L.latLngBounds(latlngs);
        window.historyMap.fitBounds(bounds);
    }
}

// Close modal if clicked outside content
window.onclick = function(event) {
    if(event.target == modal) modal.style.display = 'none';
};

// Refresh drivers every 10 seconds
loadDrivers();
setInterval(loadDrivers, 10000);
