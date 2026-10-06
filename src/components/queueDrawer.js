/**
 * Queue Drawer Component
 * Solves Spotify's queue frustrations: intuitive drag/reorder, clear queue,
 * and one-click "Save Queue as Playlist".
 */

export class QueueDrawer {
  constructor(containerElement, audioService, onSavePlaylist) {
    this.container = containerElement;
    this.audioService = audioService;
    this.onSavePlaylist = onSavePlaylist;

    this.audioService.on('queuechange', () => this.render());
    this.audioService.on('trackchange', () => this.render());
  }

  render() {
    if (!this.container) return;

    const queue = this.audioService.queue;
    const currentTrack = this.audioService.currentTrack;
    const queueIndex = this.audioService.queueIndex;

    const upNext = queue.slice(queueIndex + 1);

    this.container.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-title-group">
          <h3 class="drawer-title">Play Queue</h3>
          <span class="badge queue-badge">${queue.length} Tracks</span>
        </div>
        <div class="drawer-actions">
          <button class="btn-ghost btn-sm" id="btn-save-queue" title="Save this queue as a custom playlist">
            <i data-lucide="plus-circle"></i> Save as Playlist
          </button>
          <button class="btn-ghost btn-sm text-danger" id="btn-clear-queue" title="Clear upcoming tracks">
            <i data-lucide="trash-2"></i> Clear
          </button>
        </div>
      </div>

      <div class="drawer-body">
        <!-- Now Playing Section -->
        <div class="queue-section">
          <div class="queue-section-header">NOW PLAYING</div>
          ${currentTrack ? `
            <div class="queue-item active-queue-item">
              <div class="queue-item-drag-ghost">
                <i data-lucide="volume-2" class="text-accent animate-pulse"></i>
              </div>
              <img src="${currentTrack.coverUrl}" class="queue-thumb" alt="${currentTrack.title}"/>
              <div class="queue-info">
                <div class="queue-track-title text-accent">${currentTrack.title}</div>
                <div class="queue-track-artist">${currentTrack.artist}</div>
              </div>
              <div class="queue-meta">
                <span class="tag-pill">${currentTrack.genre}</span>
                <span class="duration-pill">${this._formatTime(currentTrack.duration)}</span>
              </div>
            </div>
          ` : `
            <div class="empty-hint">No track currently playing</div>
          `}
        </div>

        <!-- Up Next Section -->
        <div class="queue-section">
          <div class="queue-section-header">
            <span>UP NEXT (${upNext.length})</span>
            ${this.audioService.shuffleMode !== 'off' ? `
              <span class="badge badge-accent">
                <i data-lucide="shuffle"></i> ${this.audioService.shuffleMode === 'true-random' ? 'True Random' : 'Smart Flow'}
              </span>
            ` : ''}
          </div>

          <div class="queue-list" id="queue-up-next-list">
            ${upNext.length > 0 ? upNext.map((track, relativeIdx) => {
              const actualIdx = queueIndex + 1 + relativeIdx;
              return `
                <div class="queue-item" data-index="${actualIdx}" draggable="true">
                  <div class="queue-drag-handle" title="Drag to reorder">
                    <i data-lucide="grip-vertical"></i>
                  </div>
                  <img src="${track.coverUrl}" class="queue-thumb" alt="${track.title}"/>
                  <div class="queue-info" data-action="play-index" data-index="${actualIdx}">
                    <div class="queue-track-title">${track.title}</div>
                    <div class="queue-track-artist">${track.artist}</div>
                  </div>
                  <div class="queue-item-actions">
                    <button class="btn-icon-subtle" data-action="remove-track" data-index="${actualIdx}" title="Remove from queue">
                      <i data-lucide="x"></i>
                    </button>
                  </div>
                </div>
              `;
            }).join('') : `
              <div class="empty-hint">
                <i data-lucide="music"></i>
                <p>Queue is empty. Select any song or playlist to start listening!</p>
              </div>
            `}
          </div>
        </div>
      </div>
    `;

    this._bindEvents();
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  _bindEvents() {
    // Clear Queue
    const clearBtn = this.container.querySelector('#btn-clear-queue');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.audioService.clearQueue();
      });
    }

    // Save as Playlist
    const saveBtn = this.container.querySelector('#btn-save-queue');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        if (this.onSavePlaylist) {
          const trackIds = this.audioService.queue.map(t => t.id);
          this.onSavePlaylist(trackIds);
        }
      });
    }

    // Play specific queue item
    this.container.querySelectorAll('[data-action="play-index"]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-index'), 10);
        if (this.audioService.queue[idx]) {
          this.audioService.queueIndex = idx;
          this.audioService.playTrack(this.audioService.queue[idx]);
        }
      });
    });

    // Remove from queue
    this.container.querySelectorAll('[data-action="remove-track"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(el.getAttribute('data-index'), 10);
        this.audioService.removeFromQueue(idx);
      });
    });

    // Drag and Drop reordering
    let draggedItem = null;
    let draggedIdx = null;

    const list = this.container.querySelector('#queue-up-next-list');
    if (list) {
      list.querySelectorAll('.queue-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
          draggedItem = item;
          draggedIdx = parseInt(item.getAttribute('data-index'), 10);
          item.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
          if (draggedItem) draggedItem.classList.remove('dragging');
          draggedItem = null;
          draggedIdx = null;
        });

        item.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        });

        item.addEventListener('drop', (e) => {
          e.preventDefault();
          if (draggedIdx !== null) {
            const targetIdx = parseInt(item.getAttribute('data-index'), 10);
            if (draggedIdx !== targetIdx) {
              this.audioService.reorderQueue(draggedIdx, targetIdx);
            }
          }
        });
      });
    }
  }

  _formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
}
