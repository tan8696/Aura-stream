/**
 * AuraStream Main Application Controller
 * Spotify-layout edition: Sidebar Library | Main Content | Right Panel
 */

import './index.css';
import { createIcons, icons } from 'lucide';
import confetti from 'canvas-confetti';
import { CATALOG, ARTIST_DATA } from './data/catalog.js';
import { DEFAULT_PLAYLISTS } from './data/playlists.js';
import { StorageService } from './services/storageService.js';
import { RecommendationEngine } from './services/recommendationEngine.js';
import { AudioService } from './services/audioService.js';
import { AudioVisualizer } from './components/visualizer.js';
import { SpotifyAuth, SpotifyAPI } from './services/spotify.js';
import { SpotifyPlayerService } from './services/spotifyPlayerService.js';

window.lucide = {
  createIcons: (opts = {}) => createIcons({ icons, ...opts }),
  icons
};

class AuraStreamApp {
  constructor() {
    this.catalog = CATALOG;
    this.spotifyPlayer = new AudioService(this.catalog);

    this.currentView = 'home';
    this.activeCategory = 'All';
    this.selectedPlaylistId = null;
    this.searchQuery = '';
    this.activePanelTab = null; // 'queue' | 'nowplaying' | 'lyrics' | 'eq'
    this.discoveryDial = StorageService.getDiscoveryDial();
    this.followedArtists = new Set(['Broke For Free']);
    this._navHistory = [];
    this._navFuture = [];

    // User-Centric State
    this.homeMode = StorageService.getHomeMode(); // 'my-music' | 'discover' (defaults to 'my-music')
    this.focusMode = StorageService.getFocusMode(); // 'music' | 'all' (Music only focus mode)
    this.contentType = 'music';
    this.pinnedSections = new Set(['section-my-quick']);
    this.activeExplainTrack = null;

    // DOM refs
    this.stageContent   = document.getElementById('stage-content');
    this.rightPanel     = document.getElementById('right-panel');
    this.rightDrawer    = document.getElementById('right-drawer');
    this.omnibox        = document.getElementById('omnibox-search');
    this.dialSlider     = document.getElementById('discovery-dial-slider');
    this.dialLabel      = document.getElementById('dial-mode-label');
    this.theaterEl      = document.getElementById('fullscreen-theater');
    this.sidebarList    = document.getElementById('sidebar-library-list');
    this.mainContent    = document.getElementById('main-content');

    // Mini visualizer
    const miniCanvas = document.getElementById('mini-visualizer');
    if (miniCanvas) {
      this.visualizer = new AudioVisualizer(miniCanvas, this.spotifyPlayer);
      this.visualizer.start();
      miniCanvas.addEventListener('click', () => {
        const mode = this.visualizer.cycleMode();
        this.showToast(`Visualizer: ${mode.toUpperCase()}`);
      });
    }

    this.spotifyPlayer = new SpotifyPlayerService();

    this.init();
  }

  async init() {
    // Spotify Auth Check
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('code')) {
      const success = await SpotifyAuth.handleCallback();
      if (success) {
        window.location.href = '/';
        return;
      }
    }

    const token = await SpotifyAuth.getAccessToken();
    if (!token) {
      const overlay = document.getElementById('spotify-auth-overlay');
      overlay.style.display = 'flex';
      
      const clientIdInput = document.getElementById('spotify-client-id-input');
      clientIdInput.value = SpotifyAuth.getClientId() !== 'YOUR_SPOTIFY_CLIENT_ID' ? SpotifyAuth.getClientId() : '';
      
      const urlDisplay = document.getElementById('current-url-display');
      if (urlDisplay) urlDisplay.textContent = window.location.origin + '/';

      document.getElementById('btn-spotify-login').addEventListener('click', () => {
        if (!clientIdInput.value.trim()) {
          alert('Please enter your Client ID');
          return;
        }
        SpotifyAuth.setClientId(clientIdInput.value.trim());
        // Since we are overriding the hardcoded string
        SpotifyAuth.login();
      });
      return; // Stop initialization until logged in
    }

    // Initialize Spotify SDK
    await this.spotifyPlayer.init();
    
    // Load initial user data
    try {
      this.userProfile = await SpotifyAPI.getUserProfile();
      this.userPlaylists = await SpotifyAPI.getUserPlaylists();
      
      const avatarBtn = document.getElementById('btn-user-avatar');
      if (avatarBtn && this.userProfile) {
        avatarBtn.textContent = this.userProfile.display_name?.charAt(0) || 'U';
        if (this.userProfile.images && this.userProfile.images.length > 0) {
          avatarBtn.innerHTML = `<img src="${this.userProfile.images[0].url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        }
      }
    } catch (e) {
      console.error('Error fetching user data', e);
    }

    this._bindGlobalEvents();
    this._bindPlayerBar();
    this._bindExplainModal();
    this._bindCustomizeSectionsModal();
    this._updateFocusModeUI();
    this._renderSidebarLibrary();
    this._updateDiscoveryDialUI();
    this.navigate('home', null, true);

    if (this.catalog.length > 0) {
      this.spotifyPlayer.queue = [...this.catalog];
      this.spotifyPlayer.queueIndex = 0;
      this.spotifyPlayer.currentTrack = this.catalog[0];
      this._updatePlayerBar(this.catalog[0]);
      this._updateAuraGlow(this.catalog[0]);
    }

    this.activePanelTab = 'queue';
    this._renderPanel('queue');
    this._updatePanelTabUI();

    // Sticky nav scroll listener
    if (this.mainContent) {
      this.mainContent.addEventListener('scroll', () => {
        const nav = document.getElementById('content-sticky-nav');
        if (nav) nav.classList.toggle('scrolled', this.mainContent.scrollTop > 60);
      });
    }

    createIcons({ icons });
  }

  /* ── Aura Glow ─────────────────────────────────────────────────────────── */
  _updateAuraGlow(track) {
    if (!track) return;
    const root = document.documentElement;
    root.style.setProperty('--aura-primary', track.color || '#7928CA');
    root.style.setProperty('--aura-accent',  track.accentColor || '#00F2FE');
    root.style.setProperty('--aura-glow',    `${track.color || '#7928CA'}40`);
  }

  /* ── Player Bar Updates ─────────────────────────────────────────────────── */
  _updatePlayerBar(track) {
    if (!track) return;
    const thumb  = document.getElementById('player-thumb');
    const title  = document.getElementById('player-track-title');
    const artist = document.getElementById('player-track-artist');
    const likeBtn = document.getElementById('player-like-btn');

    if (thumb)  { thumb.src = track.coverUrl; thumb.alt = track.title; }
    if (title)  title.textContent = track.title;
    if (artist) artist.textContent = track.artist;

    const likedIds = StorageService.getLikedTrackIds();
    if (likeBtn) {
      const liked = likedIds.has(track.id);
      likeBtn.classList.toggle('liked', liked);
      likeBtn.querySelector('svg path') &&
        likeBtn.querySelector('svg').setAttribute('fill', liked ? 'currentColor' : 'none');
    }
    this._updateAuraGlow(track);

    // update right panel if open
    if (this.activePanelTab === 'nowplaying') this._renderPanelNowPlaying();
    if (this.activePanelTab === 'lyrics')     this._renderPanelLyrics();
    if (this.activePanelTab === 'queue')      this._renderPanelQueue();
  }

  /* ── Player Bar Event Bindings ──────────────────────────────────────────── */
  _bindPlayerBar() {
    // Track change
    this.spotifyPlayer.on('trackchange', ({ track }) => {
      this._updatePlayerBar(track);
      this._highlightActiveRow();
      this._renderSidebarLibrary(); // update now-playing dot
    });

    // Play/Pause state
    this.spotifyPlayer.on('playstate', ({ isPlaying }) => {
      const playIcon  = document.getElementById('icon-play');
      const pauseIcon = document.getElementById('icon-pause');
      if (playIcon)  playIcon.style.display  = isPlaying ? 'none' : 'block';
      if (pauseIcon) pauseIcon.style.display = isPlaying ? 'block' : 'none';
      this._highlightActiveRow();
    });

    // Play / Pause button
    document.getElementById('btn-play-pause')?.addEventListener('click', () =>
      this.spotifyPlayer.togglePlayPause()
    );

    // Prev / Next
    document.getElementById('btn-prev')?.addEventListener('click', () => this.spotifyPlayer.playPrev());
    document.getElementById('btn-next')?.addEventListener('click', () => this.spotifyPlayer.playNext());

    // Shuffle with mode badge & transparent popover
    const shuffleBtn     = document.getElementById('btn-shuffle');
    const shuffleBadge   = document.getElementById('shuffle-badge');
    const shufflePopover = document.getElementById('shuffle-popover');
    const shuffleWidget  = document.getElementById('shuffle-widget');

    const updateShuffleUI = (mode) => {
      if (!shuffleBtn || !shuffleBadge) return;
      shuffleBtn.classList.toggle('active', mode !== 'off');
      shuffleWidget?.classList.remove('mode-true-random', 'mode-smart-flow');

      let badgeText = 'OFF';
      if (mode === 'true-random') {
        badgeText = 'RANDOM';
        shuffleWidget?.classList.add('mode-true-random');
      } else if (mode === 'smart-flow') {
        badgeText = 'SMART';
        shuffleWidget?.classList.add('mode-smart-flow');
      }
      shuffleBadge.textContent = badgeText;

      // Update active option in popover
      shufflePopover?.querySelectorAll('.shuffle-option').forEach(opt => {
        const isOpt = opt.dataset.shuffleMode === mode;
        opt.classList.toggle('active', isOpt);
        const tag = opt.querySelector('.shuffle-opt-tag');
        if (tag) {
          if (isOpt) {
            tag.textContent = 'Active';
          } else {
            if (opt.dataset.shuffleMode === 'true-random') tag.textContent = 'Unbiased';
            else if (opt.dataset.shuffleMode === 'smart-flow') tag.textContent = 'AI Harmony';
            else tag.textContent = 'Default';
          }
        }
      });
    };

    // Click on shuffle button cycles mode
    shuffleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = this.spotifyPlayer.cycleShuffleMode();
      updateShuffleUI(mode);
      const msgs = {
        'true-random': 'Shuffle: True Random (Fisher-Yates pure randomization, zero repeats)',
        'smart-flow': 'Shuffle: Smart Flow (Harmonic key & tempo energy flow)',
        'off': 'Shuffle: Off (Sequential)'
      };
      this.showToast(msgs[mode] || 'Shuffle toggled');
    });

    // Click on badge opens/closes popover
    shuffleBadge?.addEventListener('click', (e) => {
      e.stopPropagation();
      shufflePopover?.classList.toggle('active');
    });

    // Selecting option inside popover
    shufflePopover?.querySelectorAll('.shuffle-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = opt.dataset.shuffleMode;
        this.spotifyPlayer.setShuffleMode(mode);
        updateShuffleUI(mode);
        shufflePopover.classList.remove('active');
        const msgs = {
          'true-random': 'Shuffle Mode: True Random (Pure Fisher-Yates, zero repeats)',
          'smart-flow': 'Shuffle Mode: Smart Flow (AI harmonic valence & BPM matching)',
          'off': 'Shuffle Mode: Off (Playing sequentially)'
        };
        this.showToast(msgs[mode]);
      });
    });

    // Close popover when clicking anywhere else
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#shuffle-widget')) {
        shufflePopover?.classList.remove('active');
      }
    });

    this.spotifyPlayer.on('modechange', ({ shuffleMode }) => {
      updateShuffleUI(shuffleMode);
    });

    // Repeat
    const repeatBtn = document.getElementById('btn-repeat');
    repeatBtn?.addEventListener('click', () => {
      const mode = this.spotifyPlayer.cycleLoopMode();
      repeatBtn.classList.toggle('active', mode !== 'off');
      this.showToast(`Repeat: ${mode}`);
    });

    // Time update → scrubber
    this.spotifyPlayer.on('timeupdate', ({ currentTime, duration }) => {
      const cur   = document.getElementById('scrub-current');
      const fill  = document.getElementById('scrub-fill');
      const thumb = document.getElementById('scrub-thumb');
      const total = document.getElementById('scrub-total');
      if (cur)   cur.textContent   = this._formatTime(currentTime);
      if (total) total.textContent = this._formatTime(duration || this.spotifyPlayer.currentTrack?.duration || 0);
      if (duration > 0 && fill) {
        const pct = (currentTime / duration) * 100;
        fill.style.width = `${pct}%`;
        if (thumb) thumb.style.left = `${pct}%`;
      }
      // lyrics sync
      if (this.activePanelTab === 'lyrics') this._syncLyricsHighlight(currentTime);
    });

    // Scrubber click
    const scrubWrap = document.getElementById('scrub-wrapper');
    if (scrubWrap) {
      let dragging = false;
      const seek = (e) => {
        const rect = scrubWrap.getBoundingClientRect();
        const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const dur  = this.spotifyPlayer.audio?.duration || this.spotifyPlayer.currentTrack?.duration || 0;
        this.spotifyPlayer.seekTo(pct * dur);
      };
      scrubWrap.addEventListener('click', seek);
      scrubWrap.addEventListener('mousedown', () => { dragging = true; });
      document.addEventListener('mousemove', (e) => { if (dragging) seek(e); });
      document.addEventListener('mouseup',   () => { dragging = false; });
    }

    // Volume
    const volSlider = document.getElementById('volume-slider');
    if (volSlider) {
      volSlider.value = (this.spotifyPlayer.volume || 0.8) * 100;
      volSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 100;
        this.spotifyPlayer.setVolume(val);
        this._updateVolumeIcon(val);
      });
    }

    // Mute
    document.getElementById('btn-mute')?.addEventListener('click', () => {
      const muted = this.spotifyPlayer.toggleMute();
      this._updateVolumeIcon(muted ? 0 : this.spotifyPlayer.volume);
    });

    // Like from player
    document.getElementById('player-like-btn')?.addEventListener('click', () => {
      if (!this.spotifyPlayer.currentTrack) return;
      const liked = StorageService.toggleLike(this.spotifyPlayer.currentTrack.id);
      this._updatePlayerBar(this.spotifyPlayer.currentTrack);
      if (liked) {
        confetti({ particleCount: 30, spread: 60, origin: { y: 0.9, x: 0.15 } });
        this.showToast(`Added "${this.spotifyPlayer.currentTrack.title}" to Liked Songs`);
      } else {
        this.showToast('Removed from Liked Songs');
      }
    });

    // Right panel tab buttons (player bar)
    document.getElementById('btn-panel-queue')?.addEventListener('click',   () => this._togglePanel('queue'));
    document.getElementById('btn-panel-lyrics')?.addEventListener('click',  () => this._togglePanel('lyrics'));
    document.getElementById('btn-panel-eq')?.addEventListener('click',      () => this._togglePanel('eq'));

    // Theater
    document.getElementById('btn-theater')?.addEventListener('click', () => this._openTheater());

    // Thumb click → open now playing
    document.getElementById('player-thumb-wrap')?.addEventListener('click', () => this._togglePanel('nowplaying'));

    // Panel tabs (inside right panel)
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => this._togglePanel(tab.dataset.panel));
    });

    // Close panel
    document.getElementById('btn-right-panel-close')?.addEventListener('click', () => {
      this.activePanelTab = null;
      this.rightPanel?.classList.add('hidden');
      this._updatePanelTabUI();
    });
  }

  /* ── Volume Icon ─────────────────────────────────────────────────────────── */
  _updateVolumeIcon(vol) {
    const icon   = document.getElementById('icon-volume');
    const muted  = document.getElementById('icon-mute');
    if (!icon || !muted) return;
    icon.style.display  = vol === 0 ? 'none' : 'block';
    muted.style.display = vol === 0 ? 'block' : 'none';
  }

  /* ── Discovery Dial ─────────────────────────────────────────────────────── */
  _updateDiscoveryDialUI() {
    if (!this.dialSlider || !this.dialLabel) return;
    this.dialSlider.value = this.discoveryDial;
    let label = 'BLEND';
    if      (this.discoveryDial <= 30) label = 'COMFORT';
    else if (this.discoveryDial <= 70) label = 'BLEND';
    else                                label = 'EXPLORE';
    this.dialLabel.textContent = label;
  }

  /* ── Right Panel ─────────────────────────────────────────────────────────── */
  _togglePanel(tabName) {
    if (this.activePanelTab === tabName) {
      this.activePanelTab = null;
      this.rightPanel?.classList.add('hidden');
    } else {
      this.activePanelTab = tabName;
      this.rightPanel?.classList.remove('hidden');
      this._renderPanel(tabName);
    }
    this._updatePanelTabUI();
  }

  _updatePanelTabUI() {
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.panel === this.activePanelTab);
    });
    const extraBtns = {
      queue:      'btn-panel-queue',
      lyrics:     'btn-panel-lyrics',
      eq:         'btn-panel-eq',
      nowplaying: 'btn-panel-queue',
    };
    ['btn-panel-queue','btn-panel-lyrics','btn-panel-eq'].forEach(id => {
      document.getElementById(id)?.classList.remove('active');
    });
    if (this.activePanelTab && extraBtns[this.activePanelTab]) {
      document.getElementById(extraBtns[this.activePanelTab])?.classList.add('active');
    }
  }

  _renderPanel(tabName) {
    switch (tabName) {
      case 'queue':      this._renderPanelQueue();      break;
      case 'nowplaying': this._renderPanelNowPlaying(); break;
      case 'lyrics':     this._renderPanelLyrics();     break;
      case 'eq':         this._renderPanelEQ();         break;
    }
  }

  /* ── Queue Panel ─────────────────────────────────────────────────────────── */
  _renderPanelQueue() {
    if (!this.rightDrawer) return;
    const queue = this.spotifyPlayer.queue || [];
    const idx   = this.spotifyPlayer.queueIndex || 0;
    const cur   = this.spotifyPlayer.currentTrack;
    const upcoming = queue.slice(idx + 1);

    const totalSeconds = upcoming.reduce((acc, t) => acc + (t.duration || 0), 0);
    const mins = Math.floor(totalSeconds / 60);

    this.rightDrawer.innerHTML = `
      ${cur ? `
        <p class="queue-section-label">Now playing</p>
        <div class="queue-track-item active-queue">
          <img class="queue-thumb" src="${cur.coverUrl}" alt="${cur.title}" />
          <div class="queue-info">
            <div class="queue-title" style="color:var(--brand-green)">${cur.title}</div>
            <div class="queue-artist">${cur.artist}</div>
          </div>
          <span class="queue-duration">${this._formatTime(cur.duration)}</span>
        </div>
      ` : ''}

      <div class="queue-header-actions" style="margin-top:18px">
        <div>
          <span class="queue-section-label" style="margin:0">Next up</span>
          <span class="queue-summary-text" style="display:block;margin-top:2px">${upcoming.length} track${upcoming.length !== 1 ? 's' : ''} • ${mins} min</span>
        </div>
        ${upcoming.length > 0 ? `
          <button class="btn-clear-queue" id="btn-clear-upcoming" title="Clear all upcoming tracks from queue">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            Clear upcoming
          </button>
        ` : ''}
      </div>

      ${upcoming.map((t, uIdx) => {
        const absoluteIdx = idx + 1 + uIdx;
        return `
          <div class="queue-track-item" data-queue-track="${t.id}" data-queue-idx="${absoluteIdx}">
            <img class="queue-thumb" src="${t.coverUrl}" alt="${t.title}" />
            <div class="queue-info">
              <div class="queue-title">${t.title}</div>
              <div class="queue-artist">${t.artist}</div>
            </div>
            <div class="queue-item-actions">
              ${uIdx > 0 ? `<button class="queue-action-btn" data-action="move-up" data-idx="${absoluteIdx}" title="Move up">▲</button>` : ''}
              ${uIdx < upcoming.length - 1 ? `<button class="queue-action-btn" data-action="move-down" data-idx="${absoluteIdx}" title="Move down">▼</button>` : ''}
              <button class="queue-action-btn" data-action="remove-item" data-idx="${absoluteIdx}" data-id="${t.id}" title="Remove from queue">✕</button>
            </div>
            <span class="queue-duration" style="margin-left:6px">${this._formatTime(t.duration)}</span>
          </div>
        `;
      }).join('')}

      ${upcoming.length === 0 ? `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg>
          <p>No upcoming tracks. Queue songs from Home or Playlists!</p>
        </div>
      ` : ''}
    `;

    // Click item to play
    this.rightDrawer.querySelectorAll('[data-queue-track]').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.queue-item-actions')) return;
        const t = this.catalog.find(tr => tr.id === item.dataset.queueTrack);
        if (t) this.spotifyPlayer.playTrack(t, queue);
      });
    });

    // Clear upcoming button with Undo
    document.getElementById('btn-clear-upcoming')?.addEventListener('click', () => {
      const savedQueue = [...this.spotifyPlayer.queue];
      const savedIdx   = this.spotifyPlayer.queueIndex;
      this.spotifyPlayer.clearQueue();
      this._renderPanelQueue();
      this.showToast('Upcoming queue cleared', {
        undoAction: () => {
          this.spotifyPlayer.queue = savedQueue;
          this.spotifyPlayer.queueIndex = savedIdx;
          this._renderPanelQueue();
          this.showToast('Queue restored');
        }
      });
    });

    // Move up
    this.rightDrawer.querySelectorAll('[data-action="move-up"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fromIdx = parseInt(btn.dataset.idx, 10);
        this.spotifyPlayer.reorderQueue(fromIdx, fromIdx - 1);
        this._renderPanelQueue();
      });
    });

    // Move down
    this.rightDrawer.querySelectorAll('[data-action="move-down"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fromIdx = parseInt(btn.dataset.idx, 10);
        this.spotifyPlayer.reorderQueue(fromIdx, fromIdx + 1);
        this._renderPanelQueue();
      });
    });

    // Remove single track with Undo
    this.rightDrawer.querySelectorAll('[data-action="remove-item"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const remIdx = parseInt(btn.dataset.idx, 10);
        const removedTrack = this.spotifyPlayer.queue[remIdx];
        if (removedTrack) {
          this.spotifyPlayer.removeFromQueue(remIdx);
          this._renderPanelQueue();
          this.showToast(`Removed "${removedTrack.title}" from queue`, {
            undoAction: () => {
              this.spotifyPlayer.queue.splice(remIdx, 0, removedTrack);
              this._renderPanelQueue();
              this.showToast(`Restored "${removedTrack.title}" to queue`);
            }
          });
        }
      });
    });
  }

  /* ── Now Playing Panel ───────────────────────────────────────────────────── */
  _renderPanelNowPlaying() {
    if (!this.rightDrawer) return;
    const t = this.spotifyPlayer.currentTrack;
    if (!t) {
      this.rightDrawer.innerHTML = `<div class="empty-state"><p>Nothing playing yet.</p></div>`;
      return;
    }
    const liked = StorageService.getLikedTrackIds().has(t.id);
    const artistInfo = (ARTIST_DATA && ARTIST_DATA[t.artist]) || {
      photo: '/artists/broke-for-free.jpg',
      listeners: '1,200,000 monthly listeners',
      bio: `${t.artist} is an independent musician creating open-source audio under Creative Commons.`
    };
    const isFollowing = this.followedArtists.has(t.artist);

    const queue = this.spotifyPlayer.queue || [];
    const qIdx  = this.spotifyPlayer.queueIndex || 0;
    const nextTrack = queue[qIdx + 1];

    this.rightDrawer.innerHTML = `
      <!-- Now Playing Main Card -->
      <div class="now-playing-card">
        <img class="now-playing-art" src="${t.coverUrl}" alt="${t.title}" />
        <div class="now-playing-meta">
          <div class="now-playing-text">
            <div class="now-playing-title">${t.title}</div>
            <div class="now-playing-artist">${t.artist}</div>
          </div>
          <button class="player-like-btn ${liked ? 'liked' : ''}" id="panel-like-btn" aria-label="Like song">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
        </div>
      </div>

      <!-- Quick Actions / Badges -->
      <div style="padding:4px 0 12px; display:flex; gap:8px; flex-wrap:wrap;">
        <span class="tag-badge">${t.genre}</span>
        <span class="tag-badge">${t.mood}</span>
        <span class="tag-badge">${t.bpm} BPM</span>
        <span class="tag-badge">${t.license || 'CC-BY'}</span>
      </div>

      <!-- About the Artist (Spotify Desktop Style) -->
      <div class="artist-profile-card">
        <div class="artist-banner-wrap">
          <img class="artist-banner-img" src="${artistInfo.photo}" alt="${t.artist}" />
          <div class="artist-banner-overlay"></div>
          <span class="artist-banner-label">About the artist</span>
        </div>
        <div class="artist-profile-info">
          <div class="artist-profile-name-row">
            <div class="artist-profile-name">
              ${t.artist}
              <span class="artist-verified-badge" title="Verified Creator">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
              </span>
            </div>
            <button class="artist-follow-btn ${isFollowing ? 'following' : ''}" id="btn-artist-follow">
              ${isFollowing ? 'Following' : 'Follow'}
            </button>
          </div>
          <div class="artist-profile-listeners">${artistInfo.listeners}</div>
          <p class="artist-profile-bio">${artistInfo.bio}</p>
        </div>
      </div>

      <!-- Next in Queue Preview -->
      ${nextTrack ? `
        <div class="now-playing-credits" style="cursor:pointer" id="btn-next-in-queue">
          <div class="credits-title-row">
            <span class="credits-title">Next in queue</span>
            <span style="font-size:12px;font-weight:700;color:var(--brand-green)">Open queue →</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <img src="${nextTrack.coverUrl}" alt="${nextTrack.title}" style="width:48px;height:48px;border-radius:var(--r-xs);object-fit:cover" />
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nextTrack.title}</div>
              <div style="font-size:12px;color:var(--text-muted)">${nextTrack.artist}</div>
            </div>
            <span style="font-size:12px;color:var(--text-muted)">${this._formatTime(nextTrack.duration)}</span>
          </div>
        </div>
      ` : ''}

      <!-- Credits Card (Spotify Style) -->
      <div class="now-playing-credits">
        <div class="credits-title-row">
          <span class="credits-title">Credits</span>
        </div>
        <div class="credit-row">
          <div class="credit-role">Main Performer</div>
          <div class="credit-name">${t.artist}</div>
        </div>
        <div class="credit-row">
          <div class="credit-role">Album / Release</div>
          <div class="credit-name">${t.album || t.title}</div>
        </div>
        <div class="credit-row">
          <div class="credit-role">Licensing Source</div>
          <div class="credit-name">${t.license || 'Free Music Archive (CC-BY 3.0)'}</div>
        </div>
      </div>
    `;

    document.getElementById('panel-like-btn')?.addEventListener('click', () => {
      const nowLiked = StorageService.toggleLike(t.id);
      this._updatePlayerBar(t);
      this._renderPanelNowPlaying();
      this.showToast(nowLiked ? `Added to Liked Songs` : `Removed from Liked Songs`);
    });

    document.getElementById('btn-artist-follow')?.addEventListener('click', () => {
      if (this.followedArtists.has(t.artist)) {
        this.followedArtists.delete(t.artist);
        this.showToast(`Unfollowed ${t.artist}`);
      } else {
        this.followedArtists.add(t.artist);
        confetti({ particleCount: 25, spread: 50 });
        this.showToast(`Following ${t.artist}`);
      }
      this._renderPanelNowPlaying();
    });

    document.getElementById('btn-next-in-queue')?.addEventListener('click', () => {
      this._togglePanel('queue');
    });
  }

  /* ── Lyrics Panel ─────────────────────────────────────────────────────────── */
  _renderPanelLyrics() {
    if (!this.rightDrawer) return;
    const t = this.spotifyPlayer.currentTrack;
    if (!t || !t.lyrics || t.lyrics.length === 0) {
      this.rightDrawer.innerHTML = `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <p>No lyrics available for this track.</p>
        </div>
      `;
      return;
    }

    this.rightDrawer.innerHTML = `
      <div class="lyrics-panel-header">
        <span class="lyrics-panel-label">Lyrics</span>
        <span class="lyrics-synced-badge"><span class="lyrics-synced-dot"></span> SYNCED</span>
      </div>
      <div class="lyrics-scroll-area" id="lyrics-scroll-area">
        ${t.lyrics.map((line, i) => `
          <div class="lyric-line ${line.text === '♪' ? 'lyric-instrumental' : ''}"
               data-ts="${line.time}"
               data-lyric-idx="${i}"
               id="lyric-line-${i}">
            ${line.text}
          </div>
        `).join('')}
      </div>
    `;

    // Click to seek
    this.rightDrawer.querySelectorAll('.lyric-line').forEach(el => {
      el.addEventListener('click', () => {
        const ts = parseFloat(el.dataset.ts);
        this.spotifyPlayer.seekTo(ts);
      });
    });
  }

  _syncLyricsHighlight(currentTime) {
    const lines = document.querySelectorAll('.lyric-line[data-ts]');
    if (!lines.length) return;
    let activeIdx = -1;
    lines.forEach((el, i) => {
      const ts = parseFloat(el.dataset.ts);
      if (currentTime >= ts) activeIdx = i;
    });
    lines.forEach((el, i) => {
      el.classList.toggle('active', i === activeIdx);
      el.classList.toggle('past',   i < activeIdx);
    });
    if (activeIdx >= 0 && lines[activeIdx]) {
      lines[activeIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /* ── EQ Panel ─────────────────────────────────────────────────────────────── */
  _renderPanelEQ() {
    if (!this.rightDrawer) return;
    const bands = [
      { label: 'Bass',    hz: '60Hz',   gain: 0 },
      { label: 'Low-Mid', hz: '250Hz',  gain: 0 },
      { label: 'Mid',     hz: '1kHz',   gain: 0 },
      { label: 'Hi-Mid',  hz: '4kHz',   gain: 0 },
      { label: 'Treble',  hz: '12kHz',  gain: 0 },
    ];
    const presets = ['Flat', 'Bass Boost', 'Pop', 'Rock', 'Jazz', 'Classical', 'Electronic'];
    const speeds  = ['0.75×', '1×', '1.25×', '1.5×', '2×'];

    this.rightDrawer.innerHTML = `
      <div class="eq-panel">
        <div>
          <div class="eq-panel-title">Preset</div>
          <div class="eq-preset-chips">
            ${presets.map((p, i) => `<button class="eq-chip ${i===0?'active':''}" data-preset="${p}">${p}</button>`).join('')}
          </div>
        </div>

        <div class="eq-sliders">
          ${bands.map((b, i) => `
            <div class="eq-slider-col">
              <span class="eq-val" id="eq-val-${i}">0 dB</span>
              <input class="eq-v-range" type="range" min="-12" max="12" value="0"
                     data-band="${i}" orient="vertical" />
              <span class="eq-band-label">${b.label}</span>
              <span class="eq-band-hz">${b.hz}</span>
            </div>
          `).join('')}
        </div>

        <div class="eq-feature-row">
          <div>
            <div class="eq-feature-label">Spatial Width</div>
            <div class="eq-feature-sub">3D stereo widening</div>
          </div>
          <label class="toggle-wrap">
            <input type="checkbox" id="eq-toggle-spatial" />
            <span class="toggle-track"></span>
          </label>
        </div>

        <div class="eq-feature-row">
          <div>
            <div class="eq-feature-label">Bass Enhance</div>
            <div class="eq-feature-sub">Sub-harmonic boost</div>
          </div>
          <label class="toggle-wrap">
            <input type="checkbox" id="eq-toggle-bass" />
            <span class="toggle-track"></span>
          </label>
        </div>

        <div>
          <div class="eq-panel-title" style="margin-bottom:8px">Playback Speed</div>
          <div class="speed-row">
            ${speeds.map((s, i) => `<button class="speed-chip ${i===1?'active':''}" data-speed="${s}">${s}</button>`).join('')}
          </div>
        </div>
      </div>
    `;

    // EQ sliders
    this.rightDrawer.querySelectorAll('.eq-v-range').forEach(input => {
      input.addEventListener('input', () => {
        const band = parseInt(input.dataset.band, 10);
        const val  = parseFloat(input.value);
        const label = document.getElementById(`eq-val-${band}`);
        if (label) label.textContent = `${val > 0 ? '+' : ''}${val} dB`;
        try { this.spotifyPlayer.setEQBand?.(band, val); } catch(e) {}
      });
    });

    // Presets
    this.rightDrawer.querySelectorAll('.eq-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        this.rightDrawer.querySelectorAll('.eq-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.showToast(`EQ Preset: ${btn.dataset.preset}`);
      });
    });

    // Speed
    this.rightDrawer.querySelectorAll('.speed-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        this.rightDrawer.querySelectorAll('.speed-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const rate = parseFloat(btn.dataset.speed.replace('×',''));
        if (this.spotifyPlayer.audio) this.spotifyPlayer.audio.playbackRate = rate;
        this.showToast(`Speed: ${btn.dataset.speed}`);
      });
    });

    // Spatial toggle
    document.getElementById('eq-toggle-spatial')?.addEventListener('change', (e) => {
      try { this.spotifyPlayer.setSpatialWidth?.(e.target.checked ? 0.6 : 0); } catch(_) {}
      this.showToast(`Spatial Width: ${e.target.checked ? 'ON' : 'OFF'}`);
    });
  }

  /* ── Theater Mode ─────────────────────────────────────────────────────────── */
  _openTheater() {
    const t = this.spotifyPlayer.currentTrack;
    if (!t || !this.theaterEl) return;
    const lyrics = t.lyrics || [];

    this.theaterEl.innerHTML = `
      <div class="theater-bg" style="
        background: radial-gradient(ellipse 80% 60% at 30% 20%, ${t.color}30, transparent 55%),
                    radial-gradient(ellipse 50% 40% at 75% 80%, ${t.accentColor}20, transparent 50%),
                    #080A10;"></div>
      <button class="theater-close" id="theater-close-btn">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <div class="theater-main">
        <div class="vinyl-stage">
          <div class="vinyl-disc-wrap">
            <div class="vinyl-outer ${this.spotifyPlayer.isPlaying ? '' : 'paused'}" id="theater-vinyl">
              <div class="vinyl-grooves"></div>
            </div>
            <img class="vinyl-art" src="${t.coverUrl}" alt="${t.title}" />
          </div>
          <div class="theater-meta">
            <div class="theater-track-title">${t.title}</div>
            <div class="theater-track-artist">${t.artist}</div>
            <div class="theater-badges">
              <span class="tag-badge">${t.genre}</span>
              <span class="tag-badge">${t.bpm} BPM</span>
            </div>
          </div>
        </div>
        <div class="theater-lyrics-side">
          <div class="theater-lyrics-label">Lyrics</div>
          <div class="theater-lyrics-scroll" id="theater-lyrics-scroll">
            ${lyrics.length > 0
              ? lyrics.map((l, i) => `
                  <div class="theater-lyric ${l.text === '♪' ? 'lyric-instrumental' : ''}"
                       data-ts="${l.time}" data-idx="${i}" id="theater-lyric-${i}">
                    ${l.text}
                  </div>`).join('')
              : '<div style="color:var(--text-muted);font-size:18px;font-weight:600">No lyrics for this track.</div>'
            }
          </div>
        </div>
      </div>

      <div class="theater-controls">
        <div class="theater-scrub-row">
          <span class="theater-time" id="theater-cur">0:00</span>
          <div class="theater-progress" id="theater-progress">
            <div class="theater-progress-fill" id="theater-fill"></div>
          </div>
          <span class="theater-time" id="theater-dur">${this._formatTime(t.duration)}</span>
        </div>
        <div class="theater-btns-row">
          <button class="theater-ctrl ${this.spotifyPlayer.shuffleMode !== 'off' ? 'active' : ''}" id="theater-shuffle">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
          </button>
          <button class="theater-ctrl" id="theater-prev">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M6 6h2v12H6zm3.5 6L20 18V6z"/></svg>
          </button>
          <button class="theater-main-play" id="theater-play">
            <svg id="theater-icon-play" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="28" height="28" ${this.spotifyPlayer.isPlaying ? 'style="display:none"' : ''}><path d="M8 5v14l11-7z"/></svg>
            <svg id="theater-icon-pause" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="28" height="28" ${this.spotifyPlayer.isPlaying ? '' : 'style="display:none"'}><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <button class="theater-ctrl" id="theater-next">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
          <button class="theater-ctrl" id="theater-close-btn2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
          </button>
        </div>
      </div>
    `;

    this.theaterEl.classList.add('active');

    // Theater controls
    const closeTheater = () => this.theaterEl.classList.remove('active');
    document.getElementById('theater-close-btn')?.addEventListener('click', closeTheater);
    document.getElementById('theater-close-btn2')?.addEventListener('click', closeTheater);
    document.getElementById('theater-play')?.addEventListener('click', () => this.spotifyPlayer.togglePlayPause());
    document.getElementById('theater-prev')?.addEventListener('click', () => this.spotifyPlayer.playPrev());
    document.getElementById('theater-next')?.addEventListener('click', () => this.spotifyPlayer.playNext());

    // Theater scrubber
    document.getElementById('theater-progress')?.addEventListener('click', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct  = (e.clientX - rect.left) / rect.width;
      const dur  = this.spotifyPlayer.audio?.duration || t.duration;
      this.spotifyPlayer.seekTo(pct * dur);
    });

    // Theater time/lyric sync
    const theaterTimeHandler = ({ currentTime, duration }) => {
      const cur  = document.getElementById('theater-cur');
      const fill = document.getElementById('theater-fill');
      if (cur)  cur.textContent  = this._formatTime(currentTime);
      if (fill && duration > 0) fill.style.width = `${(currentTime / duration) * 100}%`;

      // sync lyrics
      const lyricEls = this.theaterEl.querySelectorAll('.theater-lyric[data-ts]');
      let activeIdx = -1;
      lyricEls.forEach((el, i) => {
        if (currentTime >= parseFloat(el.dataset.ts)) activeIdx = i;
      });
      lyricEls.forEach((el, i) => {
        el.classList.toggle('active', i === activeIdx);
        el.classList.toggle('past',   i < activeIdx);
      });
      if (activeIdx >= 0 && lyricEls[activeIdx]) {
        lyricEls[activeIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };
    this.spotifyPlayer.on('timeupdate', theaterTimeHandler);

    // Play state sync in theater
    this.spotifyPlayer.on('playstate', ({ isPlaying }) => {
      const vinyl   = document.getElementById('theater-vinyl');
      const playI   = document.getElementById('theater-icon-play');
      const pauseI  = document.getElementById('theater-icon-pause');
      if (vinyl)  vinyl.classList.toggle('paused', !isPlaying);
      if (playI)  playI.style.display  = isPlaying ? 'none' : 'block';
      if (pauseI) pauseI.style.display = isPlaying ? 'block' : 'none';
    });

    // Lyric click-to-seek
    this.theaterEl.querySelectorAll('.theater-lyric[data-ts]').forEach(el => {
      el.addEventListener('click', () => this.spotifyPlayer.seekTo(parseFloat(el.dataset.ts)));
    });

    // ESC to close
    const escHandler = (e) => { if (e.key === 'Escape') { closeTheater(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);
  }

  /* ── Sidebar Library ─────────────────────────────────────────────────────── */
  _renderSidebarLibrary() {
    if (!this.sidebarList) return;
    const custom    = StorageService.getCustomPlaylists();
    const allPls    = [...DEFAULT_PLAYLISTS, ...custom];
    const currentId = this.spotifyPlayer.currentTrack?.id;
    const likedIds  = StorageService.getLikedTrackIds();

    this.sidebarList.innerHTML = `
      <!-- Liked Songs item -->
      <div class="library-item ${this.currentView === 'liked' ? 'active' : ''}" data-nav="liked">
        <div class="library-item-thumb" style="background:linear-gradient(135deg,#7928CA,#4338CA);display:flex;align-items:center;justify-content:center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="22" height="22"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </div>
        <div class="library-item-info">
          <div class="library-item-name">Liked Songs</div>
          <div class="library-item-meta">Playlist • ${likedIds.size} songs</div>
        </div>
      </div>

      <!-- Playlists -->
      ${allPls.map(pl => {
        const isActive = this.currentView === 'playlist' && this.selectedPlaylistId === pl.id;
        const tracksInPl = pl.trackIds?.map(id => this.catalog.find(t => t.id === id)).filter(Boolean) || [];
        const isNowPlaying = tracksInPl.some(t => t.id === currentId);
        return `
          <div class="library-item ${isActive ? 'active' : ''}" data-nav="playlist" data-id="${pl.id}">
            <img class="library-item-thumb" src="${pl.coverUrl}" alt="${pl.title}" />
            <div class="library-item-info">
              <div class="library-item-name">${pl.title}</div>
              <div class="library-item-meta">Playlist • ${pl.trackIds?.length || 0} songs</div>
            </div>
            ${isNowPlaying ? '<div class="now-playing-dot"></div>' : ''}
          </div>
        `;
      }).join('')}
    `;

    // Bind clicks
    this.sidebarList.querySelectorAll('[data-nav]').forEach(item => {
      item.addEventListener('click', () => {
        const nav = item.dataset.nav;
        const id  = item.dataset.id || null;
        this.navigate(nav, id);
      });
    });
  }

  /* ── Global Events ────────────────────────────────────────────────────────── */
  _bindGlobalEvents() {
    // Discovery dial
    this.dialSlider?.addEventListener('input', (e) => {
      this.discoveryDial = parseInt(e.target.value, 10);
      StorageService.saveDiscoveryDial(this.discoveryDial);
      this._updateDiscoveryDialUI();
      if (this.currentView === 'home') this.renderHome();
    });

    // Live search
    this.omnibox?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim();
      if (this.searchQuery.length > 0) {
        this.currentView = 'search';
        this.renderSearchResults();
      } else {
        this.navigate('home', null, true);
      }
    });

    // Back / Forward nav
    document.getElementById('btn-nav-back')?.addEventListener('click', () => {
      if (this._navHistory.length < 2) return;
      this._navFuture.push(this._navHistory.pop());
      const prev = this._navHistory[this._navHistory.length - 1];
      this._navigateDirect(prev.view, prev.param);
    });

    document.getElementById('btn-nav-forward')?.addEventListener('click', () => {
      if (!this._navFuture.length) return;
      const next = this._navFuture.pop();
      this.navigate(next.view, next.param, true);
    });

    // Create playlist modal
    const modal       = document.getElementById('create-playlist-modal');
    const openModal   = () => modal?.classList.add('active');
    const closeModal  = () => modal?.classList.remove('active');

    document.getElementById('btn-create-playlist')?.addEventListener('click', openModal);
    document.getElementById('modal-close-btn')?.addEventListener('click',  closeModal);
    document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);

    document.getElementById('modal-save-btn')?.addEventListener('click', () => {
      const nameInput = document.getElementById('playlist-name-input');
      const descInput = document.getElementById('playlist-desc-input');
      const title = nameInput?.value.trim();
      const desc  = descInput?.value.trim();
      if (title) {
        const newPl = StorageService.createPlaylist(title, desc);
        closeModal();
        if (nameInput) nameInput.value = '';
        if (descInput) descInput.value = '';
        this._renderSidebarLibrary();
        this.showToast(`Playlist "${newPl.title}" created!`);
        this.navigate('playlist', newPl.id);
      }
    });

    // Focus mode toggle (Music Only)
    document.getElementById('btn-focus-mode')?.addEventListener('click', () => {
      this.focusMode = this.focusMode === 'music' ? 'all' : 'music';
      StorageService.saveFocusMode(this.focusMode);
      this._updateFocusModeUI();
      if (this.currentView === 'home') this.renderHome();
      this.showToast(this.focusMode === 'music' ? 'Focus Mode ON: Music Only (Podcasts & Audiobooks hidden)' : 'Focus Mode OFF: All media types enabled');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ') { e.preventDefault(); this.spotifyPlayer.togglePlayPause(); }
      if (e.key === 'ArrowRight' && e.altKey) this.spotifyPlayer.playNext();
      if (e.key === 'ArrowLeft'  && e.altKey) this.spotifyPlayer.playPrev();
    });
  }

  /* ── Focus Mode UI ─────────────────────────────────────────────────────────── */
  _updateFocusModeUI() {
    const btn = document.getElementById('btn-focus-mode');
    if (!btn) return;
    const isMusic = this.focusMode === 'music';
    btn.classList.toggle('active', isMusic);
    const label = btn.querySelector('.focus-mode-label');
    if (label) label.textContent = isMusic ? 'Music Only' : 'All Media';
  }

  /* ── Explainability Modal (Why am I seeing this?) ──────────────────────────── */
  _bindExplainModal() {
    const modal = document.getElementById('explain-rec-modal');
    const closeBtn = document.getElementById('explain-close-btn');
    const notInterestedBtn = document.getElementById('explain-not-interested-btn');
    const playBtn = document.getElementById('explain-play-btn');

    closeBtn?.addEventListener('click', () => modal?.classList.remove('active'));
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });

    playBtn?.addEventListener('click', () => {
      if (this.activeExplainTrack) {
        modal?.classList.remove('active');
        this.spotifyPlayer.playTrack(this.activeExplainTrack, this.catalog);
      }
    });

    notInterestedBtn?.addEventListener('click', () => {
      if (this.activeExplainTrack) {
        modal?.classList.remove('active');
        const trackTitle = this.activeExplainTrack.title;
        this.showToast(`Feedback noted: excluded "${trackTitle}" from recommendations`, {
          undoAction: () => {
            this.showToast(`Restored recommendation weighting for "${trackTitle}"`);
          }
        });
      }
    });
  }

  _openExplainModal(trackId) {
    const modal = document.getElementById('explain-rec-modal');
    const body  = document.getElementById('explain-body');
    const track = this.catalog.find(t => t.id === trackId);
    if (!modal || !body || !track) return;
    this.activeExplainTrack = track;

    const energyScore   = Math.round((track.vector?.energy || 0.7) * 100);
    const valenceScore  = Math.round((track.vector?.valence || 0.65) * 100);
    const curTrack      = this.spotifyPlayer.currentTrack || this.catalog[0];
    const bpmDiff       = Math.abs((track.bpm || 115) - (curTrack.bpm || 115));
    const dialMode      = this.discoveryDial <= 30 ? 'Comfort' : this.discoveryDial <= 70 ? 'Blend' : 'Explorer';

    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:12px;background:var(--bg-surface);border-radius:var(--r-md);border:1px solid var(--border-subtle)">
        <img src="${track.coverUrl}" alt="${track.title}" onerror="this.onerror=null;this.src='/covers/night-owl.jpg'" style="width:52px;height:52px;border-radius:var(--r-xs);object-fit:cover" />
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:700">${track.title}</div>
          <div style="font-size:13px;color:var(--text-muted)">${track.artist} • ${track.genre}</div>
        </div>
      </div>

      <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px">
        <strong style="color:#fff">Recommendation logic:</strong> Matched via localized audio vector similarity with your listening history and "${curTrack.title}" (${curTrack.artist}).
      </div>

      <div class="explain-match-grid">
        <div class="explain-match-card">
          <div class="explain-match-label">Energy Resonance</div>
          <div class="explain-match-value">${energyScore}%</div>
          <div class="explain-bar-track"><div class="explain-bar-fill" style="width:${energyScore}%"></div></div>
        </div>
        <div class="explain-match-card">
          <div class="explain-match-label">Mood / Valence Match</div>
          <div class="explain-match-value">${valenceScore}%</div>
          <div class="explain-bar-track"><div class="explain-bar-fill" style="width:${valenceScore}%"></div></div>
        </div>
        <div class="explain-match-card">
          <div class="explain-match-label">BPM Proximity</div>
          <div class="explain-match-value">±${bpmDiff} BPM (${track.bpm} BPM)</div>
          <div class="explain-bar-track"><div class="explain-bar-fill" style="width:${Math.max(15, 100 - bpmDiff * 2)}%"></div></div>
        </div>
        <div class="explain-match-card">
          <div class="explain-match-label">Discovery Dial Factor</div>
          <div class="explain-match-value">${this.discoveryDial}% (${dialMode})</div>
          <div class="explain-bar-track"><div class="explain-bar-fill" style="width:${this.discoveryDial}%"></div></div>
        </div>
      </div>

      <p style="font-size:12px;color:var(--text-muted);line-height:1.4">
        Zero surveillance or sponsored feed manipulation. Computed privately on your browser via Creative Commons open audio vectors.
      </p>
    `;

    modal.classList.add('active');
  }

  /* ── Customize Sections Modal ────────────────────────────────────────────── */
  _bindCustomizeSectionsModal() {
    const modal = document.getElementById('customize-sections-modal');
    const closeBtn = document.getElementById('sections-close-btn');
    const saveBtn = document.getElementById('sections-save-btn');
    const resetBtn = document.getElementById('sections-reset-btn');

    closeBtn?.addEventListener('click', () => modal?.classList.remove('active'));
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });

    saveBtn?.addEventListener('click', () => {
      modal?.classList.remove('active');
      if (this.currentView === 'home') this.renderHome();
      this.showToast('Home feed customized');
    });

    resetBtn?.addEventListener('click', () => {
      StorageService.unhideAllSections();
      StorageService.saveSectionOrder('my-music', null);
      StorageService.saveSectionOrder('discover', null);
      modal?.classList.remove('active');
      if (this.currentView === 'home') this.renderHome();
      this.showToast('Restored default section layout');
    });
  }

  _openCustomizeSectionsModal() {
    const modal = document.getElementById('customize-sections-modal');
    const list  = document.getElementById('sections-manage-list');
    if (!modal || !list) return;

    const allSections = this.homeMode === 'my-music'
      ? [
          { id: 'section-my-quick',     name: 'Quick Access & Pinned Songs' },
          { id: 'section-my-recent',    name: 'Recently Played Tracks' },
          { id: 'section-my-playlists', name: 'Your Playlists & Mixes' },
          { id: 'section-my-artists',   name: 'Your Followed Artists' }
        ]
      : [
          { id: 'section-disc-recs',    name: 'AI Recommended For You' },
          { id: 'section-disc-radar',   name: 'Discovery Radar (Sonic Explorer)' },
          { id: 'section-disc-artists', name: 'Popular Artists Spotlight' },
          { id: 'section-disc-moods',   name: 'Atmosphere & Mood Mixes' },
          { id: 'section-disc-genres',  name: 'Explore All By Genre' }
        ];

    const currentOrder = StorageService.getSectionOrder(this.homeMode) || allSections.map(s => s.id);
    const hiddenSet = StorageService.getHiddenSections();

    // Sort allSections according to currentOrder
    const sorted = [...allSections].sort((a, b) => {
      const idxA = currentOrder.indexOf(a.id);
      const idxB = currentOrder.indexOf(b.id);
      return (idxA >= 0 ? idxA : 99) - (idxB >= 0 ? idxB : 99);
    });

    list.innerHTML = sorted.map((sec, idx) => {
      const isHidden = hiddenSet.has(sec.id);
      return `
        <div class="section-manage-row ${isHidden ? 'hidden-section' : ''}" data-sec-id="${sec.id}">
          <div class="section-manage-info">
            <span style="font-size:16px;color:${isHidden ? 'var(--text-muted)' : 'var(--brand-green)'}">${isHidden ? '✕' : '✓'}</span>
            <div>
              <div class="section-manage-name">${sec.name}</div>
              <div style="font-size:11px;color:var(--text-muted)">${isHidden ? 'Hidden from feed' : 'Visible on feed'}</div>
            </div>
          </div>
          <div class="section-manage-actions">
            ${idx > 0 ? `<button class="btn-section-ctrl" data-reorder="up" data-idx="${idx}" title="Move up">▲</button>` : ''}
            ${idx < sorted.length - 1 ? `<button class="btn-section-ctrl" data-reorder="down" data-idx="${idx}" title="Move down">▼</button>` : ''}
            <button class="btn-section-ctrl" data-toggle-hide="${sec.id}" style="font-size:12px;width:auto;padding:0 10px;border-radius:var(--r-pill)" title="${isHidden ? 'Show section' : 'Hide section'}">
              ${isHidden ? 'Unhide' : 'Hide'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Reorder handlers
    list.querySelectorAll('[data-reorder]').forEach(btn => {
      btn.addEventListener('click', () => {
        const fromIdx = parseInt(btn.dataset.idx, 10);
        const toIdx = btn.dataset.reorder === 'up' ? fromIdx - 1 : fromIdx + 1;
        const newOrder = sorted.map(s => s.id);
        const [moved] = newOrder.splice(fromIdx, 1);
        newOrder.splice(toIdx, 0, moved);
        StorageService.saveSectionOrder(this.homeMode, newOrder);
        this._openCustomizeSectionsModal();
      });
    });

    // Toggle hide handlers
    list.querySelectorAll('[data-toggle-hide]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.toggleHide;
        StorageService.toggleHideSection(id);
        this._openCustomizeSectionsModal();
      });
    });

    modal.classList.add('active');
  }

  /* ── Navigation ───────────────────────────────────────────────────────────── */
  navigate(view, param = null, skipHistory = false) {
    if (!skipHistory) {
      this._navFuture = [];
    }
    this._navHistory.push({ view, param });
    if (this._navHistory.length > 50) this._navHistory.shift();
    this._navigateDirect(view, param);
    this._updateNavArrows();
  }

  _navigateDirect(view, param) {
    this.currentView        = view;
    this.selectedPlaylistId = param;
    this._renderSidebarLibrary();
    this.renderCurrentView();
  }

  _updateNavArrows() {
    const backBtn    = document.getElementById('btn-nav-back');
    const forwardBtn = document.getElementById('btn-nav-forward');
    if (backBtn)    backBtn.disabled    = this._navHistory.length < 2;
    if (forwardBtn) forwardBtn.disabled = this._navFuture.length === 0;
  }

  /* ── View Routing ─────────────────────────────────────────────────────────── */
  renderCurrentView() {
    if (!this.stageContent) return;
    switch (this.currentView) {
      case 'home':     this.renderHome();     break;
      case 'radar':    this.renderRadar();    break;
      case 'library':  this.renderLibrary();  break;
      case 'liked':    this.renderLiked();    break;
      case 'playlist': this.renderPlaylist(this.selectedPlaylistId); break;
      case 'search':   this.renderSearchResults(); break;
      default:         this.renderHome();
    }
    this._highlightActiveRow();
  }

  /* ── HOME ─────────────────────────────────────────────────────────────────── */
  renderHome() {
    this.stageContent.innerHTML = `
      <!-- Gradient Hero Header -->
      <div class="home-hero">
        <div class="hero-bg" style="background-image: url('https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=1200')"></div>
        <div class="hero-content">
          <div class="hero-tag">Welcome to AuraStream via Spotify</div>
          <h1 class="hero-title">Your Personalized Music</h1>
          <p class="hero-desc">Discover new sounds and enjoy your Spotify Premium playlists.</p>
          <div class="hero-actions">
            <button class="btn-play-large" id="btn-hero-play">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <button class="btn-secondary" id="btn-hero-explore">Browse Top Tracks</button>
          </div>
        </div>
      </div>

      <div class="content-body">
        <div class="section-block">
          <div class="section-block-header">
            <h2 class="section-block-title">Your Playlists</h2>
          </div>
          <div class="cards-row" id="spotify-playlists-grid">
            <!-- Populated dynamically -->
            <div style="padding:20px; color:var(--text-muted)">Loading playlists...</div>
          </div>
        </div>
        
        <div class="section-block">
          <div class="section-block-header">
            <h2 class="section-block-title">Recently Played</h2>
          </div>
          <div class="cards-row" id="spotify-recent-grid">
            <!-- Populated dynamically -->
            <div style="padding:20px; color:var(--text-muted)">Loading recent tracks...</div>
          </div>
        </div>
      </div>
    `;

    // Fetch and render Spotify data
    setTimeout(async () => {
      try {
        const playlists = await SpotifyAPI.getUserPlaylists();
        const plGrid = document.getElementById('spotify-playlists-grid');
        if (plGrid && playlists && playlists.items) {
          plGrid.innerHTML = playlists.items.map(p => {
            if (!p) return '';
            const img = p.images && p.images.length > 0 ? p.images[0].url : '/covers/playlist-radar.svg';
            return `
              <div class="media-card" data-playlist-uri="${p.uri}">
                <div class="card-art-wrapper">
                  <img class="card-art-img" src="${img}" alt="${p.name}" loading="lazy" />
                  <button class="card-play-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
                </div>
                <div class="card-title">${p.name}</div>
                <div class="card-subtitle">By ${p.owner?.display_name || 'Spotify'}</div>
              </div>
            `;
          }).join('');
          
          plGrid.querySelectorAll('.media-card').forEach(card => {
            card.addEventListener('click', () => {
               this.spotifyPlayer.playContext(card.dataset.playlistUri);
            });
          });
        }
        
        const recent = await SpotifyAPI.getRecentlyPlayed();
        const recentGrid = document.getElementById('spotify-recent-grid');
        if (recentGrid && recent && recent.items) {
          // Keep unique tracks
          const uniqueItems = [];
          const seenIds = new Set();
          for (const item of recent.items) {
            if (item && item.track && !seenIds.has(item.track.id)) {
               seenIds.add(item.track.id);
               uniqueItems.push(item);
            }
          }
          
          recentGrid.innerHTML = uniqueItems.slice(0, 10).map(item => {
            const t = item.track;
            const img = t.album.images[0]?.url || '/covers/night-owl.jpg';
            return `
              <div class="media-card" data-track-uri="${t.uri}">
                <div class="card-art-wrapper">
                  <img class="card-art-img" src="${img}" alt="${t.name}" loading="lazy" />
                  <button class="card-play-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
                </div>
                <div class="card-title">${t.name}</div>
                <div class="card-subtitle">${t.artists.map(a => a.name).join(', ')}</div>
              </div>
            `;
          }).join('');
          
          recentGrid.querySelectorAll('.media-card').forEach(card => {
            card.addEventListener('click', () => {
               this.spotifyPlayer.play(card.dataset.trackUri);
            });
          });
        }
      } catch (err) {
        console.error('Error loading Spotify home data:', err);
      }
    }, 100);
  }

  /* ── RADAR ────────────────────────────────────────────────────────────────── */
  renderRadar() {
    const cur  = this.spotifyPlayer.currentTrack || this.catalog[0];
    const recs = RecommendationEngine.getRecommendationsForTrack(cur, this.catalog, this.discoveryDial, 12);

    this.stageContent.innerHTML = `
      <div class="content-gradient-header" style="background:linear-gradient(180deg,${cur.color}99 0%,var(--bg-surface) 100%)">
        <div class="playlist-header">
          <img class="playlist-header-art" src="${cur.coverUrl}" alt="${cur.title}" />
          <div class="playlist-header-info">
            <div class="playlist-type-label">Discovery Radar</div>
            <h1 class="playlist-header-title">Based on: ${cur.title}</h1>
            <div class="playlist-header-meta">
              <span>${cur.artist}</span>
              <span class="dot">•</span>
              <span>${cur.genre}</span>
              <span class="dot">•</span>
              <span>${cur.bpm} BPM</span>
            </div>
          </div>
        </div>
        <div class="playlist-controls-bar">
          <button class="btn-big-play" id="btn-radar-play">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
      </div>
      <div class="content-body">
        <div class="section-block">
          <div class="section-block-header">
            <h2 class="section-block-title">Recommended tracks</h2>
            <span class="text-muted" style="font-size:13px">Dial: ${this.discoveryDial}% (${this.discoveryDial <= 30 ? 'Comfort' : this.discoveryDial <= 70 ? 'Blend' : 'Explorer'})</span>
          </div>
          <div class="cards-row">
            ${recs.map(item => `
              <div class="media-card" data-play-track="${item.track.id}">
                <div class="card-art-wrapper">
                  <img class="card-art-img" src="${item.track.coverUrl}" alt="${item.track.title}" />
                  <button class="card-play-btn" data-play-track="${item.track.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                </div>
                <div class="card-title">${item.track.title}</div>
                <div class="card-subtitle">${item.track.artist}</div>
                <div class="card-ai-reason">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  ${item.reason}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-radar-play')?.addEventListener('click', () => {
      const queue = [cur, ...recs.map(r => r.track)];
      this.spotifyPlayer.playTrack(cur, queue);
      this.showToast(`Playing Discovery Radar (${queue.length} tracks)`);
    });

    this.stageContent.querySelectorAll('[data-play-track]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const t = this.catalog.find(tr => tr.id === el.dataset.playTrack);
        if (t) this.spotifyPlayer.playTrack(t, [cur, ...recs.map(r => r.track)]);
      });
    });
  }

  /* ── LIBRARY ──────────────────────────────────────────────────────────────── */
  renderLibrary() {
    this.stageContent.innerHTML = `
      <div class="content-gradient-header" style="background:linear-gradient(180deg,#1a1a2e 0%,var(--bg-surface) 100%)">
        <h1 class="home-greeting">Your Library</h1>
      </div>
      <div class="content-body">
        <div class="section-block">
          <div class="section-block-header">
            <h2 class="section-block-title">Playlists</h2>
          </div>
          <div class="cards-row" id="spotify-library-grid">
            <div style="padding:20px; color:var(--text-muted)">Loading your library...</div>
          </div>
        </div>
      </div>
    `;

    setTimeout(async () => {
      try {
        const playlists = await SpotifyAPI.getUserPlaylists();
        const grid = document.getElementById('spotify-library-grid');
        if (grid && playlists && playlists.items) {
          let html = `
            <div class="media-card" id="card-liked" style="cursor:pointer">
              <div class="card-art-wrapper" style="background:linear-gradient(135deg,#7928CA,#4338CA);border-radius:var(--r-sm);display:flex;align-items:center;justify-content:center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="60" height="60"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </div>
              <div class="card-title">Liked Songs</div>
              <div class="card-subtitle">Your saved tracks</div>
            </div>
          `;
          
          html += playlists.items.map(p => {
            if (!p) return '';
            const img = p.images && p.images.length > 0 ? p.images[0].url : '/covers/playlist-radar.svg';
            return `
              <div class="media-card" data-playlist-uri="${p.uri}" data-playlist-id="${p.id}">
                <div class="card-art-wrapper">
                  <img class="card-art-img" src="${img}" alt="${p.name}" loading="lazy" />
                  <button class="card-play-btn" data-play-uri="${p.uri}">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                </div>
                <div class="card-title">${p.name}</div>
                <div class="card-subtitle">By ${p.owner?.display_name || 'Spotify'}</div>
              </div>
            `;
          }).join('');
          
          grid.innerHTML = html;
          
          document.getElementById('card-liked')?.addEventListener('click', () => this.navigate('liked'));
          
          grid.querySelectorAll('.media-card[data-playlist-id]').forEach(card => {
            card.addEventListener('click', (e) => {
              e.stopPropagation();
              if (e.target.closest('.card-play-btn')) {
                 this.spotifyPlayer.playContext(card.dataset.playlistUri);
              } else {
                 this.navigate('playlist', card.dataset.playlistId);
              }
            });
          });
        }
      } catch (err) {
        console.error('Error loading library:', err);
      }
    }, 100);
  }

  /* ── LIKED SONGS ──────────────────────────────────────────────────────────── */
  renderLiked() {
    this.stageContent.innerHTML = `
      <div class="content-gradient-header" style="background:linear-gradient(180deg,#4c0080 0%,var(--bg-surface) 100%)">
        <div class="playlist-header">
          <div style="width:200px;height:200px;flex-shrink:0;border-radius:var(--r-sm);background:linear-gradient(135deg,#7928CA,#4338CA);display:flex;align-items:center;justify-content:center;box-shadow:0 16px 40px rgba(0,0,0,.6)">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="80" height="80"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </div>
          <div class="playlist-header-info">
            <div class="playlist-type-label">Playlist</div>
            <h1 class="playlist-header-title">Liked Songs</h1>
            <div class="playlist-header-meta" id="spotify-liked-meta">
              <span>Loading...</span>
            </div>
          </div>
        </div>
        <div class="playlist-controls-bar">
          <button class="btn-big-play" id="btn-liked-play">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
      </div>
      <div class="content-body" id="spotify-liked-body">
         <div style="padding:20px; color:var(--text-muted)">Loading your liked tracks...</div>
      </div>
    `;

    setTimeout(async () => {
      try {
        const data = await SpotifyAPI.getLikedTracks();
        if (data && data.items) {
          const meta = document.getElementById('spotify-liked-meta');
          if (meta) meta.innerHTML = `<span>${data.total} songs</span>`;
          
          const body = document.getElementById('spotify-liked-body');
          if (body) {
            body.innerHTML = `
              <div class="tracks-table">
                <div class="tracks-header">
                  <div class="th-col-hash">#</div>
                  <div class="th-col-title">Title</div>
                  <div class="th-col-album">Album</div>
                  <div class="th-col-time">⏱</div>
                </div>
                <div class="tracks-list">
                  ${data.items.map((item, i) => {
                    const t = item.track;
                    const img = t.album.images[0]?.url || '/covers/default.jpg';
                    const dur = Math.floor(t.duration_ms / 1000);
                    const mins = Math.floor(dur / 60);
                    const secs = String(dur % 60).padStart(2, '0');
                    return `
                      <div class="track-row" data-track-uri="\${t.uri}">
                        <div class="td-col-hash">\${i + 1}</div>
                        <div class="td-col-title">
                          <img class="td-thumb" src="\${img}" alt="" />
                          <div class="td-title-info">
                            <div class="td-title">\${t.name}</div>
                            <div class="td-artist">\${t.artists.map(a=>a.name).join(', ')}</div>
                          </div>
                        </div>
                        <div class="td-col-album">\${t.album.name}</div>
                        <div class="td-col-time">\${mins}:\${secs}</div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
            
            body.querySelectorAll('.track-row').forEach(row => {
              row.addEventListener('click', () => {
                 this.spotifyPlayer.play(row.dataset.trackUri);
              });
            });
            
            document.getElementById('btn-liked-play')?.addEventListener('click', () => {
               if (data.items.length > 0) {
                 // For play context, user's saved tracks don't have a direct URI.
                 this.spotifyPlayer.play(data.items[0].track.uri);
               }
            });
          }
        }
      } catch (err) {
        console.error('Error loading liked tracks:', err);
      }
    }, 100);
  }

  /* ── PLAYLIST VIEW ────────────────────────────────────────────────────────── */
  renderPlaylist(playlistId) {
    this.stageContent.innerHTML = `
      <div class="content-gradient-header" style="background:linear-gradient(180deg,#3B82F699 0%,var(--bg-surface) 100%)">
        <div class="playlist-header">
           <div style="width:200px;height:200px;background:#333;border-radius:var(--r-sm)"></div>
           <div class="playlist-header-info">
             <div class="playlist-type-label">Playlist</div>
             <h1 class="playlist-header-title">Loading...</h1>
           </div>
        </div>
      </div>
      <div class="content-body" id="spotify-pl-body">
         <div style="padding:20px; color:var(--text-muted)">Loading playlist tracks...</div>
      </div>
    `;

    setTimeout(async () => {
      try {
        const pl = await SpotifyAPI.getPlaylist(playlistId);
        if (pl) {
           const img = pl.images && pl.images.length > 0 ? pl.images[0].url : '/covers/default.jpg';
           const html = `
             <div class="content-gradient-header" style="background:linear-gradient(180deg,#3B82F699 0%,var(--bg-surface) 100%)">
               <div class="playlist-header">
                 <img class="playlist-header-art" src="${img}" alt="${pl.name}" />
                 <div class="playlist-header-info">
                   <div class="playlist-type-label">Playlist</div>
                   <h1 class="playlist-header-title">${pl.name}</h1>
                   <div class="playlist-header-meta">
                     ${pl.description ? `<span>${pl.description}</span><span class="dot">•</span>` : ''}
                     <span>${pl.tracks.total} songs</span>
                   </div>
                 </div>
               </div>
               <div class="playlist-controls-bar">
                 <button class="btn-big-play" id="btn-pl-play">
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                 </button>
               </div>
             </div>
             <div class="content-body" id="spotify-pl-body">
               <div class="tracks-table">
                  <div class="tracks-header">
                    <div class="th-col-hash">#</div>
                    <div class="th-col-title">Title</div>
                    <div class="th-col-album">Album</div>
                    <div class="th-col-time">⏱</div>
                  </div>
                  <div class="tracks-list">
                    ${pl.tracks.items.map((item, i) => {
                      if (!item.track) return '';
                      const t = item.track;
                      const tImg = t.album?.images[0]?.url || '/covers/default.jpg';
                      const dur = Math.floor(t.duration_ms / 1000);
                      const mins = Math.floor(dur / 60);
                      const secs = String(dur % 60).padStart(2, '0');
                      return `
                        <div class="track-row" data-track-uri="\${t.uri}">
                          <div class="td-col-hash">\${i + 1}</div>
                          <div class="td-col-title">
                            <img class="td-thumb" src="\${tImg}" alt="" />
                            <div class="td-title-info">
                              <div class="td-title">\${t.name}</div>
                              <div class="td-artist">\${t.artists?.map(a=>a.name).join(', ')}</div>
                            </div>
                          </div>
                          <div class="td-col-album">\${t.album?.name}</div>
                          <div class="td-col-time">\${mins}:\${secs}</div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
             </div>
           `;
           this.stageContent.innerHTML = html;
           
           this.stageContent.querySelectorAll('.track-row').forEach(row => {
             row.addEventListener('click', () => {
                this.spotifyPlayer.play(row.dataset.trackUri);
             });
           });
           
           document.getElementById('btn-pl-play')?.addEventListener('click', () => {
              this.spotifyPlayer.playContext(pl.uri);
           });
        }
      } catch (err) {
        console.error('Error loading playlist:', err);
      }
    }, 100);
  }

  /* ── SEARCH ───────────────────────────────────────────────────────────────── */
  renderSearchResults() {
    const q = this.searchQuery;
    if (!q) { this.renderHome(); return; }

    this.stageContent.innerHTML = `
      <div class="content-gradient-header" style="background:linear-gradient(180deg,#2a2a2a 0%,var(--bg-surface) 100%)">
        <h1 class="home-greeting">Search Results: "${q}"</h1>
      </div>
      <div class="content-body" id="spotify-search-body">
        <div style="padding:20px; color:var(--text-muted)">Searching Spotify...</div>
      </div>
    `;
    
    setTimeout(async () => {
      try {
        const results = await SpotifyAPI.search(q);
        const body = document.getElementById('spotify-search-body');
        if (body && results && results.tracks) {
          body.innerHTML = `
            <div class="tracks-table">
              <div class="tracks-header">
                <div class="th-col-title" style="flex:1">Top Track Results</div>
              </div>
              <div class="tracks-list">
                ${results.tracks.items.map(t => {
                  const img = t.album?.images[0]?.url || '/covers/default.jpg';
                  const dur = Math.floor(t.duration_ms / 1000);
                  const mins = Math.floor(dur / 60);
                  const secs = String(dur % 60).padStart(2, '0');
                  return `
                    <div class="track-row" data-track-uri="\${t.uri}">
                      <div class="td-col-title" style="flex:1">
                        <img class="td-thumb" src="\${img}" alt="" />
                        <div class="td-title-info">
                          <div class="td-title">\${t.name}</div>
                          <div class="td-artist">\${t.artists?.map(a=>a.name).join(', ')}</div>
                        </div>
                      </div>
                      <div class="td-col-album">\${t.album?.name}</div>
                      <div class="td-col-time">\${mins}:\${secs}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
          
          body.querySelectorAll('.track-row').forEach(row => {
            row.addEventListener('click', () => {
               this.spotifyPlayer.play(row.dataset.trackUri);
            });
          });
        }
      } catch (err) {
         console.error('Search error:', err);
      }
    }, 100);
  }

  /* ── Track Table Renderer (Spotify style) ─────────────────────────────────── */
  _renderTracksTable(tracks, playlistContextId = null) {
    const currentId = this.spotifyPlayer.currentTrack?.id;
    const isPlaying = this.spotifyPlayer.isPlaying;
    const likedIds  = StorageService.getLikedTrackIds();

    return `
      <div class="tracks-table-wrap">
        <div class="tracks-table-header">
          <span>#</span>
          <span>Title</span>
          <span>Album / Genre</span>
          <span style="text-align:right">⏱</span>
        </div>
        ${tracks.map((t, idx) => {
          const isCur  = t.id === currentId;
          const isLiked = likedIds.has(t.id);
          return `
            <div class="track-row ${isCur ? 'playing' : ''}" data-track-id="${t.id}" data-index="${idx}">
              <!-- # -->
              <div class="track-num">
                <span class="track-num-text">${idx + 1}</span>
                <div class="track-now-playing-anim">
                  <div class="now-bar"></div><div class="now-bar"></div><div class="now-bar"></div><div class="now-bar"></div>
                </div>
                <span class="track-num-play-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>
                </span>
              </div>
              <!-- Title -->
              <div class="track-info">
                <img class="track-thumb" src="${t.coverUrl}" alt="${t.title}" />
                <div class="track-text">
                  <div class="track-title">${t.title}</div>
                  <div class="track-artist">${t.artist}</div>
                </div>
              </div>
              <!-- Genre -->
              <div class="track-album">${t.genre}</div>
              <!-- Duration + actions -->
              <div class="track-meta-cell">
                <button class="track-like-btn ${isLiked ? 'liked' : ''}" data-action="toggle-like" data-track-id="${t.id}">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </button>
                <span class="track-duration">${this._formatTime(t.duration)}</span>
                <button class="track-more-btn" data-action="add-queue" data-track-id="${t.id}" title="Add to queue">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                </button>
                ${playlistContextId?.startsWith('custom-') ? `
                  <button class="track-more-btn" data-action="remove-from-playlist" data-track-id="${t.id}" data-playlist-id="${playlistContextId}" title="Remove from playlist">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  _bindTableActions(playlistContextId = null) {
    // Row click → play
    this.stageContent.querySelectorAll('.track-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const id  = row.dataset.trackId;
        const track = this.catalog.find(t => t.id === id);
        if (!track) return;
        const rows    = Array.from(this.stageContent.querySelectorAll('.track-row'));
        const context = rows.map(r => this.catalog.find(t => t.id === r.dataset.trackId)).filter(Boolean);
        this.spotifyPlayer.playTrack(track, context);
      });
    });

    // Like toggle
    this.stageContent.querySelectorAll('[data-action="toggle-like"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id      = btn.dataset.trackId;
        const liked   = StorageService.toggleLike(id);
        btn.classList.toggle('liked', liked);
        btn.querySelector('svg')?.setAttribute('fill', liked ? 'currentColor' : 'none');
        if (liked) confetti({ particleCount: 20, spread: 50 });
        this.showToast(liked ? 'Added to Liked Songs' : 'Removed from Liked Songs');
        if (this.spotifyPlayer.currentTrack?.id === id) this._updatePlayerBar(this.spotifyPlayer.currentTrack);
        if (this.currentView === 'liked') this.renderLiked();
      });
    });

    // Add to queue
    this.stageContent.querySelectorAll('[data-action="add-queue"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const track = this.catalog.find(t => t.id === btn.dataset.trackId);
        if (track) {
          this.spotifyPlayer.addToQueue(track);
          this.showToast(`Added "${track.title}" to queue`);
          if (this.activePanelTab === 'queue') this._renderPanelQueue();
        }
      });
    });

    // Remove from playlist
    this.stageContent.querySelectorAll('[data-action="remove-from-playlist"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        StorageService.removeTrackFromPlaylist(btn.dataset.playlistId, btn.dataset.trackId);
        this.showToast('Removed from playlist');
        this.renderPlaylist(btn.dataset.playlistId);
      });
    });
  }

  /* ── Highlight active playing row ─────────────────────────────────────────── */
  _highlightActiveRow() {
    const curId     = this.spotifyPlayer.currentTrack?.id;
    const isPlaying = this.spotifyPlayer.isPlaying;

    document.querySelectorAll('.track-row').forEach(row => {
      const isCur = row.dataset.trackId === curId;
      row.classList.toggle('playing', isCur);

      const numText  = row.querySelector('.track-num-text');
      const anim     = row.querySelector('.track-now-playing-anim');
      if (numText && anim) {
        numText.style.display = (isCur && isPlaying) ? 'none' : 'block';
        anim.style.display    = (isCur && isPlaying) ? 'flex'  : 'none';
      }
    });
  }

  /* ── Toast ────────────────────────────────────────────────────────────────── */
  showToast(message, options = {}) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    let undoHtml = '';
    if (typeof options.undoAction === 'function') {
      undoHtml = `<button class="toast-undo-btn" type="button">Undo</button>`;
    }

    toast.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="color:var(--brand-green); flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>
      <span style="flex:1;">${message}</span>
      ${undoHtml}
    `;

    if (typeof options.undoAction === 'function') {
      const undoBtn = toast.querySelector('.toast-undo-btn');
      if (undoBtn) {
        undoBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          options.undoAction();
          toast.remove();
        });
      }
    }

    stack.appendChild(toast);
    const duration = options.duration || (options.undoAction ? 4500 : 2800);
    setTimeout(() => {
      toast.style.opacity   = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /* ── Helpers ──────────────────────────────────────────────────────────────── */
  _formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new AuraStreamApp());
} else {
  new AuraStreamApp();
}
