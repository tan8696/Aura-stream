/**
 * Audio Service for AuraStream
 * HTML5 audio + Web Audio pipeline (5-band EQ, analyser), shuffle modes and queue management.
 */

import { StorageService } from './storageService.js';
import { RecommendationEngine } from './recommendationEngine.js';

export const EQ_PRESETS = {
  flat:       { name: 'Flat',       bands: [0, 0, 0, 0, 0] },
  bass_boost: { name: 'Bass Boost', bands: [8, 5, 1, 0, -1] },
  vocal:      { name: 'Vocal',      bands: [-2, 1, 4, 3, 2] },
  acoustic:   { name: 'Acoustic',   bands: [3, 2, 0, 2, 4] },
  electronic: { name: 'Electronic', bands: [6, 3, -1, 4, 6] },
  rock:       { name: 'Rock',       bands: [5, 3, -2, 4, 5] }
};

export const EQ_BANDS = [
  { label: 'Bass',    hz: '60 Hz',  freq: 60,    type: 'lowshelf' },
  { label: 'Low-mid', hz: '250 Hz', freq: 250,   type: 'peaking' },
  { label: 'Mid',     hz: '1 kHz',  freq: 1000,  type: 'peaking' },
  { label: 'Hi-mid',  hz: '4 kHz',  freq: 4000,  type: 'peaking' },
  { label: 'Treble',  hz: '16 kHz', freq: 16000, type: 'highshelf' }
];

export class AudioService {
  constructor(catalog = []) {
    this.catalog = catalog;

    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';

    // Web Audio graph is created lazily on first user gesture (autoplay policy)
    this.audioCtx = null;
    this.analyserNode = null;
    this.eqNodes = [];

    this.currentTrack = null;
    this.queue = [];
    this.queueIndex = -1;
    this.originalQueue = [];
    this.isPlaying = false;
    this.isMuted = false;
    this.volume = StorageService.getVolume();
    this.audio.volume = this.volume;
    this.playbackRate = 1;

    this.shuffleMode = 'off'; // 'off' | 'true-random' | 'smart-flow'
    this.loopMode = 'off';    // 'off' | 'all' | 'one'

    const savedEq = StorageService.getEqSettings();
    this.eqBands = savedEq.bands || [0, 0, 0, 0, 0];
    this.activePreset = savedEq.preset || 'flat';

    this.listeners = {};
    this._bindAudioEvents();
  }

  initWebAudio() {
    if (this.audioCtx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new Ctx();

      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.82;

      this.eqNodes = EQ_BANDS.map((band, i) => {
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.value = band.freq;
        filter.Q.value = 1;
        filter.gain.value = this.eqBands[i] || 0;
        return filter;
      });

      let node = this.audioCtx.createMediaElementSource(this.audio);
      for (const filter of this.eqNodes) {
        node.connect(filter);
        node = filter;
      }
      node.connect(this.analyserNode);
      this.analyserNode.connect(this.audioCtx.destination);
    } catch (err) {
      console.warn('Web Audio API unavailable, EQ and visualizer disabled:', err);
    }
  }

  _resumeContext() {
    this.initWebAudio();
    // Not awaited: resume() can stay pending without a user gesture (e.g. media keys), which must not block playback
    if (this.audioCtx?.state === 'suspended') this.audioCtx.resume().catch(() => {});
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
      this._emit('timeupdate', {
        currentTime: this.audio.currentTime,
        duration: this.audio.duration || this.currentTrack?.duration || 0
      });
    });

    this.audio.addEventListener('ended', () => {
      if (this.loopMode === 'one') {
        this.audio.currentTime = 0;
        this.audio.play();
      } else {
        this.playNext(false);
      }
    });

    this.audio.addEventListener('error', () => {
      if (!this.audio.src) return;
      console.warn('Audio playback error on track:', this.currentTrack?.title);
      this._emit('error', { track: this.currentTrack });
    });
  }

  /** Make a track current without starting playback (e.g. restoring the last session). */
  load(track, queue = null) {
    this.currentTrack = track;
    if (queue) {
      this.originalQueue = [...queue];
      this.queue = [...queue];
      this.queueIndex = Math.max(0, this.queue.findIndex(t => t.id === track.id));
    }
    this.audio.src = track.audioUrl;
    this._emit('trackchange', { track });
    this._emit('queuechange', {});
  }

  /** Play a track; passing newQueue replaces the queue (re-applying the active shuffle mode). */
  async playTrack(track, newQueue = null) {
    this._resumeContext();

    this.currentTrack = track;
    if (newQueue) {
      this.originalQueue = [...newQueue];
      this.queue = [...newQueue];
      this.queueIndex = this.queue.findIndex(t => t.id === track.id);
      if (this.queueIndex === -1) {
        this.queue.unshift(track);
        this.queueIndex = 0;
      }
      if (this.shuffleMode === 'true-random') this._applyTrueRandomShuffle();
      else if (this.shuffleMode === 'smart-flow') this._applySmartFlowShuffle();
      this._emit('queuechange', {});
    }

    this.audio.src = track.audioUrl;
    this.audio.playbackRate = this.playbackRate;
    StorageService.recordPlay(track.id);
    this._emit('trackchange', { track });

    try {
      await this.audio.play();
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('Playback failed:', err);
    }
  }

  playFromQueue(index) {
    const track = this.queue[index];
    if (!track) return;
    this.queueIndex = index;
    this.playTrack(track);
    this._emit('queuechange', {});
  }

  async togglePlayPause() {
    if (!this.currentTrack || !this.audio.src) {
      const track = this.currentTrack || this.queue[0] || this.catalog[0];
      if (track) return this.playTrack(track, this.queue.length ? null : this.catalog);
      return;
    }
    this._resumeContext();
    if (this.audio.paused) {
      try { await this.audio.play(); } catch (e) { console.warn('Failed to resume:', e); }
    } else {
      this.audio.pause();
    }
  }

  playNext(manual = true) {
    if (this.queue.length === 0) return;

    // Smart Flow keeps the session going by appending recommendations at the end of the queue
    if (this.shuffleMode === 'smart-flow' && this.queueIndex >= this.queue.length - 1) {
      const recs = RecommendationEngine.getRecommendationsForTrack(
        this.currentTrack, this.catalog, StorageService.getDiscoveryDial(), 3
      );
      for (const { track } of recs) {
        if (!this.queue.some(t => t.id === track.id)) this.queue.push(track);
      }
    }

    let next = this.queueIndex + 1;
    if (next >= this.queue.length) {
      if (this.loopMode !== 'all' && !manual) {
        this.audio.pause();
        this.audio.currentTime = 0;
        return;
      }
      next = 0;
    }
    this.playFromQueue(next);
  }

  playPrev() {
    if (this.audio.currentTime > 3 || this.queue.length === 0) {
      this.audio.currentTime = 0;
      return;
    }
    this.playFromQueue(this.queueIndex > 0 ? this.queueIndex - 1 : this.queue.length - 1);
  }

  seekTo(seconds) {
    if (!Number.isFinite(seconds)) return;
    const max = this.audio.duration || this.currentTrack?.duration || 0;
    this.audio.currentTime = Math.max(0, Math.min(seconds, max));
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    this.audio.volume = this.volume;
    if (this.volume > 0 && this.isMuted) this.toggleMute();
    StorageService.saveVolume(this.volume);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.audio.muted = this.isMuted;
    return this.isMuted;
  }

  setPlaybackSpeed(speed) {
    this.playbackRate = speed;
    this.audio.playbackRate = speed;
  }

  /** off -> true-random -> smart-flow -> off */
  cycleShuffleMode() {
    const order = ['off', 'true-random', 'smart-flow'];
    return this.setShuffleMode(order[(order.indexOf(this.shuffleMode) + 1) % order.length]);
  }

  setShuffleMode(mode) {
    this.shuffleMode = mode;
    if (mode === 'true-random') this._applyTrueRandomShuffle();
    else if (mode === 'smart-flow') this._applySmartFlowShuffle();
    else this._restoreOriginalQueue();
    this._emit('modechange', { shuffleMode: this.shuffleMode, loopMode: this.loopMode });
    this._emit('queuechange', {});
    return this.shuffleMode;
  }

  /** Fisher-Yates: every ordering equally likely, each track plays once per cycle. */
  _applyTrueRandomShuffle() {
    if (this.queue.length <= 1) return;
    const current = this.currentTrack;
    const others = this.queue.filter(t => t.id !== current?.id);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    this.queue = current ? [current, ...others] : others;
    this.queueIndex = 0;
  }

  /** Greedy nearest-neighbour ordering by BPM and energy for smooth transitions. */
  _applySmartFlowShuffle() {
    if (this.queue.length <= 1) return;
    const current = this.currentTrack || this.queue[0];
    const pool = this.queue.filter(t => t.id !== current.id);
    const sorted = [current];
    let pivot = current;
    while (pool.length > 0) {
      let bestIdx = 0;
      let minDiff = Infinity;
      pool.forEach((t, i) => {
        const diff = Math.abs(t.bpm - pivot.bpm) + Math.abs(t.vector.energy - pivot.vector.energy) * 50;
        if (diff < minDiff) { minDiff = diff; bestIdx = i; }
      });
      pivot = pool.splice(bestIdx, 1)[0];
      sorted.push(pivot);
    }
    this.queue = sorted;
    this.queueIndex = 0;
  }

  _restoreOriginalQueue() {
    if (this.originalQueue.length === 0) return;
    this.queue = [...this.originalQueue];
    if (this.currentTrack) {
      this.queueIndex = Math.max(0, this.queue.findIndex(t => t.id === this.currentTrack.id));
    }
  }

  /** off -> all -> one -> off */
  cycleLoopMode() {
    const order = ['off', 'all', 'one'];
    this.loopMode = order[(order.indexOf(this.loopMode) + 1) % order.length];
    this._emit('modechange', { shuffleMode: this.shuffleMode, loopMode: this.loopMode });
    return this.loopMode;
  }

  addToQueue(track, playNext = false) {
    if (playNext && this.queueIndex >= 0) this.queue.splice(this.queueIndex + 1, 0, track);
    else this.queue.push(track);
    this._emit('queuechange', {});
  }

  insertIntoQueue(index, track) {
    this.queue.splice(index, 0, track);
    if (index <= this.queueIndex) this.queueIndex++;
    this._emit('queuechange', {});
  }

  removeFromQueue(index) {
    if (index === this.queueIndex) return;
    this.queue.splice(index, 1);
    if (index < this.queueIndex) this.queueIndex--;
    this._emit('queuechange', {});
  }

  reorderQueue(fromIdx, toIdx) {
    if (fromIdx < 0 || fromIdx >= this.queue.length || toIdx < 0 || toIdx >= this.queue.length) return;
    const [moved] = this.queue.splice(fromIdx, 1);
    this.queue.splice(toIdx, 0, moved);
    if (this.currentTrack) this.queueIndex = this.queue.findIndex(t => t.id === this.currentTrack.id);
    this._emit('queuechange', {});
  }

  /** Drop everything after the current track. */
  clearUpcoming() {
    this.queue = this.queue.slice(0, this.queueIndex + 1);
    this._emit('queuechange', {});
  }

  setQueue(queue, queueIndex) {
    this.queue = queue;
    this.queueIndex = queueIndex;
    this._emit('queuechange', {});
  }

  setEqBand(bandIndex, gainDb) {
    this.initWebAudio();
    this.eqBands[bandIndex] = gainDb;
    if (this.eqNodes[bandIndex]) this.eqNodes[bandIndex].gain.value = gainDb;
    this.activePreset = 'custom';
    this._saveEq();
  }

  setEqPreset(presetKey) {
    const preset = EQ_PRESETS[presetKey];
    if (!preset) return;
    this.initWebAudio();
    this.activePreset = presetKey;
    this.eqBands = [...preset.bands];
    this.eqNodes.forEach((node, i) => { node.gain.value = this.eqBands[i]; });
    this._saveEq();
  }

  _saveEq() {
    StorageService.saveEqSettings({ preset: this.activePreset, bands: this.eqBands });
  }

  getFrequencyData(array) {
    if (this.analyserNode) this.analyserNode.getByteFrequencyData(array);
    else array.fill(0);
  }

  getTimeDomainData(array) {
    if (this.analyserNode) this.analyserNode.getByteTimeDomainData(array);
    else array.fill(128);
  }

  on(event, callback) {
    (this.listeners[event] ||= []).push(callback);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(fn => fn(data));
  }
}
