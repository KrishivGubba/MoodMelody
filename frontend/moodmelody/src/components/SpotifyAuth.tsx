import React, { useEffect, useState } from 'react';
import './SpotifyAuth.css';
const SpotifyAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    // Check if the URL contains the auth code from Spotify redirect
    const urlParams = new URLSearchParams(window.location.search);
    const spotifyCode = urlParams.get('code');
    
    // If there's a code in the URL, exchange it for an access token
    if (spotifyCode) {
      exchangeCodeForToken(spotifyCode);
    }
    
    // Check if we already have a token in localStorage
    const token = localStorage.getItem('spotify_access_token');
    const tokenExpiry = localStorage.getItem('spotify_token_expiry');
    
    if (token && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
      setIsAuthenticated(true);
      fetchUserProfile(token);
    }
  }, []);

  const exchangeCodeForToken = async (code) => {
    try {
      // Send the code to your backend to exchange for tokens
      const response = await fetch('http://127.0.0.1:5000/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });
      
      const data = await response.json();
      
      if (data.access_token) {
        // Store tokens securely
        localStorage.setItem('spotify_access_token', data.access_token);
        localStorage.setItem('spotify_refresh_token', data.refresh_token);
        
        // Calculate expiry time (subtract 60 seconds for safety)
        const expiryTime = Date.now() + (data.expires_in * 1000) - 60000;
        localStorage.setItem('spotify_token_expiry', expiryTime);
        
        setIsAuthenticated(true);
        fetchUserProfile(data.access_token);
        
        // Remove the code from URL for cleanliness
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (error) {
      console.error('Error exchanging code for token:', error);
    }
  };

  const fetchUserProfile = async (token) => {
    try {
      const response = await fetch('http://127.0.0.1:5000/api/spotify/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const profile = await response.json();
      setUserData(profile);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      // If unauthorized, token might be expired
      if (error.status === 401) {
        refreshToken();
      }
    }
  };
  
  const refreshToken = async () => {
    const refreshToken = localStorage.getItem('spotify_refresh_token');
    if (!refreshToken) return;
    
    try {
      const response = await fetch('http://127.0.0.1:5000/api/spotify/refresh-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      
      const data = await response.json();
      
      if (data.access_token) {
        localStorage.setItem('spotify_access_token', data.access_token);
        
        // Calculate expiry time
        const expiryTime = Date.now() + (data.expires_in * 1000) - 60000;
        localStorage.setItem('spotify_token_expiry', expiryTime);
        
        // Fetch profile with new token
        fetchUserProfile(data.access_token);
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
      // If refresh failed, log the user out
      handleLogout();
    }
  };

  const handleLogin = () => {
    // Generate a random string for state parameter
    const generateRandomString = (length) => {
      const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let text = '';
      for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
      }
      return text;
    };
    
    const state = generateRandomString(16);
    localStorage.setItem('spotify_auth_state', state);
    
    // Define the scopes your app needs
    // Adding scopes for controlling playback and reading user's activity
    const scopes = [
      'user-read-private',
      'user-read-email',
      'user-read-currently-playing',
      'user-modify-playback-state',
      'user-read-playback-state',
      'streaming',
      'user-read-recently-played',
      'playlist-read-private',
      'playlist-read-collaborative'
    ];
    
    // Get client ID from env or config
    // const clientId = process.env.REACT_APP_SPOTIFY_CLIENT_ID;
    const clientId = "3ca3ed72214c473189be036197848f85" ; //TODO: remove hardcoding
    
    // Get the redirect URI - using loopback IP as required by Spotify
    const redirectUri = 'http://127.0.0.1:3000/callback';
    
    // Redirect to Spotify's authorization endpoint
    window.location.href = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes.join(' '))}&state=${state}`;
  };

  const handleLogout = () => {
    // Clear all Spotify related data
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_token_expiry');
    localStorage.removeItem('spotify_auth_state');
    
    setIsAuthenticated(false);
    setUserData(null);
  };

  return (
    <div className="spotify-auth">
      {!isAuthenticated ? (
        <div className="login-container">
          <h2>Connect with Spotify</h2>
          <p>Allow our app to access your Spotify account to play music based on your screen activity.</p>
          <button 
            className="spotify-login-btn"
            onClick={handleLogin}
          >
            Connect Spotify Account
          </button>
        </div>
      ) : (
        <div className="user-profile">
          <h2>Connected to Spotify</h2>
          {userData && (
            <div className="profile-info">
              {userData.images && userData.images[0] && (
                <img src={userData.images[0].url} alt="Profile" className="profile-image" />
              )}
              <p>Welcome, {userData.display_name}</p>
              <p>{userData.email}</p>
            </div>
          )}
          <button 
            className="spotify-logout-btn"
            onClick={handleLogout}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
};

export default SpotifyAuth;