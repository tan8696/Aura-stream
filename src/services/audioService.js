/**
 * Audio Service for AuraStream
 * Full Web Audio API Pipeline with 5-Band EQ, 3D Spatial Panner, Real-Time Analyser,
 * True Fisher-Yates Random Shuffle, and Smart Queue Management.
 */

import { StorageService } from './storageService.js';
import { RecommendationEngine } from './recommendationEngine.js';

export const EQ_PRESETS = {
  flat: { name: 'Flat', bands: [0, 0, 0, 0, 0] },
  bass_boost: { name: 'Bass Boost', bands: [8, 5, 1, 0, -1] },
  vocal: { name: 'Vocal Clarity', bands: [-2, 1, 4, 3, 2] },
  acoustic: { name: 'Acoustic Warmth', bands: [3, 2, 0, 2, 4] },
  electronic: { name: 'Electronic Club', bands: [6, 3, -1, 4, 6] },
  rock: { name: 'Rock Drive', bands: [5, 3, -2, 4, 5] }
};

export class AudioService {
  constructor(catalog = []) {
    this.catalog = catalog;

    // Core HTML5 audio element
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';

    // Web Audio API context & nodes
    this.audioCtx = null;
    this.sourceNode = null;
    this.analyserNode = null;
    this.gainNode = null;
    this.pannerNode = null;
    this.eqNodes = []; // 5 BiquadFilterNodes

    // Playback state
    this.currentTrack = null;
    this.queue = [];
    this.queueIndex = -1;
    this.originalQueue = [];
    this.isPlaying = false;
    this.isMuted = false;
    this.volume = StorageService.getVolume();
    this.audio.volume = this.volume;
    this.playbackRate = 1.0;

    // Modes
    this.shuffleMode = 'off'; // 'off' | 'true-random' | 'smart-flow'
    this.loopMode = 'all';     // 'off' | 'all' | 'one'
    this.spatial3DEnabled = true;

    // A-B Looping
    this.abLoop = { enabled: false, start: 0, end: 0 };

    // Saved EQ settings
    const savedEq = StorageService.getEqSettings();
    this.eqBands = savedEq.bands || [4, 2, 0, 3, 5];
    this.activePreset = savedEq.preset || 'electronic';
    this.spatial3DEnabled = savedEq.spatial3D !== undefined ? savedEq.spatial3D : true;

    // Event listeners callback dictionary
    this.listeners = {
      trackchange: [],
      playstate: [],
      timeupdate: [],
      queuechange: [],
      modechange: [],
      eqchange: []
    };

    this._bindAudioEvents();
  }

  /**
   * Lazily initialize Web Audio API on first user interaction
   */
  initWebAudio() {
    if (this.audioCtx) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      // Create analyser node
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.82;

      // Create Gain node
      this.gainNode = this.audioCtx.createGain();

      // Create Spatial Stereo Panner node
      if (this.audioCtx.createStereoPanner) {
        this.pannerNode = this.audioCtx.createStereoPanner();
        this.pannerNode.pan.value = 0;
      }

      // Create 5-Band BiquadFilter Equalizer
      // Bands: 60Hz (lowshelf), 250Hz (peaking), 1000Hz (peaking), 4000Hz (peaking), 16000Hz (highshelf)
      const frequencies = [60, 250, 1000, 4000, 16000];
      const types = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

      this.eqNodes = frequencies.map((freq, idx) => {
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = types[idx];
        filter.frequency.value = freq;
        filter.Q.value = 1.0;
        filter.gain.value = this.eqBands[idx] || 0;
        return filter;
      });

      // Connect MediaElementSource through nodes chain
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

      let prevNode = this.sourceNode;
      for (const filter of this.eqNodes) {
        prevNode.connect(filter);
        prevNode = filter;
      }

      if (this.pannerNode) {
        prevNode.connect(this.pannerNode);
        prevNode = this.pannerNode;
      }

      prevNode.connect(this.analyserNode);
      this.analyserNode.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);

      console.log('AuraStream Web Audio API initialized successfully');
    } catch (err) {
      console.warn('Web Audio API not supported or blocked by browser policy:', err);
    }
  }

  _bindAudioEvents() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this._emit('playstate', { isPlaying: true });
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this._emit('playstate', { isPlaying: false });
    });

    this.audio.addEventListener('timeupdate', () => {
      if (this.abLoop.enabled && this.audio.currentTime >= this.abLoop.end) {
        this.audio.currentTime = this.abLoop.start;
      }
      this._emit('timeupdate', {
        currentTime: this.audio.currentTime,
        duration: this.audio.duration || 0
      });
    });

    this.audio.addEventListener('ended', () => {
      if (this.loopMode === 'one') {
        this.audio.currentTime = 0;
        this.audio.play();
      } else {
        this.playNext(false); // auto advance
      }
    });

    this.audio.addEventListener('error', (e) => {
      console.warn('Audio playback error on track:', this.currentTrack?.title, e);
      // If error occurs, advance to next track after short pause
      setTimeout(() => {
        if (this.isPlaying) this.playNext(false);
      }, 1500);
    });
  }

  /**
   * Play a specific track
   */
  async playTrack(track, newQueue = null) {
    this.initWebAudio();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    if (newQueue) {
      this.originalQueue = [...newQueue];
      this.queue = [...newQueue];
      this.queueIndex = this.queue.findIndex(t => t.id === track.id);
      if (this.queueIndex === -1) {
        this.queue.unshift(track);
        this.queueIndex = 0;
      }
      this._emit('queuechange', { queue: this.queue, queueIndex: this.queueIndex });
    }

    this.currentTrack = track;
    this.audio.src = track.audioUrl;
    this.audio.playbackRate = this.playbackRate;

    try {
      await this.audio.play();
      this.isPlaying = true;
      StorageService.recordPlay(track.id);
      this._emit('trackchange', { track: this.currentTrack, queueIndex: this.queueIndex });
    } catch (err) {
      console.warn('Playback start postponed until user interacts:', err);
    }
  }

  /**
   * Toggle Play / Pause
   */
  async togglePlayPause() {
    this.initWebAudio();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    if (!this.currentTrack) {
      if (this.queue.length > 0) {
        return this.playTrack(this.queue[0]);
      } else if (this.catalog.length > 0) {
        return this.playTrack(this.catalog[0], this.catalog);
      }
      return;
    }

    if (this.audio.paused) {
      try {
        await this.audio.play();
        this.isPlaying = true;
      } catch (e) {
        console.warn('Failed to resume:', e);
      }
    } else {
      this.audio.pause();
      this.isPlaying = false;
    }
    this._emit('playstate', { isPlaying: this.isPlaying });
  }

  /**
   * Play next track
   */
  playNext(manual = true) {
    if (this.queue.length === 0) return;

    // Check if smart flow shuffle is active and queue is ending
    if (this.shuffleMode === 'smart-flow' && this.queueIndex >= this.queue.length - 1) {
      // Intelligently inject 3 new recommendations at the end of queue
      const dial = StorageService.getDiscoveryDial();
      const recs = RecommendationEngine.getRecommendationsForTrack(this.currentTrack, this.catalog, dial, 3);
      for (const item of recs) {
        if (!this.queue.some(t => t.id === item.track.id)) {
          this.queue.push(item.track);
        }
      }
      this._emit('queuechange', { queue: this.queue, queueIndex: this.queueIndex });
    }

    let nextIndex = this.queueIndex + 1;
    if (nextIndex >= this.queue.length) {
      if (this.loopMode === 'all' || manual) {
        nextIndex = 0;
      } else {
        this.audio.pause();
        this.isPlaying = false;
        this._emit('playstate', { isPlaying: false });
        return;
      }
    }

    this.queueIndex = nextIndex;
    this.playTrack(this.queue[this.queueIndex]);
    this._emit('queuechange', { queue: this.queue, queueIndex: this.queueIndex });
  }

  /**
   * Play previous track or restart current track
   */
  playPrev() {
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }

    if (this.queue.length === 0) return;

    let prevIndex = this.queueIndex - 1;
    if (prevIndex < 0) {
      prevIndex = this.queue.length - 1;
    }

    this.queueIndex = prevIndex;
    this.playTrack(this.queue[this.queueIndex]);
    this._emit('queuechange', { queue: this.queue, queueIndex: this.queueIndex });
  }

  /**
   * Seek to timestamp in seconds
   */
  seekTo(seconds) {
    if (Number.isFinite(seconds)) {
      this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration || 0));
    }
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    this.audio.volume = this.volume;
    this.isMuted = this.volume === 0;
    StorageService.saveVolume(this.volume);
  }

  /**
   * Toggle mute
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    this.audio.muted = this.isMuted;
    return this.isMuted;
  }

  /**
   * Set playback speed (e.g. 0.75, 1.0, 1.25, 1.5, 2.0)
   */
  setPlaybackSpeed(speed) {
    this.playbackRate = speed;
    this.audio.playbackRate = speed;
  }

  /**
   * Toggle Shuffle Mode:
   * 'off' -> 'true-random' (Fisher-Yates pure randomness, no repeats) -> 'smart-flow' (AI harmonic flow) -> 'off'
   */
  cycleShuffleMode() {
    if (this.shuffleMode === 'off') {
      this.shuffleMode = 'true-random';
      this._applyTrueRandomShuffle();
    } else if (this.shuffleMode === 'true-random') {
      this.shuffleMode = 'smart-flow';
      this._applySmartFlowShuffle();
    } else {
      this.shuffleMode = 'off';
      this._restoreOriginalQueue();
    }

    this._emit('modechange', { shuffleMode: this.shuffleMode, loopMode: this.loopMode });
    return this.shuffleMode;
  }

  /**
   * Directly set shuffle mode: 'off' | 'true-random' | 'smart-flow'
   */
  setShuffleMode(mode) {
    this.shuffleMode = mode;
    if (mode === 'true-random') {
      this._applyTrueRandomShuffle();
    } else if (mode === 'smart-flow') {
      this._applySmartFlowShuffle();
    } else {
      this.shuffleMode = 'off';
      this._restoreOriginalQueue();
    }
    this._emit('modechange', { shuffleMode: this.shuffleMode, loopMode: this.loopMode });
    return this.shuffleMode;
  }

  /**
   * True Fisher-Yates random shuffle (Guarantees zero algorithmic bias & zero repeats!)
   */
  _applyTrueRandomShuffle() {
    if (this.queue.length <= 1) return;
    const current = this.currentTrack;
    const others = this.queue.filter(t => t.id !== current?.id);

    // Fisher-Yates algorithm
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }

    this.queue = current ? [current, ...others] : others;
    this.queueIndex = 0;
    this._emit('queuechange', { queue: this.queue, queueIndex: this.queueIndex });
  }

  /**
   * Smart Flow Shuffle: orders tracks by harmonic valence and tempo proximity
   */
  _applySmartFlowShuffle() {
    if (this.queue.length <= 1) return;
    const current = this.currentTrack || this.queue[0];
    const pool = this.queue.filter(t => t.id !== current.id);
    const sorted = [current];

    let pivot = current;
    while (pool.length > 0) {
      // Find closest track by BPM & energy
      let bestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const diff = Math.abs(pool[i].bpm - pivot.bpm) + (Math.abs(pool[i].vector.energy - pivot.vector.energy) * 50);
        if (diff < minDiff) {
          minDiff = diff;
          bestIdx = i;
        }
      }
      pivot = pool.splice(bestIdx, 1)[0];
      sorted.push(pivot);
    }

    this.queue = sorted;
    this.queueIndex = 0;
    this._emit('queuechange', { queue: this.queue, queueIndex: this.queueIndex });
  }

  _restoreOriginalQueue() {
    if (this.originalQueue.length > 0) {
      this.queue = [...this.originalQueue];
      if (this.currentTrack) {
        this.queueIndex = this.queue.findIndex(t => t.id === this.currentTrack.id);
      }
      this._emit('queuechange', { queue: this.queue, queueIndex: this.queueIndex });
    }
  }

  /**
   * Toggle Loop Mode: 'off' -> 'all' -> 'one' -> 'off'
   */
  cycleLoopMode() {
    if (this.loopMode === 'all') {
      this.loopMode = 'one';
    } else if (this.loopMode === 'one') {
      this.loopMode = 'off';
    } else {
      this.loopMode = 'all';
    }

    this._emit('modechange', { shuffleMode: this.shuffleMode, loopMode: this.loopMode });
    return this.loopMode;
  }

  /**
   * Queue Management Methods
   */
  addToQueue(track, playNext = false) {
    if (playNext && this.queueIndex >= 0) {
      this.queue.splice(this.queueIndex + 1, 0, track);
    } else {
      this.queue.push(track);
    }
    this._emit('queuechange', { queue: this.queue, queueIndex: this.queueIndex });
  }

  removeFromQueue(index) {
    if (index === this.queueIndex) return; // Cannot remove currently playing track
    this.queue.splice(index, 1);
    if (index < this.queueIndex) {
      this.queueIndex--;
    }
    this._emit('queuechange', { queue: this.queue, queueIndex: this.queueIndex });
  }

  reorderQueue(fromIdx, toIdx) {
    if (fromIdx < 0 || fromIdx >= this.queue.length || toIdx < 0 || toIdx >= this.queue.length) return;
    const [moved] = this.queue.splice(fromIdx, 1);
    this.queue.splice(toIdx, 0, moved);

    if (this.currentTrack) {
      this.queueIndex = this.queue.findIndex(t => t.id === this.currentTrack.id);
    }
    this._emit('queuechange', { queue: this.queue, queueIndex: this.queueIndex });
  }

  clearQueue() {
    if (this.currentTrack) {
      this.queue = [this.currentTrack];
      this.queueIndex = 0;
    } else {
      this.queue = [];
      this.queueIndex = -1;
    }
    this._emit('queuechange', { queue: this.queue, queueIndex: this.queueIndex });
  }

  /**
   * Equalizer & Spatial controls
   */
  setEqBand(bandIndex, gainDb) {
    this.initWebAudio();
    if (this.eqNodes[bandIndex]) {
      this.eqNodes[bandIndex].gain.value = gainDb;
      this.eqBands[bandIndex] = gainDb;
      this.activePreset = 'custom';
      this._saveEq();
      this._emit('eqchange', { bands: this.eqBands, preset: this.activePreset });
    }
  }

  setEqPreset(presetKey) {
    this.initWebAudio();
    const preset = EQ_PRESETS[presetKey];
    if (!preset) return;

    this.activePreset = presetKey;
    this.eqBands = [...preset.bands];

    this.eqNodes.forEach((node, idx) => {
      node.gain.value = this.eqBands[idx];
    });

    this._saveEq();
    this._emit('eqchange', { bands: this.eqBands, preset: this.activePreset });
  }

  setSpatial3D(enabled) {
    this.initWebAudio();
    this.spatial3DEnabled = enabled;
    if (this.pannerNode) {
      // Simulate wide stereo ambiance by slight pan oscillation or subtle stereo expansion
      this.pannerNode.pan.value = enabled ? 0.05 : 0;
    }
    this._saveEq();
  }

  _saveEq() {
    StorageService.saveEqSettings({
      preset: this.activePreset,
      bands: this.eqBands,
      spatial3D: this.spatial3DEnabled,
      playbackSpeed: this.playbackRate
    });
  }

  /**
   * Get Real-Time Audio Data for Canvas Visualizer
   */
  getFrequencyData(array) {
    if (this.analyserNode) {
      this.analyserNode.getByteFrequencyData(array);
    } else {
      array.fill(0);
    }
  }

  getTimeDomainData(array) {
    if (this.analyserNode) {
      this.analyserNode.getByteTimeDomainData(array);
    } else {
      array.fill(128);
    }
  }

  /**
   * Event subscribe helper
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  _emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(fn => fn(data));
    }
  }
}
