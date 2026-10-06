/**
 * Synchronized Lyrics Component for AuraStream
 * Real-time karaoke-style highlighting, smooth autoscroll, and click-to-seek.
 */

export class LyricsDrawer {
  constructor(containerElement, audioService) {
    this.container = containerElement;
    this.audioService = audioService;
    this.currentLineIndex = -1;
    this.userScrolling = false;
    this.scrollTimeout = null;

    this.audioService.on('trackchange', () => this.render());
    this.audioService.on('timeupdate', (data) => this.syncTime(data.currentTime));
  }

  render() {
    if (!this.container) return;

    const track = this.audioService.currentTrack;
    if (!track || !track.lyrics || track.lyrics.length === 0) {
      this.container.innerHTML = `
        <div class="drawer-header">
          <h3 class="drawer-title">Lyrics</h3>
        </div>
        <div class="empty-hint lyrics-empty">
          <i data-lucide="mic-off"></i>
          <p>No lyrics available for this instrumental track.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    this.container.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-title-group">
          <h3 class="drawer-title">Live Lyrics</h3>
          <span class="badge lyrics-synced-badge">
            <span class="pulse-dot"></span> Synced
          </span>
        </div>
        <div class="drawer-actions">
          <span class="text-muted-xs">Click any line to seek</span>
        </div>
      </div>

      <div class="lyrics-scroll-container" id="lyrics-scroll-area">
        <div class="lyrics-list">
          ${track.lyrics.map((line, idx) => {
            const isNote = line.text.includes('♪');
            return `
              <div class="lyric-line ${isNote ? 'lyric-instrumental' : ''}" data-index="${idx}" data-time="${line.time}">
                <span class="lyric-text">${line.text}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    this._bindEvents();
    if (window.lucide) window.lucide.createIcons();
  }

  _bindEvents() {
    const scrollArea = this.container.querySelector('#lyrics-scroll-area');
    if (scrollArea) {
      // Pause autoscroll if user scrolls manually
      scrollArea.addEventListener('wheel', () => {
        this.userScrolling = true;
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
          this.userScrolling = false;
        }, 3500);
      });
    }

    // Click to seek
    this.container.querySelectorAll('.lyric-line').forEach(el => {
      el.addEventListener('click', () => {
        const time = parseFloat(el.getAttribute('data-time'));
        if (Number.isFinite(time)) {
          this.audioService.seekTo(time);
        }
      });
    });
  }

  syncTime(currentTime) {
    const track = this.audioService.currentTrack;
    if (!track || !track.lyrics) return;

    const lyrics = track.lyrics;
    let activeIdx = -1;

    for (let i = 0; i < lyrics.length; i++) {
      if (currentTime >= lyrics[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }

    if (activeIdx !== this.currentLineIndex) {
      this.currentLineIndex = activeIdx;
      this._updateVisualHighlight(activeIdx);
    }
  }

  _updateVisualHighlight(activeIdx) {
    const lines = this.container.querySelectorAll('.lyric-line');
    const scrollArea = this.container.querySelector('#lyrics-scroll-area');

    lines.forEach((line, idx) => {
      line.classList.remove('active', 'past', 'future');
      if (idx === activeIdx) {
        line.classList.add('active');
        if (!this.userScrolling && scrollArea) {
          const lineTop = line.offsetTop;
          const containerHeight = scrollArea.clientHeight;
          scrollArea.scrollTo({
            top: Math.max(0, lineTop - (containerHeight / 2) + 20),
            behavior: 'smooth'
          });
        }
      } else if (idx < activeIdx) {
        line.classList.add('past');
      } else {
        line.classList.add('future');
      }
    });
  }
}
