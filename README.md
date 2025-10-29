# 🌵🐡🍤 Twister Game

A modern, interactive Twister game web application with Spotify integration, voice announcements, and fun challenges!

## Features

- 🎮 Interactive game with customizable players
- 🎵 Spotify music integration with volume control
- 🗣️ Voice announcements with intelligent voice selection
- ⭐ Random challenges to spice up the game
- ⏱️ Timer mode for automated turns
- 📱 Fully responsive - works on mobile and desktop
- 🎨 Beautiful iOS-inspired UI
- 🔒 Secure OAuth 2.0 with PKCE flow

## Quick Start

### 1. Basic Setup (No Spotify)

1. Open `index.html` in a web browser
2. Add players and start playing!

### 2. Full Setup (With Spotify Integration)

#### Step 1: Get Your Spotify Client ID

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account (requires Premium for playback)
3. Click **"Create an app"**
4. Fill in:
   - **App name:** Twister Game (or any name)
   - **App description:** Interactive Twister game
5. Accept the terms and click **Create**
6. Copy your **Client ID** from the dashboard

#### Step 2: Configure Your Spotify App

1. In your Spotify app dashboard, click **"Edit Settings"**
2. Add your **Redirect URIs**:
   - For GitHub Pages: `https://yourusername.github.io/Twister/`
   - For local development: `http://localhost:8000/` (or whatever port you use)
   - You can add multiple URIs
3. Click **"Save"**

#### Step 3: Create Your Config File

1. Copy the template:
   ```bash
   cp config.template.js config.js
   ```

2. Edit `config.js`:
   ```javascript
   const SPOTIFY_CLIENT_ID = 'your_actual_client_id_here';
   ```

3. **Important:** Never commit `config.js` to git (it's already in `.gitignore`)

#### Step 4: Run Locally (For Testing)

```bash
# Using Python
python -m http.server 8000

# OR using Node.js
npx serve

# OR using PHP
php -S localhost:8000
```

Open `http://localhost:8000` in your browser.

#### Step 5: Deploy to GitHub Pages

**Option A: For Personal Use (Keep Private)**
1. Keep your `config.js` file locally
2. Don't commit it to the repo
3. Use it only for local testing

**Option B: For Public Deployment**

Since this is a client-side app, the Client ID will be visible in the browser anyway. To deploy:

1. Create a separate branch for deployment:
   ```bash
   git checkout -b gh-pages
   ```

2. Temporarily add `config.js` to this branch:
   ```bash
   git add -f config.js
   git commit -m "Add config for deployment"
   ```

3. Push to GitHub Pages:
   ```bash
   git push origin gh-pages
   ```

4. In your repo settings, set GitHub Pages to use the `gh-pages` branch

**Note:** For OAuth 2.0 Implicit Grant or Authorization Code flows used in client-side apps, having the Client ID visible is expected and acceptable. The Client ID is not a secret - it identifies your app but cannot be used maliciously without the Client Secret (which you never use in client-side apps).

## How to Play

1. **Add Players:** Enter player names and click "Add"
2. **Choose Settings:**
   - **Manual or Timer Mode:** Control turn advancement
   - **Enable/Disable Challenges:** Add extra difficulty
   - **Adjust Voice Settings:** Customize announcements
   - **Connect Spotify** (optional): Play music during the game
3. **Start Game:** Click "Start Game"
4. **Follow Instructions:** Each turn shows which limb goes on which color
5. **Have Fun!** Try not to fall over!

## Game Modes

- **Manual Mode:** Click "Next Player" to advance turns manually
- **Timer Mode:** Turns advance automatically after a countdown (adjustable 5-30 seconds)

## Features in Detail

### Voice Announcements
- Automatically announces moves with player names
- Intelligent voice selection - picks the best quality English voice available
- Adjustable speed, volume, and pitch
- Works across all major browsers

### Spotify Integration
- **Desktop:** Uses Spotify Web Playback SDK for seamless in-browser playback
- **Mobile:** Controls your Spotify app (must have app open)
- Search and select any playlist
- Adjustable music volume (defaults to 30% so voice is audible)
- Mini player with play/pause/skip controls
- **Requires Spotify Premium** for playback

### Challenges
- Random challenges appear during gameplay
- Adjustable frequency: Rare, Medium, or Frequent
- Adds extra time in timer mode
- Fun sound effects
- Each challenge can be individually enabled/disabled

### iOS Optimizations
- Automatically pauses music during voice announcements on iOS
- Resumes music after speaking
- Addresses iOS Safari audio routing limitations

## Browser Support

| Browser | Desktop | Mobile | Notes |
|---------|---------|--------|-------|
| Chrome/Edge | ✅ | ✅ | Full support |
| Firefox | ✅ | ✅ | Full support |
| Safari | ✅ | ✅ | Spotify requires app on iOS |

**iOS Note:** Due to iOS Safari limitations, Spotify playback requires the Spotify app to be open. The web app will control your phone's Spotify app.

## Privacy & Security

- **Client ID:** Stored in `config.js` (not committed to git)
- **No server:** All data stays in your browser
- **localStorage:** Game settings and Spotify tokens stored locally
- **OAuth 2.0 with PKCE:** Secure authentication flow
- **No tracking:** This app doesn't collect or send any analytics

### Why is the Client ID not a secret?

For client-side OAuth apps (like this one), the Client ID is meant to identify your app to Spotify but is not confidential. It's similar to a username - it identifies you but can't be used to access your account. The app uses OAuth 2.0 with PKCE (Proof Key for Code Exchange), which is secure without needing a client secret.

## Development

### Project Structure

```
Twister/
├── index.html          # Main HTML structure
├── script.js           # Game logic and voice control
├── spotify.js          # Spotify integration (OAuth + API)
├── styles.css          # Modern iOS-inspired styling
├── config.js           # Your Spotify Client ID (gitignored)
├── config.template.js  # Template for config.js
├── images/             # Game icons and graphics
├── sfx/                # Sound effects
└── README.md           # This file
```

### Tech Stack

- **Vanilla JavaScript** - No frameworks needed
- **Web Speech API** - For voice announcements
- **Spotify Web API** - Music integration
- **Spotify Web Playback SDK** - In-browser playback (desktop)
- **OAuth 2.0 with PKCE** - Secure authentication
- **LocalStorage** - Persistent settings

### Contributing

Feel free to fork and improve! Some ideas:
- Add more challenge types
- Support for more languages
- Custom color schemes
- Multiplayer scoring system
- Web Bluetooth for IoT integration with actual Twister mats

## Troubleshooting

### "SPOTIFY_CLIENT_ID is not defined" error
- Make sure you created `config.js` from `config.template.js`
- Verify `config.js` contains your actual Client ID
- Check that `config.js` is loaded before `spotify.js` in `index.html`

### Spotify won't connect
- Verify you added the correct Redirect URI in your Spotify app settings
- Make sure the URI exactly matches your current URL (including trailing slash)
- Check browser console for specific error messages

### Music doesn't play on iPhone
- Ensure the Spotify app is open on your phone
- Make sure you have Spotify Premium
- Try force-closing and reopening the Spotify app
- Check that Spotify is logged in on your device

### Voice sounds weird
- The app automatically selects the best voice, but you can adjust speed and pitch
- Some browsers have better voice synthesis than others
- Chrome typically has the best voices

### Challenge sound doesn't play
- Some browsers require user interaction before playing audio
- Try clicking anywhere on the page first
- Check that your device isn't muted

## Credits

- **Voice Synthesis:** Web Speech API
- **Music:** Spotify Web API & Web Playback SDK
- **Icons & Sound Effects:** Custom assets
- **Design:** iOS-inspired interface

## License

Free to use and modify for personal and educational purposes.

---

🤖 Enhanced with [Claude Code](https://claude.com/claude-code)

Made with ❤️ for game nights!
