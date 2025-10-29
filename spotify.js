// Spotify Configuration
const SPOTIFY_CONFIG = {
    clientId: 'a7c8939253df48e6857e0fca2493f43d',
    redirectUri: 'https://pecas-dev.github.io/Twister/',
    scopes: [
        'streaming',
        'user-read-email',
        'user-read-private',
        'user-read-playback-state',
        'user-modify-playback-state',
        'user-library-read',
        'playlist-read-private',
        'playlist-read-collaborative'
    ]
};

// Spotify State
let spotifyAccessToken = null;
let spotifyPlayer = null;
let currentPlaylist = null;
let spotifyDeviceId = null;
let isSpotifyReady = false;
let isPlaying = false;
let isMobileDevice = false;
let playbackStateInterval = null;
let spotifyVolume = 0.3; // Default to 30% so voice can be heard

// Check if mobile device
function detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Initialize Spotify SDK
function initSpotifySDK() {
    // Check if mobile - Spotify Web Playback SDK doesn't work on iOS/mobile
    isMobileDevice = detectMobile();

    if (isMobileDevice) {
        console.log('Mobile device detected - using Spotify Connect API');
        // For mobile, we'll use the existing Spotify app
        isSpotifyReady = true;
        updateSpotifyUI();
        getAvailableDevices(); // Get user's Spotify devices
        return;
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
        const token = spotifyAccessToken;
        if (!token) return;

        spotifyPlayer = new Spotify.Player({
            name: 'Twister Game',
            getOAuthToken: cb => { cb(token); },
            volume: 0.3 // Lower default volume so voice can be heard
        });

        // Ready
        spotifyPlayer.addListener('ready', ({ device_id }) => {
            console.log('Spotify Ready', device_id);
            spotifyDeviceId = device_id;
            isSpotifyReady = true;
            updateSpotifyUI();

            // Auto-play if playlist is selected
            if (currentPlaylist) {
                setTimeout(() => playSpotify(), 1000);
            }
        });

        // Not Ready
        spotifyPlayer.addListener('not_ready', ({ device_id }) => {
            console.log('Spotify offline', device_id);
            isSpotifyReady = false;
        });

        // Player state changed
        spotifyPlayer.addListener('player_state_changed', state => {
            if (!state) return;
            isPlaying = !state.paused;
            updateNowPlaying(state);
            updatePlayPauseButtons();
        });

        // Connect
        spotifyPlayer.connect();
    };
}

// Spotify Authentication
function connectSpotify() {
    const authUrl = `https://accounts.spotify.com/authorize?` +
        `client_id=${SPOTIFY_CONFIG.clientId}` +
        `&response_type=token` +
        `&redirect_uri=${encodeURIComponent(SPOTIFY_CONFIG.redirectUri)}` +
        `&scope=${encodeURIComponent(SPOTIFY_CONFIG.scopes.join(' '))}`;
    
    window.location.href = authUrl;
}

function disconnectSpotify() {
    if (spotifyPlayer) {
        spotifyPlayer.disconnect();
    }
    spotifyAccessToken = null;
    spotifyPlayer = null;
    spotifyDeviceId = null;
    isSpotifyReady = false;
    currentPlaylist = null;
    localStorage.removeItem('spotifyAccessToken');
    localStorage.removeItem('spotifyTokenExpiry');
    localStorage.removeItem('currentPlaylist');
    updateSpotifyUI();
}

// Check for token in URL
function checkSpotifyCallback() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    const expiresIn = params.get('expires_in');

    if (token) {
        spotifyAccessToken = token;
        const expiryTime = Date.now() + (expiresIn * 1000);
        localStorage.setItem('spotifyAccessToken', token);
        localStorage.setItem('spotifyTokenExpiry', expiryTime.toString());

        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);

        // Load SDK
        loadSpotifySDK();
    } else {
        // Check stored token
        const storedToken = localStorage.getItem('spotifyAccessToken');
        const expiryTime = localStorage.getItem('spotifyTokenExpiry');

        if (storedToken && expiryTime && Date.now() < parseInt(expiryTime)) {
            spotifyAccessToken = storedToken;
            loadSpotifySDK();
        }
    }

    // Load saved playlist
    const savedPlaylist = localStorage.getItem('currentPlaylist');
    if (savedPlaylist) {
        currentPlaylist = JSON.parse(savedPlaylist);
        updateSpotifyUI();
    }

    // Load saved volume
    const savedVolume = localStorage.getItem('spotifyVolume');
    if (savedVolume) {
        spotifyVolume = parseFloat(savedVolume);
        updateVolumeSlider();
    }
}

function loadSpotifySDK() {
    // Don't load SDK on mobile devices
    if (detectMobile()) {
        isMobileDevice = true;
        initSpotifySDK();
        return;
    }

    if (document.getElementById('spotify-sdk')) return;

    const script = document.createElement('script');
    script.id = 'spotify-sdk';
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    document.body.appendChild(script);

    initSpotifySDK();
}

// Get available Spotify devices (for mobile)
async function getAvailableDevices() {
    if (!spotifyAccessToken) return;

    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });

        const data = await response.json();
        if (data.devices && data.devices.length > 0) {
            // Use the first available device (usually the phone's Spotify app)
            const activeDevice = data.devices.find(d => d.is_active) || data.devices[0];
            spotifyDeviceId = activeDevice.id;
            console.log('Using device:', activeDevice.name);
        }
    } catch (error) {
        console.error('Error getting devices:', error);
    }
}

// Search playlists
async function searchPlaylists(query) {
    if (!spotifyAccessToken) return;

    try {
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=playlist&limit=8`, {
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });

        const data = await response.json();
        displayPlaylistResults(data.playlists.items);
    } catch (error) {
        console.error('Error searching playlists:', error);
    }
}

function displayPlaylistResults(playlists) {
    const resultsContainer = document.getElementById('playlistResults');
    if (!resultsContainer) return;

    if (playlists.length === 0) {
        resultsContainer.innerHTML = '<div class="empty-state" style="padding: 20px;">No playlists found</div>';
        return;
    }

    resultsContainer.innerHTML = playlists.map(playlist => `
        <div class="playlist-item-simple" onclick="selectPlaylist('${playlist.id}', '${escapeHtml(playlist.name)}')">
            <img src="${playlist.images[0]?.url || 'https://via.placeholder.com/48'}" class="playlist-cover-small">
            <div class="playlist-info-simple">
                <div class="playlist-name-simple">${playlist.name}</div>
                <div class="playlist-meta">${playlist.owner.display_name} • ${playlist.tracks.total} songs</div>
            </div>
        </div>
    `).join('');
}

function escapeHtml(text) {
    return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

async function selectPlaylist(id, name) {
    currentPlaylist = { id, name };
    localStorage.setItem('currentPlaylist', JSON.stringify(currentPlaylist));
    
    // Hide search
    document.getElementById('playlistSearchContainer').style.display = 'none';
    document.getElementById('playlistSearch').value = '';
    document.getElementById('playlistResults').innerHTML = '';
    
    updateSpotifyUI();
    
    // Auto-play if ready
    if (isSpotifyReady) {
        setTimeout(() => playSpotify(), 500);
    }
}

// Playback controls
async function playSpotify() {
    if (!spotifyAccessToken || !currentPlaylist) return;

    // For mobile, ensure we have a device
    if (isMobileDevice && !spotifyDeviceId) {
        await getAvailableDevices();
        if (!spotifyDeviceId) {
            alert('Please open Spotify on your device first!');
            return;
        }
    }

    if (!spotifyDeviceId && !isMobileDevice) return;

    try {
        const url = spotifyDeviceId
            ? `https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`
            : `https://api.spotify.com/v1/me/player/play`;

        await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                context_uri: `spotify:playlist:${currentPlaylist.id}`,
                position_ms: 0
            })
        });
        isPlaying = true;
        updatePlayPauseButtons();

        // For mobile, poll playback state since we don't have listeners
        if (isMobileDevice) {
            startPlaybackStatePolling();
        }
    } catch (error) {
        console.error('Error playing:', error);
        alert('Could not play music. Make sure Spotify is open on your device!');
    }
}

async function pauseSpotify() {
    if (!spotifyAccessToken) return;

    try {
        const url = spotifyDeviceId
            ? `https://api.spotify.com/v1/me/player/pause?device_id=${spotifyDeviceId}`
            : `https://api.spotify.com/v1/me/player/pause`;

        await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });
        isPlaying = false;
        updatePlayPauseButtons();
    } catch (error) {
        console.error('Error pausing:', error);
    }
}

async function skipSpotify() {
    if (!spotifyAccessToken) return;

    try {
        const url = spotifyDeviceId
            ? `https://api.spotify.com/v1/me/player/next?device_id=${spotifyDeviceId}`
            : `https://api.spotify.com/v1/me/player/next`;

        await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });
    } catch (error) {
        console.error('Error skipping:', error);
    }
}

// Poll playback state for mobile devices
function startPlaybackStatePolling() {
    if (playbackStateInterval) {
        clearInterval(playbackStateInterval);
    }

    playbackStateInterval = setInterval(async () => {
        if (!spotifyAccessToken) return;

        try {
            const response = await fetch('https://api.spotify.com/v1/me/player', {
                headers: {
                    'Authorization': `Bearer ${spotifyAccessToken}`
                }
            });

            if (response.status === 200) {
                const data = await response.json();
                isPlaying = data.is_playing;
                updatePlayPauseButtons();

                // Update now playing if available
                if (data.item) {
                    const miniTrackName = document.getElementById('miniTrackName');
                    const miniArtistName = document.getElementById('miniArtistName');
                    if (miniTrackName) miniTrackName.textContent = data.item.name;
                    if (miniArtistName) miniArtistName.textContent = data.item.artists.map(a => a.name).join(', ');
                }
            }
        } catch (error) {
            console.error('Error polling playback state:', error);
        }
    }, 2000); // Poll every 2 seconds
}

// Set Spotify volume
async function setSpotifyVolume(volume) {
    spotifyVolume = volume;

    // Save to localStorage
    localStorage.setItem('spotifyVolume', volume.toString());

    if (!spotifyAccessToken) return;

    const volumePercent = Math.round(volume * 100);

    try {
        // For desktop with Web Playback SDK
        if (spotifyPlayer && !isMobileDevice) {
            await spotifyPlayer.setVolume(volume);
        }

        // For mobile or as fallback, use API
        const url = spotifyDeviceId
            ? `https://api.spotify.com/v1/me/player/volume?volume_percent=${volumePercent}&device_id=${spotifyDeviceId}`
            : `https://api.spotify.com/v1/me/player/volume?volume_percent=${volumePercent}`;

        await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });
    } catch (error) {
        console.error('Error setting volume:', error);
    }
}

// Update volume slider display
function updateVolumeSlider() {
    const volumeSlider = document.getElementById('spotifyVolumeSlider');
    const volumeValue = document.getElementById('spotifyVolumeValue');

    if (volumeSlider) {
        volumeSlider.value = spotifyVolume;
    }
    if (volumeValue) {
        volumeValue.textContent = `${Math.round(spotifyVolume * 100)}%`;
    }
}

// Update UI
function updateSpotifyUI() {
    const connectedView = document.getElementById('spotifyConnected');
    const disconnectedView = document.getElementById('spotifyDisconnected');
    const playlistNameEl = document.getElementById('selectedPlaylistName');
    const playlistStatusEl = document.getElementById('playlistStatus');
    const miniPlayer = document.getElementById('miniMusicPlayer');

    if (spotifyAccessToken) {
        if (disconnectedView) disconnectedView.style.display = 'none';
        if (connectedView) connectedView.style.display = 'block';
        
        if (currentPlaylist) {
            if (playlistNameEl) playlistNameEl.textContent = currentPlaylist.name;
            if (playlistStatusEl) playlistStatusEl.textContent = 'Ready to play';
            
            // Show mini player
            if (miniPlayer) miniPlayer.style.display = 'flex';
            updatePlayPauseButtons();
        } else {
            if (playlistNameEl) playlistNameEl.textContent = 'No playlist';
            if (playlistStatusEl) playlistStatusEl.textContent = 'Select a playlist to play';
            if (miniPlayer) miniPlayer.style.display = 'none';
        }
    } else {
        if (connectedView) connectedView.style.display = 'none';
        if (disconnectedView) disconnectedView.style.display = 'block';
        if (miniPlayer) miniPlayer.style.display = 'none';
    }
}

function updateNowPlaying(state) {
    const track = state.track_window.current_track;
    
    const miniTrackName = document.getElementById('miniTrackName');
    const miniArtistName = document.getElementById('miniArtistName');
    
    if (miniTrackName) miniTrackName.textContent = track.name;
    if (miniArtistName) miniArtistName.textContent = track.artists.map(a => a.name).join(', ');
}

function updatePlayPauseButtons() {
    const miniPlayBtn = document.getElementById('miniPlayBtn');
    const miniPauseBtn = document.getElementById('miniPauseBtn');
    const miniSkipBtn = document.getElementById('miniSkipBtn');
    
    if (currentPlaylist && spotifyDeviceId) {
        if (miniSkipBtn) miniSkipBtn.style.display = 'flex';
        
        if (isPlaying) {
            if (miniPlayBtn) miniPlayBtn.style.display = 'none';
            if (miniPauseBtn) miniPauseBtn.style.display = 'flex';
        } else {
            if (miniPlayBtn) miniPlayBtn.style.display = 'flex';
            if (miniPauseBtn) miniPauseBtn.style.display = 'none';
        }
    } else {
        if (miniPlayBtn) miniPlayBtn.style.display = 'none';
        if (miniPauseBtn) miniPauseBtn.style.display = 'none';
        if (miniSkipBtn) miniSkipBtn.style.display = 'none';
    }
}

// Initialize
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        checkSpotifyCallback();
    });
}
