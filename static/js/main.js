let map;
let userMarker = null;
let stationMarkers = [];
let routingControl = null;
let accuracyCircle = null;
let isMapInitialized = false;

// Replace with your Google Maps API key
const GOOGLE_MAPS_API_KEY = 'YOUR_API_KEY';

// Initialize map when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize if the map container exists
    const mapContainer = document.getElementById('map');
    if (mapContainer && !isMapInitialized) {
        initMap();
    }
});

function initMap() {
    // Check if map is already initialized
    if (isMapInitialized) {
        return;
    }

    // Initialize map
    map = L.map('map').setView([28.6139, 77.2090], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
    }).addTo(map);

    // Add click handler to map
    map.on('click', function(e) {
        handleLocationSelect(e.latlng.lat, e.latlng.lng);
    });

    // Add event listener to location button
    const locationButton = document.getElementById('location-button');
    if (locationButton) {
        locationButton.addEventListener('click', getCurrentLocation);
    }

    isMapInitialized = true;
}

function getCurrentLocation() {
    const button = document.getElementById('location-button');
    button.textContent = 'Getting location...';
    button.disabled = true;

    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser");
        button.textContent = 'Use My Location';
        button.disabled = false;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        // Success callback
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            // Update map and marker
            handleLocationSelect(lat, lng);
            map.setView([lat, lng], 14);
            
            button.textContent = 'Use My Location';
            button.disabled = false;
        },
        // Error callback
        function(error) {
            let errorMessage = "Error getting your location. ";
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage += "Please enable location services.";
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage += "Location unavailable.";
                    break;
                case error.TIMEOUT:
                    errorMessage += "Request timed out.";
                    break;
                default:
                    errorMessage += "An unknown error occurred.";
            }
            alert(errorMessage);
            button.textContent = 'Use My Location';
            button.disabled = false;
        },
        // Options
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }
    );
}

function handleLocationSelect(lat, lng) {
    if (userMarker) {
        map.removeLayer(userMarker);
    }
    
    userMarker = L.marker([lat, lng], {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34]
        })
    }).addTo(map);
    userMarker.bindPopup("Your Location").openPopup();

    fetchNearbyStations(lat, lng);
}

function fetchNearbyStations(lat, lng) {
    fetch(`/api/stations/${lat}/${lng}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
                return;
            }
            displayStations(data.stations);
        })
        .catch(error => {
            console.error('Error fetching stations:', error);
            alert('Error fetching nearby stations. Please try again.');
        });
}

function displayStations(stations) {
    // Clear existing markers
    stationMarkers.forEach(marker => map.removeLayer(marker));
    stationMarkers = [];

    stations.forEach(station => {
        const marker = L.marker([station.position.lat, station.position.lng], {
            icon: L.icon({
                iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${getMarkerColor(station.type)}.png`,
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34]
            })
        }).addTo(map);

        const popupContent = `
            <div class="station-popup">
                <h3>${station.name}</h3>
                <p>Type: ${station.type}</p>
                <p>Wait Time: ${station.wait_time} minutes</p>
                <p>Available Chargers: ${station.active_chargers}/${station.total_chargers}</p>
                <p>Connectors: ${station.connectors.join(', ')}</p>
                <p>Power: ${station.power} kW</p>
                <button onclick="getDirections(${station.position.lat}, ${station.position.lng})" class="direction-btn">
                    Get Directions
                </button>
            </div>
        `;

        marker.bindPopup(popupContent);
        stationMarkers.push(marker);
    });
}

function getMarkerColor(stationType) {
    switch(stationType.toLowerCase()) {
        case 'market':
            return 'green';
        case 'office':
            return 'blue';
        case 'hospital':
            return 'red';
        case 'school':
            return 'orange';
        default:
            return 'blue';
    }
}

function getDirections(destLat, destLng) {
    // Get user's current location or marker position
    let startLat, startLng;
    
    if (userMarker) {
        const userPos = userMarker.getLatLng();
        startLat = userPos.lat;
        startLng = userPos.lng;
    } else {
        alert("Please set your location first!");
        return;
    }

    // Open Google Maps in a new tab with directions
    const url = `https://www.google.com/maps/dir/?api=1&origin=${startLat},${startLng}&destination=${destLat},${destLng}&travelmode=driving`;
    window.open(url, '_blank');
}

// Add some CSS for the location button
const style = document.createElement('style');
style.textContent = `
    .custom-map-control {
        margin: 10px;
    }
    .location-button {
        padding: 8px 12px;
        background: white;
        border: 2px solid rgba(0,0,0,0.2);
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
    }
    .location-button:hover {
        background: #f4f4f4;
    }
    .location-button:disabled {
        background: #cccccc;
        cursor: wait;
    }
`;
document.head.appendChild(style);