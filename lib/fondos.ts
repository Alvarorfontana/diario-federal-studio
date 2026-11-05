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
  { id: "n-redaccion", nombre: "Redacción", prompt: `Busy modern newsroom background out of focus, rows of desks with computer monitors, wall of TV screens, red accents, bright, ${ESTILO}` },
  { id: "n-mundo", nombre: "Mapa del mundo", prompt: `International news channel studio, large digital world map on LED screens, deep blue and red neon accents, ${ESTILO}` },
  { id: "n-mapa-rojo", nombre: "Mapa del mundo · rojo", prompt: `TV news studio, giant LED wall with glowing world map in red and dark grey, glossy black floor reflections, curved red light strip, ${ESTILO}` },
  { id: "n-mapa-america", nombre: "Mapa de América", prompt: `News channel studio, large video wall showing a digital map of South America and the Americas, blue holographic lines, red accent lights, ${ESTILO}` },
  { id: "n-mapa-globo", nombre: "Globo terráqueo", prompt: `International news studio with a large glowing 3D earth globe on a huge screen, dark blue background, red and white accent lights, ${ESTILO}` },
  { id: "n-mapa-noche", nombre: "Mapa con luces de ciudades", prompt: `Night world map made of city lights on a panoramic LED wall in a modern news studio, deep navy blue, subtle red neon, ${ESTILO}` },
  { id: "n-analisis", nombre: "Set de análisis político", prompt: `Political analysis TV studio, dark modern set with vertical LED panels, subtle light blue and white accents, elegant, ${ESTILO}` },
  { id: "n-entrevista", nombre: "Set de entrevistas", prompt: `TV interview studio set background, warm lights, wooden bookshelves, red accent wall, plants, ${ESTILO}` },
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
    this.fondo = tipo === "desenfoque" ? null : foto || null;
    const pista = this.lienzo.captureStream(30).getVideoTracks()[0];
    this.salida = new MediaStream([pista, ...fuente.getAudioTracks()]);
  }

  // tipo: "desenfoque", "foto" (con la imagen en foto) o un fondo de noticiero (se genera/carga solo)
  static async crear(fuente: MediaStream, tipo: TipoFondo, foto?: CanvasImageSource | null) {
    let imagen = foto || null;
    if (tipo !== "desenfoque" && tipo !== "foto") imagen = await cargarImagen(urlFondo(tipo));
    const p = new ProcesadorFondo(fuente, tipo, imagen);
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
