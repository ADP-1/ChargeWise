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
    if (isMapInitialized) {
        return;
    }

    map = L.map('map').setView([28.6139, 77.2090], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
    }).addTo(map);

    map.on('click', function(e) {
        handleLocationSelect(e.latlng.lat, e.latlng.lng);
    });

    const locationButton = document.getElementById('location-button');
    if (locationButton) {
        locationButton.addEventListener('click', getCurrentLocation);
    }

    isMapInitialized = true;
}

function getCurrentLocation() {
    const button = document.getElementById('location-button');
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Getting location...';
    button.disabled = true;

    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser");
        resetLocationButton(button);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        // Success callback
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            handleLocationSelect(lat, lng);
            map.setView([lat, lng], 14);
            resetLocationButton(button);
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
            resetLocationButton(button);
        },
        // Options
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }
    );
}

function resetLocationButton(button) {
    button.innerHTML = '<i class="fas fa-location-arrow"></i> Use My Location';
    button.disabled = false;
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

    // Update station list
    const stationList = document.getElementById('station-list');
    stationList.innerHTML = '';

    // Create bounds to fit all markers
    const bounds = L.latLngBounds();

    stations.forEach(station => {
        // Get station position
        const position = station.position || { lat: station.lat, lng: station.lng };
        
        // Add marker to map
        const marker = L.marker([position.lat, position.lng], {
            icon: L.icon({
                iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${getMarkerColor(station.type)}.png`,
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34]
            })
        }).addTo(map);

        // Create popup content
        const popupContent = `
            <div class="station-popup">
                <h3>${station.name}</h3>
                <div class="station-details">
                    <p><i class="fas fa-charging-station"></i> ${station.active_chargers}/${station.total_chargers} Chargers Available</p>
                    <p><i class="fas fa-clock"></i> ${station.wait_time || station.historical_avg_wait_time} mins wait time</p>
                    <p><i class="fas fa-bolt"></i> ${station.power || '50'} kW</p>
                    <p><i class="fas fa-car"></i> Queue: ${station.current_queue_length || '0'} vehicles</p>
                </div>
                <button onclick="getDirections(${position.lat}, ${position.lng})" class="direction-btn">
                    <i class="fas fa-directions"></i> Get Directions
                </button>
            </div>
        `;
        
        marker.bindPopup(popupContent);
        stationMarkers.push(marker);

        // Add station location to bounds
        bounds.extend([position.lat, position.lng]);

        // Create station card in list
        const stationCard = document.createElement('div');
        stationCard.className = 'station-card';
        stationCard.innerHTML = `
            <h3>${station.name}</h3>
            <div class="station-details">
                <p><i class="fas fa-charging-station"></i> ${station.active_chargers}/${station.total_chargers} Chargers</p>
                <p><i class="fas fa-clock"></i> ${station.wait_time || station.historical_avg_wait_time} mins wait</p>
                <p><i class="fas fa-bolt"></i> ${station.power || '50'} kW</p>
                <p><i class="fas fa-car"></i> Queue: ${station.current_queue_length || '0'} vehicles</p>
            </div>
            <button onclick="getDirections(${position.lat}, ${position.lng})" class="direction-btn">
                <i class="fas fa-directions"></i> Get Directions
            </button>
        `;

        // Add click handler to center map on station
        stationCard.addEventListener('click', () => {
            map.setView([position.lat, position.lng], 15);
            marker.openPopup();
        });

        stationList.appendChild(stationCard);
    });

    // If we have stations, fit the map to show all of them
    if (stationMarkers.length > 0) {
        // Add user location to bounds if it exists
        if (userMarker) {
            bounds.extend(userMarker.getLatLng());
        }
        // Fit the map to show all markers with some padding
        map.fitBounds(bounds, {
            padding: [50, 50],
            maxZoom: 15
        });
    }
}

function getMarkerColor(stationType) {
    switch(stationType.toLowerCase()) {
        case 'market': return 'green';
        case 'office': return 'blue';
        case 'hospital': return 'red';
        case 'school': return 'orange';
        case 'mall': return 'violet';
        case 'parking': return 'yellow';
        default: return 'blue';
    }
}

function getDirections(destLat, destLng) {
    if (!userMarker) {
        alert("Please set your location first!");
        return;
    }
    
    const userPos = userMarker.getLatLng();
    const url = `https://www.google.com/maps/dir/?api=1&origin=${userPos.lat},${userPos.lng}&destination=${destLat},${destLng}&travelmode=driving`;
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