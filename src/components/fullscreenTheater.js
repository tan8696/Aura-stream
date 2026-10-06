/**
 * Fullscreen Theater Ambient Mode for AuraStream
 * Features rotating vinyl disc, ambient chromatic aura, synchronized lyrics, and floating controls.
 */

export class FullscreenTheater {
  constructor(overlayElement, audioService) {
    this.overlay = overlayElement;
    this.audioService = audioService;
    this.isOpen = false;
    this.currentLineIdx = -1;

    this.audioService.on('trackchange', () => {
      if (this.isOpen) this.render();
    });
    this.audioService.on('playstate', () => {
      if (this.isOpen) this._updatePlayState();
    });
    this.audioService.on('timeupdate', (data) => {
      if (this.isOpen) this._syncTime(data.currentTime, data.duration);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  open() {
    this.isOpen = true;
    this.overlay.classList.add('active');
    this.render();
  }

  close() {
    this.isOpen = false;
    this.overlay.classList.remove('active');
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  render() {
    if (!this.overlay) return;

    const track = this.audioService.currentTrack;
    if (!track) return;

    const primaryColor = track.color || '#7928CA';
    const accentColor = track.accentColor || '#00F2FE';

    this.overlay.style.setProperty('--theater-color', primaryColor);
    this.overlay.style.setProperty('--theater-accent', accentColor);

    this.overlay.innerHTML = `
      <div class="theater-backdrop" style="background: radial-gradient(circle at 30% 50%, ${primaryColor}33 0%, #080A10 75%);"></div>
      
      <button class="theater-close-btn" id="theater-close" title="Exit Theater Mode (Esc)">
        <i data-lucide="x"></i>
      </button>

      <div class="theater-content">
        <!-- Left: Vinyl & Track Artwork -->
        <div class="theater-left">
          <div class="vinyl-stage">
            <div class="vinyl-disc ${this.audioService.isPlaying ? 'spinning' : 'paused'}">
              <div class="vinyl-grooves"></div>
              <div class="vinyl-center" style="background-image: url('${track.coverUrl}')"></div>
            </div>
            <div class="album-art-card">
              <img src="${track.coverUrl}" alt="${track.title}" class="theater-cover-art" />
            </div>
          </div>

          <div class="theater-meta">
            <h1 class="theater-title">${track.title}</h1>
            <h2 class="theater-artist">${track.artist}</h2>
            <div class="theater-badges">
              <span class="tag-pill">${track.genre}</span>
              <span class="tag-pill">${track.bpm} BPM</span>
              <span class="tag-pill">${track.mood}</span>
            </div>
          </div>
        </div>

        <!-- Right: Synced Lyrics -->
        <div class="theater-right">
          <div class="theater-lyrics-header">
            <h3>Live Synchronized Lyrics</h3>
          </div>
          <div class="theater-lyrics-scroll" id="theater-lyrics-area">
            ${track.lyrics && track.lyrics.length > 0 ? track.lyrics.map((l, idx) => `
              <div class="theater-lyric-line ${l.text.includes('♪') ? 'lyric-instrumental' : ''}" data-index="${idx}" data-time="${l.time}">
                ${l.text}
              </div>
            `).join('') : `
              <div class="empty-hint">
                <i data-lucide="music"></i>
                <p>Instrumental track. Sit back and enjoy the sonic atmosphere.</p>
              </div>
            `}
          </div>
        </div>
      </div>

      <!-- Floating Controls -->
      <div class="theater-controls-bar">
        <div class="theater-scrub-row">
          <span class="time-readout" id="theater-cur-time">0:00</span>
          <div class="theater-progress-track" id="theater-progress">
            <div class="theater-progress-fill" id="theater-progress-fill"></div>
          </div>
          <span class="time-readout" id="theater-dur-time">${this._formatTime(track.duration)}</span>
        </div>

        <div class="theater-btns-row">
          <button class="btn-icon-subtle ${this.audioService.shuffleMode !== 'off' ? 'active text-accent' : ''}" id="theater-shuffle" title="Shuffle">
            <i data-lucide="shuffle"></i>
          </button>
          <button class="btn-icon-subtle" id="theater-prev" title="Previous">
            <i data-lucide="skip-back"></i>
          </button>
          <button class="theater-play-btn" id="theater-play" title="Play / Pause">
            <i data-lucide="${this.audioService.isPlaying ? 'pause' : 'play'}"></i>
          </button>
          <button class="btn-icon-subtle" id="theater-next" title="Next">
            <i data-lucide="skip-forward"></i>
          </button>
          <button class="btn-icon-subtle ${this.audioService.loopMode !== 'off' ? 'active text-accent' : ''}" id="theater-loop" title="Repeat">
            <i data-lucide="repeat"></i>
          </button>
        </div>
      </div>
    `;

    this._bindEvents();
    if (window.lucide) window.lucide.createIcons();
  }

  _bindEvents() {
    const closeBtn = this.overlay.querySelector('#theater-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    const playBtn = this.overlay.querySelector('#theater-play');
    if (playBtn) playBtn.addEventListener('click', () => this.audioService.togglePlayPause());

    const prevBtn = this.overlay.querySelector('#theater-prev');
    if (prevBtn) prevBtn.addEventListener('click', () => this.audioService.playPrev());

    const nextBtn = this.overlay.querySelector('#theater-next');
    if (nextBtn) nextBtn.addEventListener('click', () => this.audioService.playNext());

    const shuffleBtn = this.overlay.querySelector('#theater-shuffle');
    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', () => {
        this.audioService.cycleShuffleMode();
        this.render();
      });
    }

    const loopBtn = this.overlay.querySelector('#theater-loop');
    if (loopBtn) {
      loopBtn.addEventListener('click', () => {
        this.audioService.cycleLoopMode();
        this.render();
      });
    }

    // Progress bar seeking
    const progressBar = this.overlay.querySelector('#theater-progress');
    if (progressBar) {
      progressBar.addEventListener('click', (e) => {
        const rect = progressBar.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const duration = this.audioService.audio.duration || this.audioService.currentTrack.duration;
        this.audioService.seekTo(percent * duration);
      });
    }

    // Lyrics click seeking
    this.overlay.querySelectorAll('.theater-lyric-line').forEach(el => {
      el.addEventListener('click', () => {
        const time = parseFloat(el.getAttribute('data-time'));
        if (Number.isFinite(time)) {
          this.audioService.seekTo(time);
        }
      });
    });
  }

  _updatePlayState() {
    const isPlaying = this.audioService.isPlaying;
    const playBtn = this.overlay.querySelector('#theater-play');
    if (playBtn) {
      playBtn.innerHTML = `<i data-lucide="${isPlaying ? 'pause' : 'play'}"></i>`;
      if (window.lucide) window.lucide.createIcons();
    }

    const vinyl = this.overlay.querySelector('.vinyl-disc');
    if (vinyl) {
      if (isPlaying) {
        vinyl.classList.remove('paused');
        vinyl.classList.add('spinning');
      } else {
        vinyl.classList.remove('spinning');
        vinyl.classList.add('paused');
      }
    }
  }

  _syncTime(currentTime, duration) {
    const curTimeEl = this.overlay.querySelector('#theater-cur-time');
    const durTimeEl = this.overlay.querySelector('#theater-dur-time');
    const fillEl = this.overlay.querySelector('#theater-progress-fill');

    if (curTimeEl) curTimeEl.textContent = this._formatTime(currentTime);
    if (durTimeEl && duration) durTimeEl.textContent = this._formatTime(duration);

    if (fillEl && duration > 0) {
      const pct = (currentTime / duration) * 100;
      fillEl.style.width = `${pct}%`;
    }

    // Sync lyrics
    const track = this.audioService.currentTrack;
    if (!track || !track.lyrics) return;

    let activeIdx = -1;
    for (let i = 0; i < track.lyrics.length; i++) {
      if (currentTime >= track.lyrics[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }

    if (activeIdx !== this.currentLineIdx) {
      this.currentLineIdx = activeIdx;
      const lines = this.overlay.querySelectorAll('.theater-lyric-line');
      const area = this.overlay.querySelector('#theater-lyrics-area');

      lines.forEach((l, idx) => {
        l.classList.remove('active', 'past');
        if (idx === activeIdx) {
          l.classList.add('active');
          if (area) {
            const top = l.offsetTop;
            area.scrollTo({
              top: Math.max(0, top - (area.clientHeight / 2) + 20),
              behavior: 'smooth'
            });
          }
        } else if (idx < activeIdx) {
          l.classList.add('past');
        }
      });
    }
  }

  _formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
}
