let routeMap;
let routeLayer;
let markersLayer;
let destinationMarker;
let sourceMarker;

// Initialize map
function initializeMap() {
    routeMap = L.map('route-map').setView([51.505, -0.09], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(routeMap);
    
    markersLayer = L.layerGroup().addTo(routeMap);
    routeLayer = L.layerGroup().addTo(routeMap);

    // Add click event to map
    routeMap.on('click', handleMapClick);
}

// Handle map clicks for destination selection
function handleMapClick(e) {
    const latlng = e.latlng;
    
    // Update destination marker
    if (destinationMarker) {
        routeMap.removeLayer(destinationMarker);
    }
    
    destinationMarker = L.marker([latlng.lat, latlng.lng], {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41]
        })
    }).addTo(routeMap);

    // Update destination input field with coordinates
    document.getElementById('end-location').value = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
}

// Handle current location
function getCurrentLocation() {
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // Update source marker
            if (sourceMarker) {
                routeMap.removeLayer(sourceMarker);
            }

            sourceMarker = L.marker([lat, lng], {
                icon: L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41]
                })
            }).addTo(routeMap);

            // Update start location input field
            document.getElementById('start-location').value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            
            // Center map on current location
            routeMap.setView([lat, lng], 13);
        },
        (error) => {
            alert('Error getting your location: ' + error.message);
        }
    );
}

// EV Models database (simplified)
const evModels = {
    tesla_model_3: {
        name: "Tesla Model 3",
        batteryCapacity: 82, // kWh
        range: 358, // km
        chargingSpeed: 250, // kW
        consumption: 0.229 // kWh/km
    },
    nissan_leaf: {
        name: "Nissan Leaf",
        batteryCapacity: 62,
        range: 385,
        chargingSpeed: 100,
        consumption: 0.161
    },
    // Add more EV models
};

// Add this function to calculate the actual route
async function calculateRoute(startCoords, endCoords) {
    const startStr = `${startCoords[1]},${startCoords[0]}`; // OSRM expects lng,lat format
    const endStr = `${endCoords[1]},${endCoords[0]}`;
    
    try {
        const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${startStr};${endStr}?overview=full&geometries=geojson`
        );
        
        if (!response.ok) {
            throw new Error('Route calculation failed');
        }
        
        const data = await response.json();
        
        if (data.code !== 'Ok') {
            throw new Error('No route found');
        }
        
        return {
            coordinates: data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]), // Convert to lat,lng format
            distance: data.routes[0].distance / 1000, // Convert to km
            duration: Math.round(data.routes[0].duration / 60) // Convert to minutes
        };
    } catch (error) {
        console.error('Error calculating route:', error);
        throw error;
    }
}

// Update the displayRoute function to handle the new route format
function displayRoute(route, stops) {
    // Clear previous route and markers
    routeLayer.clearLayers();
    markersLayer.clearLayers();
    
    // Draw route line
    const routePath = L.polyline(route.coordinates, {
        color: '#4CAF50',
        weight: 5
    }).addTo(routeLayer);
    
    // Add markers for start and end points
    const startPoint = route.coordinates[0];
    const endPoint = route.coordinates[route.coordinates.length - 1];
    
    // Add route summary if available
    const routeSummary = document.createElement('div');
    routeSummary.className = 'route-summary';
    routeSummary.innerHTML = `
        <div class="summary-item">
            <i class="fas fa-road"></i>
            <span>Distance: ${route.distance.toFixed(1)} km</span>
        </div>
        <div class="summary-item">
            <i class="fas fa-clock"></i>
            <span>Duration: ${route.duration} mins</span>
        </div>
    `;
    document.querySelector('.route-results').prepend(routeSummary);
    
    // Start marker
    L.marker(startPoint, {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41]
        })
    }).addTo(markersLayer).bindPopup('Start');
    
    // End marker
    L.marker(endPoint, {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41]
        })
    }).addTo(markersLayer).bindPopup('Destination');
    
    // Add markers for charging stops
    stops.forEach((stop, index) => {
        const marker = L.marker([stop.lat, stop.lng], {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41]
            })
        }).addTo(markersLayer);
        
        const popupContent = `
            <div class="charging-stop-popup">
                <h3>${stop.name}</h3>
                <p>Arrival Charge: ${stop.arrivalCharge}%</p>
                <p>Charging Time: ${stop.chargeTime} mins</p>
                <p>Departure Charge: ${stop.departureCharge}%</p>
            </div>
        `;
        
        marker.bindPopup(popupContent);
    });
    
    // Update stops list in sidebar
    displayStopsList(stops);
    
    // Fit map to show entire route
    routeMap.fitBounds(routePath.getBounds(), {
        padding: [50, 50]
    });
}

// Display stops list in sidebar
function displayStopsList(stops) {
    const stopsList = document.getElementById('stops-list');
    if (!stops.length) {
        stopsList.innerHTML = '<p>No charging stops needed</p>';
        return;
    }
    
    const stopsHTML = stops.map((stop, index) => `
        <div class="stop-card">
            <h4>Stop ${index + 1}: ${stop.name}</h4>
            <div class="stop-details">
                <p><i class="fas fa-battery-half"></i> Arrival: ${stop.arrivalCharge}%</p>
                <p><i class="fas fa-clock"></i> Charge time: ${stop.chargeTime} mins</p>
                <p><i class="fas fa-battery-full"></i> Departure: ${stop.departureCharge}%</p>
            </div>
        </div>
    `).join('');
    
    stopsList.innerHTML = stopsHTML;
}

// Update the backend API call in the form submission handler
document.getElementById('route-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const startLocation = document.getElementById('start-location').value;
    const endLocation = document.getElementById('end-location').value;
    const evModel = document.getElementById('ev-model').value;
    const currentCharge = document.getElementById('current-charge').value;
    
    // Validate inputs
    if (!startLocation || !endLocation) {
        alert('Please select both start and destination locations');
        return;
    }
    
    try {
        // First calculate the actual route
        const [startLat, startLng] = startLocation.split(',').map(coord => parseFloat(coord.trim()));
        const [endLat, endLng] = endLocation.split(',').map(coord => parseFloat(coord.trim()));
        
        const routeData = await calculateRoute([startLat, startLng], [endLat, endLng]);
        
        // Then get charging stops from our backend
        const response = await fetch('/api/route-plan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                start: startLocation,
                end: endLocation,
                route: routeData,
                evModel: evModel,
                currentCharge: parseInt(currentCharge)
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Use the calculated route instead of straight line
        displayRoute(routeData, data.chargingStops);
    } catch (error) {
        console.error('Error planning route:', error);
        alert('Error planning route. Please try again.');
    }
});

// Initialize map when page loads
document.addEventListener('DOMContentLoaded', initializeMap); 