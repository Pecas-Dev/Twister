// Spotify Configuration
// Client ID is loaded from config.js to keep credentials out of source control
if (typeof SPOTIFY_CLIENT_ID === 'undefined') {
    console.error('SPOTIFY_CLIENT_ID is not defined. Please create config.js from config.template.js');
}

const DEFAULT_SPOTIFY_REDIRECT_URI = 'https://pecas-dev.github.io/Twister/';

function getSpotifyRedirectUri() {
    if (typeof window === 'undefined') {
        return DEFAULT_SPOTIFY_REDIRECT_URI;
    }

    const { origin, pathname } = window.location;

    if (!origin || origin === 'null' || origin.startsWith('file://')) {
        return DEFAULT_SPOTIFY_REDIRECT_URI;
    }

    let normalizedPath = pathname || '/';

    if (normalizedPath.endsWith('index.html')) {
        normalizedPath = normalizedPath.slice(0, -'index.html'.length);
    }

    if (!normalizedPath.endsWith('/')) {
        normalizedPath += '/';
    }

    return `${origin}${normalizedPath}`;
}

const SPOTIFY_CONFIG = {
    clientId: typeof SPOTIFY_CLIENT_ID !== 'undefined' ? SPOTIFY_CLIENT_ID : 'YOUR_CLIENT_ID_HERE',
    redirectUri: getSpotifyRedirectUri(),
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

const SPOTIFY_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000; // Refresh one minute before expiry

function base64UrlEncode(buffer) {
    let bytes = buffer;

    if (buffer instanceof ArrayBuffer) {
        bytes = new Uint8Array(buffer);
    }

    let binary = '';
    const len = bytes.length;

    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function generateCodeVerifier() {
    const randomBytes = new Uint8Array(96);
    crypto.getRandomValues(randomBytes);
    return base64UrlEncode(randomBytes);
}

function generateStateParameter() {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    return base64UrlEncode(randomBytes);
}

async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(digest);
}

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

    // If SDK already loaded, initialize now
    if (window.Spotify && typeof window.Spotify.Player === 'function') {
        window.onSpotifyWebPlaybackSDKReady();
    }
}

// Spotify Authentication
async function connectSpotify() {
    // Using Authorization Code Flow with PKCE (recommended for client-side apps)
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateStateParameter();

    // Store code verifier and state for later use
    localStorage.setItem('spotifyCodeVerifier', codeVerifier);
    localStorage.setItem('spotifyAuthState', state);

    const authUrl = `https://accounts.spotify.com/authorize?` +
        `client_id=${SPOTIFY_CONFIG.clientId}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(SPOTIFY_CONFIG.redirectUri)}` +
        `&scope=${encodeURIComponent(SPOTIFY_CONFIG.scopes.join(' '))}` +
        `&code_challenge_method=S256` +
        `&code_challenge=${codeChallenge}` +
        `&state=${state}` +
        `&show_dialog=true`;

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
    localStorage.removeItem('spotifyCodeVerifier');
    localStorage.removeItem('spotifyAuthState');
    localStorage.removeItem('currentPlaylist');
    updateSpotifyUI();
}

// Check for authorization code in URL (Authorization Code Flow with PKCE)
async function checkSpotifyCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    // Handle errors
    if (error) {
        console.error('Spotify authorization error:', error);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    // If we have an authorization code, exchange it for an access token
    if (code) {
        const storedState = localStorage.getItem('spotifyAuthState');
        const codeVerifier = localStorage.getItem('spotifyCodeVerifier');

        // Verify state to prevent CSRF attacks
        if (state !== storedState) {
            console.error('State mismatch - possible CSRF attack');
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
        }

        if (!codeVerifier) {
            console.error('Code verifier not found');
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
        }

        try {
            // Exchange code for token
            await exchangeCodeForToken(code, codeVerifier);
            
            // Clean up stored values
            localStorage.removeItem('spotifyCodeVerifier');
            localStorage.removeItem('spotifyAuthState');
            
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Load SDK
            loadSpotifySDK();
        } catch (error) {
            console.error('Token exchange failed:', error);
            window.history.replaceState({}, document.title, window.location.pathname);
        }
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
    }

    // Load saved volume
    const savedVolume = localStorage.getItem('spotifyVolume');
    if (savedVolume) {
        spotifyVolume = parseFloat(savedVolume);
        updateVolumeSlider();
    }

    updateSpotifyUI();
}

// Exchange authorization code for access token
async function exchangeCodeForToken(code, codeVerifier) {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: SPOTIFY_CONFIG.redirectUri,
        client_id: SPOTIFY_CONFIG.clientId,
        code_verifier: codeVerifier
    });

    const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Token exchange failed: ${errorData.error_description || errorData.error}`);
    }

    const data = await response.json();
    spotifyAccessToken = data.access_token;
    const expiresIn = data.expires_in;
    const expiryTime = Date.now() + (expiresIn * 1000) - TOKEN_EXPIRY_BUFFER_MS;
    
    localStorage.setItem('spotifyAccessToken', spotifyAccessToken);
    localStorage.setItem('spotifyTokenExpiry', expiryTime.toString());
    
    // Store refresh token if provided (for future use)
    if (data.refresh_token) {
        localStorage.setItem('spotifyRefreshToken', data.refresh_token);
    }
}



function loadSpotifySDK() {
    // Don't load SDK on mobile devices
    if (detectMobile()) {
        isMobileDevice = true;
        initSpotifySDK();
        return;
    }

    if (document.getElementById('spotify-sdk')) {
        initSpotifySDK();
        return;
    }

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

        if (!response.ok) {
            throw new Error(`Spotify search failed with status ${response.status}`);
        }

        const data = await response.json();
        const playlists = data?.playlists?.items || [];
        displayPlaylistResults(playlists);
    } catch (error) {
        console.error('Error searching playlists:', error);
        displayPlaylistResults([]);
    }
}

function displayPlaylistResults(playlists) {
    const resultsContainer = document.getElementById('playlistResults');
    if (!resultsContainer) return;

    const playlistItems = Array.isArray(playlists) ? playlists : [];
    const sanitizedPlaylists = playlistItems.filter(playlist => playlist && playlist.id);

    if (sanitizedPlaylists.length === 0) {
        resultsContainer.innerHTML = '<div class="empty-state" style="padding: 20px;">No playlists found</div>';
        return;
    }

    resultsContainer.innerHTML = sanitizedPlaylists.map(playlist => {
        const ownerName = playlist.owner?.display_name || 'Unknown';
        const trackTotal = typeof playlist.tracks?.total === 'number' ? playlist.tracks.total : 0;
        const imageUrl = playlist.images?.[0]?.url || 'https://via.placeholder.com/48';

        return `
        <div class="playlist-item-simple" onclick="selectPlaylist('${playlist.id}', '${escapeHtml(playlist.name)}')">
            <img src="${imageUrl}" class="playlist-cover-small">
            <div class="playlist-info-simple">
                <div class="playlist-name-simple">${playlist.name}</div>
                <div class="playlist-meta">${ownerName} • ${trackTotal} songs</div>
            </div>
        </div>
    `;
    }).join('');
}

function escapeHtml(text) {
    if (typeof text !== 'string') {
        return '';
    }

    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, "\\'");
}

async function selectPlaylist(id, name) {
    currentPlaylist = { id: String(id), name };
    localStorage.setItem('currentPlaylist', JSON.stringify(currentPlaylist));

    // Hide search
    const searchContainer = document.getElementById('playlistSearchContainer');
    const searchInput = document.getElementById('playlistSearch');
    const resultsContainer = document.getElementById('playlistResults');

    if (searchContainer) searchContainer.style.display = 'none';
    if (searchInput) searchInput.value = '';
    if (resultsContainer) resultsContainer.innerHTML = '';
    
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

        const response = await fetch(url, {
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

        if (!response.ok && response.status !== 204) {
            throw new Error(`Spotify playback failed with status ${response.status}`);
        }

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

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });

        if (!response.ok && response.status !== 204) {
            throw new Error(`Spotify pause failed with status ${response.status}`);
        }

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

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });

        if (!response.ok && response.status !== 204) {
            throw new Error(`Spotify skip failed with status ${response.status}`);
        }
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
    const track = state.track_window?.current_track;

    if (!track) return;

    const miniTrackName = document.getElementById('miniTrackName');
    const miniArtistName = document.getElementById('miniArtistName');

    if (miniTrackName) miniTrackName.textContent = track.name;
    if (miniArtistName) miniArtistName.textContent = track.artists.map(a => a.name).join(', ');
}

function updatePlayPauseButtons() {
    const miniPlayBtn = document.getElementById('miniPlayBtn');
    const miniPauseBtn = document.getElementById('miniPauseBtn');
    const miniSkipBtn = document.getElementById('miniSkipBtn');
    
    if (currentPlaylist && (spotifyDeviceId || isSpotifyReady)) {
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