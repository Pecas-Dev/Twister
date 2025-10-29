// Spotify Configuration
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
    clientId: 'a7c8939253df48e6857e0fca2493f43d',
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

function initializeSpotifyPlayer() {
    if (spotifyPlayer || !spotifyAccessToken) {
        return;
    }

    if (!window.Spotify || typeof window.Spotify.Player !== 'function') {
        return;
    }

    spotifyPlayer = new Spotify.Player({
        name: 'Twister Game',
        getOAuthToken: cb => {
            if (spotifyAccessToken) {
                cb(spotifyAccessToken);
            }
        },
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
}

// Initialize Spotify SDK
function initSpotifySDK() {
    window.onSpotifyWebPlaybackSDKReady = () => {
        initializeSpotifyPlayer();
    };

    if (window.Spotify && typeof window.Spotify.Player === 'function') {
        initializeSpotifyPlayer();
    }
}

// Spotify Authentication
async function connectSpotify() {
    try {
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error('Secure crypto APIs are not available in this browser.');
        }

        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        const state = generateStateParameter();

        localStorage.setItem('spotifyCodeVerifier', codeVerifier);
        localStorage.setItem('spotifyAuthState', state);

        const authUrl = `https://accounts.spotify.com/authorize?` +
            `client_id=${SPOTIFY_CONFIG.clientId}` +
            `&response_type=code` +
            `&redirect_uri=${encodeURIComponent(SPOTIFY_CONFIG.redirectUri)}` +
            `&scope=${encodeURIComponent(SPOTIFY_CONFIG.scopes.join(' '))}` +
            `&state=${encodeURIComponent(state)}` +
            `&code_challenge_method=S256` +
            `&code_challenge=${encodeURIComponent(codeChallenge)}`;

        window.location.href = authUrl;
    } catch (error) {
        console.error('Error initiating Spotify authorization:', error);
        alert('Unable to start Spotify authorization. Please try again.');
    }
}

function disconnectSpotify() {
    currentPlaylist = null;
    clearSpotifySession();
    localStorage.removeItem('spotifyCodeVerifier');
    localStorage.removeItem('spotifyAuthState');
    localStorage.removeItem('currentPlaylist');
    updateSpotifyUI();
}

// Check for token in URL
async function checkSpotifyCallback() {
    const url = new URL(window.location.href);
    const queryParams = url.searchParams;
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const authError = queryParams.get('error') || hashParams.get('error');

    if (authError) {
        console.error('Spotify authorization error:', authError);
        alert('Spotify authorization was cancelled or failed. Please try again.');
        clearSpotifySession();
    }

    let handledAuthFlow = false;

    if (queryParams.has('code')) {
        const authState = queryParams.get('state');
        const storedState = localStorage.getItem('spotifyAuthState');

        if (storedState && authState && storedState !== authState) {
            console.error('Spotify authorization state mismatch.');
            alert('Spotify authorization failed due to a state mismatch. Please try again.');
            clearSpotifySession();
        } else {
            try {
                await exchangeSpotifyCodeForToken(queryParams.get('code'));
                handledAuthFlow = true;
            } catch (error) {
                console.error('Error completing Spotify authorization:', error);
                alert('Unable to complete Spotify authorization. Please try again.');
                clearSpotifySession();
            }
        }
    }

    localStorage.removeItem('spotifyCodeVerifier');
    localStorage.removeItem('spotifyAuthState');

    if (url.search || authError) {
        const cleanHash = hashParams;
        if (cleanHash.has('error')) {
            cleanHash.delete('error');
        }

        const cleanUrl = `${window.location.origin}${window.location.pathname}${cleanHash.toString() ? `#${cleanHash.toString()}` : ''}`;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    if (!handledAuthFlow) {
        await restoreStoredSpotifySession();
    }

    // Load saved playlist
    const savedPlaylist = localStorage.getItem('currentPlaylist');
    if (savedPlaylist) {
        currentPlaylist = JSON.parse(savedPlaylist);
    }

    updateSpotifyUI();
}

async function exchangeSpotifyCodeForToken(code) {
    const codeVerifier = localStorage.getItem('spotifyCodeVerifier');

    if (!codeVerifier) {
        throw new Error('Missing PKCE code verifier.');
    }

    const body = new URLSearchParams({
        client_id: SPOTIFY_CONFIG.clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_CONFIG.redirectUri,
        code_verifier: codeVerifier
    });

    const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error_description || data.error || 'Spotify token exchange failed.');
    }

    applySpotifyTokenResponse(data);
}

async function restoreStoredSpotifySession() {
    const storedToken = localStorage.getItem('spotifyAccessToken');
    const expiry = parseInt(localStorage.getItem('spotifyTokenExpiry'), 10);

    if (!storedToken || !expiry) {
        return false;
    }

    if (Date.now() < (expiry - TOKEN_EXPIRY_BUFFER_MS)) {
        spotifyAccessToken = storedToken;
        loadSpotifySDK();
        updateSpotifyUI();
        return true;
    }

    const refreshToken = localStorage.getItem('spotifyRefreshToken');

    if (!refreshToken) {
        clearSpotifySession();
        return false;
    }

    try {
        await refreshSpotifyToken(refreshToken);
        return true;
    } catch (error) {
        console.error('Error refreshing Spotify token:', error);
        clearSpotifySession();
        return false;
    }
}

async function refreshSpotifyToken(refreshToken) {
    const body = new URLSearchParams({
        client_id: SPOTIFY_CONFIG.clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
    });

    const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error_description || data.error || 'Spotify token refresh failed.');
    }

    applySpotifyTokenResponse(data);
}

function applySpotifyTokenResponse(tokenResponse) {
    const { access_token: accessToken, expires_in: expiresIn, refresh_token: refreshToken } = tokenResponse;

    if (!accessToken) {
        throw new Error('Spotify token response did not include an access token.');
    }

    const expiryTime = Date.now() + ((typeof expiresIn === 'number' ? expiresIn : parseInt(expiresIn, 10) || 3600) * 1000);

    spotifyAccessToken = accessToken;
    localStorage.setItem('spotifyAccessToken', accessToken);
    localStorage.setItem('spotifyTokenExpiry', expiryTime.toString());

    if (refreshToken) {
        localStorage.setItem('spotifyRefreshToken', refreshToken);
    }

    loadSpotifySDK();
    if (spotifyPlayer) {
        spotifyPlayer.connect();
    }
    updateSpotifyUI();
}

function clearSpotifySession() {
    if (spotifyPlayer) {
        spotifyPlayer.disconnect();
    }

    spotifyAccessToken = null;
    spotifyPlayer = null;
    spotifyDeviceId = null;
    isSpotifyReady = false;
    isPlaying = false;

    localStorage.removeItem('spotifyAccessToken');
    localStorage.removeItem('spotifyTokenExpiry');
    localStorage.removeItem('spotifyRefreshToken');
}

function loadSpotifySDK() {
    initSpotifySDK();

    if (document.getElementById('spotify-sdk')) {
        initializeSpotifyPlayer();
        return;
    }

    const script = document.createElement('script');
    script.id = 'spotify-sdk';
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    document.body.appendChild(script);
}

async function ensureSpotifyAccessToken() {
    if (!spotifyAccessToken) {
        return false;
    }

    const expiry = parseInt(localStorage.getItem('spotifyTokenExpiry'), 10);

    if (!expiry) {
        return false;
    }

    if (Date.now() < (expiry - TOKEN_EXPIRY_BUFFER_MS)) {
        return true;
    }

    const storedRefreshToken = localStorage.getItem('spotifyRefreshToken');

    if (!storedRefreshToken) {
        return false;
    }

    try {
        await refreshSpotifyToken(storedRefreshToken);
        return true;
    } catch (error) {
        console.error('Unable to refresh Spotify token automatically:', error);
        return false;
    }
}

async function fetchWithSpotifyToken(url, options = {}, retry = true) {
    const hasValidToken = await ensureSpotifyAccessToken();

    if (!hasValidToken) {
        clearSpotifySession();
        updateSpotifyUI();
        throw new Error('Spotify session is not available.');
    }

    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${spotifyAccessToken}`);

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (response.status === 401 && retry) {
        const storedRefreshToken = localStorage.getItem('spotifyRefreshToken');

        if (!storedRefreshToken) {
            clearSpotifySession();
            updateSpotifyUI();
            throw new Error('Spotify session expired and could not be refreshed.');
        }

        try {
            await refreshSpotifyToken(storedRefreshToken);
        } catch (refreshError) {
            clearSpotifySession();
            updateSpotifyUI();
            throw refreshError;
        }

        return fetchWithSpotifyToken(url, options, false);
    }

    return response;
}

// Search playlists
async function searchPlaylists(query) {
    if (!spotifyAccessToken) return;

    try {
        const response = await fetchWithSpotifyToken(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=playlist&limit=8`);

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
    if (!spotifyAccessToken || !currentPlaylist || !spotifyDeviceId) return;

    try {
        const response = await fetchWithSpotifyToken(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`, {
            method: 'PUT',
            headers: {
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
    } catch (error) {
        console.error('Error playing:', error);
    }
}

async function pauseSpotify() {
    if (!spotifyAccessToken || !spotifyDeviceId) return;

    try {
        const response = await fetchWithSpotifyToken(`https://api.spotify.com/v1/me/player/pause?device_id=${spotifyDeviceId}`, {
            method: 'PUT'
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
    if (!spotifyAccessToken || !spotifyDeviceId) return;

    try {
        const response = await fetchWithSpotifyToken(`https://api.spotify.com/v1/me/player/next?device_id=${spotifyDeviceId}`, {
            method: 'POST'
        });

        if (!response.ok && response.status !== 204) {
            throw new Error(`Spotify skip failed with status ${response.status}`);
        }
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
        checkSpotifyCallback().catch(error => {
            console.error('Error initializing Spotify session:', error);
        });
    });
}
