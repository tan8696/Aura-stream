import { SpotifyAuth, SpotifyAPI } from './spotify.js';

export class SpotifyPlayerService {
  constructor() {
    this.player = null;
    this.deviceId = null;
    this.isReady = false;
    this.currentTrack = null;
    this.isPlaying = false;
    this.listeners = {
      'trackchange': [],
      'playstate': [],
      'timeupdate': [],
      'modechange': [],
      'ready': []
    };
    this.pollInterval = null;
    this.shuffleMode = 'off';
    this.loopMode = 'off';
    this.volume = 0.8;
  }

  async init() {
    const token = await SpotifyAuth.getAccessToken();
    if (!token) return;

    if (!window.Spotify) {
      await new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.async = true;
        document.body.appendChild(script);

        window.onSpotifyWebPlaybackSDKReady = resolve;
      });
    }

    this.player = new window.Spotify.Player({
      name: 'AuraStream Web Player',
      getOAuthToken: async cb => { 
        cb(await SpotifyAuth.getAccessToken()); 
      },
      volume: this.volume
    });

    this.player.addListener('initialization_error', ({ message }) => { console.error(message); });
    this.player.addListener('authentication_error', ({ message }) => { console.error(message); SpotifyAuth.logout(); });
    this.player.addListener('account_error', ({ message }) => { console.error('Premium required: ', message); alert('Spotify Premium is required for Web Playback SDK'); });
    this.player.addListener('playback_error', ({ message }) => { console.error(message); });

    this.player.addListener('player_state_changed', state => {
      if (!state) return;

      const track = state.track_window.current_track;
      
      const newIsPlaying = !state.paused;
      if (this.isPlaying !== newIsPlaying) {
        this.isPlaying = newIsPlaying;
        this._emit('playstate', { isPlaying: this.isPlaying });
        
        if (this.isPlaying) {
          this._startPolling();
        } else {
          this._stopPolling();
        }
      }

      if (track) {
        const mappedTrack = {
          id: track.id,
          title: track.name,
          artist: track.artists.map(a => a.name).join(', '),
          coverUrl: track.album.images[0]?.url || '/covers/default.jpg',
          duration: track.duration_ms / 1000,
          color: '#7928CA',
          accentColor: '#00F2FE'
        };

        if (!this.currentTrack || this.currentTrack.id !== mappedTrack.id) {
          this.currentTrack = mappedTrack;
          this._emit('trackchange', { track: this.currentTrack });
        }
      }

      this._emit('timeupdate', { 
        currentTime: state.position / 1000, 
        duration: state.duration / 1000 
      });
    });

    this.player.addListener('ready', ({ device_id }) => {
      console.log('Ready with Device ID', device_id);
      this.deviceId = device_id;
      this.isReady = true;
      
      SpotifyAPI.request('/me/player', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_ids: [device_id],
          play: false,
        })
      });

      this._emit('ready', device_id);
    });

    this.player.addListener('not_ready', ({ device_id }) => {
      console.log('Device ID has gone offline', device_id);
      this.isReady = false;
    });

    this.player.connect();
  }
  
  _startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(async () => {
      if (!this.player || !this.isPlaying) return;
      const state = await this.player.getCurrentState();
      if (state) {
        this._emit('timeupdate', { 
          currentTime: state.position / 1000, 
          duration: state.duration / 1000 
        });
      }
    }, 500);
  }

  _stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  _emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  async play(uri) {
    if (!this.deviceId) return;
    await SpotifyAPI.play(null, [uri]);
  }
  
  async playContext(contextUri) {
    if (!this.deviceId) return;
    await SpotifyAPI.play(contextUri);
  }

  async pause() {
    if (this.player) await this.player.pause();
  }

  async resume() {
    if (this.player) await this.player.resume();
  }
  
  async togglePlayPause() {
    if (this.player) await this.player.togglePlay();
  }

  async playNext() {
    if (this.player) await this.player.nextTrack();
  }

  async playPrev() {
    if (this.player) await this.player.previousTrack();
  }

  async seekTo(timeSeconds) {
    if (this.player) await this.player.seek(timeSeconds * 1000);
  }

  async setVolume(vol) {
    this.volume = vol;
    if (this.player) await this.player.setVolume(vol);
  }

  toggleMute() {
    if (this.volume > 0) {
      this._prevVol = this.volume;
      this.setVolume(0);
      return true;
    } else {
      this.setVolume(this._prevVol || 0.8);
      return false;
    }
  }

  cycleShuffleMode() {
    const modes = ['off', 'true-random', 'smart-flow'];
    const idx = modes.indexOf(this.shuffleMode);
    this.shuffleMode = modes[(idx + 1) % modes.length];
    
    // Spotify API shuffle toggle
    SpotifyAPI.request(`/me/player/shuffle?state=\${this.shuffleMode !== 'off'}`, {
      method: 'PUT'
    });

    this._emit('modechange', { shuffleMode: this.shuffleMode });
    return this.shuffleMode;
  }
  
  setShuffleMode(mode) {
    this.shuffleMode = mode;
    SpotifyAPI.request(`/me/player/shuffle?state=\${this.shuffleMode !== 'off'}`, {
      method: 'PUT'
    });
    this._emit('modechange', { shuffleMode: this.shuffleMode });
  }

  cycleLoopMode() {
    const modes = ['off', 'context', 'track'];
    const idx = modes.indexOf(this.loopMode);
    this.loopMode = modes[(idx + 1) % modes.length];
    
    SpotifyAPI.request(`/me/player/repeat?state=\${this.loopMode}`, {
      method: 'PUT'
    });
    
    return this.loopMode;
  }
}
