// Mesa de audio del estudio (WebAudio).
// - Programa: suma de todos los canales, es lo que se graba y sale al aire.
// - Monitor: lo que escucha el operador por auriculares (invitados y pantalla; no su propio micrófono).
// - Retorno de cada invitado (mix-minus): todos menos él, para que no se escuche con eco.

type Canal = {
  id: string;
  fuente: MediaStreamAudioSourceNode;
  ganancia: GainNode;
  analizador: AnalyserNode;
  volumen: number;
  silenciado: boolean;
  aMonitor: boolean;
  esInvitado: boolean;
  datos: Float32Array<ArrayBuffer>;
};

export class Mezcla {
  ctx: AudioContext;
  programa: MediaStreamAudioDestinationNode;
  monitor: GainNode;
  maestro: GainNode;
  canales = new Map<string, Canal>();
  retornos = new Map<string, MediaStreamAudioDestinationNode>();

  constructor() {
    this.ctx = new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
    this.programa = this.ctx.createMediaStreamDestination();
    this.maestro = this.ctx.createGain();
    // limitador suave para que el programa no sature
    const limitador = this.ctx.createDynamicsCompressor();
    limitador.threshold.value = -6;
    limitador.knee.value = 6;
    limitador.ratio.value = 12;
    limitador.attack.value = 0.003;
    limitador.release.value = 0.15;
    this.maestro.connect(limitador).connect(this.programa);
    this.monitor = this.ctx.createGain();
    this.monitor.connect(this.ctx.destination);
  }

  get pistaPrograma() {
    return this.programa.stream.getAudioTracks()[0];
  }

  agregar(id: string, stream: MediaStream, { aMonitor = true, esInvitado = false } = {}) {
    this.quitar(id);
    if (!stream.getAudioTracks().length) return;
    const fuente = this.ctx.createMediaStreamSource(stream);
    const ganancia = this.ctx.createGain();
    const analizador = this.ctx.createAnalyser();
    analizador.fftSize = 1024;
    fuente.connect(ganancia);
    ganancia.connect(analizador);
    ganancia.connect(this.maestro);
    if (aMonitor) ganancia.connect(this.monitor);
    const c: Canal = { id, fuente, ganancia, analizador, volumen: 1, silenciado: false, aMonitor, esInvitado, datos: new Float32Array(new ArrayBuffer(analizador.fftSize * 4)) };
    this.canales.set(id, c);
    this.rehacerRetornos();
  }

  quitar(id: string) {
    const c = this.canales.get(id);
    if (c) {
      try { c.fuente.disconnect(); c.ganancia.disconnect(); } catch {}
      this.canales.delete(id);
    }
    this.retornos.delete(id);
    this.rehacerRetornos();
  }

  volumen(id: string, v: number) {
    const c = this.canales.get(id);
    if (!c) return;
    c.volumen = v;
    this.aplicar(c);
  }

  silenciar(id: string, s: boolean) {
    const c = this.canales.get(id);
    if (!c) return;
    c.silenciado = s;
    this.aplicar(c);
  }

  private aplicar(c: Canal) {
    c.ganancia.gain.setTargetAtTime(c.silenciado ? 0 : c.volumen, this.ctx.currentTime, 0.02);
  }

  // Nivel en 0..1 (escala aproximada de vúmetro, -60 dB a 0 dB)
  nivel(id: string) {
    const c = this.canales.get(id);
    if (!c) return 0;
    c.analizador.getFloatTimeDomainData(c.datos);
    let s = 0;
    for (let i = 0; i < c.datos.length; i++) s += c.datos[i] * c.datos[i];
    const rms = Math.sqrt(s / c.datos.length);
    const db = 20 * Math.log10(rms || 1e-8);
    return Math.max(0, Math.min(1, (db + 60) / 60));
  }

  // Pista de audio que se le devuelve a un invitado: todos menos él
  retorno(idInvitado: string) {
    let d = this.retornos.get(idInvitado);
    if (!d) {
      d = this.ctx.createMediaStreamDestination();
      this.retornos.set(idInvitado, d);
      this.rehacerRetornos();
    }
    return d.stream.getAudioTracks()[0];
  }

  private rehacerRetornos() {
    for (const c of this.canales.values()) {
      for (const [inv, d] of this.retornos) {
        try { c.ganancia.disconnect(d); } catch {}
        if (c.id !== inv) c.ganancia.connect(d);
      }
    }
  }

  // Cortina sonora corta para la presentación (generada, sin derechos de autor)
  cortina(segundos = 6) {
    const t0 = this.ctx.currentTime + 0.05;
    const salida = this.ctx.createGain();
    salida.gain.value = 0.22;
    salida.connect(this.maestro);
    salida.connect(this.monitor);
    const notas = [
      { f: 196.0, t: 0, d: segundos },
      { f: 293.66, t: 0.35, d: segundos - 0.35 },
      { f: 392.0, t: 0.7, d: segundos - 0.7 },
      { f: 587.33, t: 2.2, d: 1.2 },
      { f: 783.99, t: 2.45, d: 1.4 },
    ];
    for (const n of notas) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = n.f > 500 ? "triangle" : "sawtooth";
      o.frequency.value = n.f;
      const filtro = this.ctx.createBiquadFilter();
      filtro.type = "lowpass";
      filtro.frequency.setValueAtTime(400, t0 + n.t);
      filtro.frequency.linearRampToValueAtTime(2400, t0 + n.t + n.d * 0.5);
      g.gain.setValueAtTime(0, t0 + n.t);
      g.gain.linearRampToValueAtTime(n.f > 500 ? 0.25 : 0.18, t0 + n.t + 0.25);
      g.gain.setTargetAtTime(0, t0 + n.t + n.d - 0.8, 0.3);
      o.connect(filtro).connect(g).connect(salida);
      o.start(t0 + n.t);
      o.stop(t0 + n.t + n.d + 1);
    }
    // golpe grave al aparecer "ENTREVISTAS"
    const golpe = this.ctx.createOscillator();
    const gg = this.ctx.createGain();
    golpe.frequency.setValueAtTime(110, t0 + 2.2);
    golpe.frequency.exponentialRampToValueAtTime(40, t0 + 2.9);
    gg.gain.setValueAtTime(0, t0 + 2.2);
    gg.gain.linearRampToValueAtTime(0.7, t0 + 2.22);
    gg.gain.exponentialRampToValueAtTime(0.001, t0 + 3.2);
    golpe.connect(gg).connect(salida);
    golpe.start(t0 + 2.2);
    golpe.stop(t0 + 3.3);
  }
}
