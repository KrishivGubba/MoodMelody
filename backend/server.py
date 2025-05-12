from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
import base64
from dotenv import load_dotenv
from datetime import datetime
import io
from PIL import Image


# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Spotify API credentials
CLIENT_ID = os.getenv('SPOTIFY_CLIENT_ID')
CLIENT_SECRET = os.getenv('SPOTIFY_CLIENT_SECRET')
REDIRECT_URI = os.getenv('REDIRECT_URI', 'http://127.0.0.1:3000/callback')

# Route to handle the callback after Spotify auth
@app.route('/callback', methods=['POST'])
def spotify_callback():
    # Get the authorization code from request
    data = request.get_json()
    code = data.get('code')
    
    if not code:
        return jsonify({'error': 'Authorization code is required'}), 400
    
    try:
        # Exchange the authorization code for access and refresh tokens
        auth_header = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
        
        token_response = requests.post(
            'https://accounts.spotify.com/api/token',
            data={
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': REDIRECT_URI
            },
            headers={
                'Authorization': f'Basic {auth_header}',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        )
        
        token_data = token_response.json()
        
        if 'error' in token_data:
            return jsonify({'error': token_data['error_description']}), 400
        
        # Return tokens to the client
        return jsonify({
            'access_token': token_data['access_token'],
            'refresh_token': token_data['refresh_token'],
            'expires_in': token_data['expires_in']
        })
        
    except Exception as e:
        print(f"Error exchanging code for token: {str(e)}")
        return jsonify({'error': 'Failed to exchange authorization code for token'}), 500

# Route to refresh an expired token
@app.route('/api/spotify/refresh-token', methods=['POST'])
def refresh_token():
    data = request.get_json()
    refresh_token = data.get('refresh_token')
    
    if not refresh_token:
        return jsonify({'error': 'Refresh token is required'}), 400
    
    try:
        auth_header = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
        
        token_response = requests.post(
            'https://accounts.spotify.com/api/token',
            data={
                'grant_type': 'refresh_token',
                'refresh_token': refresh_token
            },
            headers={
                'Authorization': f'Basic {auth_header}',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        )
        
        token_data = token_response.json()
        
        if 'error' in token_data:
            return jsonify({'error': token_data['error_description']}), 400
        
        return jsonify({
            'access_token': token_data['access_token'],
            'expires_in': token_data['expires_in']
        })
        
    except Exception as e:
        print(f"Error refreshing token: {str(e)}")
        return jsonify({'error': 'Failed to refresh token'}), 500

# Route to fetch user profile
@app.route('/api/spotify/profile', methods=['GET'])
def get_user_profile():
    # Get token from the Authorization header
    auth_header = request.headers.get('Authorization')
    
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Access token is required'}), 401
    
    token = auth_header.split(' ')[1]
    
    try:
        # Use the token to fetch user profile from Spotify
        profile_response = requests.get(
            'https://api.spotify.com/v1/me',
            headers={
                'Authorization': f'Bearer {token}'
            }
        )
        
        if profile_response.status_code == 401:
            return jsonify({'error': 'Token expired'}), 401
            
        profile_data = profile_response.json()
        print(profile_data)
        return jsonify(profile_data)
        
    except Exception as e:
        print(f"Error fetching user profile: {str(e)}")
        return jsonify({'error': 'Failed to fetch user profile'}), 500

# Route to play a track or playlist
@app.route('/api/spotify/play', methods=['POST'])
def play_music():
    data = request.get_json()
    search_query = data.get('search_query')  # Search prompt instead of URI
    device_id = data.get('device_id')  # Optional device ID
    
    # Get token from the Authorization header
    auth_header = request.headers.get('Authorization')
    
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Access token is required'}), 401
    
    token = auth_header.split(' ')[1]
    
    try:
        # First, search for tracks matching the query
        search_endpoint = 'https://api.spotify.com/v1/search'
        search_params = {
            'q': search_query,
            'type': 'track',
            'limit': 1  # Only get the top result
        }
        
        search_response = requests.get(
            search_endpoint,
            params=search_params,
            headers={
                'Authorization': f'Bearer {token}'
            }
        )
        
        if search_response.status_code != 200:
            if search_response.status_code == 401:
                return jsonify({'error': 'Token expired'}), 401
            else:
                return jsonify({'error': 'Failed to search Spotify'}), search_response.status_code
        
        search_data = search_response.json()
        
        # Check if we got any tracks
        if not search_data['tracks']['items']:
            return jsonify({'error': 'No tracks found matching the query'}), 404
        
        # Get the URI of the first track
        track_uri = search_data['tracks']['items'][0]['uri']
        
        print(f"Found track: {search_data['tracks']['items'][0]['name']} by {search_data['tracks']['items'][0]['artists'][0]['name']}")
        print(f"Track URI: {track_uri}")
        
        # Now play the track using the existing logic
        endpoint = 'https://api.spotify.com/v1/me/player/play'
        if device_id:
            endpoint += f'?device_id={device_id}'
            
        play_response = requests.put(
            endpoint,
            json={'uris': [track_uri]},
            headers={
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json'
            }
        )
        
        if play_response.status_code == 204:
            return jsonify({
                'success': True,
                'track_info': {
                    'name': search_data['tracks']['items'][0]['name'],
                    'artist': search_data['tracks']['items'][0]['artists'][0]['name'],
                    'uri': track_uri
                }
            })
        elif play_response.status_code == 401:
            return jsonify({'error': 'Token expired'}), 401
        else:
            error_data = play_response.json()
            return jsonify({'error': error_data.get('error', {}).get('message', 'Unknown error')}), play_response.status_code
            
    except Exception as e:
        print(f"Error playing music: {str(e)}")
        return jsonify({'error': 'Failed to control playback'}), 500
    
from imageClassifier import ImageActivityClassifier
def recognizeActivity(image):
    """
    Recognize activity from the image using the ImageActivityClassifier
    
    Args:
        image: PIL Image object from the request
        
    Returns:
        activity_name: String representing the detected activity (formatted for display)
        playlist_uri: Spotify playlist URI corresponding to the activity
    """
    try:
        # Use the classifier to get predictions
        classifier = ImageActivityClassifier()

        predictions = classifier.classify(image)
        
        if not predictions or len(predictions) == 0:
            print("No activity predictions found, defaulting to coding")
            return "coding", "spotify:playlist:37i9dQZF1DX5trt9i14X7j"
        
        # Get the top prediction
        top_activity, confidence = predictions[0]
        
        
        return top_activity, confidence
        
    except Exception as e:
        print(f"Error in recognizeActivity: {str(e)}")
        return "coding", "spotify:playlist:37i9dQZF1DX5trt9i14X7j"

@app.route('/api/analyze-screenshot', methods=['POST'])
def analyze_screenshot():
    try:
        # Check for Authorization header
        auth_header = request.headers.get('Authorization')
        if auth_header:
            print(f"Received Authorization header: {auth_header[:20]}...")  # Print first 20 chars for security
        
        # Process the screenshot if present
        if 'screenshot' in request.files:
            file = request.files['screenshot']
            print(f"Received screenshot: {file.filename}")
            
            # Convert file data to PIL Image
            image_bytes = file.read()
            image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
            
            # Recognize activity from the image using our method
            activity, playlist_uri = recognizeActivity(image)
            print(activity, playlist_uri)
            # Return the detected activity and playlist
            return jsonify({
                'activity': activity,
                'playlist_uri': playlist_uri,
                'timestamp': datetime.now().isoformat()
            })
        else:
            print("No screenshot file received")
            # If no file is provided, return default values
            return jsonify({
                'activity': 'coding',
                'playlist_uri': 'spotify:track:3xKsf9qdS1CyvXSMEid6g8',
                'timestamp': datetime.now().isoformat(),
                'note': 'Default values returned - no image provided'
            })

    except Exception as e:
        print(f"Error in analyze_screenshot: {str(e)}")
        return jsonify({'error': 'Error processing screenshot', 'details': str(e)}), 500
    

# Environment setup (.env file)
# SPOTIFY_CLIENT_ID=your_client_id_here
# SPOTIFY_CLIENT_SECRET=your_client_secret_here
# REDIRECT_URI=http://127.0.0.1:3000/callback
# FLASK_ENV=development
# FLASK_APP=app.py

if __name__ == '__main__':
    app.run(debug=True, port=5000)