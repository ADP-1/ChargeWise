let map;
let userMarker = null;
let stationMarkers = [];
let routingControl = null;

// Initialize map when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    
    // Add click event listener to the location button
    document.getElementById('location-button').addEventListener('click', getCurrentLocation);
});

function initMap() {
    // Initialize map centered on Delhi
    map = L.map('map').setView([28.6139, 77.2090], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
    }).addTo(map);

    // Add click handler to map
    map.on('click', function(e) {
        const position = {
            lat: e.latlng.lat,
            lng: e.latlng.lng
        };
        
        // Update user marker
        if (userMarker) {
            map.removeLayer(userMarker);
        }
        userMarker = L.marker([position.lat, position.lng], {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34]
            })
        }).addTo(map);
        userMarker.bindPopup("Your Selected Location").openPopup();

        // Fetch stations for clicked location
        fetchNearbyStations(position);
    });

    // Get user's current location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                const userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                map.setView([userLocation.lat, userLocation.lng], 13);
                fetchNearbyStations(userLocation);
            },
            error => {
                console.error('Error getting location:', error);
                // Default to Delhi if location access denied
                fetchNearbyStations({ lat: 28.6139, lng: 77.2090 });
            }
        );
    }
}

function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const pos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                };

                map.setView([pos.lat, pos.lng], 13);
                
                // Update user marker
                if (userMarker) map.removeLayer(userMarker);
                userMarker = L.marker([pos.lat, pos.lng], {
                    icon: L.icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34]
                    })
                }).addTo(map);
                userMarker.bindPopup("Your Location").openPopup();

                // Fetch nearby stations
                fetchNearbyStations(pos);
            },
            () => {
                handleLocationError(true);
            }
        );
    } else {
        handleLocationError(false);
    }
}

function fetchNearbyStations(position) {
    // Make actual API call to our backend
    fetch(`/api/stations/${position.lat}/${position.lng}`)
        .then(response => response.json())
        .then(data => {
            const stations = data.stations.map(station => ({
                position: { lat: station.position.lat, lng: station.position.lng },
                title: `Station ${station.id}`,
                waitTime: `${Math.round(station.wait_time)} mins`,
                connectors: station.connectors || ["Type 2", "CCS"],
                power: station.power || "50kW",
                confidence: station.confidence,
                activeChargers: station.active_chargers,
                totalChargers: station.total_chargers,
                type: station.type,
                name: station.name
            }));
            displayStations(stations);
        })
        .catch(error => {
            console.error('Error fetching stations:', error);
            // Fallback to dummy data if API fails
            const dummyStations = [
                {
                    position: { lat: position.lat + 0.01, lng: position.lng + 0.01 },
                    title: "Station 1",
                    waitTime: "5 mins",
                    connectors: ["Type 2", "CCS"],
                    power: "50kW",
                    type: "Market"
                },
                {
                    position: { lat: position.lat - 0.01, lng: position.lng - 0.01 },
                    title: "Station 2",
                    waitTime: "10 mins",
                    connectors: ["CHAdeMO", "Type 2"],
                    power: "150kW",
                    type: "Office"
                }
            ];
            displayStations(dummyStations);
        });
}

function displayStations(stations) {
    // Clear existing markers
    stationMarkers.forEach(marker => map.removeLayer(marker));
    stationMarkers = [];

    stations.forEach(station => {
        // Choose marker color based on station type
        const markerColor = getMarkerColor(station.type);
        
        const marker = L.marker([station.position.lat, station.position.lng], {
            icon: L.icon({
                iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${markerColor}.png`,
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34]
            })
        }).addTo(map);

        const popupContent = `
            <div class="station-popup">
                <h3>${station.name}</h3>
                <p class="station-type">${station.type} Area</p>
                <p>Location: ${station.position.lat.toFixed(4)}, ${station.position.lng.toFixed(4)}</p>
                <p>Wait Time: ${station.waitTime}</p>
                <p>Confidence: ${Math.round(station.confidence * 100)}%</p>
                <p>Available Chargers: ${station.activeChargers}/${station.totalChargers}</p>
                <p>Connectors: ${station.connectors.join(', ')}</p>
                <p>Power: ${station.power}</p>
                <button onclick="getDirections(${station.position.lat}, ${station.position.lng})">
                    Get Directions
                </button>
            </div>
        `;

        marker.bindPopup(popupContent);
        stationMarkers.push(marker);
    });
}

function getMarkerColor(stationType) {
    const colorMap = {
        'Market': 'red',
        'Office': 'blue',
        'Hospital': 'green',
        'School': 'orange',
        'Factory': 'violet',
        'Residential': 'gray'
    };
    return colorMap[stationType] || 'green';
}

function getDirections(destLat, destLng) {
    if (userMarker) {
        // Remove existing route if any
        if (routingControl) {
            map.removeControl(routingControl);
        }

        // Add new route
        routingControl = L.Routing.control({
            waypoints: [
                L.latLng(userMarker.getLatLng().lat, userMarker.getLatLng().lng),
                L.latLng(destLat, destLng)
            ],
            routeWhileDragging: true,
            showAlternatives: true,
            altLineOptions: {
                styles: [
                    {color: 'black', opacity: 0.15, weight: 9},
                    {color: 'white', opacity: 0.8, weight: 6},
                    {color: 'blue', opacity: 0.5, weight: 2}
                ]
            }
        }).addTo(map);
    }
}

function handleLocationError(browserHasGeolocation) {
    alert(
        browserHasGeolocation
            ? "Error: The Geolocation service failed."
            : "Error: Your browser doesn't support geolocation."
    );
}

// Initialize map when the page loads
window.onload = initMap;