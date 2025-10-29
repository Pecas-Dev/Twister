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

// Initialize Spotify SDK
function initSpotifySDK() {
    window.onSpotifyWebPlaybackSDKReady = () => {
        const token = spotifyAccessToken;
        if (!token) return;

        spotifyPlayer = new Spotify.Player({
            name: 'Twister Game',
            getOAuthToken: cb => { cb(token); },
            volume: 0.5
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
}

function loadSpotifySDK() {
    if (document.getElementById('spotify-sdk')) return;
    
    const script = document.createElement('script');
    script.id = 'spotify-sdk';
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    document.body.appendChild(script);
    
    initSpotifySDK();
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
    if (!spotifyAccessToken || !currentPlaylist || !spotifyDeviceId) return;

    try {
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`, {
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
    } catch (error) {
        console.error('Error playing:', error);
    }
}

async function pauseSpotify() {
    if (!spotifyAccessToken || !spotifyDeviceId) return;

    try {
        await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${spotifyDeviceId}`, {
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
    if (!spotifyAccessToken || !spotifyDeviceId) return;

    try {
        await fetch(`https://api.spotify.com/v1/me/player/next?device_id=${spotifyDeviceId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });
    } catch (error) {
        console.error('Error skipping:', error);
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
