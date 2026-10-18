/**
 * Web Audio Feedback Engine untuk Scanner Barcode DocuFlow Stock Opname
 * Menggunakan Web Audio API native browser (Zero Dependency).
 *
 * Tiga nada suara:
 * 1. Success Chime (880Hz -> 1175Hz sine) -> SN Valid & Tercatat
 * 2. Warning Tone (587Hz double pulse) -> SN Duplikat (Area Sama / Lintas Area)
 * 3. Error Buzzer (220Hz sawtooth) -> SN Asing / Tak Terdaftar / Satuan Invalid
 */

class SoundFeedbackEngine {
  private ctx: AudioContext | null = null;
  private _isMuted: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("docuflow_so_audio_muted");
        if (saved !== null) {
          this._isMuted = saved === "true";
        }
      } catch {
        // Abaikan jika localStorage tidak tersedia
      }
    }
  }

  private initContext(): AudioContext | null {
    if (typeof window === "undefined") return null;

    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }

      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }

      return this.ctx;
    } catch {
      return null;
    }
  }

  public isMuted(): boolean {
    return this._isMuted;
  }

  public setMuted(muted: boolean): void {
    this._isMuted = muted;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("docuflow_so_audio_muted", String(muted));
      } catch {
        // Abaikan jika localStorage dibatasi
      }
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this._isMuted);
    return this._isMuted;
  }

  /**
   * Suara 1: SN Valid (Success Chime)
   * Nada 880Hz (A5) meluncur naik ke 1174.66Hz (D6), sine wave singkat 120ms.
   */
  public playSuccess(): void {
    if (this._isMuted) return;

    try {
      const ctx = this.initContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.12);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Audio playback tidak boleh melempar unhandled error
    }
  }

  /**
   * Suara 2: SN Duplikat (Warning Tone)
   * Dua pulsa nada 587.33Hz (D5), sine wave ~160ms.
   */
  public playWarning(): void {
    if (this._isMuted) return;

    try {
      const ctx = this.initContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Pulsa 1 (0 to 0.07s)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.linearRampToValueAtTime(0.01, now + 0.07);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.07);

      // Pulsa 2 (0.09s to 0.16s)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(587.33, now + 0.09);
      gain2.gain.setValueAtTime(0.15, now + 0.09);
      gain2.gain.linearRampToValueAtTime(0.01, now + 0.16);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.16);
    } catch {
      // Audio playback tidak boleh melempar unhandled error
    }
  }

  /**
   * Suara 3: SN Tidak Ditemukan / Tidak Valid (Error Buzzer)
   * Nada rendah disonan 220Hz (A3), sawtooth wave ~200ms.
   */
  public playError(): void {
    if (this._isMuted) return;

    try {
      const ctx = this.initContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, now);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      // Audio playback tidak boleh melempar unhandled error
    }
  }
}

export const soundFeedback = new SoundFeedbackEngine();
