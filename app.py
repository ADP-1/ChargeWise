from flask import Flask, render_template, jsonify, send_from_directory, request
import requests
import json
from datetime import datetime
import numpy as np
import time
from models.location_optimizer import LocationOptimizer
from models.wait_time_predictor import WaitTimePredictor
from dataclasses import dataclass
from typing import Dict, Any

app = Flask(__name__, static_url_path='/static')

# Initialize our models
location_optimizer = LocationOptimizer()
wait_predictor = WaitTimePredictor()

# Define water bodies and restricted areas in NCR
RESTRICTED_AREAS = [
    # Yamuna River and floodplains - more detailed polygon
    {
        'name': 'Yamuna River and Floodplains',
        'polygon': [
            {'lat': 28.6890, 'lng': 77.2170},  # North Delhi
            {'lat': 28.6800, 'lng': 77.2220},
            {'lat': 28.6700, 'lng': 77.2250},
            {'lat': 28.6600, 'lng': 77.2280},
            {'lat': 28.6500, 'lng': 77.2300},
            {'lat': 28.6400, 'lng': 77.2320},
            {'lat': 28.6300, 'lng': 77.2340},
            {'lat': 28.6200, 'lng': 77.2360},
            {'lat': 28.6100, 'lng': 77.2380},
            {'lat': 28.6000, 'lng': 77.2400},
            {'lat': 28.5900, 'lng': 77.2420},
            {'lat': 28.5800, 'lng': 77.2440},
            {'lat': 28.5700, 'lng': 77.2460},  # South Delhi
            # West bank
            {'lat': 28.5700, 'lng': 77.2360},
            {'lat': 28.5800, 'lng': 77.2340},
            {'lat': 28.5900, 'lng': 77.2320},
            {'lat': 28.6000, 'lng': 77.2300},
            {'lat': 28.6100, 'lng': 77.2280},
            {'lat': 28.6200, 'lng': 77.2260},
            {'lat': 28.6300, 'lng': 77.2240},
            {'lat': 28.6400, 'lng': 77.2220},
            {'lat': 28.6500, 'lng': 77.2200},
            {'lat': 28.6600, 'lng': 77.2180},
            {'lat': 28.6700, 'lng': 77.2160},
            {'lat': 28.6800, 'lng': 77.2140},
            {'lat': 28.6890, 'lng': 77.2170}  # Close the polygon
        ]
    },
    # Add other water bodies
    {
        'name': 'Okhla Bird Sanctuary',
        'polygon': [
            {'lat': 28.5680, 'lng': 77.3000},
            {'lat': 28.5700, 'lng': 77.3100},
            {'lat': 28.5600, 'lng': 77.3150},
            {'lat': 28.5550, 'lng': 77.3050},
            {'lat': 28.5680, 'lng': 77.3000}
        ]
    }
]

# Define EV models data structure
ev_models = {
    'tesla_model_3': {
        'name': "Tesla Model 3",
        'battery_capacity': 82,  # kWh
        'range': 358,  # km
        'charging_speed': 250,  # kW
        'consumption': 0.229  # kWh/km
    },
    'nissan_leaf': {
        'name': "Nissan Leaf",
        'battery_capacity': 62,
        'range': 385,
        'charging_speed': 100,
        'consumption': 0.161
    },
    'chevy_bolt': {
        'name': "Chevrolet Bolt",
        'battery_capacity': 65,
        'range': 417,
        'charging_speed': 55,
        'consumption': 0.156
    }
}

def point_in_polygon(point, polygon):
    """Ray casting algorithm to determine if point is in polygon"""
    x, y = point['lng'], point['lat']
    inside = False
    j = len(polygon) - 1
    
    for i in range(len(polygon)):
        if ((polygon[i]['lng'] > x) != (polygon[j]['lng'] > x) and
            y < (polygon[j]['lat'] - polygon[i]['lat']) * 
            (x - polygon[i]['lng']) / 
            (polygon[j]['lng'] - polygon[i]['lng']) + 
            polygon[i]['lat']):
            inside = not inside
        j = i
    
    return inside

def is_valid_location(lat, lng):
    """Enhanced location validation with buffer zone"""
    point = {'lat': lat, 'lng': lng}
    
    # Add a buffer zone around restricted areas (approximately 100 meters)
    BUFFER = 0.001  # roughly 100 meters in degrees
    
    for area in RESTRICTED_AREAS:
        # Check if point is in restricted area or buffer zone
        for i in range(len(area['polygon'])):
            p1 = area['polygon'][i]
            p2 = area['polygon'][(i + 1) % len(area['polygon'])]
            
            # Calculate distance to line segment
            if distance_to_line_segment(point, p1, p2) < BUFFER:
                return False
    
    return True

def distance_to_line_segment(p, p1, p2):
    """Calculate distance from point to line segment"""
    x, y = p['lng'], p['lat']
    x1, y1 = p1['lng'], p1['lat']
    x2, y2 = p2['lng'], p2['lat']
    
    A = x - x1
    B = y - y1
    C = x2 - x1
    D = y2 - y1
    
    dot = A * C + B * D
    len_sq = C * C + D * D
    
    if len_sq == 0:
        return np.sqrt(A * A + B * B)
        
    param = dot / len_sq
    
    if param < 0:
        return np.sqrt(A * A + B * B)
    elif param > 1:
        return np.sqrt((x - x2) * (x - x2) + (y - y2) * (y - y2))
    
    return abs(A * D - C * B) / np.sqrt(len_sq)

def get_time_info():
    """Get current time information"""
    current_time = datetime.now()
    hour = current_time.hour
    
    # Determine time of day
    if 6 <= hour < 12:
        time_of_day = 'morning'
    elif 12 <= hour < 17:
        time_of_day = 'afternoon'
    else:
        time_of_day = 'evening'
    
    return {
        'is_weekend': current_time.weekday() >= 5,
        'time_of_day': time_of_day,
        'hour': hour,
        'day_of_week': current_time.weekday()
    }

def fetch_gas_stations(lat, lng, radius=3000):
    """Fetch gas stations and convert them to nodes for optimization"""
    overpass_url = "http://overpass-api.de/api/interpreter"
    
    overpass_query = f"""
    [out:json][timeout:25];
    (
        node["amenity"="fuel"](around:{radius},{lat},{lng});
        way["amenity"="fuel"](around:{radius},{lat},{lng});
    );
    out body;
    >;
    out skel qt;
    """
    
    try:
        response = requests.post(overpass_url, data=overpass_query)
        data = response.json()
        
        nodes = []
        for element in data.get('elements', []):
            if element.get('type') == 'node':
                node = {
                    'lat': element.get('lat'),
                    'lng': element.get('lon'),
                    'type': determine_area_type(element),
                    'name': element.get('tags', {}).get('name', 'Unnamed Station')
                }
                if is_valid_location(node['lat'], node['lng']):
                    nodes.append(node)
        return nodes
    except Exception as e:
        print(f"Error fetching gas stations: {e}")
        return []

def determine_area_type(element):
    """Determine area type based on surroundings"""
    tags = element.get('tags', {})
    
    if tags.get('shop') in ['mall', 'supermarket']:
        return 'Market'
    elif tags.get('building') in ['commercial', 'office']:
        return 'Office'
    elif tags.get('amenity') in ['hospital', 'clinic']:
        return 'Hospital'
    elif tags.get('amenity') in ['school', 'university']:
        return 'School'
    elif tags.get('industrial') == 'yes':
        return 'Factory'
    else:
        return 'Market'  # Default to market for gas stations

def analyze_location_suitability(gas_station, existing_stations):
    """Enhanced location suitability analysis"""
    if not is_valid_location(gas_station['lat'], gas_station['lng']):
        return 0
    
    # Check minimum distance from existing stations
    MIN_DISTANCE = 0.005  # roughly 500m
    for existing in existing_stations:
        dist = np.sqrt(
            (gas_station['lat'] - existing['lat'])**2 + 
            (gas_station['lng'] - existing['lng'])**2
        )
        if dist < MIN_DISTANCE:
            return 0
    
    # Base score
    score = 1.0
    
    # Factors affecting suitability
    if gas_station.get('near_highway', False):
        score *= 1.3  # Prefer locations near major roads
    
    if gas_station.get('in_commercial', False):
        score *= 1.2  # Prefer commercial areas
    
    if '24/7' in gas_station.get('opening_hours', ''):
        score *= 1.2  # Prefer 24/7 locations
    
    if gas_station.get('brand', 'Unknown') != 'Unknown':
        score *= 1.1  # Prefer established brands
    
    return score

@app.route('/')
def dashboard():
    return render_template('dashboard.html')

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

@app.route('/api/stations/<lat>/<lng>')
def get_nearby_stations(lat, lng):
    lat, lng = float(lat), float(lng)
    time_info = get_time_info()
    
    # Fetch gas stations as potential nodes
    nodes = fetch_gas_stations(lat, lng)
    
    if not nodes:
        return jsonify({'error': 'No suitable locations found', 'stations': []})
    
    # Get optimal locations using the LocationOptimizer
    candidates = location_optimizer.get_candidate_locations(nodes, time_info)
    
    # Prepare station data for wait time prediction
    station_data = []
    for i, candidate in enumerate(candidates[:5]):  # Take top 5 candidates
        station = {
            'id': i + 1,
            'name': f"EV Station {i+1}",
            'lat': candidate['location']['lat'],
            'lng': candidate['location']['lng'],
            'type': candidate['type'],
            'active_chargers': np.random.randint(3, 7),
            'total_chargers': np.random.randint(7, 12),
            'current_queue_length': np.random.randint(0, 3),
            'hour_of_day': time_info['hour'],
            'day_of_week': time_info['day_of_week'],
            'is_weekend': time_info['is_weekend'],
            'traffic_density': candidate['congestion_score'],
            'historical_avg_wait_time': 15
        }
        station_data.append(station)
    
    # Get wait time predictions
    predictions = wait_predictor.predict_wait_time(station_data)
    
    # Prepare response
    stations = []
    for station, pred in zip(station_data, predictions):
        stations.append({
            'id': station['id'],
            'name': station['name'],
            'position': {'lat': station['lat'], 'lng': station['lng']},
            'wait_time': pred['predicted_wait'],
            'confidence': pred['confidence'],
            'active_chargers': station['active_chargers'],
            'total_chargers': station['total_chargers'],
            'connectors': get_random_connectors(),
            'power': get_random_power(),
            'type': station['type']
        })
    
    return jsonify({'stations': stations})

def get_random_connectors():
    connector_types = ["Type 2", "CCS", "CHAdeMO"]
    num_connectors = np.random.randint(1, len(connector_types) + 1)
    return np.random.choice(connector_types, num_connectors, replace=False).tolist()

def get_random_power():
    power_options = ["50kW", "100kW", "150kW", "350kW"]
    return np.random.choice(power_options)

@app.route('/api/optimize-locations/<lat>/<lng>')
def get_optimal_locations(lat, lng):
    # Dummy node data for demonstration
    nodes = [
        {'id': 1, 'type': 'Market', 'lat': float(lat) + 0.02, 'lng': float(lng) + 0.02},
        {'id': 2, 'type': 'Office', 'lat': float(lat) - 0.02, 'lng': float(lng) - 0.02},
        # Add more nodes...
    ]
    
    # Dummy VSF matrix
    vsf_matrix = np.random.rand(len(nodes), len(nodes))
    
    candidates = location_optimizer.get_candidate_locations(nodes, vsf_matrix)
    
    return jsonify({'candidates': candidates})

@app.route('/nearby-stations')
def nearby_stations():
    return render_template('index.html')  # Your existing station search page

@app.route('/route-planner')
def route_planner():
    return render_template('route_planner.html')

@app.route('/favorites')
def favorites():
    return render_template('favorites.html')  # You'll need to create this

@app.route('/statistics')
def statistics():
    return render_template('statistics.html')  # You'll need to create this

@app.route('/api/route-plan', methods=['POST'])
def plan_route():
    data = request.json
    
    # Extract route data
    route = data['route']
    ev_model = data['evModel']
    current_charge = data['currentCharge']
    
    # Validate EV model
    if ev_model not in ev_models:
        return jsonify({'error': 'Invalid EV model'}), 400
    
    # Calculate optimal charging stops based on the actual route
    total_distance = route['distance']
    ev_range = ev_models[ev_model]['range'] * (current_charge / 100)
    
    charging_stops = []
    
    if total_distance > ev_range:
        # Calculate number of stops needed
        remaining_distance = total_distance
        current_position = 0
        route_coordinates = route['coordinates']
        
        while remaining_distance > ev_range:
            # Find a charging stop approximately at the maximum range
            stop_index = int(len(route_coordinates) * (ev_range / remaining_distance))
            stop_point = route_coordinates[stop_index]
            
            # Find nearest actual charging station using existing function
            nearby_stations = fetch_gas_stations(stop_point[0], stop_point[1], radius=5000)
            
            if nearby_stations:
                nearest_station = nearby_stations[0]  # Take the first station for now
                charging_stops.append({
                    'name': nearest_station.get('name', f'Charging Stop {len(charging_stops) + 1}'),
                    'lat': nearest_station['lat'],
                    'lng': nearest_station['lng'],
                    'chargeTime': calculate_charge_time(
                        ev_models[ev_model],
                        10,  # Arrival charge percentage
                        90   # Target charge percentage
                    ),
                    'arrivalCharge': 10,
                    'departureCharge': 90,
                    'type': nearest_station.get('type', 'Fast Charger')
                })
            
            remaining_distance -= ev_range
            current_position += ev_range
            ev_range = ev_models[ev_model]['range'] * 0.8  # Assume 80% charge for subsequent stops
    
    return jsonify({
        'chargingStops': charging_stops
    })

def calculate_charge_time(ev_model: Dict[str, Any], start_charge: int, target_charge: int) -> int:
    """Calculate charging time in minutes"""
    charge_difference = target_charge - start_charge
    battery_capacity = ev_model['battery_capacity']
    charging_speed = ev_model['charging_speed']
    
    # Simplified charging time calculation
    # In reality, charging speed varies based on battery level
    energy_needed = (charge_difference / 100) * battery_capacity
    hours_needed = energy_needed / charging_speed
    return round(hours_needed * 60)  # Convert to minutes

if __name__ == '__main__':
    app.run(debug=True)