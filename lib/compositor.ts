// Arma la señal de programa en un lienzo de 1920 × 1080 con la gráfica de Diario Federal.
// Lo que se dibuja acá es exactamente lo que se graba y lo que toma OBS para YouTube.

export const ANCHO = 1920;
export const ALTO = 1080;
const ROJO = "#d0021b";
const ROJO_OSC = "#8e0013";
const NEGRO = "#16161a";
const FUENTE = "Manrope, Inter, Arial, Helvetica, sans-serif";
const ARRIBA = 64; // franja superior
const ABAJO = 72; // franja inferior

export type Escena = "dividida" | "invitado" | "periodista" | "pantalla" | "titular" | "placa";

export type Persona = {
  id: string;
  nombre: string;
  rol: string;
  video: HTMLVideoElement | null;
  conVideo: boolean;
  zocalo: boolean;
  esAnfitrion: boolean;
};

export type Cortina = { tipo: "apertura" | "cierre"; inicio: number; duracion: number };

export type Programa = {
  escena: Escena;
  foco: string | null;
  personas: Persona[]; // las que están en pantalla, en orden
  pantalla: HTMLVideoElement | null;
  titular: string;
  volanta: string;
  cinta: string;
  seccion: string;
  vivo: boolean;
  zocalos: boolean;
  placaTitulo: string;
  placaTexto: string;
  tema: string;
  cortina: Cortina | null;
  logo: HTMLImageElement | null;
};

const zocaloDesde = new Map<string, number>();
let escenaPrevia: Escena | null = null;
let cambioEscena = 0;

const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);

function cubrir(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, x: number, y: number, w: number, h: number, contener = false) {
  const vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh) return false;
  const r = vw / vh, R = w / h;
  if (contener) {
    let dw = w, dh = h;
    if (r > R) dh = w / r; else dw = h * r;
    ctx.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    return true;
  }
  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (r > R) { sw = vh * R; sx = (vw - sw) / 2; } else { sh = vw / R; sy = (vh - sh) / 2.6; }
  ctx.drawImage(v, sx, sy, sw, sh, x, y, w, h);
  return true;
}

function recortar(ctx: CanvasRenderingContext2D, texto: string, max: number) {
  if (ctx.measureText(texto).width <= max) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

function lineas(ctx: CanvasRenderingContext2D, texto: string, max: number, n: number) {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? actual + " " + p : p;
    if (ctx.measureText(prueba).width > max && actual) {
      out.push(actual);
      actual = p;
      if (out.length === n - 1) break;
    } else actual = prueba;
  }
  const resto = palabras.slice(out.join(" ").split(/\s+/).filter(Boolean).length).join(" ");
  if (out.length < n) out.push(recortar(ctx, out.length === n - 1 ? resto || actual : actual, max));
  return out.filter(Boolean);
}

function iniciales(n: string) {
  return n.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase() || "DF";
}

function marcaDF(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  ctx.fillStyle = ROJO;
  ctx.fillRect(x, y, t, t);
  ctx.fillStyle = "#fff";
  ctx.font = `800 ${Math.round(t * 0.5)}px ${FUENTE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("DF", x + t / 2, y + t / 2 + t * 0.03);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function fondo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const g = ctx.createRadialGradient(x + w / 2, y + h * 0.36, 10, x + w / 2, y + h * 0.4, Math.max(w, h) * 0.75);
  g.addColorStop(0, "#3c434d");
  g.addColorStop(0.45, "#232830");
  g.addColorStop(1, "#111418");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function sinVideo(ctx: CanvasRenderingContext2D, p: Persona, x: number, y: number, w: number, h: number) {
  fondo(ctx, x, y, w, h);
  const r = Math.min(w, h) * 0.13;
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.44, r, 0, Math.PI * 2);
  ctx.fillStyle = "#2c323b";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#5d6672";
  ctx.stroke();
  ctx.fillStyle = "#d7dbe0";
  ctx.font = `800 ${Math.round(r * 0.8)}px ${FUENTE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(iniciales(p.nombre), x + w / 2, y + h * 0.44 + 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function zocalo(ctx: CanvasRenderingContext2D, p: Persona, x: number, y: number, w: number, ahora: number, chico = false) {
  if (!zocaloDesde.has(p.id)) zocaloDesde.set(p.id, ahora);
  const k = ease((ahora - (zocaloDesde.get(p.id) || ahora)) / 450);
  const s = chico ? 0.62 : Math.max(0.62, Math.min(1, w / 1300));
  const tn = Math.round(46 * s), tr = Math.round(22 * s);
  ctx.font = `800 ${tn}px ${FUENTE}`;
  const nombre = (p.nombre || "Invitado").toUpperCase();
  ctx.font = `800 ${tn}px ${FUENTE}`;
  const an = ctx.measureText(nombre).width;
  ctx.font = `600 ${tr}px ${FUENTE}`;
  const ar = ctx.measureText((p.rol || "").toUpperCase()).width;
  const pad = Math.round(26 * s);
  const ancho = Math.min(w - 2 * pad, Math.max(520 * s, an, ar) + pad * 2 + 14 * s);
  const alto = Math.round((p.rol ? 112 : 80) * s);
  const x0 = x + pad, y0 = y - pad - alto;
  ctx.save();
  ctx.beginPath();
  const th = Math.round(36 * s);
  ctx.rect(x0, y0 - th - 4, ancho * k + 12, alto + th + 8);
  ctx.clip();
  // pestaña identificatoria: marca DF + rótulo
  const rotulo = p.esAnfitrion ? "CONDUCE" : "ENTREVISTA";
  ctx.font = `800 ${Math.round(17 * s)}px ${FUENTE}`;
  ctx.letterSpacing = `${Math.round(3 * s)}px`;
  const rw = ctx.measureText(rotulo).width + th + Math.round(30 * s);
  ctx.fillStyle = ROJO;
  ctx.fillRect(x0, y0 - th, rw, th);
  ctx.fillStyle = ROJO_OSC;
  ctx.fillRect(x0, y0 - th, th, th);
  ctx.fillStyle = "#fff";
  ctx.fillText(rotulo, x0 + th + Math.round(12 * s), y0 - Math.round(11 * s));
  ctx.letterSpacing = "0px";
  ctx.font = `800 ${Math.round(16 * s)}px ${FUENTE}`;
  ctx.textAlign = "center";
  ctx.fillText("DF", x0 + th / 2, y0 - Math.round(11 * s));
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.fillRect(x0 + 6, y0 + 8, ancho, alto);
  const g = ctx.createLinearGradient(x0, 0, x0 + ancho, 0);
  g.addColorStop(0, "rgba(14,16,20,.97)");
  g.addColorStop(1, "rgba(22,22,26,.88)");
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, ancho, alto);
  ctx.fillStyle = p.esAnfitrion ? ROJO : "#f1f2f4";
  ctx.fillRect(x0, y0, Math.round(10 * s), alto);
  ctx.fillStyle = ROJO;
  ctx.fillRect(x0 + Math.round(10 * s), y0 + alto - Math.round(5 * s), (ancho - 10 * s) * ease((ahora - (zocaloDesde.get(p.id) || 0) - 200) / 600), Math.round(5 * s));
  const tx = x0 + Math.round(10 * s) + pad * 0.85;
  ctx.globalAlpha = ease((ahora - (zocaloDesde.get(p.id) || 0) - 150) / 350);
  ctx.fillStyle = "#fff";
  ctx.font = `800 ${tn}px ${FUENTE}`;
  ctx.fillText(recortar(ctx, nombre, ancho - pad * 2), tx, y0 + (p.rol ? 54 : 54) * s);
  if (p.rol) {
    ctx.fillStyle = "#c9ced5";
    ctx.font = `600 ${tr}px ${FUENTE}`;
    ctx.fillText(recortar(ctx, p.rol.toUpperCase(), ancho - pad * 2), tx, y0 + 90 * s);
  }
  ctx.restore();
}

function cuadro(ctx: CanvasRenderingContext2D, p: Persona, x: number, y: number, w: number, h: number, ahora: number, conZocalo: boolean) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const ok = p.conVideo && p.video && cubrir(ctx, p.video, x, y, w, h);
  if (!ok) sinVideo(ctx, p, x, y, w, h);
  ctx.restore();
  if (conZocalo && p.zocalo) zocalo(ctx, p, x, y + h, w, ahora);
  else zocaloDesde.delete(p.id);
}

function franjas(ctx: CanvasRenderingContext2D, pr: Programa) {
  // superior
  const g = ctx.createLinearGradient(0, 0, ANCHO, 0);
  g.addColorStop(0, "#101318");
  g.addColorStop(0.55, "#20252c");
  g.addColorStop(1, "#111419");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ANCHO, ARRIBA);
  ctx.fillStyle = ROJO;
  ctx.fillRect(0, ARRIBA - 5, ANCHO, 5);
  if (pr.logo?.complete && pr.logo.naturalWidth) {
    const h = 40, w = (pr.logo.naturalWidth / pr.logo.naturalHeight) * h;
    ctx.drawImage(pr.logo, 30, 10, w, h);
  } else {
    marcaDF(ctx, 30, 11, 38);
    ctx.fillStyle = "#fff";
    ctx.font = `800 25px ${FUENTE}`;
    ctx.fillText("DIARIO FEDERAL", 84, 40);
    const a = ctx.measureText("DIARIO FEDERAL").width;
    ctx.fillStyle = "#59616c";
    ctx.fillRect(84 + a + 20, 18, 2, 26);
    ctx.fillStyle = "#b9bfc7";
    ctx.font = `700 19px ${FUENTE}`;
    ctx.fillText((pr.seccion || "ENTREVISTAS").toUpperCase(), 84 + a + 42, 39);
  }
  // reloj y en vivo
  const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" });
  ctx.font = `700 24px ${FUENTE}`;
  ctx.fillStyle = "#e9ebee";
  ctx.textAlign = "right";
  ctx.fillText(hora, ANCHO - 30, 40);
  const ah = ctx.measureText(hora).width;
  if (pr.vivo) {
    ctx.font = `800 18px ${FUENTE}`;
    const t = "EN VIVO";
    const tw = ctx.measureText(t).width;
    const x1 = ANCHO - 30 - ah - 26 - tw - 48;
    ctx.fillStyle = ROJO;
    ctx.fillRect(x1, 15, tw + 48, 32);
    ctx.fillStyle = "#fff";
    const titila = Math.floor(performance.now() / 600) % 2 === 0;
    ctx.globalAlpha = titila ? 1 : 0.35;
    ctx.beginPath();
    ctx.arc(x1 + 18, 31, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillText(t, x1 + tw + 36, 38);
  }
  ctx.textAlign = "left";
  // inferior
  const yb = ALTO - ABAJO;
  ctx.fillStyle = "#0d1014";
  ctx.fillRect(0, yb, ANCHO, ABAJO);
  ctx.fillStyle = "#4b525c";
  ctx.fillRect(0, yb, ANCHO, 1);
  const gr = ctx.createLinearGradient(0, yb, 0, ALTO);
  gr.addColorStop(0, "#e1192f");
  gr.addColorStop(1, ROJO_OSC);
  ctx.fillStyle = gr;
  ctx.font = `800 22px ${FUENTE}`;
  const marca = "DIARIO FEDERAL";
  const mw = ctx.measureText(marca).width + 56;
  ctx.fillRect(0, yb, mw, ABAJO);
  ctx.fillStyle = "#fff";
  ctx.fillText(marca, 28, yb + 44);
  ctx.font = `600 18px ${FUENTE}`;
  ctx.fillStyle = "#a4aab3";
  ctx.textAlign = "right";
  ctx.fillText("diariofederal.com.ar", ANCHO - 30, yb + 44);
  const sw = ctx.measureText("diariofederal.com.ar").width;
  ctx.textAlign = "left";
  ctx.fillStyle = "#f1f2f4";
  ctx.font = `700 25px ${FUENTE}`;
  ctx.fillText(recortar(ctx, pr.cinta || pr.titular || "", ANCHO - mw - sw - 110), mw + 30, yb + 45);
}

function grilla(n: number, x: number, y: number, w: number, h: number, sep = 6) {
  const out: [number, number, number, number][] = [];
  if (n <= 0) return out;
  if (n <= 3) {
    const cw = (w - sep * (n - 1)) / n;
    for (let i = 0; i < n; i++) out.push([x + i * (cw + sep), y, cw, h]);
    return out;
  }
  const cols = Math.ceil(n / 2);
  const cw = (w - sep * (cols - 1)) / cols, ch = (h - sep) / 2;
  for (let i = 0; i < n; i++) {
    const fila = i < cols ? 0 : 1;
    const enFila = fila === 0 ? cols : n - cols;
    const col = fila === 0 ? i : i - cols;
    const ancho = fila === 1 && enFila < cols ? (w - sep * (enFila - 1)) / enFila : cw;
    out.push([x + col * (ancho + sep), y + fila * (ch + sep), ancho, ch]);
  }
  return out;
}

function placa(ctx: CanvasRenderingContext2D, pr: Programa, ahora: number) {
  const g = ctx.createLinearGradient(0, 0, ANCHO, ALTO);
  g.addColorStop(0, "#0e1014");
  g.addColorStop(1, "#1d2128");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  // líneas diagonales sutiles
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  const corr = (ahora / 40) % 80;
  for (let i = -ALTO; i < ANCHO + ALTO; i += 80) {
    ctx.beginPath();
    ctx.moveTo(i + corr, 0);
    ctx.lineTo(i + corr - ALTO, ALTO);
    ctx.stroke();
  }
  ctx.restore();
  marcaDF(ctx, 160, 330, 150);
  ctx.fillStyle = "#fff";
  ctx.font = `800 96px ${FUENTE}`;
  ctx.fillText((pr.placaTitulo || "YA VOLVEMOS").toUpperCase(), 350, 430);
  ctx.fillStyle = ROJO;
  ctx.fillRect(350, 462, 220, 8);
  ctx.fillStyle = "#c9ced5";
  ctx.font = `600 40px ${FUENTE}`;
  for (const [i, l] of lineas(ctx, pr.placaTexto || "Diario Federal · Entrevistas", 1300, 2).entries()) ctx.fillText(l, 350, 540 + i * 54);
}

function cortina(ctx: CanvasRenderingContext2D, pr: Programa, c: Cortina, ahora: number) {
  const t = (ahora - c.inicio) / 1000;
  const d = c.duracion / 1000;
  // salida: en apertura se funde al programa; en cierre queda en la placa
  const alfa = c.tipo === "apertura" ? 1 - ease((t - (d - 0.9)) / 0.9) : 1;
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.fillStyle = "#0b0c0f";
  ctx.fillRect(0, 0, ANCHO, ALTO);
  // haz de luz que cruza
  const hx = -600 + ease(t / 2.4) * (ANCHO + 1200);
  const gl = ctx.createLinearGradient(hx - 500, 0, hx + 500, 0);
  gl.addColorStop(0, "rgba(208,2,27,0)");
  gl.addColorStop(0.5, "rgba(208,2,27,.22)");
  gl.addColorStop(1, "rgba(208,2,27,0)");
  ctx.fillStyle = gl;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  // retícula
  ctx.globalAlpha = alfa * 0.07 * ease(t / 1);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  for (let x = 0; x < ANCHO; x += 96) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ALTO); ctx.stroke(); }
  for (let y = 0; y < ALTO; y += 96) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ANCHO, y); ctx.stroke(); }
  ctx.globalAlpha = alfa;
  // cuadrado rojo que crece
  const kc = ease((t - 0.25) / 0.6);
  const lado = 170 * kc;
  const cx = 300, cy = 380;
  if (kc > 0) marcaDF(ctx, cx + (170 - lado) / 2, cy + (170 - lado) / 2, Math.max(1, lado));
  // DIARIO FEDERAL se descubre
  const kt = ease((t - 0.8) / 0.9);
  ctx.save();
  ctx.beginPath();
  ctx.rect(510, 360, 1300 * kt, 220);
  ctx.clip();
  ctx.fillStyle = "#fff";
  ctx.font = `800 132px ${FUENTE}`;
  ctx.fillText("DIARIO FEDERAL", 510, 500);
  ctx.restore();
  // barra roja con ENTREVISTAS (o el cierre)
  const kb = ease((t - 2.1) / 0.5);
  if (kb > 0) {
    ctx.fillStyle = ROJO;
    ctx.fillRect(0, 610, ANCHO * kb, 128);
    ctx.fillStyle = "#fff";
    ctx.font = `800 84px ${FUENTE}`;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 610, ANCHO * kb, 128);
    ctx.clip();
    const palabra = c.tipo === "apertura" ? (pr.seccion || "ENTREVISTAS").toUpperCase() : "GRACIAS POR ACOMPAÑARNOS";
    ctx.letterSpacing = "18px";
    ctx.fillText(palabra, 300, 702);
    ctx.letterSpacing = "0px";
    ctx.restore();
    // destello
    const fl = 1 - ease((t - 2.1) / 0.5);
    if (fl > 0 && fl < 1) {
      ctx.globalAlpha = alfa * fl * 0.5;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, ANCHO, ALTO);
      ctx.globalAlpha = alfa;
    }
  }
  // tema e invitado
  const ks = ease((t - 3.1) / 0.6);
  if (ks > 0) {
    ctx.globalAlpha = alfa * ks;
    ctx.fillStyle = "#e6e8eb";
    ctx.font = `600 46px ${FUENTE}`;
    const invitados = pr.personas.filter((p) => !p.esAnfitrion).map((p) => p.nombre).filter(Boolean);
    const sub = c.tipo === "apertura" ? pr.tema || pr.titular : "diariofederal.com.ar";
    for (const [i, l] of lineas(ctx, sub || "", 1400, 2).entries()) ctx.fillText(l, 300 + (1 - ks) * 40, 830 + i * 58);
    if (c.tipo === "apertura" && invitados.length) {
      ctx.fillStyle = "#9aa1ab";
      ctx.font = `700 32px ${FUENTE}`;
      ctx.fillText(("Con " + invitados.join(" y ")).toUpperCase(), 300 + (1 - ks) * 40, 955);
    }
  }
  ctx.restore();
}

export function dibujar(ctx: CanvasRenderingContext2D, pr: Programa, ahora: number) {
  if (pr.escena !== escenaPrevia) { escenaPrevia = pr.escena; cambioEscena = ahora; zocaloDesde.clear(); }
  ctx.fillStyle = NEGRO;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  const c = pr.cortina;
  const tapa = c && ahora - c.inicio < c.duracion - (c.tipo === "apertura" ? 900 : 0);
  if (c && c.tipo === "cierre" && ahora - c.inicio >= c.duracion) {
    placa(ctx, { ...pr, placaTitulo: "Gracias por acompañarnos", placaTexto: "Diario Federal · diariofederal.com.ar" }, ahora);
    return;
  }
  if (!tapa) {
    if (pr.escena === "placa") placa(ctx, pr, ahora);
    else {
      const y = ARRIBA, h = ALTO - ARRIBA - ABAJO;
      const conZ = pr.zocalos && pr.escena !== "titular";
      const anfitrion = pr.personas.find((p) => p.esAnfitrion);
      const invitados = pr.personas.filter((p) => !p.esAnfitrion);
      const enFoco = pr.personas.find((p) => p.id === pr.foco);
      if (pr.escena === "periodista" && anfitrion) cuadro(ctx, anfitrion, 0, y, ANCHO, h, ahora, conZ);
      else if (pr.escena === "invitado" && (enFoco && !enFoco.esAnfitrion ? enFoco : invitados[0])) cuadro(ctx, (enFoco && !enFoco.esAnfitrion ? enFoco : invitados[0])!, 0, y, ANCHO, h, ahora, conZ);
      else if (pr.escena === "pantalla" && pr.pantalla) {
        fondo(ctx, 0, y, ANCHO, h);
        cubrir(ctx, pr.pantalla, 24, y + 24, ANCHO - 48, h - 48, true);
        const chica = enFoco || anfitrion || pr.personas[0];
        if (chica) {
          const w = 448, hh = 252, x = ANCHO - w - 36, yy = y + h - hh - 36;
          ctx.fillStyle = "#000";
          ctx.fillRect(x - 4, yy - 4, w + 8, hh + 8);
          cuadro(ctx, chica, x, yy, w, hh, ahora, false);
          ctx.fillStyle = "rgba(14,16,20,.92)";
          ctx.fillRect(x, yy + hh - 44, w, 44);
          ctx.fillStyle = ROJO;
          ctx.fillRect(x, yy + hh - 44, 6, 44);
          ctx.fillStyle = "#fff";
          ctx.font = `800 20px ${FUENTE}`;
          ctx.fillText(recortar(ctx, chica.nombre.toUpperCase(), w - 30), x + 18, yy + hh - 15);
        }
      } else {
        const todos = pr.personas.length ? pr.personas : [];
        if (!todos.length) fondo(ctx, 0, y, ANCHO, h);
        for (const [i, [x, yy, w, hh]] of grilla(todos.length, 0, y, ANCHO, h).entries()) cuadro(ctx, todos[i], x, yy, w, hh, ahora, conZ);
      }
      if (pr.escena === "titular") {
        const k = ease((ahora - cambioEscena) / 500);
        const hb = 170, yb = ALTO - ABAJO - hb;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, yb, ANCHO * k, hb);
        ctx.clip();
        const g = ctx.createLinearGradient(0, 0, ANCHO, 0);
        g.addColorStop(0, "#c5101f");
        g.addColorStop(0.7, "#9e0b17");
        g.addColorStop(1, "#6f0912");
        ctx.fillStyle = g;
        ctx.fillRect(0, yb, ANCHO, hb);
        ctx.fillStyle = "#ffe0e1";
        ctx.font = `800 22px ${FUENTE}`;
        ctx.letterSpacing = "4px";
        ctx.fillText((pr.volanta || "DIARIO FEDERAL · ENTREVISTAS").toUpperCase(), 48, yb + 42);
        ctx.letterSpacing = "0px";
        ctx.fillStyle = "#fff";
        ctx.font = `800 50px ${FUENTE}`;
        for (const [i, l] of lineas(ctx, pr.titular || "", ANCHO - 96, 2).entries()) ctx.fillText(l, 48, yb + 98 + i * 56);
        ctx.restore();
      }
      franjas(ctx, pr);
    }
  }
  if (c && ahora - c.inicio < c.duracion) cortina(ctx, pr, c, ahora);
}
