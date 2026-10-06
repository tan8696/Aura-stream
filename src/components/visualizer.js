/**
 * HTML5 Canvas Real-Time Audio Visualizer for AuraStream
 * Modes: Neon Spectrum Bars, Oscilloscope Waveform, and Nebula Radial Pulse
 */

export class AudioVisualizer {
  constructor(canvasElement, audioService) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.audioService = audioService;

    this.mode = 'bars'; // 'bars' | 'waveform' | 'nebula'
    this.isRunning = false;
    this.animationFrameId = null;

    this.fftBuffer = new Uint8Array(256);
    this.timeBuffer = new Uint8Array(256);
    this.peakCaps = new Float32Array(64); // Peak meters

    // Particles for Nebula mode
    this.particles = Array.from({ length: 48 }, () => ({
      angle: Math.random() * Math.PI * 2,
      distance: 30 + Math.random() * 80,
      size: 1 + Math.random() * 2.5,
      speed: 0.005 + Math.random() * 0.015,
      opacity: 0.3 + Math.random() * 0.7
    }));

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
  }

  setMode(mode) {
    if (['bars', 'waveform', 'nebula'].includes(mode)) {
      this.mode = mode;
    }
  }

  cycleMode() {
    const modes = ['bars', 'waveform', 'nebula'];
    const idx = modes.indexOf(this.mode);
    this.mode = modes[(idx + 1) % modes.length];
    return this.mode;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._renderLoop();
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  _renderLoop() {
    if (!this.isRunning) return;

    this._resizeIfNeeded();
    this.audioService.getFrequencyData(this.fftBuffer);
    this.audioService.getTimeDomainData(this.timeBuffer);

    const isPlaying = this.audioService.isPlaying;
    const currentTrack = this.audioService.currentTrack;
    const primaryColor = currentTrack?.color || '#1DB954';
    const accentColor = currentTrack?.accentColor || '#00F2FE';

    this.ctx.clearRect(0, 0, this.width, this.height);

    if (this.mode === 'bars') {
      this._renderSpectrumBars(primaryColor, accentColor, isPlaying);
    } else if (this.mode === 'waveform') {
      this._renderWaveform(primaryColor, accentColor, isPlaying);
    } else if (this.mode === 'nebula') {
      this._renderNebula(primaryColor, accentColor, isPlaying);
    }

    this.animationFrameId = requestAnimationFrame(() => this._renderLoop());
  }

  _resizeIfNeeded() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      if (Math.abs(rect.width - this.width) > 2 || Math.abs(rect.height - this.height) > 2) {
        this._resize();
      }
    }
  }

  _renderSpectrumBars(c1, c2, isPlaying) {
    const barCount = 36;
    const padding = 3;
    const totalPadding = (barCount - 1) * padding;
    const barWidth = Math.max(2, (this.width - totalPadding) / barCount);
    const maxHeight = this.height * 0.88;

    for (let i = 0; i < barCount; i++) {
      // Sample frequency data
      const sampleIdx = Math.floor(Math.pow(i / barCount, 1.4) * (this.fftBuffer.length * 0.7));
      let val = isPlaying ? this.fftBuffer[sampleIdx] / 255 : Math.sin(Date.now() * 0.003 + i * 0.3) * 0.06 + 0.08;
      
      const barHeight = Math.max(3, val * maxHeight);
      const x = i * (barWidth + padding);
      const y = this.height - barHeight;

      // Peak caps
      if (val > this.peakCaps[i]) {
        this.peakCaps[i] = val;
      } else {
        this.peakCaps[i] = Math.max(0, this.peakCaps[i] - 0.015);
      }
      const peakY = this.height - (this.peakCaps[i] * maxHeight) - 2;

      // Bar gradient
      const grad = this.ctx.createLinearGradient(0, this.height, 0, y);
      grad.addColorStop(0, c1 + '44');
      grad.addColorStop(0.7, c1);
      grad.addColorStop(1, c2);

      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
      this.ctx.fill();

      // Draw peak cap
      if (this.peakCaps[i] > 0.05) {
        this.ctx.fillStyle = c2;
        this.ctx.fillRect(x, Math.max(0, peakY), barWidth, 2);
      }
    }
  }

  _renderWaveform(c1, c2, isPlaying) {
    const sliceWidth = this.width / this.timeBuffer.length;
    let x = 0;

    this.ctx.lineWidth = 2.5;
    const grad = this.ctx.createLinearGradient(0, 0, this.width, 0);
    grad.addColorStop(0, c1);
    grad.addColorStop(0.5, c2);
    grad.addColorStop(1, c1);
    this.ctx.strokeStyle = grad;
    this.ctx.shadowColor = c2;
    this.ctx.shadowBlur = 10;

    this.ctx.beginPath();
    for (let i = 0; i < this.timeBuffer.length; i++) {
      let v = this.timeBuffer[i] / 128.0;
      if (!isPlaying) {
        v = 1.0 + Math.sin(Date.now() * 0.004 + (i / 15)) * 0.05;
      }
      const y = (v * this.height) / 2;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    this.ctx.stroke();
    this.ctx.shadowBlur = 0; // reset
  }

  _renderNebula(c1, c2, isPlaying) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const baseRadius = Math.min(this.width, this.height) * 0.22;

    // Calculate bass energy average
    let bassSum = 0;
    for (let i = 0; i < 16; i++) {
      bassSum += this.fftBuffer[i];
    }
    const bassAvg = isPlaying ? bassSum / (16 * 255) : 0.12;
    const pulseRadius = baseRadius + (bassAvg * 28);

    // Outer glow ring
    const glowGrad = this.ctx.createRadialGradient(cx, cy, pulseRadius * 0.5, cx, cy, pulseRadius * 1.5);
    glowGrad.addColorStop(0, c1 + '44');
    glowGrad.addColorStop(0.8, c2 + '11');
    glowGrad.addColorStop(1, 'transparent');
    this.ctx.fillStyle = glowGrad;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, pulseRadius * 1.4, 0, Math.PI * 2);
    this.ctx.fill();

    // Central pulsing ring
    this.ctx.strokeStyle = c2;
    this.ctx.lineWidth = 3;
    this.ctx.shadowColor = c2;
    this.ctx.shadowBlur = 12;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;

    // Orbiting particles
    for (const p of this.particles) {
      p.angle += p.speed * (1 + bassAvg * 2);
      const dist = p.distance + (bassAvg * 35);
      const px = cx + Math.cos(p.angle) * dist;
      const py = cy + Math.sin(p.angle) * dist;

      this.ctx.fillStyle = c1;
      this.ctx.globalAlpha = p.opacity;
      this.ctx.beginPath();
      this.ctx.arc(px, py, p.size * (1 + bassAvg * 0.8), 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1.0;
  }
}
