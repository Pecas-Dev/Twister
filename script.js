// Game State
let players = [];
let currentPlayerIndex = 0;
let turnNumber = 1;
let turnMode = 'manual'; // 'manual' or 'timer'
let timerDuration = 10; // in seconds
let countdownInterval = null;
let currentCountdown = 0;
let currentChallenge = null;
let challengeBonusTime = 0; // Track bonus time from challenges

// Challenge Settings
let challengesEnabled = true;
let challengeFrequency = 'medium'; // 'rare', 'medium', 'frequent'

// Voice Settings
let voiceEnabled = true;
let voiceRate = 1.0; // 0.5 to 2.0
let voiceVolume = 1.0; // 0 to 1
let voicePitch = 1.0; // 0 to 2
let selectedVoice = null;
let availableVoices = [];

// Game Constants
const COLORS = ['red', 'blue', 'yellow', 'green'];
const LIMBS = ['Left Hand', 'Right Hand', 'Left Foot', 'Right Foot'];
const MIN_TIMER = 5;
const MAX_TIMER = 30;
const TIMER_STEP = 5;

// Challenge Types with enable/disable state
const CHALLENGES = [
    { id: 1, text: "Hold for 10 seconds!", icon: "⏱️", enabled: true },
    { id: 2, text: "Eyes closed for next move!", icon: "👁️", enabled: true },
    { id: 3, text: "Switch spots with another player!", icon: "🔄", enabled: true },
    { id: 4, text: "Freeze! Everyone hold position for 5 seconds!", icon: "🧊", enabled: true },
    { id: 5, text: "Double move - place two limbs!", icon: "✌️", enabled: true },
    { id: 6, text: "Spin 360° before your next move!", icon: "🌀", enabled: true },
    { id: 7, text: "Touch your nose while in position!", icon: "👃", enabled: true },
    { id: 8, text: "Balance on one foot only!", icon: "🦩", enabled: true },
    { id: 9, text: "Make this move in slow motion!", icon: "🐌", enabled: true },
    { id: 10, text: "Wild card - choose any spot!", icon: "🎲", enabled: true }
];

// Challenge frequency settings
const CHALLENGE_PROBABILITIES = {
    'rare': { minTurns: 8, maxTurns: 20, probability: 0.15 },
    'medium': { minTurns: 5, maxTurns: 15, probability: 0.25 },
    'frequent': { minTurns: 3, maxTurns: 10, probability: 0.35 }
};

// Challenge sound
const challengeSound = new Audio('sfx/OIIA.mp3');
challengeSound.preload = 'auto';
challengeSound.load(); // Preload the audio

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    loadPlayers();
    setupEventListeners();
    loadVoiceSettings();
    loadChallengeSettings();
    checkSpeechSupport();
    renderChallengeList();
});

// Setup Event Listeners
function setupEventListeners() {
    const playerInput = document.getElementById('playerNameInput');
    if (playerInput) {
        playerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addPlayer();
            }
        });
    }
}

// Check if Speech Synthesis is supported
function checkSpeechSupport() {
    if (!('speechSynthesis' in window)) {
        console.warn('Speech Synthesis not supported in this browser');
        voiceEnabled = false;
        const voiceToggle = document.getElementById('voiceToggle');
        if (voiceToggle) {
            voiceToggle.disabled = true;
            voiceToggle.checked = false;
        }
    } else {
        loadVoices();
    }
}

// Load and select best voice
function loadVoices() {
    // Voices may load asynchronously
    const setVoices = () => {
        availableVoices = window.speechSynthesis.getVoices();

        if (availableVoices.length > 0) {
            selectBestVoice();
        }
    };

    // Initial load
    setVoices();

    // Listen for voice list changes (some browsers load async)
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = setVoices;
    }
}

// Select the best quality English voice
function selectBestVoice() {
    // Filter for English voices
    const englishVoices = availableVoices.filter(voice =>
        voice.lang.startsWith('en')
    );

    if (englishVoices.length === 0) {
        console.warn('No English voices available');
        return;
    }

    // Priority order for voice selection:
    // 1. Google voices (usually high quality)
    // 2. Premium/enhanced voices (containing words like 'premium', 'enhanced', 'quality')
    // 3. Female voices (often clearer)
    // 4. US English voices
    // 5. Any English voice

    let bestVoice = null;

    // Try to find Google voices first
    bestVoice = englishVoices.find(voice =>
        voice.name.includes('Google') && voice.lang === 'en-US'
    );

    // Try any Google English voice
    if (!bestVoice) {
        bestVoice = englishVoices.find(voice => voice.name.includes('Google'));
    }

    // Try premium/enhanced voices
    if (!bestVoice) {
        bestVoice = englishVoices.find(voice =>
            voice.name.toLowerCase().includes('premium') ||
            voice.name.toLowerCase().includes('enhanced') ||
            voice.name.toLowerCase().includes('natural')
        );
    }

    // Try US English female voices (often clearer)
    if (!bestVoice) {
        bestVoice = englishVoices.find(voice =>
            voice.lang === 'en-US' &&
            (voice.name.includes('female') || voice.name.includes('Female') ||
             voice.name.includes('Samantha') || voice.name.includes('Victoria'))
        );
    }

    // Try any US English voice
    if (!bestVoice) {
        bestVoice = englishVoices.find(voice => voice.lang === 'en-US');
    }

    // Fallback to first English voice
    if (!bestVoice) {
        bestVoice = englishVoices[0];
    }

    selectedVoice = bestVoice;
    console.log('Selected voice:', bestVoice.name, bestVoice.lang);
}

// Player Management
function addPlayer() {
    const input = document.getElementById('playerNameInput');
    const name = input.value.trim();

    if (name === '') {
        alert('Please enter a player name!');
        return;
    }

    if (players.includes(name)) {
        alert('This player is already in the game!');
        return;
    }

    players.push(name);
    input.value = '';
    input.focus();
    
    updatePlayersList();
    savePlayers();
}

function removePlayer(index) {
    players.splice(index, 1);
    updatePlayersList();
    savePlayers();
}

function updatePlayersList() {
    const playersList = document.getElementById('playersList');
    const playerCount = document.getElementById('playerCount');
    const startBtn = document.getElementById('startBtn');

    playerCount.textContent = players.length;

    if (players.length === 0) {
        playersList.innerHTML = '<div class="empty-state">No players yet. Add some players to start!</div>';
        startBtn.disabled = true;
    } else {
        playersList.innerHTML = players.map((player, index) => `
            <div class="player-item">
                <span class="player-name">${player}</span>
                <button class="btn btn-remove" onclick="removePlayer(${index})">Remove</button>
            </div>
        `).join('');
        startBtn.disabled = players.length < 2;
    }
}

function loadPlayers() {
    const savedPlayers = localStorage.getItem('twisterPlayers');
    if (savedPlayers) {
        players = JSON.parse(savedPlayers);
        updatePlayersList();
    }
}

function savePlayers() {
    localStorage.setItem('twisterPlayers', JSON.stringify(players));
}

// Turn Mode Management
function setTurnMode(mode) {
    turnMode = mode;
    
    // Update all mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-mode') === mode) {
            btn.classList.add('active');
        }
    });
    
    // Show/hide timer settings
    document.querySelectorAll('.timer-settings').forEach(settings => {
        if (mode === 'timer') {
            settings.classList.add('active');
        } else {
            settings.classList.remove('active');
        }
    });
}

function adjustTimer(amount) {
    const newDuration = timerDuration + amount;
    if (newDuration >= MIN_TIMER && newDuration <= MAX_TIMER) {
        timerDuration = newDuration;
        updateTimerDisplay();
    }
}

function updateTimerDisplay() {
    const displays = document.querySelectorAll('.timer-display');
    displays.forEach(display => {
        display.textContent = `${timerDuration}s`;
    });
    
    // Update minus buttons state
    document.querySelectorAll('.timer-btn-minus').forEach(btn => {
        btn.disabled = timerDuration <= MIN_TIMER;
    });
    
    // Update plus buttons state
    document.querySelectorAll('.timer-btn-plus').forEach(btn => {
        btn.disabled = timerDuration >= MAX_TIMER;
    });
}

// Challenge Management
function toggleChallenges() {
    const toggle = document.getElementById('challengeToggle');
    challengesEnabled = toggle.checked;
    
    const challengeControls = document.querySelector('.challenge-controls');
    if (challengesEnabled) {
        challengeControls.classList.add('active');
    } else {
        challengeControls.classList.remove('active');
    }
    
    saveChallengeSettings();
}

function setChallengeFrequency(frequency) {
    challengeFrequency = frequency;
    
    // Update all frequency buttons
    document.querySelectorAll('.frequency-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-frequency') === frequency) {
            btn.classList.add('active');
        }
    });
    
    saveChallengeSettings();
}

function toggleChallenge(challengeId) {
    const challenge = CHALLENGES.find(c => c.id === challengeId);
    if (challenge) {
        challenge.enabled = !challenge.enabled;
        saveChallengeSettings();
        renderChallengeList();
    }
}

function renderChallengeList() {
    const container = document.getElementById('challengeListContainer');
    if (!container) return;
    
    container.innerHTML = CHALLENGES.map(challenge => `
        <div class="challenge-list-item">
            <div class="challenge-list-info">
                <span class="challenge-icon">${challenge.icon}</span>
                <span class="challenge-text">${challenge.text}</span>
            </div>
            <label class="switch">
                <input type="checkbox" ${challenge.enabled ? 'checked' : ''} onchange="toggleChallenge(${challenge.id})">
                <span class="slider"></span>
            </label>
        </div>
    `).join('');
}

function loadChallengeSettings() {
    const saved = localStorage.getItem('twisterChallengeSettings');
    if (saved) {
        const settings = JSON.parse(saved);
        challengesEnabled = settings.enabled ?? true;
        challengeFrequency = settings.frequency ?? 'medium';
        
        // Load individual challenge states
        if (settings.challengeStates) {
            settings.challengeStates.forEach(state => {
                const challenge = CHALLENGES.find(c => c.id === state.id);
                if (challenge) {
                    challenge.enabled = state.enabled;
                }
            });
        }
        
        // Update UI
        const toggle = document.getElementById('challengeToggle');
        if (toggle) {
            toggle.checked = challengesEnabled;
            if (challengesEnabled) {
                const controls = document.querySelector('.challenge-controls');
                if (controls) controls.classList.add('active');
            }
        }
        
        // Update frequency buttons
        document.querySelectorAll('.frequency-btn').forEach(btn => {
            if (btn.getAttribute('data-frequency') === challengeFrequency) {
                btn.classList.add('active');
            }
        });
    }
}

function saveChallengeSettings() {
    const settings = {
        enabled: challengesEnabled,
        frequency: challengeFrequency,
        challengeStates: CHALLENGES.map(c => ({ id: c.id, enabled: c.enabled }))
    };
    localStorage.setItem('twisterChallengeSettings', JSON.stringify(settings));
}

function toggleChallengeList() {
    const list = document.getElementById('challengeListDropdown');
    const arrow = document.querySelector('.dropdown-arrow');
    
    if (list.style.display === 'none' || !list.style.display) {
        list.style.display = 'block';
        if (arrow) arrow.textContent = '▼';
    } else {
        list.style.display = 'none';
        if (arrow) arrow.textContent = '▶';
    }
}

// Voice Management
function toggleVoice() {
    const toggle = document.getElementById('voiceToggle');
    const toggleSettings = document.getElementById('voiceToggleSettings');
    voiceEnabled = toggle ? toggle.checked : toggleSettings.checked;
    
    // Sync both toggles
    if (toggle) toggle.checked = voiceEnabled;
    if (toggleSettings) toggleSettings.checked = voiceEnabled;
    
    const voiceControls = document.querySelectorAll('.voice-controls');
    voiceControls.forEach(controls => {
        if (voiceEnabled) {
            controls.classList.add('active');
        } else {
            controls.classList.remove('active');
        }
    });
    
    saveVoiceSettings();
}

function updateVoiceRate(value) {
    voiceRate = parseFloat(value);
    document.querySelectorAll('[id^="rateValue"]').forEach(el => {
        el.textContent = `${voiceRate.toFixed(1)}x`;
    });
    saveVoiceSettings();
}

function updateVoiceVolume(value) {
    voiceVolume = parseFloat(value);
    document.querySelectorAll('[id^="volumeValue"]').forEach(el => {
        el.textContent = `${Math.round(voiceVolume * 100)}%`;
    });
    saveVoiceSettings();
}

function updateVoicePitch(value) {
    voicePitch = parseFloat(value);
    document.querySelectorAll('[id^="pitchValue"]').forEach(el => {
        el.textContent = voicePitch.toFixed(1);
    });
    saveVoiceSettings();
}

function testVoice() {
    speak("Left hand on red", true);
}

function speak(text, isTest = false, callback = null) {
    if (!voiceEnabled && !isTest) {
        // If voice is disabled, still call the callback
        if (callback) callback();
        return;
    }
    if (!('speechSynthesis' in window)) {
        if (callback) callback();
        return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = voiceRate;
    utterance.volume = voiceVolume;
    utterance.pitch = voicePitch;

    // Use selected voice if available
    if (selectedVoice) {
        utterance.voice = selectedVoice;
    }

    // iOS WORKAROUND: Pause Spotify during speech on mobile devices
    // iOS routes speech synthesis through phone earpiece, so we pause music to avoid conflicts
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    let wasMusicPlaying = false;

    if (isIOS && typeof pauseSpotify === 'function' && typeof isPlaying !== 'undefined') {
        wasMusicPlaying = isPlaying;
        if (wasMusicPlaying) {
            pauseSpotify();
        }
    }

    // Resume music and call callback after speech ends
    utterance.onend = () => {
        if (isIOS && wasMusicPlaying && typeof playSpotify === 'function') {
            // Small delay before resuming music
            setTimeout(() => {
                playSpotify();
            }, 300);
        }
        
        // Call the callback function if provided
        if (callback) {
            callback();
        }
    };

    window.speechSynthesis.speak(utterance);
}

function loadVoiceSettings() {
    const saved = localStorage.getItem('twisterVoiceSettings');
    if (saved) {
        const settings = JSON.parse(saved);
        voiceEnabled = settings.enabled ?? true;
        voiceRate = settings.rate ?? 1.0;
        voiceVolume = settings.volume ?? 1.0;
        voicePitch = settings.pitch ?? 1.0;
        
        updateSliderValues();
    }
}

function updateSliderValues() {
    const sliders = {
        rate: document.querySelectorAll('[id^="rateSlider"]'),
        volume: document.querySelectorAll('[id^="volumeSlider"]'),
        pitch: document.querySelectorAll('[id^="pitchSlider"]')
    };
    
    sliders.rate.forEach(slider => {
        slider.value = voiceRate;
    });
    sliders.volume.forEach(slider => {
        slider.value = voiceVolume;
    });
    sliders.pitch.forEach(slider => {
        slider.value = voicePitch;
    });
    
    updateVoiceRate(voiceRate);
    updateVoiceVolume(voiceVolume);
    updateVoicePitch(voicePitch);
}

function saveVoiceSettings() {
    const settings = {
        enabled: voiceEnabled,
        rate: voiceRate,
        volume: voiceVolume,
        pitch: voicePitch
    };
    localStorage.setItem('twisterVoiceSettings', JSON.stringify(settings));
}

// Settings Panel
function openSettings() {
    // Sync all settings before opening
    const toggleSettings = document.getElementById('voiceToggleSettings');
    if (toggleSettings) toggleSettings.checked = voiceEnabled;
    
    document.querySelector('.settings-overlay').classList.add('active');
    setTimeout(() => {
        document.querySelector('.settings-panel').classList.add('active');
    }, 10);
}

function closeSettings() {
    document.querySelector('.settings-panel').classList.remove('active');
    setTimeout(() => {
        document.querySelector('.settings-overlay').classList.remove('active');
    }, 300);
}

// Challenge System
function checkForChallenge() {
    if (!challengesEnabled) return null;
    
    // Get only enabled challenges
    const enabledChallenges = CHALLENGES.filter(c => c.enabled);
    if (enabledChallenges.length === 0) return null;
    
    const settings = CHALLENGE_PROBABILITIES[challengeFrequency];
    
    // Check if enough turns have passed
    if (turnNumber < settings.minTurns) return null;
    
    // Random chance based on frequency
    const randomRoll = Math.random();
    const shouldShowChallenge = randomRoll < settings.probability;
    
    if (shouldShowChallenge) {
        const randomChallenge = enabledChallenges[Math.floor(Math.random() * enabledChallenges.length)];
        showChallenge(randomChallenge);

        // Play challenge sound - ensure it's stopped and reset before playing
        challengeSound.pause();
        challengeSound.currentTime = 0;

        // Use a promise to ensure audio plays properly
        const playPromise = challengeSound.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => {
                console.log('Audio play failed:', e);
                // Try again after a small delay
                setTimeout(() => {
                    challengeSound.currentTime = 0;
                    challengeSound.play().catch(err => console.log('Retry failed:', err));
                }, 100);
            });
        }

        // Add 10 seconds to timer (if in timer mode)
        if (turnMode === 'timer') {
            // Set bonus time flag - startCountdown will use it
            challengeBonusTime = 10;
        }

        // Return challenge so it can be announced in proper sequence
        return randomChallenge;
    }
    return null;
}

function showChallenge(challenge) {
    currentChallenge = challenge;
    const challengeBanner = document.getElementById('challengeBanner');
    if (challengeBanner) {
        challengeBanner.style.display = 'block';
        document.getElementById('challengeText').textContent = `${challenge.icon} ${challenge.text}`;
    }
}

function hideChallenge() {
    currentChallenge = null;
    const challengeBanner = document.getElementById('challengeBanner');
    if (challengeBanner) {
        challengeBanner.style.display = 'none';
    }
}

// Game Flow
function startGame() {
    if (players.length < 2) {
        alert('You need at least 2 players to start!');
        return;
    }

    // Reset game state
    currentPlayerIndex = 0;
    turnNumber = 1;
    challengeBonusTime = 0; // Reset any bonus time
    hideChallenge();

    // Switch to game screen
    document.querySelector('.setup-screen').classList.add('hidden');
    document.querySelector('.game-screen').classList.add('active');

    // Update display
    updateGameDisplay();
    updateTimerDisplay();
    
    // Show in-game timer controls if in timer mode
    updateInGameTimerVisibility();
    
    // Auto-spin first turn
    spinWheel();
}

function updateInGameTimerVisibility() {
    const timerAdjust = document.querySelector('.ingame-timer-adjust');
    if (timerAdjust) {
        timerAdjust.style.display = turnMode === 'timer' ? 'flex' : 'none';
    }
}

function updateGameDisplay() {
    const currentPlayer = players[currentPlayerIndex];
    document.getElementById('currentPlayerName').textContent = currentPlayer;
    document.getElementById('turnNumber').textContent = turnNumber;
}

function spinWheel() {
    // Hide previous challenge first
    hideChallenge();
    
    // Check for challenge
    const challenge = checkForChallenge();
    
    // Random selection
    const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    const randomLimb = LIMBS[Math.floor(Math.random() * LIMBS.length)];

    // Update display
    const resultDisplay = document.querySelector('.result-display');
    resultDisplay.className = 'result-display';
    resultDisplay.classList.add(`color-${randomColor}`);
    
    // Determine limb icon
    const isHand = randomLimb.includes('Hand');
    const limbIcon = isHand ? 'arm.png' : 'leg.png';
    
    const iconElement = document.getElementById('limbIcon');
    iconElement.src = `images/${limbIcon}`;
    iconElement.alt = randomLimb;
    iconElement.style.display = 'block';
    
    document.getElementById('resultLimb').textContent = randomLimb;
    document.getElementById('resultColorText').textContent = randomColor.toUpperCase();

    // Voice announcement with proper sequencing
    const currentPlayer = players[currentPlayerIndex];
    
    if (challenge) {
        // If there's a challenge: announce challenge FIRST, then announce the turn
        const challengeAnnouncement = `Challenge for ${currentPlayer}! ${challenge.text}`;
        speak(challengeAnnouncement, false, () => {
            // After challenge announcement finishes, announce the turn
            const turnAnnouncement = `${currentPlayer}, ${randomLimb} on ${randomColor}`;
            speak(turnAnnouncement);
        });
    } else {
        // No challenge: just announce the turn normally
        const announcement = `${currentPlayer}, ${randomLimb} on ${randomColor}`;
        speak(announcement);
    }

    // Start timer if in timer mode
    if (turnMode === 'timer') {
        startCountdown();
    }
}

function startCountdown() {
    // Clear any existing countdown
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    // Start with base timer duration plus any challenge bonus time
    currentCountdown = timerDuration + challengeBonusTime;
    
    // Reset bonus time after using it
    challengeBonusTime = 0;
    
    // Show countdown display
    const countdownDisplay = document.querySelector('.timer-countdown');
    if (countdownDisplay) {
        countdownDisplay.style.display = 'block';
        updateCountdownDisplay();
    }

    countdownInterval = setInterval(() => {
        currentCountdown--;
        updateCountdownDisplay();

        if (currentCountdown <= 0) {
            clearInterval(countdownInterval);
            nextPlayerAuto();
        }
    }, 1000);
}

function updateCountdownDisplay() {
    const countdownTimer = document.getElementById('countdownTimer');
    if (countdownTimer) {
        countdownTimer.textContent = currentCountdown;
    }
}

function nextPlayerAuto() {
    // Move to next player
    currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
    
    // Increment turn when we complete a full round
    if (currentPlayerIndex === 0) {
        turnNumber++;
    }

    updateGameDisplay();
    spinWheel(); // Auto-spin for next player
}

function nextPlayerManual() {
    // In manual mode, clicking next player also spins
    currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
    
    if (currentPlayerIndex === 0) {
        turnNumber++;
    }

    updateGameDisplay();
    spinWheel();
}

function endGame() {
    if (confirm('Are you sure you want to end the game?')) {
        // Clear any running timer
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        
        // Stop any ongoing speech
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        
        // Hide challenge
        hideChallenge();
        
        // Reset display
        const resultDisplay = document.querySelector('.result-display');
        resultDisplay.className = 'result-display color-waiting';
        document.getElementById('resultLimb').textContent = '';
        document.getElementById('resultColorText').textContent = 'Ready?';
        document.getElementById('limbIcon').style.display = 'none';
        
        // Hide countdown if visible
        const countdownDisplay = document.querySelector('.timer-countdown');
        if (countdownDisplay) {
            countdownDisplay.style.display = 'none';
        }
        
        // Switch back to setup screen
        document.querySelector('.game-screen').classList.remove('active');
        document.querySelector('.setup-screen').classList.remove('hidden');
    }
}
