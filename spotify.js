// Spotify Configuration
const SPOTIFY_CONFIG = {
    clientId: 'a7c8939253df48e6857e0fca2493f43d',
    clientSecret: '639af9268f8a448fa0d016acf905e6c6',
    redirectUri: 'https://pecas-dev.github.io/Twister/',
    scopes: [
        'streaming',
        'user-read-email',
        'user-read-private',
        'user-read-playback-state',
        'user-modify-playback-state',
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

// Initialize Spotify SDK
function initSpotifySDK() {
    window.onSpotifyWebPlaybackSDKReady = () => {
        const token = spotifyAccessToken;
        if (!token) return;

        spotifyPlayer = new Spotify.Player({
            name: 'Twister Game Player',
            getOAuthToken: cb => { cb(token); },
            volume: 0.5
        });

        // Ready
        spotifyPlayer.addListener('ready', ({ device_id }) => {
            console.log('Ready with Device ID', device_id);
            spotifyDeviceId = device_id;
            isSpotifyReady = true;
            updateSpotifyUI();
        });

        // Not Ready
        spotifyPlayer.addListener('not_ready', ({ device_id }) => {
            console.log('Device ID has gone offline', device_id);
            isSpotifyReady = false;
        });

        // Player state changed
        spotifyPlayer.addListener('player_state_changed', state => {
            if (!state) return;
            updateNowPlaying(state);
        });

        // Connect to the player
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

// Check for token in URL (after redirect)
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
        
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Load Spotify SDK
        loadSpotifySDK();
    } else {
        // Check if we have a stored token
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
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=playlist&limit=10`, {
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
        resultsContainer.innerHTML = '<div class="empty-state">No playlists found</div>';
        return;
    }

    resultsContainer.innerHTML = playlists.map(playlist => `
        <div class="playlist-item" onclick="selectPlaylist('${playlist.id}', '${playlist.name.replace(/'/g, "\\'")}', '${playlist.images[0]?.url || ''}')">
            <img src="${playlist.images[0]?.url || 'https://via.placeholder.com/60'}" alt="${playlist.name}" class="playlist-cover">
            <div class="playlist-info">
                <div class="playlist-name">${playlist.name}</div>
                <div class="playlist-owner">${playlist.owner.display_name}</div>
            </div>
        </div>
    `).join('');
}

async function selectPlaylist(id, name, image) {
    currentPlaylist = { id, name, image };
    localStorage.setItem('currentPlaylist', JSON.stringify(currentPlaylist));
    updateSpotifyUI();
    
    // Clear search
    const searchInput = document.getElementById('playlistSearch');
    if (searchInput) searchInput.value = '';
    document.getElementById('playlistResults').innerHTML = '';
}

// Playback controls
async function playSpotify() {
    if (!spotifyAccessToken || !currentPlaylist) return;

    try {
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                context_uri: `spotify:playlist:${currentPlaylist.id}`
            })
        });
    } catch (error) {
        console.error('Error playing:', error);
    }
}

async function pauseSpotify() {
    if (!spotifyAccessToken) return;

    try {
        await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${spotifyDeviceId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });
    } catch (error) {
        console.error('Error pausing:', error);
    }
}

async function skipSpotify() {
    if (!spotifyAccessToken) return;

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

async function setSpotifyVolume(volume) {
    if (!spotifyPlayer) return;
    await spotifyPlayer.setVolume(volume / 100);
}

// Update UI
function updateSpotifyUI() {
    const connectedView = document.getElementById('spotifyConnected');
    const disconnectedView = document.getElementById('spotifyDisconnected');
    const playlistDisplay = document.getElementById('selectedPlaylist');
    const miniPlayer = document.getElementById('miniMusicPlayer');

    if (spotifyAccessToken) {
        if (disconnectedView) disconnectedView.style.display = 'none';
        if (connectedView) connectedView.style.display = 'block';
        
        if (currentPlaylist && playlistDisplay) {
            playlistDisplay.innerHTML = `
                <div class="playlist-item selected">
                    <img src="${currentPlaylist.image || 'https://via.placeholder.com/60'}" alt="${currentPlaylist.name}" class="playlist-cover">
                    <div class="playlist-info">
                        <div class="playlist-name">${currentPlaylist.name}</div>
                    </div>
                    <button class="btn-remove" onclick="currentPlaylist = null; localStorage.removeItem('currentPlaylist'); updateSpotifyUI();">Remove</button>
                </div>
            `;
        } else if (playlistDisplay) {
            playlistDisplay.innerHTML = '<div class="empty-state">No playlist selected</div>';
        }
        
        // Show mini player if playlist is selected
        if (miniPlayer && currentPlaylist) {
            miniPlayer.style.display = 'flex';
        }
    } else {
        if (connectedView) connectedView.style.display = 'none';
        if (disconnectedView) disconnectedView.style.display = 'block';
        if (miniPlayer) miniPlayer.style.display = 'none';
    }
}

function updateNowPlaying(state) {
    const track = state.track_window.current_track;
    const nowPlaying = document.getElementById('nowPlayingInfo');
    
    if (nowPlaying) {
        nowPlaying.innerHTML = `
            <div class="now-playing-track">${track.name}</div>
            <div class="now-playing-artist">${track.artists.map(a => a.name).join(', ')}</div>
        `;
    }
    
    // Update play/pause button
    const playBtn = document.getElementById('spotifyPlayBtn');
    const pauseBtn = document.getElementById('spotifyPauseBtn');
    
    if (state.paused) {
        if (playBtn) playBtn.style.display = 'block';
        if (pauseBtn) pauseBtn.style.display = 'none';
    } else {
        if (playBtn) playBtn.style.display = 'none';
        if (pauseBtn) pauseBtn.style.display = 'block';
    }
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
    checkSpotifyCallback();
});
