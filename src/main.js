/**
 * AuraStream application controller.
 * Layout: top bar | library sidebar | main view | detail panel, with a persistent player bar.
 * All clicks go through one delegated handler keyed on data-nav / data-action / data-panel / data-filter.
 */

import './index.css';
import { CATALOG, ARTIST_DATA } from './data/catalog.js';
import { DEFAULT_PLAYLISTS } from './data/playlists.js';
import { StorageService } from './services/storageService.js';
import { RecommendationEngine } from './services/recommendationEngine.js';
import { AudioService, EQ_PRESETS, EQ_BANDS } from './services/audioService.js';
import { AudioVisualizer } from './components/visualizer.js';
import { icon, hydrateIcons } from './icons.js';

const TRACKS = new Map(CATALOG.map(t => [t.id, t]));
const ARTISTS = Object.keys(ARTIST_DATA);
const LIKED_COLOR = '#5038a0';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function formatTotal(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h} hr ${m} min` : `${m} min`;
}

const tracksFor = ids => ids.map(id => TRACKS.get(id)).filter(Boolean);
const artistTracks = name => CATALOG.filter(t => t.artist === name);
const dialMode = v => (v <= 30 ? 'Comfort' : v <= 70 ? 'Blend' : 'Explore');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

class AuraStreamApp {
  constructor() {
    this.player = new AudioService(CATALOG);
    this.view = null;
    this.history = [];
    this.future = [];
    this.searchQuery = '';
    this.panelTab = window.innerWidth >= 1280 ? 'nowplaying' : null;
    this.libraryFilter = 'all';
    this.contextId = null;  // where the current queue came from, e.g. 'playlist:playlist-chill'
    this.lists = {};        // contextId -> tracks rendered in the current view (row clicks resolve here)
    this.dial = StorageService.getDiscoveryDial();
    this.theaterOpen = false;
    this.menuItems = [];
    this.menuAnchor = null;
    this.pendingTrackIds = [];

    this.stage = document.getElementById('stage-content');
    this.main = document.getElementById('main-content');
    this.rightPanel = document.getElementById('right-panel');
    this.drawer = document.getElementById('right-drawer');
    this.sidebarList = document.getElementById('sidebar-library-list');
    this.theater = document.getElementById('fullscreen-theater');
    this.omnibox = document.getElementById('omnibox-search');
    this.menu = document.getElementById('context-menu');

    hydrateIcons();

    const canvas = document.getElementById('mini-visualizer');
    this.visualizer = new AudioVisualizer(canvas, this.player);
    this.visualizer.start();
    canvas.addEventListener('click', () => {
      const mode = this.visualizer.cycleMode();
      this.toast(`Visualizer: ${{ bars: 'Spectrum', waveform: 'Waveform', nebula: 'Pulse' }[mode]}`);
    });

    this.actions = this._createActions();
    this._bindPlayer();
    this._bindControls();
    this._bindGlobal();
    this._bindMediaSession();
    this._updateDialUI();
    this._updateModeButtons();
    this._updateVolumeUI();

    // Restore the last played song (paused) so the player bar is never empty
    const last = TRACKS.get(StorageService.getHistory()[0]?.trackId) || CATALOG[0];
    this.player.load(last, CATALOG);

    this.navigate('home');
    this._renderPanel();
  }

  /* ── Data helpers ─────────────────────────────────────────────────────── */

  _allPlaylists() {
    return [...StorageService.getCustomPlaylists(), ...DEFAULT_PLAYLISTS];
  }

  _getPlaylist(id) {
    return this._allPlaylists().find(p => p.id === id);
  }

  _likedTracks() {
    return tracksFor([...StorageService.getLikedTrackIds()].reverse());
  }

  _likedPlaylist() {
    const trackIds = [...StorageService.getLikedTrackIds()];
    return { id: 'liked', title: 'Liked Songs', trackIds, color: LIKED_COLOR };
  }

  _contextTracks(ctx) {
    if (this.lists[ctx]) return this.lists[ctx];
    if (ctx === 'liked') return this._likedTracks();
    if (ctx.startsWith('playlist:')) return tracksFor(this._getPlaylist(ctx.slice(9))?.trackIds || []);
    if (ctx.startsWith('artist:')) return artistTracks(ctx.slice(7));
    return [];
  }

  /* ── Playback entry points ────────────────────────────────────────────── */

  playList(tracks, index, contextId) {
    if (!tracks[index]) return;
    this.contextId = contextId;
    this.player.playTrack(tracks[index], tracks);
  }

  toggleContext(ctx) {
    if (this.contextId === ctx && this.player.currentTrack) return this.player.togglePlayPause();
    const tracks = this._contextTracks(ctx);
    if (!tracks.length) return this.toast('Nothing to play here yet');
    const start = this.player.shuffleMode === 'true-random' ? Math.floor(Math.random() * tracks.length) : 0;
    this.playList(tracks, start, ctx);
  }

  /* ── Delegated actions ────────────────────────────────────────────────── */

  _createActions() {
    const p = this.player;
    return {
      'play-row': el => {
        const tracks = this.lists[el.dataset.list] || [];
        const track = tracks[Number(el.dataset.index)];
        // Clicking the song that is already playing from this list pauses/resumes instead of restarting
        if (track && track.id === p.currentTrack?.id && this.contextId === el.dataset.list) return p.togglePlayPause();
        this.playList(tracks, Number(el.dataset.index), el.dataset.list);
      },
      'play-context': el => this.toggleContext(el.dataset.context),
      'like': el => this.toggleLike(el.dataset.trackId),
      'more': el => this.openTrackMenu(el, el.dataset.trackId, el.dataset.playlistId),
      'playlist-more': el => this.openPlaylistMenu(el, el.dataset.id),
      'menu-item': el => {
        const item = this.menuItems[Number(el.dataset.index)];
        this._closeMenu();
        item?.run();
      },
      'explain': el => this.openExplain(el.dataset.trackId, el.dataset.seedId),
      'follow': el => this.toggleFollow(el.dataset.artist),
      'create-playlist': () => this.openCreatePlaylist(),
      'browse': el => this.setSearch(el.dataset.query),
      'seek-lyric': el => p.seekTo(Number(el.dataset.time)),
      'toggle-play': () => p.togglePlayPause(),
      'next': () => p.playNext(),
      'prev': () => p.playPrev(),
      'close-theater': () => this.closeTheater(),
      'queue-play': el => p.playFromQueue(Number(el.dataset.index)),
      'queue-up': el => p.reorderQueue(Number(el.dataset.index), Number(el.dataset.index) - 1),
      'queue-down': el => p.reorderQueue(Number(el.dataset.index), Number(el.dataset.index) + 1),
      'queue-remove': el => {
        const i = Number(el.dataset.index);
        const track = p.queue[i];
        p.removeFromQueue(i);
        this.toast(`Removed "${track.title}" from queue`, { undo: () => p.insertIntoQueue(i, track) });
      },
      'clear-queue': () => {
        const saved = [...p.queue];
        const savedIdx = p.queueIndex;
        p.clearUpcoming();
        this.toast('Queue cleared', { undo: () => p.setQueue(saved, savedIdx) });
      },
      'save-queue': () => {
        const date = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const pl = StorageService.createPlaylist(`Queue · ${date}`, 'Saved from your queue', p.queue.map(t => t.id));
        this._renderSidebar();
        this.toast(`Saved queue as "${pl.title}"`);
      },
      'eq-preset': el => {
        p.setEqPreset(el.dataset.preset);
        this._renderPanel();
      },
      'speed': el => {
        p.setPlaybackSpeed(Number(el.dataset.speed));
        this._renderPanel();
      }
    };
  }

  _onClick(e) {
    if (!this.menu.hidden && !e.target.closest('#context-menu')) {
      this._lastMenuAnchor = this.menuAnchor;
      this._closeMenu();
    } else {
      this._lastMenuAnchor = null;
    }

    // closest() with a combined selector returns the innermost interactive element,
    // so a like button inside a clickable row wins over the row itself.
    const el = e.target.closest('[data-nav],[data-action],[data-panel],[data-filter]');
    if (!el) return;
    if (el.dataset.nav) return this.navigate(el.dataset.nav, el.dataset.id ?? null);
    if (el.dataset.panel) {
      return el.classList.contains('panel-tab') ? this.showPanel(el.dataset.panel) : this.togglePanel(el.dataset.panel);
    }
    if (el.dataset.filter) {
      this.libraryFilter = el.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(c => c.classList.toggle('active', c.dataset.filter === this.libraryFilter));
      this._renderSidebar();
      if (this.view?.name === 'library') this.renderView();
      return;
    }
    if (el === this._lastMenuAnchor) return; // second click on the same ••• closes its menu
    this.actions[el.dataset.action]?.(el, e);
  }

  /* ── Player wiring ────────────────────────────────────────────────────── */

  _bindPlayer() {
    const p = this.player;

    p.on('trackchange', ({ track }) => {
      this._updatePlayerBar();
      document.documentElement.style.setProperty('--aura', track.color || '#535353');
      this._refreshPlayingState();
      if (this.panelTab) this._renderPanel();
      if (this.theaterOpen) this._renderTheater();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album || '',
          artwork: [{ src: new URL(track.coverUrl, location.href).href, sizes: '512x512', type: 'image/jpeg' }]
        });
      }
    });

    p.on('playstate', ({ isPlaying }) => {
      const btn = document.getElementById('btn-play-pause');
      btn.innerHTML = icon(isPlaying ? 'pause' : 'play', 18);
      btn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
      const t = p.currentTrack;
      document.title = isPlaying && t ? `${t.title} • ${t.artist}` : 'AuraStream';
      const theaterBtn = this.theater.querySelector('[data-action="toggle-play"]');
      if (theaterBtn) {
        theaterBtn.innerHTML = icon(isPlaying ? 'pause' : 'play', 24);
        theaterBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
      }
      this._refreshPlayingState();
    });

    p.on('timeupdate', ({ currentTime, duration }) => {
      this._updateProgress(currentTime, duration);
      if (this.panelTab === 'lyrics') this._syncLyrics(this.drawer, currentTime);
      if (this.theaterOpen) this._syncLyrics(this.theater.querySelector('.theater-lyrics'), currentTime);
    });

    p.on('queuechange', () => {
      if (this.panelTab === 'queue' || this.panelTab === 'nowplaying') this._renderPanel();
    });

    p.on('modechange', () => this._updateModeButtons());

    p.on('error', ({ track }) => {
      this.toast(`Couldn't play "${track?.title}". Skipping.`);
      setTimeout(() => p.playNext(false), 1200);
    });
  }

  _bindControls() {
    const p = this.player;
    const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);

    on('btn-play-pause', () => p.togglePlayPause());
    on('btn-prev', () => p.playPrev());
    on('btn-next', () => p.playNext());
    on('btn-theater', () => this.openTheater());
    on('player-thumb-wrap', () => this.togglePanel('nowplaying'));
    on('btn-nav-back', () => this.back());
    on('btn-nav-forward', () => this.forward());
    on('btn-right-panel-close', () => this.togglePanel(null));
    on('player-track-artist', e => this.navigate('artist', e.currentTarget.dataset.artist));

    on('btn-shuffle', () => {
      const mode = p.cycleShuffleMode();
      this.toast({
        'true-random': 'Shuffle on: true random',
        'smart-flow': 'Smart Flow on: songs ordered by tempo and energy',
        off: 'Shuffle off'
      }[mode]);
    });

    on('btn-repeat', () => {
      const mode = p.cycleLoopMode();
      this.toast({ all: 'Repeat all', one: 'Repeat one', off: 'Repeat off' }[mode]);
    });

    on('btn-mute', () => {
      p.toggleMute();
      this._updateVolumeUI();
    });

    const vol = document.getElementById('volume-slider');
    vol.addEventListener('input', () => {
      p.setVolume(Number(vol.value) / 100);
      this._updateVolumeUI();
    });

    this._bindSeekRange(document.getElementById('scrub-range'), document.getElementById('scrub-current'));

    const dial = document.getElementById('discovery-dial-slider');
    dial.addEventListener('input', () => this.setDial(Number(dial.value)));
  }

  /** Native range input for seeking: preview while dragging, seek on release. */
  _bindSeekRange(range, label) {
    range.addEventListener('input', () => {
      range.dataset.seeking = '1';
      const dur = this._duration();
      range.style.setProperty('--progress', `${range.value / 10}%`);
      if (label) label.textContent = formatTime((range.value / 1000) * dur);
    });
    range.addEventListener('change', () => {
      this.player.seekTo((range.value / 1000) * this._duration());
      delete range.dataset.seeking;
    });
  }

  _duration() {
    return this.player.audio.duration || this.player.currentTrack?.duration || 0;
  }

  _bindGlobal() {
    document.addEventListener('click', e => this._onClick(e));

    // Hide broken artwork instead of showing the browser's broken-image glyph
    document.addEventListener('error', e => {
      if (e.target.tagName === 'IMG') e.target.classList.add('img-broken');
    }, true);

    this.omnibox.addEventListener('input', () => {
      this.searchQuery = this.omnibox.value;
      if (this.view?.name === 'search') this.renderView();
      else this.navigate('search');
    });

    this.main.addEventListener('scroll', () => {
      // Show the compact title bar once the big play button has scrolled out of view
      const actions = this.stage.querySelector('.view-actions');
      this.stage.querySelector('.sticky-bar')?.classList.toggle('show', !!actions && this.main.scrollTop > actions.offsetTop);
      if (!this.menu.hidden) this._closeMenu();
    }, { passive: true });

    window.addEventListener('resize', () => this._closeMenu());

    document.addEventListener('keydown', e => this._onKeydown(e));

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && this.theaterOpen) this.closeTheater();
    });

    // Modals: overlay click and [data-close-modal] buttons close
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay || e.target.closest('[data-close-modal]')) overlay.classList.remove('open');
      });
    });

    document.getElementById('create-playlist-form').addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('playlist-name-input');
      const desc = document.getElementById('playlist-desc-input');
      const pl = StorageService.createPlaylist(name.value, desc.value, this.pendingTrackIds);
      e.target.reset();
      document.getElementById('create-playlist-modal').classList.remove('open');
      this._renderSidebar();
      this.toast(this.pendingTrackIds.length ? `Added to "${pl.title}"` : `Created "${pl.title}"`);
      this.navigate('playlist', pl.id);
    });

    document.getElementById('explain-play-btn').addEventListener('click', () => {
      document.getElementById('explain-rec-modal').classList.remove('open');
      const track = TRACKS.get(this.explainTrackId);
      if (!track) return;
      const [ctx, list] = Object.entries(this.lists).find(([, ts]) => ts.includes(track)) || [`track:${track.id}`, [track]];
      this.playList(list, list.indexOf(track), ctx);
    });

    // EQ sliders live in the re-rendered panel, so listen on the stable container
    this.drawer.addEventListener('input', e => {
      if (!e.target.matches('.eq-range')) return;
      const band = Number(e.target.dataset.band);
      const val = Number(e.target.value);
      this.player.setEqBand(band, val);
      e.target.closest('.eq-band').querySelector('.eq-val').textContent = `${val > 0 ? '+' : ''}${val} dB`;
      this.drawer.querySelectorAll('[data-action="eq-preset"]').forEach(c => c.classList.remove('active'));
    });
  }

  _onKeydown(e) {
    const t = e.target;
    if (e.key === 'Escape') {
      if (!this.menu.hidden) return this._closeMenu();
      const modal = document.querySelector('.modal-overlay.open');
      if (modal) return modal.classList.remove('open');
      if (this.theaterOpen) return this.closeTheater();
      if (t === this.omnibox) this.omnibox.blur();
      return;
    }
    if (t.matches('input[type="text"], input[type="search"], textarea') || t.isContentEditable) return;

    if ((e.key === 'Enter' || e.key === ' ') && t.matches('[tabindex][data-action]')) {
      e.preventDefault();
      t.click();
      return;
    }
    if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      this.omnibox.focus();
      return;
    }
    // Space toggles playback unless a button has focus (Space activates the focused button instead)
    if (e.key === ' ' && !t.matches('button, a')) {
      e.preventDefault();
      this.player.togglePlayPause();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') { e.preventDefault(); this.player.playNext(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft')  { e.preventDefault(); this.player.playPrev(); }
  }

  _bindMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const p = this.player;
    const handlers = {
      play: () => p.togglePlayPause(),
      pause: () => p.togglePlayPause(),
      nexttrack: () => p.playNext(),
      previoustrack: () => p.playPrev(),
      seekto: d => p.seekTo(d.seekTime)
    };
    for (const [action, fn] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action, fn); } catch { /* unsupported action */ }
    }
  }

  /* ── Player bar ───────────────────────────────────────────────────────── */

  _updatePlayerBar() {
    const t = this.player.currentTrack;
    if (!t) return;
    const thumb = document.getElementById('player-thumb');
    thumb.src = t.coverUrl;
    thumb.classList.remove('img-broken');
    document.getElementById('player-track-title').textContent = t.title;
    const artist = document.getElementById('player-track-artist');
    artist.textContent = t.artist;
    artist.dataset.artist = t.artist;

    const like = document.getElementById('player-like-btn');
    like.dataset.action = 'like';
    like.dataset.trackId = t.id;
    like.dataset.size = '18';
    this._paintLike(like, StorageService.getLikedTrackIds().has(t.id));

    this._updateProgress(0, t.duration);
  }

  _updateProgress(currentTime, duration) {
    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
    const ranges = [
      [document.getElementById('scrub-range'), document.getElementById('scrub-current'), document.getElementById('scrub-total')],
      [this.theater.querySelector('.progress-range'), this.theater.querySelector('.t-cur'), this.theater.querySelector('.t-total')]
    ];
    for (const [range, cur, total] of ranges) {
      if (!range || range.dataset.seeking) continue;
      range.value = Math.round(pct * 10);
      range.style.setProperty('--progress', `${pct}%`);
      cur.textContent = formatTime(currentTime);
      total.textContent = formatTime(duration);
    }
  }

  _updateModeButtons() {
    const { shuffleMode, loopMode } = this.player;
    const shuffle = document.getElementById('btn-shuffle');
    const shuffleLabel = { off: 'Shuffle: off', 'true-random': 'Shuffle: true random', 'smart-flow': 'Shuffle: Smart Flow' }[shuffleMode];
    shuffle.classList.toggle('active', shuffleMode !== 'off');
    shuffle.innerHTML = icon('shuffle', 18) + (shuffleMode === 'smart-flow' ? `<span class="ctrl-badge">${icon('sparkle', 9)}</span>` : '');
    shuffle.title = shuffleLabel;
    shuffle.setAttribute('aria-label', shuffleLabel);

    const repeat = document.getElementById('btn-repeat');
    const repeatLabel = { off: 'Repeat: off', all: 'Repeat: all', one: 'Repeat: one' }[loopMode];
    repeat.classList.toggle('active', loopMode !== 'off');
    repeat.innerHTML = icon('repeat', 18) + (loopMode === 'one' ? '<span class="ctrl-badge">1</span>' : '');
    repeat.title = repeatLabel;
    repeat.setAttribute('aria-label', repeatLabel);
  }

  _updateVolumeUI() {
    const { volume, isMuted } = this.player;
    const level = isMuted ? 0 : volume;
    const btn = document.getElementById('btn-mute');
    btn.innerHTML = icon(level === 0 ? 'volume-x' : level < 0.5 ? 'volume-low' : 'volume', 18);
    btn.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
    const range = document.getElementById('volume-slider');
    range.value = Math.round(level * 100);
    range.style.setProperty('--progress', `${level * 100}%`);
  }

  /** Sync every "is this playing" indicator in the DOM with the player. */
  _refreshPlayingState() {
    const curId = this.player.currentTrack?.id;
    const playing = this.player.isPlaying;

    document.querySelectorAll('.track-row').forEach(row => {
      const isCur = row.dataset.trackId === curId;
      row.classList.toggle('is-current', isCur);
      row.classList.toggle('is-playing', isCur && playing);
    });

    document.querySelectorAll('[data-action="play-context"]').forEach(btn => {
      const active = btn.dataset.context === this.contextId && playing;
      btn.innerHTML = icon(active ? 'pause' : 'play', Number(btn.dataset.size) || 22);
      btn.setAttribute('aria-label', active ? 'Pause' : 'Play');
      btn.classList.toggle('is-playing', active);
    });

    document.querySelectorAll('[data-context-id]').forEach(item => {
      const isCur = item.dataset.contextId === this.contextId;
      item.classList.toggle('is-current', isCur);
      item.classList.toggle('is-playing', isCur && playing);
    });
  }

  /* ── Likes, follows, playlists ────────────────────────────────────────── */

  _likeBtn(id, size = 16) {
    const liked = StorageService.getLikedTrackIds().has(id);
    return `<button class="icon-btn like-btn ${liked ? 'liked' : ''}" data-action="like" data-track-id="${id}" data-size="${size}"
      aria-pressed="${liked}" aria-label="${liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}">${icon(liked ? 'heart-fill' : 'heart', size)}</button>`;
  }

  _paintLike(btn, liked) {
    btn.classList.toggle('liked', liked);
    btn.innerHTML = icon(liked ? 'heart-fill' : 'heart', Number(btn.dataset.size) || 16);
    btn.setAttribute('aria-pressed', liked);
    btn.setAttribute('aria-label', liked ? 'Remove from Liked Songs' : 'Save to Liked Songs');
  }

  toggleLike(id) {
    const liked = StorageService.toggleLike(id);
    document.querySelectorAll(`[data-action="like"][data-track-id="${id}"]`).forEach(b => this._paintLike(b, liked));
    this.toast(liked ? 'Added to Liked Songs' : 'Removed from Liked Songs');
    this._renderSidebar();
    if (this.view?.name === 'liked') this.renderView();
  }

  toggleFollow(name) {
    const following = StorageService.toggleFollowArtist(name);
    document.querySelectorAll(`[data-action="follow"]`).forEach(b => {
      if (b.dataset.artist !== name) return;
      b.textContent = following ? 'Following' : 'Follow';
      b.classList.toggle('following', following);
    });
    this.toast(following ? `Following ${name}` : `Unfollowed ${name}`);
    this._renderSidebar();
  }

  _followBtn(name) {
    const following = StorageService.getFollowedArtists().has(name);
    return `<button class="btn btn-outline ${following ? 'following' : ''}" data-action="follow" data-artist="${esc(name)}">${following ? 'Following' : 'Follow'}</button>`;
  }

  openCreatePlaylist(trackIds = []) {
    this.pendingTrackIds = trackIds;
    document.getElementById('create-playlist-modal').classList.add('open');
    setTimeout(() => document.getElementById('playlist-name-input').focus(), 50);
  }

  addToPlaylist(playlistId, track) {
    const pl = this._getPlaylist(playlistId);
    const added = StorageService.addTrackToPlaylist(playlistId, track.id);
    this.toast(added ? `Added to "${pl.title}"` : `Already in "${pl.title}"`);
    this._renderSidebar();
    if (this.view?.name === 'playlist' && this.view.param === playlistId) this.renderView();
  }

  removeFromPlaylist(playlistId, trackId) {
    const before = StorageService.getCustomPlaylists();
    const pl = before.find(p => p.id === playlistId);
    StorageService.removeTrackFromPlaylist(playlistId, trackId);
    const refresh = () => {
      this._renderSidebar();
      if (this.view?.name === 'playlist' && this.view.param === playlistId) this.renderView();
    };
    refresh();
    this.toast(`Removed from "${pl.title}"`, { undo: () => { StorageService.saveCustomPlaylists(before); refresh(); } });
  }

  deletePlaylist(id) {
    const before = StorageService.getCustomPlaylists();
    const pl = before.find(p => p.id === id);
    StorageService.deletePlaylist(id);
    this._renderSidebar();
    if (this.view?.name === 'playlist' && this.view.param === id) this.navigate('home');
    this.toast(`Deleted "${pl.title}"`, {
      undo: () => {
        StorageService.saveCustomPlaylists(before);
        this._renderSidebar();
        if (this.view?.name === 'home') this.renderView();
      }
    });
  }

  /* ── Context menu ─────────────────────────────────────────────────────── */

  openTrackMenu(anchor, trackId, playlistId) {
    const t = TRACKS.get(trackId);
    if (!t) return;
    const liked = StorageService.getLikedTrackIds().has(t.id);
    const custom = StorageService.getCustomPlaylists();

    const playlistItems = [
      { label: 'New playlist', icon: 'plus', run: () => this.openCreatePlaylist([t.id]) },
      ...custom.map(pl => ({ label: pl.title, icon: 'music', run: () => this.addToPlaylist(pl.id, t) }))
    ];

    this._openMenu(anchor, [
      { label: 'Add to queue', icon: 'list-plus', run: () => { this.player.addToQueue(t); this.toast('Added to queue'); } },
      { label: 'Play next', icon: 'play-next', run: () => { this.player.addToQueue(t, true); this.toast(`"${t.title}" will play next`); } },
      { label: 'Add to playlist', icon: 'plus', submenu: true, run: () => this._openMenu(anchor, playlistItems, 'Add to playlist') },
      playlistId ? { label: 'Remove from this playlist', icon: 'trash', run: () => this.removeFromPlaylist(playlistId, t.id) } : null,
      { label: liked ? 'Remove from Liked Songs' : 'Save to Liked Songs', icon: liked ? 'heart-fill' : 'heart', run: () => this.toggleLike(t.id) },
      { divider: true },
      { label: 'Go to song radio', icon: 'compass', run: () => this.navigate('discover', t.id) },
      { label: 'Go to artist', icon: 'user', run: () => this.navigate('artist', t.artist) }
    ].filter(Boolean));
  }

  openPlaylistMenu(anchor, id) {
    this._openMenu(anchor, [
      { label: 'Add to queue', icon: 'list-plus', run: () => {
        this._contextTracks(`playlist:${id}`).forEach(t => this.player.addToQueue(t));
        this.toast('Added to queue');
      } },
      { divider: true },
      { label: 'Delete playlist', icon: 'trash', danger: true, run: () => this.deletePlaylist(id) }
    ]);
  }

  _openMenu(anchor, items, title = '') {
    this.menuItems = items;
    this.menuAnchor = anchor;
    this.menu.innerHTML = (title ? `<div class="menu-title">${esc(title)}</div>` : '') + items.map((it, i) => it.divider
      ? '<div class="menu-divider" role="separator"></div>'
      : `<button class="menu-item ${it.danger ? 'danger' : ''}" role="menuitem" data-action="menu-item" data-index="${i}">
          ${icon(it.icon, 16)}<span>${esc(it.label)}</span>${it.submenu ? icon('chevron-right', 16, 'menu-chevron') : ''}
        </button>`).join('');
    this.menu.hidden = false;

    const r = anchor.getBoundingClientRect();
    const m = this.menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - m.width, window.innerWidth - m.width - 8));
    let top = r.bottom + 4;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 4);
    this.menu.style.left = `${left}px`;
    this.menu.style.top = `${top}px`;
    this.menu.querySelector('.menu-item')?.focus({ preventScroll: true });
  }

  _closeMenu() {
    if (this.menu.hidden) return;
    this.menu.hidden = true;
    this.menuAnchor = null;
  }

  /* ── Explainable recommendations ──────────────────────────────────────── */

  openExplain(trackId, seedId = null) {
    const track = TRACKS.get(trackId);
    if (!track) return;
    this.explainTrackId = trackId;
    // Song radio explains against its seed; the personal mix picks each song via the closest liked song
    // (or the engine's default references when nothing is liked yet), so explain against that.
    const liked = this._likedTracks().filter(t => t.id !== track.id);
    const refs = liked.length ? liked : [CATALOG[0], CATALOG[2], CATALOG[5]].filter(t => t.id !== track.id);
    const sim = t => RecommendationEngine.calculateSimilarity(t, track, this.dial);
    const seed = TRACKS.get(seedId) || refs.reduce((best, t) => (sim(t) > sim(best) ? t : best));
    const because = seedId ? 'pairs with' : liked.length ? 'because you like' : 'similar to';

    const related = RecommendationEngine.GENRE_AFFINITIES[seed.genre]?.includes(track.genre);
    const genre = seed.genre === track.genre ? 1 : related ? 0.65 : 0.15;
    const bpmDiff = Math.abs(seed.bpm - track.bpm);
    const rows = [
      ['Genre', genre, seed.genre === track.genre ? `Both ${track.genre}` : related ? `${seed.genre} → ${track.genre} (related)` : `${seed.genre} → ${track.genre}`],
      ['Mood', seed.mood === track.mood ? 1 : 0.4, seed.mood === track.mood ? `Both ${track.mood}` : `${seed.mood} → ${track.mood}`],
      ['Tempo', Math.max(0, 1 - bpmDiff / 80), `${track.bpm} BPM (${bpmDiff === 0 ? 'same tempo' : `±${bpmDiff}`})`],
      ['Energy', 1 - Math.abs(seed.vector.energy - track.vector.energy), `${Math.round(track.vector.energy * 100)} vs ${Math.round(seed.vector.energy * 100)}`],
      ['Positivity', 1 - Math.abs(seed.vector.valence - track.vector.valence), `${Math.round(track.vector.valence * 100)} vs ${Math.round(seed.vector.valence * 100)}`]
    ];

    document.getElementById('explain-body').innerHTML = `
      <div class="explain-pair">
        <div class="explain-track"><img src="${track.coverUrl}" alt=""><div><div class="explain-name">${esc(track.title)}</div><div class="muted">${esc(track.artist)}</div></div></div>
        <div class="explain-because">${because}</div>
        <div class="explain-track"><img src="${seed.coverUrl}" alt=""><div><div class="explain-name">${esc(seed.title)}</div><div class="muted">${esc(seed.artist)}</div></div></div>
      </div>
      <p class="explain-reason">${esc(RecommendationEngine.generateReason(seed, track, this.dial))}</p>
      <div class="explain-rows">
        ${rows.map(([label, score, detail]) => `
          <div class="explain-row">
            <span class="explain-label">${label}</span>
            <div class="meter"><div class="meter-fill" style="width:${Math.round(score * 100)}%"></div></div>
            <span class="explain-detail">${esc(detail)}</span>
          </div>`).join('')}
      </div>
      <p class="muted small">Discovery Dial at ${this.dial}% (${dialMode(this.dial)}): ${this.dial > 60 ? 'genre counts less, mood and energy count more.' : 'genre and tempo matter most.'}</p>`;
    document.getElementById('explain-rec-modal').classList.add('open');
  }

  /* ── Discovery dial ───────────────────────────────────────────────────── */

  setDial(value, rerender = true) {
    this.dial = value;
    StorageService.saveDiscoveryDial(value);
    this._updateDialUI();
    if (rerender && (this.view?.name === 'home' || this.view?.name === 'discover')) this.renderView();
  }

  _updateDialUI() {
    document.querySelectorAll('.dial-range').forEach(r => {
      r.value = this.dial;
      r.style.setProperty('--progress', `${this.dial}%`);
    });
    document.querySelectorAll('.dial-value').forEach(l => { l.textContent = dialMode(this.dial); });
  }

  /* ── Navigation ───────────────────────────────────────────────────────── */

  navigate(name, param = null) {
    if (this.theaterOpen) this.closeTheater();
    if (this.view && this.view.name === name && this.view.param === param) {
      this.main.scrollTo({ top: 0, behavior: 'smooth' });
      if (name === 'search') this.omnibox.focus();
      return;
    }
    if (this.view) this.history.push(this.view);
    if (this.history.length > 50) this.history.shift();
    this.future = [];
    this._show({ name, param });
  }

  back() {
    if (!this.history.length) return;
    this.future.push(this.view);
    this._show(this.history.pop());
  }

  forward() {
    if (!this.future.length) return;
    this.history.push(this.view);
    this._show(this.future.pop());
  }

  _show(view) {
    this.view = view;
    this.main.scrollTop = 0;
    this.renderView();
    this._renderSidebar();
    document.getElementById('btn-nav-back').disabled = !this.history.length;
    document.getElementById('btn-nav-forward').disabled = !this.future.length;
    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === view.name));
    if (view.name === 'search') {
      this.omnibox.value = this.searchQuery;
      this.omnibox.focus({ preventScroll: true });
    }
  }

  renderView() {
    this.lists = {};
    const { name, param } = this.view;
    const render = {
      home: () => this.renderHome(),
      playlist: () => this.renderPlaylist(param),
      liked: () => this.renderLiked(),
      artist: () => this.renderArtist(param),
      search: () => this.renderSearch(),
      discover: () => this.renderDiscover(param),
      library: () => this.renderLibrary()
    }[name] || (() => this.renderHome());
    render();
    this._refreshPlayingState();
  }

  /* ── Shared view markup ───────────────────────────────────────────────── */

  _cover(pl, cls) {
    if (pl.id === 'liked') return `<div class="${cls} cover-liked">${icon('heart-fill', 24)}</div>`;
    if (pl.coverUrl && !pl.id.startsWith('custom-')) return `<img class="${cls}" src="${pl.coverUrl}" alt="" loading="lazy">`;
    const arts = [...new Set(tracksFor(pl.trackIds).map(t => t.coverUrl))].slice(0, 4);
    if (arts.length === 4) return `<div class="${cls} cover-mosaic">${arts.map(a => `<img src="${a}" alt="" loading="lazy">`).join('')}</div>`;
    if (arts.length) return `<img class="${cls}" src="${arts[0]}" alt="" loading="lazy">`;
    return `<div class="${cls} cover-empty">${icon('music', 24)}</div>`;
  }

  _playFab(ctx, size = 22, cls = '') {
    return `<button class="play-fab ${cls}" data-action="play-context" data-context="${esc(ctx)}" data-size="${size}" aria-label="Play">${icon('play', size)}</button>`;
  }

  _header({ color, art, type, title, desc = '', meta = '', round = false }) {
    return `
      <div class="view-bg" style="--header-color:${color}"></div>
      <header class="view-header">
        <div class="header-art ${round ? 'round' : ''}">${art}</div>
        <div class="header-info">
          <span class="header-type">${type}</span>
          <h1 class="header-title ${title.length > 24 ? 'long' : title.length > 12 ? 'medium' : ''}">${esc(title)}</h1>
          ${desc ? `<p class="header-desc">${esc(desc)}</p>` : ''}
          <div class="header-meta">${meta}</div>
        </div>
      </header>`;
  }

  _stickyBar(title, ctx, color) {
    return `<div class="sticky-bar" style="--header-color:${color}">${this._playFab(ctx, 18, 'sm')}<span class="sticky-title">${esc(title)}</span></div>`;
  }

  /**
   * Song table. `contextId` keys the list for row clicks; `secondary` overrides the album column.
   */
  _trackTable(tracks, contextId, { playlistId = null, secondary = null, showArt = true } = {}) {
    this.lists[contextId] = tracks;
    return `
      <div class="track-table">
        <div class="track-head">
          <span class="tr-num">#</span><span>Title</span><span class="tr-album">${secondary ? 'Why it fits' : 'Album'}</span>
          <span class="tr-end">${icon('clock', 16)}</span>
        </div>
        ${tracks.map((t, i) => `
          <div class="track-row" tabindex="0" data-action="play-row" data-list="${esc(contextId)}" data-index="${i}" data-track-id="${t.id}">
            <div class="tr-num">
              <span class="tr-index">${i + 1}</span>
              <span class="tr-play">${icon('play', 14)}</span>
              <span class="tr-pause">${icon('pause', 14)}</span>
              <span class="tr-bars" aria-hidden="true"><i></i><i></i><i></i></span>
            </div>
            <div class="tr-main">
              ${showArt ? `<img class="tr-art" src="${t.coverUrl}" alt="" loading="lazy">` : ''}
              <div class="tr-text">
                <div class="tr-title">${esc(t.title)}</div>
                <button class="tr-artist link" data-nav="artist" data-id="${esc(t.artist)}">${esc(t.artist)}</button>
              </div>
            </div>
            <div class="tr-album">${secondary ? secondary(t) : esc(t.album || t.genre)}</div>
            <div class="tr-end">
              ${this._likeBtn(t.id)}
              <span class="tr-time">${formatTime(t.duration)}</span>
              <button class="icon-btn tr-more" data-action="more" data-track-id="${t.id}" ${playlistId ? `data-playlist-id="${playlistId}"` : ''} aria-label="More options for ${esc(t.title)}">${icon('more', 16)}</button>
            </div>
          </div>`).join('')}
      </div>`;
  }

  _section(title, body, { sub = '', more = null, cls = '' } = {}) {
    return `
      <section class="section">
        <div class="section-head">
          <div><h2 class="section-title">${title}</h2>${sub ? `<p class="section-sub">${sub}</p>` : ''}</div>
          ${more ? `<button class="link section-more" data-nav="${more}">Show all</button>` : ''}
        </div>
        <div class="shelf ${cls}">${body}</div>
      </section>`;
  }

  _playlistCard(pl) {
    const isLiked = pl.id === 'liked';
    const ctx = isLiked ? 'liked' : `playlist:${pl.id}`;
    const sub = isLiked ? plural(pl.trackIds.length, 'song') : (pl.description || `By ${pl.id.startsWith('custom-') ? 'you' : 'AuraStream'}`);
    return `
      <div class="card" data-nav="${isLiked ? 'liked' : 'playlist'}" ${isLiked ? '' : `data-id="${pl.id}"`}>
        <div class="card-art">${this._cover(pl, 'card-img')}${this._playFab(ctx, 22, 'card-fab')}</div>
        <div class="card-title">${esc(pl.title)}</div>
        <div class="card-sub">${esc(sub)}</div>
      </div>`;
  }

  _trackCard(t, listId, index, reason = '') {
    return `
      <div class="card" data-action="play-row" tabindex="0" data-list="${esc(listId)}" data-index="${index}">
        <div class="card-art"><img class="card-img" src="${t.coverUrl}" alt="" loading="lazy">
          <button class="play-fab card-fab" data-action="play-row" data-list="${esc(listId)}" data-index="${index}" aria-label="Play ${esc(t.title)}">${icon('play', 22)}</button>
        </div>
        <div class="card-title">${esc(t.title)}</div>
        <div class="card-sub">${esc(t.artist)}</div>
        ${reason ? `<button class="reason-chip" data-action="explain" data-track-id="${t.id}" title="Why this recommendation?">${icon('sparkle', 12)}<span>${esc(reason)}</span></button>` : ''}
      </div>`;
  }

  _artistCard(name) {
    const info = ARTIST_DATA[name];
    return `
      <div class="card" data-nav="artist" data-id="${esc(name)}">
        <div class="card-art round"><img class="card-img" src="${info.photo}" alt="" loading="lazy">${this._playFab(`artist:${name}`, 22, 'card-fab')}</div>
        <div class="card-title">${esc(name)}</div>
        <div class="card-sub">Artist</div>
      </div>`;
  }

  _empty(iconName, title, text, action = '') {
    return `<div class="empty">${icon(iconName, 40)}<h3>${title}</h3><p>${text}</p>${action}</div>`;
  }

  /* ── Views ────────────────────────────────────────────────────────────── */

  renderHome() {
    const liked = this._likedPlaylist();
    const playlists = this._allPlaylists();
    const likedIds = StorageService.getLikedTrackIds();
    const history = StorageService.getHistory();
    const mix = RecommendationEngine.getPersonalizedMix(CATALOG, likedIds, history, this.dial, 10);
    this.lists['made-for-you'] = mix.map(m => m.track);
    const recent = tracksFor(history.map(h => h.trackId)).slice(0, 10);
    this.lists.recent = recent;

    const quick = [liked, ...playlists].slice(0, 6).map(pl => {
      const isLiked = pl.id === 'liked';
      return `
        <div class="quick-tile" data-nav="${isLiked ? 'liked' : 'playlist'}" ${isLiked ? '' : `data-id="${pl.id}"`} data-context-id="${isLiked ? 'liked' : `playlist:${pl.id}`}">
          ${this._cover(pl, 'quick-img')}
          <span class="quick-title">${esc(pl.title)}</span>
          ${this._playFab(isLiked ? 'liked' : `playlist:${pl.id}`, 18, 'sm quick-fab')}
        </div>`;
    }).join('');

    this.stage.innerHTML = `
      <div class="view view-home">
        <div class="view-bg" style="--header-color:var(--aura)"></div>
        <h1 class="greeting">${greeting()}</h1>
        <div class="quick-grid">${quick}</div>
        ${this._section('Made for you', mix.map((m, i) => this._trackCard(m.track, 'made-for-you', i, m.reason)).join(''),
          { sub: `Based on your liked songs · Discovery Dial: ${dialMode(this.dial)}`, more: 'discover' })}
        ${recent.length ? this._section('Recently played', recent.map((t, i) => this._trackCard(t, 'recent', i)).join('')) : ''}
        ${this._section('Playlists', [liked, ...playlists].map(pl => this._playlistCard(pl)).join(''), { more: 'library' })}
        ${this._section('Artists', ARTISTS.map(a => this._artistCard(a)).join(''))}
        <footer class="view-footer">Music by independent artists under Creative Commons licenses. Credits in each song's details.</footer>
      </div>`;
  }

  renderPlaylist(id) {
    const pl = this._getPlaylist(id);
    if (!pl) {
      this.stage.innerHTML = `<div class="view">${this._empty('music', "Couldn't find that playlist", 'It may have been deleted.', '<button class="btn btn-primary" data-nav="home">Go home</button>')}</div>`;
      return;
    }
    const tracks = tracksFor(pl.trackIds);
    const custom = id.startsWith('custom-');
    const total = tracks.reduce((s, t) => s + t.duration, 0);
    const ctx = `playlist:${id}`;

    this.stage.innerHTML = `
      <div class="view">
        ${this._stickyBar(pl.title, ctx, pl.color)}
        ${this._header({
          color: pl.color, art: this._cover(pl, 'header-img'), type: 'Playlist', title: pl.title, desc: pl.description,
          meta: `<strong>${custom ? 'You' : 'AuraStream'}</strong><span class="dot">•</span>${plural(tracks.length, 'song')}${tracks.length ? `, ${formatTotal(total)}` : ''}`
        })}
        <div class="view-actions">
          ${tracks.length ? this._playFab(ctx, 24, 'lg') : ''}
          ${custom ? `<button class="icon-btn action-more" data-action="playlist-more" data-id="${id}" aria-label="More options for ${esc(pl.title)}">${icon('more', 28)}</button>` : ''}
        </div>
        <div class="view-body">
          ${tracks.length
            ? this._trackTable(tracks, ctx, { playlistId: custom ? id : null })
            : this._empty('music', "Let's find something for your playlist", 'Use the ••• menu on any song and choose "Add to playlist".', '<button class="btn btn-primary" data-nav="search">Browse songs</button>')}
        </div>
      </div>`;
  }

  renderLiked() {
    const tracks = this._likedTracks();
    const liked = this._likedPlaylist();
    this.stage.innerHTML = `
      <div class="view">
        ${this._stickyBar('Liked Songs', 'liked', LIKED_COLOR)}
        ${this._header({
          color: LIKED_COLOR, art: this._cover(liked, 'header-img'), type: 'Playlist', title: 'Liked Songs',
          meta: `<strong>You</strong><span class="dot">•</span>${plural(tracks.length, 'song')}`
        })}
        <div class="view-actions">${tracks.length ? this._playFab('liked', 24, 'lg') : ''}</div>
        <div class="view-body">
          ${tracks.length
            ? this._trackTable(tracks, 'liked')
            : this._empty('heart', 'Songs you like will appear here', 'Save songs by tapping the heart icon.', '<button class="btn btn-primary" data-nav="search">Find songs</button>')}
        </div>
      </div>`;
  }

  renderArtist(name) {
    const info = ARTIST_DATA[name];
    const tracks = artistTracks(name);
    if (!info || !tracks.length) {
      this.stage.innerHTML = `<div class="view">${this._empty('user', "Couldn't find that artist", '', '<button class="btn btn-primary" data-nav="home">Go home</button>')}</div>`;
      return;
    }
    const ctx = `artist:${name}`;
    const color = tracks[0].color;
    this.stage.innerHTML = `
      <div class="view">
        ${this._stickyBar(name, ctx, color)}
        <header class="artist-hero" style="--header-color:${color}">
          <img class="artist-hero-img" src="${info.photo}" alt="">
          <div class="artist-hero-info">
            <span class="verified">${icon('verified', 22)} Verified Artist</span>
            <h1 class="header-title">${esc(name)}</h1>
            <p class="header-meta">${esc(info.listeners)}</p>
          </div>
        </header>
        <div class="view-bg short" style="--header-color:${color}"></div>
        <div class="view-actions">${this._playFab(ctx, 24, 'lg')}${this._followBtn(name)}</div>
        <div class="view-body">
          <h2 class="section-title">Popular</h2>
          ${this._trackTable(tracks, ctx)}
          <h2 class="section-title spaced">About</h2>
          <div class="about-card" style="background-image:url('${info.photo}')">
            <div class="about-inner">
              <div class="about-listeners">${esc(info.listeners)}</div>
              <p>${esc(info.bio)}</p>
            </div>
          </div>
        </div>
      </div>`;
  }

  renderDiscover(seedId) {
    const seed = TRACKS.get(seedId) || this.player.currentTrack || CATALOG[0];
    const recs = RecommendationEngine.getRecommendationsForTrack(seed, CATALOG, this.dial, 12);
    const tracks = [seed, ...recs.map(r => r.track)];
    const reasons = new Map(recs.map(r => [r.track.id, r.reason]));
    const ctx = 'discover';

    this.stage.innerHTML = `
      <div class="view">
        ${this._stickyBar('Discovery Radar', ctx, seed.color)}
        ${this._header({
          color: seed.color,
          art: `<div class="header-img radar-art" style="--a:${seed.color};--b:${seed.accentColor}"><img src="${seed.coverUrl}" alt="">${icon('compass', 36)}</div>`,
          type: 'Song radio', title: `${seed.title} Radio`,
          desc: `Songs that pair with "${seed.title}". Turn the Discovery Dial down to stay close, up to cross genres.`,
          meta: `<strong>AuraStream</strong><span class="dot">•</span>${plural(tracks.length, 'song')}`
        })}
        <div class="view-actions">
          ${this._playFab(ctx, 24, 'lg')}
          <div class="dial dial-inline">
            ${icon('compass', 18)}
            <input class="range dial-range" type="range" min="0" max="100" value="${this.dial}" aria-label="Discovery Dial">
            <span class="dial-value">${dialMode(this.dial)}</span>
          </div>
        </div>
        <div class="view-body">
          ${this._trackTable(tracks, ctx, {
            secondary: t => (reasons.has(t.id)
              ? `<button class="link reason-link" data-action="explain" data-track-id="${t.id}" data-seed-id="${seed.id}">${esc(reasons.get(t.id))}</button>`
              : '<span class="muted">Seed song</span>')
          })}
        </div>
      </div>`;

    const dial = this.stage.querySelector('.dial-inline .dial-range');
    dial.style.setProperty('--progress', `${this.dial}%`);
    dial.addEventListener('input', () => this.setDial(Number(dial.value), false));
    dial.addEventListener('change', () => {
      this.renderView();
      this.stage.querySelector('.dial-inline .dial-range')?.focus();
    });
  }

  renderSearch() {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this._renderBrowse();

    const terms = q.split(/\s+/);
    const songs = CATALOG.filter(t => terms.every(term =>
      [t.title, t.artist, t.album, t.genre, t.mood, `${t.bpm} bpm`].some(f => f?.toLowerCase().includes(term))));
    const artists = ARTISTS.filter(a => a.toLowerCase().includes(q));
    const playlists = this._allPlaylists().filter(p => `${p.title} ${p.description || ''}`.toLowerCase().includes(q));

    if (!songs.length && !artists.length && !playlists.length) {
      this.stage.innerHTML = `<div class="view">${this._empty('search', `No results found for "${esc(this.searchQuery.trim())}"`, 'Check the spelling, or search for a genre, mood or tempo like "chill" or "120 bpm".')}</div>`;
      return;
    }

    let top;
    if (artists.length) {
      const name = artists[0];
      top = `
        <div class="top-result" data-nav="artist" data-id="${esc(name)}">
          <img class="top-img round" src="${ARTIST_DATA[name].photo}" alt="">
          <div class="top-title">${esc(name)}</div>
          <div class="top-sub"><span class="pill">Artist</span></div>
          ${this._playFab(`artist:${name}`, 22, 'card-fab')}
        </div>`;
    } else if (songs.length) {
      const t = songs[0];
      top = `
        <div class="top-result" data-action="play-row" tabindex="0" data-list="search" data-index="0">
          <img class="top-img" src="${t.coverUrl}" alt="">
          <div class="top-title">${esc(t.title)}</div>
          <div class="top-sub"><span class="pill">Song</span>${esc(t.artist)}</div>
          <button class="play-fab card-fab" data-action="play-row" data-list="search" data-index="0" aria-label="Play ${esc(t.title)}">${icon('play', 22)}</button>
        </div>`;
    } else {
      top = `<div class="top-result" data-nav="playlist" data-id="${playlists[0].id}">${this._cover(playlists[0], 'top-img')}<div class="top-title">${esc(playlists[0].title)}</div><div class="top-sub"><span class="pill">Playlist</span></div></div>`;
    }

    this.stage.innerHTML = `
      <div class="view view-search">
        <div class="search-top">
          <section class="section"><h2 class="section-title">Top result</h2>${top}</section>
          ${songs.length ? `<section class="section"><h2 class="section-title">Songs</h2>${this._trackTable(songs, 'search')}</section>` : ''}
        </div>
        ${artists.length ? this._section('Artists', artists.map(a => this._artistCard(a)).join('')) : ''}
        ${playlists.length ? this._section('Playlists', playlists.map(p => this._playlistCard(p)).join('')) : ''}
      </div>`;
  }

  _renderBrowse() {
    const tile = (label, t) => `
      <button class="browse-tile" data-action="browse" data-query="${esc(label)}" style="--tile:${t.color}">
        <span>${esc(label)}</span><img src="${t.coverUrl}" alt="" loading="lazy">
      </button>`;
    const firstBy = key => [...new Map(CATALOG.map(t => [t[key], t])).entries()].reverse();
    this.stage.innerHTML = `
      <div class="view">
        <h2 class="section-title">Browse by genre</h2>
        <div class="browse-grid">${firstBy('genre').map(([g, t]) => tile(g, t)).join('')}</div>
        <h2 class="section-title spaced">Browse by mood</h2>
        <div class="browse-grid">${firstBy('mood').map(([m, t]) => tile(m, t)).join('')}</div>
      </div>`;
  }

  setSearch(query) {
    this.searchQuery = query;
    this.omnibox.value = query;
    if (this.view?.name === 'search') this.renderView();
    else this.navigate('search');
  }

  renderLibrary() {
    this.stage.innerHTML = `
      <div class="view">
        <div class="library-page-head">
          <h1 class="greeting">Your Library</h1>
          <button class="btn btn-outline" data-action="create-playlist">${icon('plus', 16)} New playlist</button>
        </div>
        <div class="chip-row">
          ${['all', 'playlists', 'artists'].map(f => `<button class="chip ${this.libraryFilter === f ? 'active' : ''}" data-filter="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}
        </div>
        <div class="library-list page">${this._libraryItems()}</div>
      </div>`;
  }

  /* ── Sidebar ──────────────────────────────────────────────────────────── */

  _libraryItems() {
    const f = this.libraryFilter;
    const v = this.view || {};
    const items = [];

    if (f !== 'artists') {
      const liked = this._likedPlaylist();
      items.push({ nav: 'liked', ctx: 'liked', active: v.name === 'liked', art: this._cover(liked, 'lib-img'), name: 'Liked Songs', meta: `Playlist • ${plural(liked.trackIds.length, 'song')}` });
      for (const pl of this._allPlaylists()) {
        items.push({
          nav: 'playlist', id: pl.id, ctx: `playlist:${pl.id}`, active: v.name === 'playlist' && v.param === pl.id,
          art: this._cover(pl, 'lib-img'), name: pl.title, meta: `Playlist • ${pl.id.startsWith('custom-') ? 'You' : 'AuraStream'}`
        });
      }
    }
    if (f !== 'playlists') {
      for (const name of StorageService.getFollowedArtists()) {
        if (!ARTIST_DATA[name]) continue;
        items.push({
          nav: 'artist', id: name, ctx: `artist:${name}`, active: v.name === 'artist' && v.param === name,
          art: `<img class="lib-img round" src="${ARTIST_DATA[name].photo}" alt="" loading="lazy">`, name, meta: 'Artist'
        });
      }
    }

    if (!items.length) {
      return `<div class="lib-empty"><p class="lib-empty-title">Follow your first artist</p><p>Artists you follow will appear here.</p></div>`;
    }

    return items.map(it => `
      <button class="lib-item ${it.active ? 'active' : ''}" data-nav="${it.nav}" ${it.id ? `data-id="${esc(it.id)}"` : ''} data-context-id="${esc(it.ctx)}">
        ${it.art}
        <span class="lib-text"><span class="lib-name">${esc(it.name)}</span><span class="lib-meta">${esc(it.meta)}</span></span>
        <span class="lib-speaker">${icon('volume', 16)}</span>
      </button>`).join('');
  }

  _renderSidebar() {
    this.sidebarList.innerHTML = this._libraryItems();
    if (this.view?.name === 'library') {
      const list = this.stage.querySelector('.library-list.page');
      if (list) list.innerHTML = this._libraryItems();
    }
    this._refreshPlayingState();
  }

  /* ── Right panel ──────────────────────────────────────────────────────── */

  togglePanel(tab) {
    this.panelTab = tab && this.panelTab !== tab ? tab : null;
    this._renderPanel();
  }

  showPanel(tab) {
    this.panelTab = tab;
    this._renderPanel();
  }

  _renderPanel() {
    const tab = this.panelTab;
    this.rightPanel.classList.toggle('hidden', !tab);
    document.querySelectorAll('[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === tab));
    document.querySelectorAll('.panel-tab').forEach(b => b.setAttribute('aria-selected', b.dataset.panel === tab));
    if (!tab) return;
    const scroll = this._renderedTab === tab ? this.drawer.scrollTop : 0;
    this._renderedTab = tab;
    ({
      nowplaying: () => this._renderNowPlaying(),
      queue: () => this._renderQueue(),
      lyrics: () => this._renderLyrics(),
      eq: () => this._renderEq()
    })[tab]();
    if (tab !== 'lyrics') this.drawer.scrollTop = scroll;
  }

  _renderNowPlaying() {
    const t = this.player.currentTrack;
    if (!t) { this.drawer.innerHTML = this._empty('music', 'Nothing playing', 'Pick a song to get started.'); return; }
    const info = ARTIST_DATA[t.artist];
    const next = this.player.queue[this.player.queueIndex + 1];

    this.drawer.innerHTML = `
      <div class="np">
        <img class="np-art" src="${t.coverUrl}" alt="${esc(t.title)} cover">
        <div class="np-head">
          <div class="np-text">
            <h3 class="np-title">${esc(t.title)}</h3>
            <button class="link np-artist" data-nav="artist" data-id="${esc(t.artist)}">${esc(t.artist)}</button>
          </div>
          ${this._likeBtn(t.id, 22)}
        </div>
        <div class="tags"><span class="tag">${esc(t.genre)}</span><span class="tag">${esc(t.mood)}</span><span class="tag">${t.bpm} BPM</span></div>

        ${info ? `
          <div class="np-card artist-card">
            <div class="artist-card-banner" style="background-image:url('${info.photo}')"><span>About the artist</span></div>
            <div class="np-card-body">
              <div class="artist-card-name">${esc(t.artist)}</div>
              <div class="artist-card-row"><span class="muted">${esc(info.listeners)}</span>${this._followBtn(t.artist)}</div>
              <p class="artist-card-bio">${esc(info.bio)}</p>
            </div>
          </div>` : ''}

        ${next ? `
          <div class="np-card">
            <div class="np-card-head"><span>Next in queue</span><button class="link" data-panel="queue">Open queue</button></div>
            <div class="q-row" data-action="queue-play" tabindex="0" data-index="${this.player.queueIndex + 1}">
              <img class="q-art" src="${next.coverUrl}" alt="">
              <div class="q-text"><div class="q-title">${esc(next.title)}</div><div class="q-artist">${esc(next.artist)}</div></div>
              <span class="q-time">${formatTime(next.duration)}</span>
            </div>
          </div>` : ''}

        <div class="np-card">
          <div class="np-card-head"><span>Credits</span></div>
          <div class="credit"><span>${esc(t.artist)}</span><span class="muted">Main artist</span></div>
          <div class="credit"><span>${esc(t.album || t.title)}</span><span class="muted">Release</span></div>
          <div class="credit"><span>${esc(t.license || 'Creative Commons')}</span><span class="muted">License</span></div>
        </div>
      </div>`;
  }

  _renderQueue() {
    const { queue, queueIndex, currentTrack: cur } = this.player;
    const upcoming = queue.slice(queueIndex + 1);
    const total = upcoming.reduce((s, t) => s + t.duration, 0);
    const row = (t, i, current = false) => `
      <div class="q-row ${current ? 'current' : ''}" ${current ? '' : `data-action="queue-play" tabindex="0" data-index="${i}"`}>
        <img class="q-art" src="${t.coverUrl}" alt="">
        <div class="q-text"><div class="q-title">${esc(t.title)}</div><div class="q-artist">${esc(t.artist)}</div></div>
        ${current ? `<span class="q-time">${formatTime(t.duration)}</span>` : `
          <div class="q-actions">
            <button class="icon-btn" data-action="queue-up" data-index="${i}" aria-label="Move up" ${i === queueIndex + 1 ? 'disabled' : ''}>${icon('arrow-up', 15)}</button>
            <button class="icon-btn" data-action="queue-down" data-index="${i}" aria-label="Move down" ${i === queue.length - 1 ? 'disabled' : ''}>${icon('arrow-down', 15)}</button>
            <button class="icon-btn" data-action="queue-remove" data-index="${i}" aria-label="Remove from queue">${icon('x', 15)}</button>
          </div>
          <span class="q-time">${formatTime(t.duration)}</span>`}
      </div>`;

    this.drawer.innerHTML = `
      ${cur ? `<h4 class="panel-label">Now playing</h4>${row(cur, queueIndex, true)}` : ''}
      <div class="panel-label-row">
        <div><h4 class="panel-label">Next up</h4><span class="muted small">${plural(upcoming.length, 'song')}${upcoming.length ? ` · ${formatTotal(total)}` : ''}</span></div>
        ${upcoming.length ? `
          <div class="panel-label-actions">
            <button class="icon-btn" data-action="save-queue" title="Save queue as playlist" aria-label="Save queue as playlist">${icon('save', 16)}</button>
            <button class="btn btn-ghost sm" data-action="clear-queue">Clear</button>
          </div>` : ''}
      </div>
      ${upcoming.length
        ? upcoming.map((t, i) => row(t, queueIndex + 1 + i)).join('')
        : this._empty('queue', 'Your queue is empty', 'Use "Add to queue" from any song\'s ••• menu.')}`;
  }

  _renderLyrics() {
    const t = this.player.currentTrack;
    if (!t?.lyrics?.length) {
      this.drawer.innerHTML = this._empty('lyrics', 'No lyrics for this song', "You'll have to guess the words for this one.");
      return;
    }
    this.drawer.innerHTML = `
      <div class="lyrics" style="--lyrics-bg:${t.color}">
        ${t.lyrics.map(l => `<button class="lyric ${l.text.startsWith('♪') ? 'instrumental' : ''}" data-action="seek-lyric" data-time="${l.time}">${esc(l.text)}</button>`).join('')}
      </div>`;
    this._syncLyrics(this.drawer, this.player.audio.currentTime, true);
  }

  /** Highlight the active lyric and keep it centred in `scroller` (only scrolls when the line changes). */
  _syncLyrics(scroller, time, force = false) {
    if (!scroller) return;
    const lines = scroller.querySelectorAll('.lyric');
    let active = -1;
    lines.forEach((el, i) => { if (time >= Number(el.dataset.time)) active = i; });
    if (!force && String(active) === scroller.dataset.activeLyric) return;
    scroller.dataset.activeLyric = active;
    lines.forEach((el, i) => {
      el.classList.toggle('active', i === active);
      el.classList.toggle('past', i < active);
    });
    const el = lines[active];
    if (el) {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTo({ top: top - scroller.clientHeight / 2 + el.offsetHeight / 2, behavior: force ? 'auto' : 'smooth' });
    }
  }

  _renderEq() {
    const p = this.player;
    const fmtDb = v => `${v > 0 ? '+' : ''}${v} dB`;
    this.drawer.innerHTML = `
      <div class="eq">
        <h4 class="panel-label">Equalizer</h4>
        <div class="chip-row wrap">
          ${Object.entries(EQ_PRESETS).map(([key, pr]) => `<button class="chip ${p.activePreset === key ? 'active' : ''}" data-action="eq-preset" data-preset="${key}">${pr.name}</button>`).join('')}
        </div>
        <div class="eq-bands">
          ${EQ_BANDS.map((b, i) => `
            <div class="eq-band">
              <span class="eq-val">${fmtDb(p.eqBands[i])}</span>
              <input class="eq-range" type="range" min="-12" max="12" step="1" value="${p.eqBands[i]}" data-band="${i}" aria-label="${b.label} (${b.hz})">
              <span class="eq-label">${b.label}</span>
              <span class="eq-hz">${b.hz}</span>
            </div>`).join('')}
        </div>
        <h4 class="panel-label">Playback speed</h4>
        <div class="chip-row">
          ${[0.75, 1, 1.25, 1.5, 2].map(s => `<button class="chip ${p.playbackRate === s ? 'active' : ''}" data-action="speed" data-speed="${s}">${s}×</button>`).join('')}
        </div>
        <p class="muted small eq-note">Processed in your browser with Web Audio filters. Settings are saved on this device.</p>
      </div>`;
  }

  /* ── Full-screen player ───────────────────────────────────────────────── */

  openTheater() {
    if (!this.player.currentTrack) return;
    this.theaterOpen = true;
    this._renderTheater();
    this.theater.classList.add('open');
    this.theater.setAttribute('aria-hidden', 'false');
    this.theater.requestFullscreen?.().catch(() => { /* overlay still works without the Fullscreen API */ });
  }

  closeTheater() {
    this.theaterOpen = false;
    this.theater.classList.remove('open');
    this.theater.setAttribute('aria-hidden', 'true');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  _renderTheater() {
    const t = this.player.currentTrack;
    const playing = this.player.isPlaying;
    this.theater.innerHTML = `
      <div class="theater-bg" style="background-image:url('${t.coverUrl}')"></div>
      <button class="icon-btn round theater-close" data-action="close-theater" aria-label="Exit full screen">${icon('minimize', 20)}</button>
      <div class="theater-body">
        <div class="theater-now">
          <img class="theater-art" src="${t.coverUrl}" alt="${esc(t.title)} cover">
          <div class="theater-title">${esc(t.title)}</div>
          <button class="link theater-artist" data-nav="artist" data-id="${esc(t.artist)}">${esc(t.artist)}</button>
        </div>
        <div class="theater-lyrics">
          ${t.lyrics?.length
            ? t.lyrics.map(l => `<button class="lyric ${l.text.startsWith('♪') ? 'instrumental' : ''}" data-action="seek-lyric" data-time="${l.time}">${esc(l.text)}</button>`).join('')
            : `<p class="theater-desc">${esc(t.description || '')}</p>`}
        </div>
      </div>
      <div class="theater-controls">
        <div class="player-progress">
          <span class="time t-cur">0:00</span>
          <input class="range progress-range" type="range" min="0" max="1000" value="0" aria-label="Seek">
          <span class="time t-total">${formatTime(t.duration)}</span>
        </div>
        <div class="player-controls">
          ${this._likeBtn(t.id, 22)}
          <button class="icon-btn ctrl" data-action="prev" aria-label="Previous">${icon('prev', 24)}</button>
          <button class="play-btn lg" data-action="toggle-play" aria-label="${playing ? 'Pause' : 'Play'}">${icon(playing ? 'pause' : 'play', 24)}</button>
          <button class="icon-btn ctrl" data-action="next" aria-label="Next">${icon('next', 24)}</button>
          <button class="icon-btn ctrl" data-action="close-theater" aria-label="Exit full screen">${icon('minimize', 22)}</button>
        </div>
      </div>`;
    this._bindSeekRange(this.theater.querySelector('.progress-range'), this.theater.querySelector('.t-cur'));
    this._updateProgress(this.player.audio.currentTime, this._duration());
    this._syncLyrics(this.theater.querySelector('.theater-lyrics'), this.player.audio.currentTime, true);
  }

  /* ── Toasts ───────────────────────────────────────────────────────────── */

  toast(message, { undo } = {}) {
    const stack = document.getElementById('toast-stack');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${esc(message)}</span>${undo ? '<button class="toast-undo">Undo</button>' : ''}`;
    const dismiss = () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 200);
    };
    if (undo) {
      el.querySelector('.toast-undo').addEventListener('click', () => { undo(); dismiss(); });
    }
    while (stack.children.length >= 3) stack.firstElementChild.remove();
    stack.append(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(dismiss, undo ? 5000 : 2600);
  }
}

new AuraStreamApp();
