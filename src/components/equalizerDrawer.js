/**
 * Equalizer & Pro Audio Drawer Component for AuraStream
 * Solves Spotify's buried equalizer flaw with an instant-access 5-Band EQ,
 * spatial 3D audio widener, and playback speed control.
 */

import { EQ_PRESETS } from '../services/audioService.js';

export class EqualizerDrawer {
  constructor(containerElement, audioService) {
    this.container = containerElement;
    this.audioService = audioService;

    this.audioService.on('eqchange', () => this.render());
  }

  render() {
    if (!this.container) return;

    const bands = this.audioService.eqBands;
    const activePreset = this.audioService.activePreset;
    const spatialEnabled = this.audioService.spatial3DEnabled;
    const currentSpeed = this.audioService.playbackRate;

    const bandLabels = [
      { name: 'Sub', freq: '60 Hz' },
      { name: 'Bass', freq: '250 Hz' },
      { name: 'Mid', freq: '1 kHz' },
      { name: 'High', freq: '4 kHz' },
      { name: 'Air', freq: '16 kHz' }
    ];

    this.container.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-title-group">
          <h3 class="drawer-title">Audio Studio & EQ</h3>
          <span class="badge eq-badge">5-Band Studio</span>
        </div>
      </div>

      <div class="drawer-body">
        <!-- Presets Selection -->
        <div class="eq-section">
          <label class="eq-label">Sound Presets</label>
          <div class="preset-chips">
            ${Object.entries(EQ_PRESETS).map(([key, preset]) => `
              <button class="preset-chip ${activePreset === key ? 'active' : ''}" data-preset="${key}">
                ${preset.name}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- 5-Band Sliders -->
        <div class="eq-section">
          <label class="eq-label">Frequency Response (-12dB to +12dB)</label>
          <div class="eq-sliders-grid">
            ${bands.map((val, idx) => `
              <div class="eq-slider-col">
                <span class="eq-val-badge ${val > 0 ? 'text-accent' : val < 0 ? 'text-danger' : ''}">
                  ${val > 0 ? '+' : ''}${val} dB
                </span>
                <div class="eq-range-wrapper">
                  <input 
                    type="range" 
                    class="eq-vertical-slider" 
                    min="-12" 
                    max="12" 
                    step="1" 
                    value="${val}" 
                    data-band="${idx}"
                  />
                </div>
                <div class="eq-band-meta">
                  <span class="eq-band-name">${bandLabels[idx].name}</span>
                  <span class="eq-band-freq">${bandLabels[idx].freq}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Spatial 3D Audio & Speed -->
        <div class="eq-section pro-audio-toggles">
          <div class="audio-feature-row">
            <div class="feature-info">
              <span class="feature-title">
                <i data-lucide="headphones"></i> 3D Spatial Stereo Expansion
              </span>
              <span class="feature-desc">Widens the acoustic soundstage for immersive headphone listening.</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="spatial-toggle" ${spatialEnabled ? 'checked' : ''}/>
              <span class="toggle-slider"></span>
            </label>
          </div>

          <!-- Playback Speed -->
          <div class="audio-feature-row">
            <div class="feature-info">
              <span class="feature-title">
                <i data-lucide="gauge"></i> Playback Speed
              </span>
              <span class="feature-desc">Fine-tune track tempo without distorting harmonic pitch.</span>
            </div>
            <div class="speed-chips">
              ${[0.75, 1.0, 1.25, 1.5, 2.0].map(s => `
                <button class="speed-chip ${currentSpeed === s ? 'active' : ''}" data-speed="${s}">
                  ${s}x
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    this._bindEvents();
    if (window.lucide) window.lucide.createIcons();
  }

  _bindEvents() {
    // Preset buttons
    this.container.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-preset');
        this.audioService.setEqPreset(key);
      });
    });

    // Sliders
    this.container.querySelectorAll('.eq-vertical-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const band = parseInt(e.target.getAttribute('data-band'), 10);
        const val = parseFloat(e.target.value);
        this.audioService.setEqBand(band, val);
      });
    });

    // Spatial 3D toggle
    const spatialToggle = this.container.querySelector('#spatial-toggle');
    if (spatialToggle) {
      spatialToggle.addEventListener('change', (e) => {
        this.audioService.setSpatial3D(e.target.checked);
      });
    }

    // Playback speed buttons
    this.container.querySelectorAll('[data-speed]').forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.getAttribute('data-speed'));
        this.audioService.setPlaybackSpeed(speed);
        this.container.querySelectorAll('[data-speed]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }
}
