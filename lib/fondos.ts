// Fondo virtual: recorta a la persona con MediaPipe Selfie Segmentation (libre, Apache 2.0, corre en el navegador)
// y le pone detrás un fondo de estudio con la gráfica de Diario Federal.
// Los archivos del modelo están en /public/mediapipe: no depende de ningún servicio externo.

export type TipoFondo = string; // "ninguno" | "desenfoque" | "foto" | id de un fondo de noticiero

// Fondos de canal de noticias, generados con IA gratis (Pollinations, modelo FLUX) y guardados en el sitio.
export type FondoNoticias = { id: string; nombre: string; prompt: string };
const ESTILO = "photorealistic, professional broadcast television set, empty, no people, no text, no letters, no logos, cinematic lighting, shallow depth of field, 16:9";
export const NOTICIEROS: FondoNoticias[] = [
  { id: "n-pantallas", nombre: "Estudio con pantalla gigante", prompt: `Modern TV news studio, huge curved LED video wall showing a city skyline at night, dark blue and red lighting, glossy floor, ${ESTILO}` },
  { id: "n-ciudad", nombre: "Ventanal sobre la ciudad", prompt: `Evening news studio with floor-to-ceiling windows overlooking Buenos Aires city lights at night, blurred bokeh, red accent lights, modern anchor set, ${ESTILO}` },
  { id: "n-mundo", nombre: "Mapa del mundo · azul", prompt: `International news channel studio, large digital world map on LED screens, deep blue and red neon accents, ${ESTILO}` },
  { id: "n-mapa-rojo", nombre: "Mapa del mundo · rojo", prompt: `TV news studio, giant LED wall with glowing world map in red and dark grey, glossy black floor reflections, curved red light strip, ${ESTILO}` },
  { id: "n-mapa-globo", nombre: "Globo terráqueo", prompt: `International news studio with a large glowing 3D earth globe on a huge screen, dark blue background, red and white accent lights, ${ESTILO}` },
  { id: "n-mapa-noche", nombre: "Mapa con luces de ciudades", prompt: `Night world map made of city lights on a panoramic LED wall in a modern news studio, deep navy blue, subtle red neon, ${ESTILO}` },
];

export const FONDOS: { id: TipoFondo; nombre: string }[] = [
  { id: "ninguno", nombre: "Sin fondo (cámara real)" },
  ...NOTICIEROS.map((n) => ({ id: n.id, nombre: n.nombre })),
  { id: "desenfoque", nombre: "Desenfocar mi fondo" },
  { id: "foto", nombre: "Foto propia" },
];

// Las imágenes ya están generadas y guardadas en /public/fondos (se regeneran con el flujo "Generar fondos de noticiero").
export function urlFondo(id: string) {
  return NOTICIEROS.some((x) => x.id === id) ? `/fondos/${id}.jpg` : "";
}

const cache = new Map<string, Promise<HTMLImageElement>>();
export function cargarImagen(url: string): Promise<HTMLImageElement> {
  if (!cache.has(url)) {
    cache.set(url, new Promise((ok, mal) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => ok(img);
      img.onerror = () => { cache.delete(url); mal(new Error("no cargó la imagen")); };
      img.src = url;
    }));
  }
  return cache.get(url)!;
}

// ——— Motores de recorte
// 1) MediaPipe Image Segmenter, modelo "selfie multiclass" (distingue pelo, cara, cuerpo y ropa): el mejor.
// 2) Si ese no carga, el modelo clásico de MediaPipe (2021).
// 3) Pantalla verde: si hay una tela verde detrás, se recorta por color (calidad de canal de TV).
type Alfa = { datos: Float32Array; ancho: number; alto: number }; // 1 = persona, 0 = fondo

type SegmentadorTareas = {
  segmentForVideo(v: HTMLVideoElement, t: number, cb: (r: { confidenceMasks?: { width: number; height: number; getAsFloat32Array(): Float32Array }[] }) => void): void;
  close(): void;
};
let tareas: Promise<SegmentadorTareas> | null = null;
async function crearTareas(): Promise<SegmentadorTareas> {
  const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
  const archivos = await FilesetResolver.forVisionTasks("/mediapipe-tasks");
  const opciones = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: "/modelos/selfie_multiclass_256x256.tflite", delegate },
    runningMode: "VIDEO" as const,
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  });
  // CPU: en notebooks comunes es más parejo que la placa de video (no frena el resto de la página)
  return (await ImageSegmenter.createFromOptions(archivos, opciones("CPU"))) as unknown as SegmentadorTareas;
}

type Clasico = {
  setOptions(o: Record<string, unknown>): void;
  onResults(f: (r: { segmentationMask: CanvasImageSource }) => void): void;
  send(i: { image: HTMLVideoElement }): Promise<void>;
  initialize(): Promise<void>;
  close(): Promise<void>;
};
type ClaseClasico = new (c: { locateFile: (f: string) => string }) => Clasico;
let libreria: Promise<ClaseClasico> | null = null;
function cargarClasico() {
  if (!libreria) {
    libreria = new Promise((ok, mal) => {
      const w = window as unknown as { SelfieSegmentation?: ClaseClasico };
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

// ——— Preferencias (se guardan en el navegador)
function leerNum(k: string, d: number) { try { const v = localStorage.getItem(k); return v == null ? d : Number(v); } catch { return d; } }
let ajusteBorde = 2; // 0..5: cuánto se ajusta el borde hacia adentro
let recorte: "ia" | "verde" = "ia";
try { ajusteBorde = leerNum("df-borde", 2); recorte = (localStorage.getItem("df-recorte") as "ia" | "verde") || "ia"; } catch {}
export function fijarBorde(n: number) { ajusteBorde = n; try { localStorage.setItem("df-borde", String(n)); } catch {} }
export function bordeActual() { return ajusteBorde; }
export function fijarRecorte(r: "ia" | "verde") { recorte = r; try { localStorage.setItem("df-recorte", r); } catch {} }
export function recorteActual() { return recorte; }

export class ProcesadorFondo {
  salida: MediaStream;
  tipo: TipoFondo;
  motor = "";
  private video: HTMLVideoElement;
  private lienzo: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private persona: HTMLCanvasElement;
  private pctx: CanvasRenderingContext2D;
  private mascara = Object.assign(document.createElement("canvas"), { width: 0, height: 0 });
  private mctx: CanvasRenderingContext2D;
  private anillo = document.createElement("canvas");
  private actx: CanvasRenderingContext2D;
  private chico = document.createElement("canvas");
  private cctx: CanvasRenderingContext2D;
  private fondo: CanvasImageSource | null = null;
  private previo: Float32Array | null = null;
  private tareas: SegmentadorTareas | null = null;
  private clasico: Clasico | null = null;
  private activo = true;

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
    this.mctx = this.mascara.getContext("2d", { willReadFrequently: true })!;
    this.actx = this.anillo.getContext("2d")!;
    this.cctx = this.chico.getContext("2d", { willReadFrequently: true })!;
    this.fondo = tipo === "desenfoque" ? null : foto || null;
    const pista = this.lienzo.captureStream(30).getVideoTracks()[0];
    this.salida = new MediaStream([pista, ...fuente.getAudioTracks()]);
  }

  // tipo: "desenfoque", "foto" (con la imagen en foto) o un fondo de noticiero
  static async crear(fuente: MediaStream, tipo: TipoFondo, foto?: CanvasImageSource | null) {
    let imagen = foto || null;
    if (tipo !== "desenfoque" && tipo !== "foto") imagen = await cargarImagen(urlFondo(tipo));
    const p = new ProcesadorFondo(fuente, tipo, imagen);
    try {
      if (!tareas) tareas = crearTareas();
      p.tareas = await tareas;
      p.motor = "multiclase";
    } catch {
      tareas = null;
      const Clase = await cargarClasico();
      const c = new Clase({ locateFile: (f) => `/mediapipe/${f}` });
      c.setOptions({ modelSelection: 1, selfieMode: false });
      c.onResults((r) => p.alfaDeImagen(r.segmentationMask));
      await c.initialize();
      p.clasico = c;
      p.motor = "clasico";
    }
    p.bucle();
    return p;
  }

  // El dibujo va siempre a 30 cuadros por segundo; el recorte se recalcula tan seguido como
  // aguante la computadora (en equipos lentos, menos veces), así la imagen nunca se traba.
  private async bucle() {
    let ultimoDibujo = 0, ultimoRecorte = 0, intervalo = 33;
    while (this.activo) {
      const v = this.video;
      const t = performance.now();
      if (v.readyState >= 2 && v.videoWidth) {
        if (t - ultimoRecorte >= intervalo) {
          ultimoRecorte = t;
          try {
            if (recorte === "verde") this.alfaVerde();
            else if (this.tareas) {
              this.tareas.segmentForVideo(v, t, (r) => {
                const m = r.confidenceMasks?.[0]; // 0 = fondo
                if (!m) return;
                const fondo = m.getAsFloat32Array();
                const d = new Float32Array(fondo.length);
                for (let i = 0; i < fondo.length; i++) d[i] = 1 - fondo[i];
                this.actualizarMascara({ datos: d, ancho: m.width, alto: m.height });
              });
            } else await this.clasico?.send({ image: v });
          } catch { /* cuadro salteado */ }
          const dur = performance.now() - t;
          intervalo = Math.min(1500, Math.max(33, dur * 2.5));
        }
        if (performance.now() - ultimoDibujo >= 30 && this.mascara.width > 0) {
          ultimoDibujo = performance.now();
          this.dibujar();
        }
      }
      await new Promise((ok) => setTimeout(ok, 5));
    }
  }

  // modelo clásico: la máscara viene como imagen
  private alfaDeImagen(img: CanvasImageSource) {
    const w = 256, h = 144;
    this.chico.width = w; this.chico.height = h;
    this.cctx.clearRect(0, 0, w, h);
    this.cctx.drawImage(img, 0, 0, w, h);
    const px = this.cctx.getImageData(0, 0, w, h).data;
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = Math.max(px[i * 4 + 3], px[i * 4]) / 255;
    this.actualizarMascara({ datos: d, ancho: w, alto: h });
  }

  // pantalla verde: recorte por color
  private alfaVerde() {
    const w = 480, h = 270;
    this.chico.width = w; this.chico.height = h;
    this.cctx.drawImage(this.video, 0, 0, w, h);
    const px = this.cctx.getImageData(0, 0, w, h).data;
    const d = new Float32Array(w * h);
    const sens = 18 + ajusteBorde * 6;
    for (let i = 0; i < d.length; i++) {
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      const dom = g - Math.max(r, b);
      d[i] = 1 - Math.min(1, Math.max(0, (dom - sens * 0.4) / sens));
    }
    this.actualizarMascara({ datos: d, ancho: w, alto: h }, true);
  }

  private verde = false;
  private actualizarMascara(a: Alfa, verde = false) {
    this.verde = verde;
    const { ancho: mw, alto: mh, datos } = a;
    if (this.mascara.width !== mw || this.mascara.height !== mh) {
      this.mascara.width = mw; this.mascara.height = mh;
      this.anillo.width = mw; this.anillo.height = mh;
      this.previo = null;
    }
    // suavizado en el tiempo (el borde deja de temblar) y ajuste del borde con una curva suave
    const prev = this.previo && this.previo.length === datos.length ? this.previo : null;
    const lo = verde ? 0.15 : 0.22 + ajusteBorde * 0.06, hi = lo + (verde ? 0.5 : 0.32);
    const mImg = this.mctx.createImageData(mw, mh);
    const aImg = this.actx.createImageData(mw, mh);
    for (let i = 0; i < datos.length; i++) {
      const v = prev ? datos[i] * 0.6 + prev[i] * 0.4 : datos[i];
      datos[i] = v;
      let t = (v - lo) / (hi - lo);
      t = t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
      mImg.data[i * 4 + 3] = t * 255;
      aImg.data[i * 4 + 3] = Math.min(255, 4 * t * (1 - t) * 255 * 1.4);
    }
    this.previo = datos;
    this.mctx.putImageData(mImg, 0, 0);
    this.actx.putImageData(aImg, 0, 0);
  }

  private dibujar() {
    const verde = this.verde;
    const w = this.video.videoWidth || 1280, h = this.video.videoHeight || 720;
    for (const c of [this.lienzo, this.persona]) if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }

    // 1) persona recortada
    const p = this.pctx;
    p.save();
    p.globalCompositeOperation = "copy";
    p.filter = "blur(1.5px)";
    p.imageSmoothingQuality = "high";
    p.drawImage(this.mascara, 0, 0, w, h);
    p.filter = "none";
    p.globalCompositeOperation = "source-in";
    p.drawImage(this.video, 0, 0, w, h);
    if (verde) {
      // saca el reflejo verde de la tela sobre la persona
      p.globalCompositeOperation = "color";
      p.globalAlpha = 0.12;
      p.fillStyle = "#8a6f6f";
      p.fillRect(0, 0, w, h);
      p.globalAlpha = 1;
    }
    p.restore();

    // 2) fondo
    const c = this.ctx;
    c.save();
    const dibujarFondo = () => {
      if (this.tipo === "desenfoque" || !this.fondo) {
        c.filter = "blur(16px)";
        c.drawImage(this.video, -20, -20, w + 40, h + 40);
        c.filter = "none";
      } else {
        const f = this.fondo as HTMLCanvasElement & Partial<HTMLImageElement>;
        const fw = f.naturalWidth || f.width, fh = f.naturalHeight || f.height;
        const esc = Math.max(w / fw, h / fh);
        c.drawImage(f, (w - fw * esc) / 2, (h - fh * esc) / 2, fw * esc, fh * esc);
      }
    };
    dibujarFondo();
    // 3) persona encima
    c.drawImage(this.persona, 0, 0);
    c.restore();
    // 4) "envoltura de luz": el borde toma el color del fondo nuevo en lugar del de la pared real
    const borde = this.pctx;
    borde.save();
    borde.globalCompositeOperation = "copy";
    borde.filter = "blur(3px)";
    borde.drawImage(this.anillo, 0, 0, w, h);
    borde.filter = "none";
    borde.globalCompositeOperation = "source-in";
    if (this.tipo === "desenfoque" || !this.fondo) {
      borde.filter = "blur(16px)";
      borde.drawImage(this.video, -20, -20, w + 40, h + 40);
      borde.filter = "none";
    } else {
      const f = this.fondo as HTMLCanvasElement & Partial<HTMLImageElement>;
      const fw = f.naturalWidth || f.width, fh = f.naturalHeight || f.height;
      const esc = Math.max(w / fw, h / fh);
      borde.filter = "blur(6px)";
      borde.drawImage(f, (w - fw * esc) / 2, (h - fh * esc) / 2, fw * esc, fh * esc);
      borde.filter = "none";
    }
    borde.restore();
    c.save();
    c.globalAlpha = 0.55;
    c.drawImage(this.persona, 0, 0);
    c.restore();
  }

  detener() {
    this.activo = false;
    this.salida.getVideoTracks().forEach((t) => t.stop());
    this.clasico?.close().catch(() => {});
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
