import React, { useState, useEffect } from 'react';

export default function StartScreen() {
  const [screenSharing, setScreenSharing] = useState(false);
  const [analysisActive, setAnalysisActive] = useState(false);
  const [currentActivity, setCurrentActivity] = useState('waiting');
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Fetch user data when component mounts
  useEffect(() => {
    fetchUserProfile();
  }, []);
  
  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('spotify_access_token');
      
      if (!token) {
        setLoading(false);
        return;
      }
      
      const response = await fetch('http://127.0.0.1:5000/api/spotify/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const profile = await response.json();
        setUserData(profile);
      } else if (response.status === 401) {
        // Token expired, try refreshing
        await refreshToken();
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setLoading(false);
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
        fetchUserProfile();
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
    }
  };
  
  const startScreenSharing = async () => {
    try {
      // Request screen sharing permissions
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });
      
      setScreenSharing(true);
      
      // Handle the screen sharing stream
      handleScreenSharingStream(mediaStream);
      
    } catch (error) {
      console.error('Error starting screen share:', error);
      alert('Unable to start screen sharing. Please ensure you have granted the necessary permissions.');
    }
  };

  const handleScreenSharingStream = (stream) => {
    // Set up event listener for when screen sharing stops
    const videoTrack = stream.getVideoTracks()[0];
    
    videoTrack.onended = () => {
      stopScreenSharing();
    };
    
    console.log('Screen sharing started. Stream:', stream);
    setAnalysisActive(true);
    
    // Create a video element to use for capturing frames
    const videoElement = document.createElement('video');
    videoElement.srcObject = stream;
    videoElement.autoplay = true;
    videoElement.muted = true;
    
    // Make sure the video starts playing
    videoElement.play().catch(error => {
      console.error('Error playing video:', error);
    });
    
    // Set up periodic screenshot capture (every 30 seconds)
    const screenshotInterval = setInterval(() => {
      if (videoTrack.readyState === 'ended') {
        clearInterval(screenshotInterval);
        return;
      }
      
      // Capture screenshot and send to backend
      captureAndSendScreenshot(videoElement);
      
    }, 30000); // Every 30 seconds
    
    // Store the interval ID for cleanup
    window.screenshotIntervalId = screenshotInterval;
    
    // Additionally, take the first screenshot right away
    // (after a short delay to ensure the video is playing)
    setTimeout(() => {
      captureAndSendScreenshot(videoElement);
    }, 1000);
  };
  
  const captureAndSendScreenshot = (videoElement) => {
    if (!videoElement || videoElement.readyState < 2) {
      console.log('Video not ready yet, skipping screenshot');
      return;
    }
    
    console.log('Capturing screenshot...');
    
    try {
      // Create a canvas to capture the frame
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      
      // Draw the current video frame to the canvas
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      // Convert the canvas to a blob (image file)
      canvas.toBlob((blob) => {
        // Send the image to the backend
        sendScreenshotToBackend(blob);
      }, 'image/jpeg', 0.7); // Use JPEG format with 70% quality for smaller file size
      
    } catch (error) {
      console.error('Error capturing screenshot:', error);
    }
  };
  
  const sendScreenshotToBackend = (imageBlob) => {
    // Create form data to send the image
    const formData = new FormData();
    formData.append('screenshot', imageBlob, 'screenshot.jpg');
    
    // Get Spotify token to authenticate the request
    const token = localStorage.getItem('spotify_access_token');
    
    // Send the screenshot to your backend
    fetch('http://127.0.0.1:5000/api/analyze-screenshot', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Screenshot analysis received:', data);
      
      // Update current activity if provided
      if (data.activity) {
        setCurrentActivity(data.activity);
      }
      
      // If the backend sent a playlist URI, play it
      if (data.playlist_uri) {
        playSpotifySong(data.activity);
      }
    })
    .catch(error => {
      console.error('Error sending screenshot to backend:', error);
    });
  };
  
  const playSpotifySong = (playlistUri) => {
    const token = localStorage.getItem('spotify_access_token');
    
    fetch('http://127.0.0.1:5000/api/spotify/play', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        search_query: playlistUri
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Started playback:', data);
    })
    .catch(error => {
      console.error('Error starting playback:', error);
    });
  };

  const stopScreenSharing = () => {
    setScreenSharing(false);
    setAnalysisActive(false);
    
    // Clear all intervals
    if (window.screenshotIntervalId) {
      clearInterval(window.screenshotIntervalId);
    }
    
    console.log('Screen sharing stopped');
  };

  return (
    <div className="start-screen">
      <div className="container">
        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading your profile...</p>
          </div>
        ) : (
          <>
            {userData && (
              <div className="user-greeting">
                {userData.images && userData.images[0] && (
                  <img 
                    src={userData.images[0].url} 
                    alt="Profile" 
                    className="profile-image" 
                  />
                )}
                <h2>Welcome, {userData.display_name || 'Music Fan'}!</h2>
                {userData.product && (
                  <p className="subscription-badge">
                    Spotify {userData.product === 'premium' ? 'Premium' : 'Free'}
                  </p>
                )}
              </div>
            )}
            
            <h1>Music for your workflow</h1>
            <p className="tagline">
              Share your screen and we'll play music that matches what you're doing
            </p>
            
            {!screenSharing ? (
              <div className="start-section">
                <p className="instructions">
                  Click the button below to start sharing your screen. Our app will analyze your 
                  activity and automatically play Spotify music that enhances your experience.
                </p>
                
                <button 
                  className="start-button"
                  onClick={startScreenSharing}
                >
                  Start Screen Sharing
                </button>
              </div>
            ) : (
              <div className="sharing-active">
                <div className="status-box">
                  <div className="status-indicator"></div>
                  <p className="status-text">Screen sharing active</p>
                </div>
                
                {analysisActive && (
                  <div className="activity-detection">
                    <h3>Currently detected activity:</h3>
                    <p className="activity-type">{currentActivity}</p>
                    <p className="music-info">Playing music for {currentActivity}</p>
                  </div>
                )}
                
                <div id="video-preview" className="preview-container">
                  {/* Optional: Screen preview could be shown here */}
                </div>
                
                <button 
                  className="stop-button"
                  onClick={stopScreenSharing}
                >
                  Stop Sharing
                </button>
              </div>
            )}
            
            <p className="privacy-note">
              <strong>Privacy Note:</strong> Your screen content is processed locally and is never stored or sent to our servers.
              We only use this information to determine which music to play.
            </p>
          </>
        )}
      </div>
    </div>
  );
}