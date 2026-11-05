// Fondo virtual: recorta a la persona con MediaPipe Selfie Segmentation (libre, Apache 2.0, corre en el navegador)
// y le pone detrás un fondo de estudio con la gráfica de Diario Federal.
// Los archivos del modelo están en /public/mediapipe: no depende de ningún servicio externo.

export type TipoFondo = "ninguno" | "estudio" | "redaccion" | "marca" | "desenfoque" | "foto";

export const FONDOS: { id: TipoFondo; nombre: string }[] = [
  { id: "ninguno", nombre: "Sin fondo (cámara real)" },
  { id: "estudio", nombre: "Estudio DF · noche" },
  { id: "redaccion", nombre: "Redacción DF" },
  { id: "marca", nombre: "Pared DF" },
  { id: "desenfoque", nombre: "Desenfocar mi fondo" },
  { id: "foto", nombre: "Foto propia" },
];

const ROJO = "#d0021b";
const FUENTE = "Manrope, Inter, Arial, Helvetica, sans-serif";

type Resultado = { segmentationMask: CanvasImageSource; image: CanvasImageSource };
type Segmentador = {
  setOptions(o: Record<string, unknown>): void;
  onResults(f: (r: Resultado) => void): void;
  send(i: { image: HTMLVideoElement }): Promise<void>;
  initialize(): Promise<void>;
  close(): Promise<void>;
};
type ClaseSegmentador = new (c: { locateFile: (f: string) => string }) => Segmentador;

let libreria: Promise<ClaseSegmentador> | null = null;
function cargarLibreria() {
  if (!libreria) {
    libreria = new Promise((ok, mal) => {
      const w = window as unknown as { SelfieSegmentation?: ClaseSegmentador };
      if (w.SelfieSegmentation) return ok(w.SelfieSegmentation);
      const s = document.createElement("script");
      s.src = "/mediapipe/selfie_segmentation.js";
      s.crossOrigin = "anonymous";
      s.onload = () => (w.SelfieSegmentation ? ok(w.SelfieSegmentation) : mal(new Error("no cargó")));
      s.onerror = () => { libreria = null; mal(new Error("no se pudo cargar el recorte")); };
      document.head.appendChild(s);
    });
  }
  return libreria;
}

// azar con semilla, para que el fondo sea siempre el mismo
function azar(semilla: number) {
  let x = semilla;
  return () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
}

function logoDF(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, alfa = 1) {
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.fillStyle = ROJO;
  ctx.fillRect(x, y, t, t);
  ctx.fillStyle = "#fff";
  ctx.font = `800 ${Math.round(t * 0.5)}px ${FUENTE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("DF", x + t / 2, y + t / 2 + t * 0.03);
  ctx.restore();
}

export function dibujarFondo(tipo: TipoFondo, w = 1280, h = 720): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const r = azar(tipo === "estudio" ? 7 : tipo === "redaccion" ? 13 : 21);

  if (tipo === "estudio") {
    // estudio de noche: ventanal con ciudad desenfocada, luces cálidas, pared con la marca
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0a1220");
    g.addColorStop(0.6, "#142033");
    g.addColorStop(1, "#0b0f16");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.filter = "blur(6px)";
    for (let i = 0; i < 26; i++) {
      const bw = 30 + r() * 70, bh = 120 + r() * 300, bx = r() * w, by = h * 0.72 - bh;
      ctx.fillStyle = `rgba(${20 + r() * 20},${32 + r() * 25},${55 + r() * 30},1)`;
      ctx.fillRect(bx, by, bw, bh);
      for (let k = 0; k < bh / 14; k++) {
        if (r() < 0.45) {
          ctx.fillStyle = r() < 0.8 ? "rgba(255,200,120,.55)" : "rgba(160,200,255,.5)";
          ctx.fillRect(bx + 4 + r() * (bw - 10), by + k * 14 + 4, 5, 5);
        }
      }
    }
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.fillStyle = r() < 0.3 ? "rgba(208,2,27,.35)" : `rgba(255,${170 + r() * 60},${90 + r() * 60},.25)`;
      ctx.arc(r() * w, h * 0.2 + r() * h * 0.55, 6 + r() * 26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // marcos del ventanal
    ctx.fillStyle = "rgba(5,8,12,.75)";
    for (let x = 0; x < w; x += w / 5) ctx.fillRect(x, 0, 10, h);
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
    // pared lateral con la marca
    const pared = ctx.createLinearGradient(w * 0.74, 0, w, 0);
    pared.addColorStop(0, "rgba(16,18,24,.92)");
    pared.addColorStop(1, "rgba(28,31,38,.98)");
    ctx.fillStyle = pared;
    ctx.fillRect(w * 0.74, 0, w * 0.26, h);
    ctx.fillStyle = ROJO;
    ctx.fillRect(w * 0.74, 0, 8, h);
    logoDF(ctx, w * 0.81, h * 0.16, w * 0.11, 0.95);
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.font = `800 ${Math.round(w * 0.022)}px ${FUENTE}`;
    ctx.fillText("DIARIO", w * 0.795, h * 0.43);
    ctx.fillText("FEDERAL", w * 0.795, h * 0.48);
    // mesa / zócalo de luz
    const piso = ctx.createLinearGradient(0, h * 0.82, 0, h);
    piso.addColorStop(0, "rgba(208,2,27,.0)");
    piso.addColorStop(0.08, "rgba(208,2,27,.55)");
    piso.addColorStop(0.12, "rgba(30,10,14,.9)");
    piso.addColorStop(1, "#07080b");
    ctx.fillStyle = piso;
    ctx.fillRect(0, h * 0.82, w, h * 0.18);
  } else if (tipo === "redaccion") {
    // redacción: pantallas y escritorios desenfocados, tono claro
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#2a313b");
    g.addColorStop(1, "#151a21");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.filter = "blur(5px)";
    // luces de techo
    for (let x = 60; x < w; x += 220) {
      ctx.fillStyle = "rgba(235,240,255,.55)";
      ctx.fillRect(x, 30, 140, 10);
    }
    // pared de pantallas
    for (let fila = 0; fila < 3; fila++) {
      for (let col = 0; col < 7; col++) {
        const x = 40 + col * (w / 7.3), y = 110 + fila * 120;
        ctx.fillStyle = "#0b0e13";
        ctx.fillRect(x - 4, y - 4, w / 8 + 8, 98);
        const p = ctx.createLinearGradient(x, y, x + w / 8, y + 90);
        const tono = r();
        p.addColorStop(0, tono < 0.25 ? "#b01225" : tono < 0.6 ? "#2c4f7c" : "#3d5566");
        p.addColorStop(1, tono < 0.25 ? "#5d0912" : "#16273d");
        ctx.fillStyle = p;
        ctx.fillRect(x, y, w / 8, 90);
        ctx.fillStyle = "rgba(255,255,255,.35)";
        ctx.fillRect(x + 10, y + 60, (w / 8) * (0.4 + r() * 0.4), 6);
      }
    }
    // escritorios y monitores
    for (let i = 0; i < 9; i++) {
      const x = r() * w, y = h * 0.68 + r() * 40;
      ctx.fillStyle = "rgba(120,170,230,.35)";
      ctx.fillRect(x, y, 70, 44);
    }
    ctx.restore();
    ctx.fillStyle = "rgba(10,12,16,.55)";
    ctx.fillRect(0, h * 0.78, w, h * 0.22);
    // columna roja con la marca
    ctx.fillStyle = ROJO;
    ctx.fillRect(w * 0.015, 0, w * 0.018, h);
    logoDF(ctx, w * 0.865, h * 0.07, w * 0.075, 0.9);
  } else if (tipo === "marca") {
    // pared institucional: gris oscuro, diagonales y marca grande
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#14171d");
    g.addColorStop(1, "#262b33");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    for (let i = -h; i < w + h; i += 60) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - h, h); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = ROJO;
    ctx.fillRect(0, h * 0.86, w, 10);
    logoDF(ctx, w * 0.06, h * 0.08, w * 0.09, 0.95);
    ctx.fillStyle = "rgba(255,255,255,.08)";
    ctx.font = `800 ${Math.round(w * 0.16)}px ${FUENTE}`;
    ctx.fillText("DF", w * 0.62, h * 0.75);
  }
  return c;
}

export class ProcesadorFondo {
  salida: MediaStream;
  private video: HTMLVideoElement;
  private lienzo: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private persona: HTMLCanvasElement;
  private pctx: CanvasRenderingContext2D;
  private fondo: CanvasImageSource | null = null;
  private seg: Segmentador | null = null;
  private activo = true;
  tipo: TipoFondo;

  private constructor(fuente: MediaStream, tipo: TipoFondo, foto?: CanvasImageSource | null) {
    this.tipo = tipo;
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = new MediaStream(fuente.getVideoTracks());
    this.video.play().catch(() => {});
    this.lienzo = document.createElement("canvas");
    this.lienzo.width = 1280;
    this.lienzo.height = 720;
    this.ctx = this.lienzo.getContext("2d")!;
    this.persona = document.createElement("canvas");
    this.pctx = this.persona.getContext("2d")!;
    this.fondo = tipo === "foto" ? foto || dibujarFondo("estudio") : tipo === "desenfoque" ? null : dibujarFondo(tipo);
    const pista = this.lienzo.captureStream(30).getVideoTracks()[0];
    this.salida = new MediaStream([pista, ...fuente.getAudioTracks()]);
  }

  static async crear(fuente: MediaStream, tipo: TipoFondo, foto?: CanvasImageSource | null) {
    const p = new ProcesadorFondo(fuente, tipo, foto);
    const Clase = await cargarLibreria();
    const seg = new Clase({ locateFile: (f) => `/mediapipe/${f}` });
    seg.setOptions({ modelSelection: 1, selfieMode: false });
    seg.onResults((r) => p.componer(r));
    await seg.initialize();
    p.seg = seg;
    p.bucle();
    return p;
  }

  private async bucle() {
    let ultimo = 0;
    while (this.activo) {
      const v = this.video;
      if (v.readyState >= 2 && v.videoWidth) {
        const t = performance.now();
        if (t - ultimo >= 30) {
          ultimo = t;
          try { await this.seg?.send({ image: v }); } catch { /* cuadro salteado */ }
        }
      }
      await new Promise((ok) => setTimeout(ok, 8));
    }
  }

  private componer(r: Resultado) {
    const w = this.video.videoWidth || 1280, h = this.video.videoHeight || 720;
    if (this.lienzo.width !== w || this.lienzo.height !== h) {
      this.lienzo.width = w;
      this.lienzo.height = h;
    }
    if (this.persona.width !== w || this.persona.height !== h) {
      this.persona.width = w;
      this.persona.height = h;
    }
    // persona recortada, con borde suave
    const p = this.pctx;
    p.save();
    p.clearRect(0, 0, w, h);
    p.globalCompositeOperation = "copy";
    p.filter = "blur(3px)";
    p.drawImage(r.segmentationMask, 0, 0, w, h);
    p.filter = "none";
    p.globalCompositeOperation = "source-in";
    p.drawImage(r.image, 0, 0, w, h);
    p.restore();
    // fondo
    const c = this.ctx;
    c.save();
    if (this.tipo === "desenfoque" || !this.fondo) {
      c.filter = "blur(16px)";
      c.drawImage(r.image, -20, -20, w + 40, h + 40);
      c.filter = "none";
    } else {
      const f = this.fondo as HTMLCanvasElement & Partial<HTMLImageElement>;
      const fw = f.naturalWidth || f.width, fh = f.naturalHeight || f.height;
      const esc = Math.max(w / fw, h / fh);
      c.drawImage(f, (w - fw * esc) / 2, (h - fh * esc) / 2, fw * esc, fh * esc);
    }
    c.drawImage(this.persona, 0, 0);
    c.restore();
  }

  detener() {
    this.activo = false;
    this.salida.getVideoTracks().forEach((t) => t.stop());
    this.seg?.close().catch(() => {});
    this.video.srcObject = null;
  }
}

// Carga una foto elegida por el usuario como fondo
export function leerFoto(archivo: File): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = mal;
    img.src = URL.createObjectURL(archivo);
  });
}
