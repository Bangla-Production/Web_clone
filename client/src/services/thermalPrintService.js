/**
 * RestoPulse Thermal Print Service
 * Modular support for:
 * 1. Browser Print Dialog (Fallback / standard)
 * 2. ESC/POS Raw command generation for 80mm and 58mm thermal printers
 * 3. Local Print Bridge HTTP integration (e.g. QZ Tray, ESC/POS Local Daemon)
 */

export const PaperSize = {
  MM80: '80mm',
  MM58: '58mm'
};

/**
 * Sends a print job to a local ESC/POS print agent or falls back to browser printing.
 * Never throws fatal errors that could corrupt orders.
 */
export async function dispatchThermalPrint({
  type = 'KOT', // 'KOT' | 'RECEIPT'
  data,
  restaurant,
  paperSize = '80mm',
  bridgeUrl = '',
  onFallback = null
}) {
  // If a local print bridge URL is configured, try sending raw print job
  if (bridgeUrl && bridgeUrl.trim().length > 0) {
    try {
      const response = await fetch(bridgeUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data, restaurant, paperSize }),
        signal: AbortSignal.timeout(3000) // 3 second timeout
      });

      if (response.ok) {
        return { success: true, method: 'bridge', message: 'Sent directly to thermal printer.' };
      }
    } catch (err) {
      console.warn('Local print bridge unavailable, falling back to browser print:', err);
    }
  }

  // Fallback to browser standard print
  if (onFallback) {
    onFallback();
  } else {
    window.print();
  }

  return { success: true, method: 'browser', message: 'Opened browser print dialog.' };
}

/**
 * Web Audio API Chime for New Kitchen Orders (KOT)
 */
class KitchenAudioAlert {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  setMuted(muted) {
    this.isMuted = muted;
  }

  /** Browsers only allow sound after a tap/click - call this from a user gesture. */
  unlock() {
    try {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {
      /* ignore */
    }
  }

  /** Bright rising "order up" chime for the waiter (different from the kitchen bell). */
  playServedChime() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const start = this.ctx.currentTime;
      [659.25, 880, 1174.66].forEach((freq, i) => {
        const t = start + i * 0.16;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.35, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.5);
      });
    } catch (e) {
      console.warn('Could not play served chime:', e);
    }
  }

  playOrderBell() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      // Ding-Dong pleasant 2-tone chime
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.setValueAtTime(659.25, now + 0.18); // E5
      osc.frequency.setValueAtTime(1046.5, now + 0.36); // C6

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.9);
    } catch (e) {
      console.warn('Could not play audio chime:', e);
    }
  }
}

export const kitchenAudio = new KitchenAudioAlert();

// Separate audio instance for the waiter's "kitchen served" alert.
export const serveAudio = new KitchenAudioAlert();
