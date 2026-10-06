const CLIENT_ID = 'YOUR_SPOTIFY_CLIENT_ID'; // User needs to replace this
const REDIRECT_URI = window.location.origin + '/';
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-library-read',
  'user-library-modify',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative'
].join(' ');

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

// PKCE Utility Functions
function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function generateCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export class SpotifyAuth {
  static async login() {
    const clientId = this.getClientId();
    if (clientId === 'YOUR_SPOTIFY_CLIENT_ID') {
      alert('Please set your Spotify Client ID in src/services/spotify.js');
      return;
    }
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    window.localStorage.setItem('spotify_code_verifier', codeVerifier);

    const args = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: SCOPES,
      redirect_uri: REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge
    });

    window.location = AUTH_URL + '?' + args;
  }

  static async handleCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (!code) return false;

    const codeVerifier = window.localStorage.getItem('spotify_code_verifier');
    window.localStorage.removeItem('spotify_code_verifier');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier
    });

    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
      });

      if (!response.ok) throw new Error('HTTP status ' + response.status);
      const data = await response.json();
      this.setTokens(data);
      
      // Clean up URL
      window.history.replaceState({}, document.title, '/');
      return true;
    } catch (error) {
      console.error('Error fetching token:', error);
      return false;
    }
  }

  static setTokens(data) {
    if (data.access_token) {
      window.localStorage.setItem('spotify_access_token', data.access_token);
      window.localStorage.setItem('spotify_token_expires', Date.now() + data.expires_in * 1000);
    }
    if (data.refresh_token) {
      window.localStorage.setItem('spotify_refresh_token', data.refresh_token);
    }
  }

  static async getAccessToken() {
    let token = window.localStorage.getItem('spotify_access_token');
    const expires = window.localStorage.getItem('spotify_token_expires');

    if (!token || !expires) return null;

    if (Date.now() > parseInt(expires) - 60000) {
      // Refresh token
      const refreshToken = window.localStorage.getItem('spotify_refresh_token');
      if (!refreshToken) return null;

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID
      });

      try {
        const response = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body
        });
        if (!response.ok) throw new Error('Refresh failed');
        const data = await response.json();
        this.setTokens(data);
        token = data.access_token;
      } catch (err) {
        console.error('Failed to refresh token', err);
        window.localStorage.removeItem('spotify_access_token');
        return null;
      }
    }
    return token;
  }

  static logout() {
    window.localStorage.removeItem('spotify_access_token');
    window.localStorage.removeItem('spotify_refresh_token');
    window.localStorage.removeItem('spotify_token_expires');
    window.location.reload();
  }
  
  static setClientId(id) {
    window.localStorage.setItem('spotify_custom_client_id', id);
  }
  
  static getClientId() {
    return window.localStorage.getItem('spotify_custom_client_id') || CLIENT_ID;
  }
}

export class SpotifyAPI {
  static async request(endpoint, options = {}) {
    const token = await SpotifyAuth.getAccessToken();
    if (!token) throw new Error('Not authenticated');

    const headers = {
      'Authorization': `Bearer ${token}`,
      ...options.headers
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (response.status === 204) return null; // No content
    if (!response.ok) {
      throw new Error(`Spotify API error ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }

  static async getUserProfile() {
    return this.request('/me');
  }

  static async getUserPlaylists() {
    return this.request('/me/playlists');
  }

  static async getPlaylist(playlistId) {
    return this.request(`/playlists/${playlistId}`);
  }
  
  static async getFeaturedPlaylists() {
    return this.request('/browse/featured-playlists');
  }
  
  static async getUserTopTracks() {
    return this.request('/me/top/tracks?limit=20');
  }
  
  static async getRecentlyPlayed() {
    return this.request('/me/player/recently-played?limit=20');
  }
  
  static async getLikedTracks() {
    return this.request('/me/tracks?limit=50');
  }
  
  static async play(contextUri, uris = null) {
    const body = {};
    if (contextUri) {
      body.context_uri = contextUri;
    } else if (uris) {
      body.uris = uris;
    }
    return this.request('/me/player/play', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }
  
  static async search(query, type = 'track,artist,album,playlist') {
    return this.request(`/search?q=${encodeURIComponent(query)}&type=${type}&limit=20`);
  }
}
