"use client";

import { useEffect, useRef, useState } from "react";
import type { DataConnection, MediaConnection, default as PeerT } from "peerjs";
import {
  Radio, Video, VideoOff, Mic, MicOff, MonitorUp, MonitorOff, Settings, Users, Clapperboard, Copy, Circle, Square,
  Volume2, MessageSquare, Signal, Eye, EyeOff, Type, Crosshair, UserX, Check, X, Send, ExternalLink, Film, Tv,
  RefreshCw, Headphones, Sparkles,
} from "lucide-react";
import { ANCHO, ALTO, dibujar, type Escena, type Persona, type Programa, type Cortina } from "@/lib/compositor";
import { Mezcla } from "@/lib/mezcla";
import { FONDOS, NOTICIEROS, ProcesadorFondo, leerFoto, urlFondo, fijarBorde, bordeActual, fijarRecorte, recorteActual, type TipoFondo } from "@/lib/fondos";
import { crearPeer, idEstudio, nuevaSala, hora, iniciales, subirCalidad, VIDEO_HD, AUDIO_VOZ, type Mensaje } from "@/lib/red";

type Parte = {
  id: string;
  nombre: string;
  rol: string;
  stream: MediaStream | null;
  video: HTMLVideoElement | null;
  conVideo: boolean;
  enPantalla: boolean;
  zocalo: boolean;
  silenciado: boolean;
  volumen: number;
  esAnfitrion: boolean;
  llamada?: MediaConnection;
};
type Espera = { id: string; nombre: string; rol: string; llamada: MediaConnection };
type Chat = { de: string; texto: string; hora: string; mio?: boolean };
type Panel = "estudio" | "grafica" | "chat" | "salidas" | "ajustes";

const ESCENAS: { id: Escena; nombre: string }[] = [
  { id: "dividida", nombre: "Pantalla dividida" },
  { id: "invitado", nombre: "Invitado" },
  { id: "periodista", nombre: "Periodista" },
  { id: "titular", nombre: "Titular" },
  { id: "pantalla", nombre: "Pantalla compartida" },
  { id: "placa", nombre: "Placa / pausa" },
];

const AVISOS = ["Estás al aire", "Salimos en 10 segundos", "Vamos cerrando", "Hablá un poco más fuerte", "Mirá a la cámara"];

function leer(k: string, d: string) {
  try { return localStorage.getItem("dfs-" + k) ?? d; } catch { return d; }
}
function guardar(k: string, v: string) {
  try { localStorage.setItem("dfs-" + k, v); } catch {}
}

function crearVideo(stream: MediaStream) {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.autoplay = true;
  v.srcObject = stream;
  // se guarda dentro de la página (invisible) para que el navegador nunca deje de decodificar la imagen
  let caja = document.getElementById("dfs-fuentes");
  if (!caja) {
    caja = document.createElement("div");
    caja.id = "dfs-fuentes";
    caja.style.cssText = "position:fixed;left:0;bottom:0;width:4px;height:4px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1";
    document.body.appendChild(caja);
  }
  v.style.cssText = "width:4px;height:4px";
  caja.appendChild(v);
  v.play().catch(() => {});
  return v;
}

function reloj(ms: number) {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function Consola() {
  // ——— estado de la interfaz
  const [abierto, setAbierto] = useState(false);
  const [panel, setPanel] = useState<Panel>("estudio");
  const [sala, setSala] = useState("");
  const [conexion, setConexion] = useState<"apagado" | "conectando" | "conectado" | "error">("apagado");
  const [errorRed, setErrorRed] = useState("");
  const [, setVer] = useState(0);
  const refrescar = () => setVer((v) => v + 1);
  const [espera, setEspera] = useState<Espera[]>([]);
  const [chat, setChat] = useState<Chat[]>([]);
  const [textoChat, setTextoChat] = useState("");
  const [niveles, setNiveles] = useState<Record<string, number>>({});
  const [inicioSesion] = useState(() => Date.now());
  const [ahora, setAhora] = useState(Date.now());
  const [compartiendo, setCompartiendo] = useState(false);
  const [grabando, setGrabando] = useState<number | null>(null);
  const [aviso, setAviso] = useState("");
  const [camaras, setCamaras] = useState<MediaDeviceInfo[]>([]);
  const [micros, setMicros] = useState<MediaDeviceInfo[]>([]);
  const [camara, setCamara] = useState("");
  const [micro, setMicro] = useState("");
  const [monitorOn, setMonitorOn] = useState(true);
  const [fondo, setFondo] = useState<TipoFondo>("ninguno");
  const [config, setConfig] = useState(false);
  const [borde, setBorde] = useState(2);
  const [recorte, setRecorte] = useState<"ia" | "verde">("ia");
  useEffect(() => { setBorde(bordeActual()); setRecorte(recorteActual()); }, []);
  const [cargandoFondo, setCargandoFondo] = useState(false);
  const procFondo = useRef<ProcesadorFondo | null>(null);
  const fotoFondo = useRef<HTMLImageElement | null>(null);

  // ——— gráfica
  const [escena, setEscena] = useState<Escena>("dividida");
  const [foco, setFoco] = useState<string | null>(null);
  const [vivo, setVivo] = useState(false);
  const [zocalos, setZocalos] = useState(true);
  const [titular, setTitular] = useState("LA ACTUALIDAD, EN PRIMERA PERSONA");
  const [volanta, setVolanta] = useState("DIARIO FEDERAL · ENTREVISTAS");
  const [cinta, setCinta] = useState("");
  const [seccion, setSeccion] = useState("ENTREVISTAS");
  const [tema, setTema] = useState("");
  const [placaTitulo, setPlacaTitulo] = useState("Ya volvemos");
  const [placaTexto, setPlacaTexto] = useState("Diario Federal · Entrevistas");
  const [cortinaSonido, setCortinaSonido] = useState(true);
  const [nombreAnf, setNombreAnf] = useState("Álvaro Fontana");
  const [rolAnf, setRolAnf] = useState("Periodista · Diario Federal");

  // ——— OBS
  const [obsUrl, setObsUrl] = useState("ws://127.0.0.1:4455");
  const [obsClave, setObsClave] = useState("");
  const [obsEstado, setObsEstado] = useState<"desconectado" | "conectado" | "emitiendo" | "error">("desconectado");
  const [obsTiempo, setObsTiempo] = useState("");
  const [aperturaAlEmitir, setAperturaAlEmitir] = useState(true);
  // ——— puente propio en la nube (emite sin instalar nada)
  const [puenteUrl, setPuenteUrl] = useState(process.env.NEXT_PUBLIC_PUENTE_URL || "");
  const [puenteClave, setPuenteClave] = useState("");
  const [puenteEstado, setPuenteEstado] = useState<"apagado" | "despertando" | "conectando" | "emitiendo" | "error">("apagado");
  const [puenteMsg, setPuenteMsg] = useState("");
  const [puenteDesde, setPuenteDesde] = useState(0);

  // ——— referencias de trabajo (no causan render)
  const lienzo = useRef<HTMLCanvasElement>(null);
  const mezcla = useRef<Mezcla | null>(null);
  const peer = useRef<PeerT | null>(null);
  const partes = useRef(new Map<string, Parte>());
  const datos = useRef(new Map<string, DataConnection>());
  const pantalla = useRef<{ stream: MediaStream; video: HTMLVideoElement } | null>(null);
  const cortina = useRef<Cortina | null>(null);
  const salidaVideo = useRef<MediaStreamTrack | null>(null);
  const grabador = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);
  const obs = useRef<import("obs-websocket-js").default | null>(null);
  const logo = useRef<HTMLImageElement | null>(null);
  const intentos = useRef(0);
  const graf = useRef({ escena, foco, vivo, zocalos, titular, volanta, cinta, seccion, tema, placaTitulo, placaTexto });
  graf.current = { escena, foco, vivo, zocalos, titular, volanta, cinta, seccion, tema, placaTitulo, placaTexto };

  // datos guardados
  useEffect(() => {
    setSala(leer("sala", "") || nuevaSala());
    setNombreAnf(leer("nombre", "Álvaro Fontana"));
    setRolAnf(leer("rol", "Periodista · Diario Federal"));
    setObsUrl(leer("obs-url", "ws://127.0.0.1:4455"));
    setObsClave(leer("obs-clave", ""));
    setTitular(leer("titular", "LA ACTUALIDAD, EN PRIMERA PERSONA"));
    setTema(leer("tema", ""));
    setCamara(leer("camara", ""));
    setPuenteUrl(leer("puente-url", process.env.NEXT_PUBLIC_PUENTE_URL || ""));
    setPuenteClave(leer("puente-clave", ""));
    setMicro(leer("micro", ""));
  }, []);
  useEffect(() => { if (sala) guardar("sala", sala); }, [sala]);

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // ——— avisos breves en pantalla
  const avisar = (t: string) => {
    setAviso(t);
    window.setTimeout(() => setAviso((a) => (a === t ? "" : a)), 3500);
  };

  // ——— lista de personas para la gráfica
  function personasPrograma(): Persona[] {
    return [...partes.current.values()]
      .filter((p) => p.enPantalla)
      .map((p) => ({ id: p.id, nombre: p.nombre, rol: p.rol, video: p.video, conVideo: p.conVideo, zocalo: p.zocalo, esAnfitrion: p.esAnfitrion }));
  }

  function programa(): Programa {
    const g = graf.current;
    return {
      ...g,
      personas: personasPrograma(),
      pantalla: pantalla.current?.video || null,
      cortina: cortina.current,
      logo: logo.current,
    };
  }

  // ——— envío a invitados
  function enviar(m: Mensaje, a?: string) {
    for (const [id, c] of datos.current) if ((!a || a === id) && c.open) c.send(m);
  }
  function estadoA(id: string) {
    const p = partes.current.get(id);
    const g = graf.current;
    const alAire = !!p && p.enPantalla && g.vivo && g.escena !== "placa";
    enviar({ t: "estado", alAire, silenciado: !!p?.silenciado, enEspera: !p }, id);
  }
  function estadoATodos() {
    for (const id of datos.current.keys()) estadoA(id);
  }
  useEffect(estadoATodos, [vivo, escena]); // eslint-disable-line react-hooks/exhaustive-deps

  // ——— encender el estudio
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try { bc = new BroadcastChannel("dfs-consola"); } catch { return; }
    bc.onmessage = (ev) => {
      if (ev.data === "quien" && peer.current) bc?.postMessage("aca");
      if (ev.data === "aca") avisar("La consola ya está abierta en otra pestaña: cerrá una de las dos.");
    };
    canal.current = bc;
    return () => bc?.close();
  }, []);
  const canal = useRef<BroadcastChannel | null>(null);

  async function abrir() {
    canal.current?.postMessage("quien");
    try {
      mezcla.current = new Mezcla();
      await mezcla.current.ctx.resume();
    } catch {
      avisar("El navegador no permitió el audio.");
    }
    try { await document.fonts.load(`800 40px Manrope`); } catch {}
    // lienzo y bucle de dibujo (un reloj en segundo plano para que no se frene si la pestaña queda atrás)
    const cv = lienzo.current!;
    const ctx = cv.getContext("2d", { alpha: false })!;
    const reloj = new Worker(URL.createObjectURL(new Blob(["setInterval(()=>postMessage(0),33)"], { type: "text/javascript" })));
    reloj.onmessage = () => dibujar(ctx, programa(), performance.now());
    const pista = cv.captureStream(30).getVideoTracks()[0];
    salidaVideo.current = pista;
    const salida = new MediaStream([pista, ...(mezcla.current ? [mezcla.current.pistaPrograma] : [])]);
    (window as unknown as { dfPrograma: MediaStream }).dfPrograma = salida;
    // anfitrión
    const anf: Parte = { id: "anfitrion", nombre: nombreAnf, rol: rolAnf, stream: null, video: null, conVideo: false, enPantalla: true, zocalo: true, silenciado: false, volumen: 1, esAnfitrion: true };
    partes.current.set("anfitrion", anf);
    await camaraYMicro(camara, micro);
    setAbierto(true);
    listarDispositivos();
    conectar();
    // vúmetros
    window.setInterval(() => {
      const m = mezcla.current;
      if (!m) return;
      const n: Record<string, number> = {};
      for (const id of m.canales.keys()) n[id] = m.nivel(id);
      setNiveles(n);
    }, 120);
  }

  async function camaraYMicro(cam: string, mic: string) {
    const anf = partes.current.get("anfitrion")!;
    anf.stream?.getTracks().forEach((t) => t.stop());
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({
        video: { ...VIDEO_HD, width: { ideal: 1920 }, height: { ideal: 1080 }, ...(cam ? { deviceId: { exact: cam } } : {}) },
        audio: { ...AUDIO_VOZ, ...(mic ? { deviceId: { exact: mic } } : {}) },
      });
    } catch {
      try {
        s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        avisar("No se pudo usar la cámara o el micrófono. Revisá los permisos del navegador.");
        return;
      }
    }
    anf.stream = s;
    anf.conVideo = s.getVideoTracks().length > 0;
    await aplicarFondo((leer("fondo", "ninguno") as TipoFondo) || "ninguno");
    s.getAudioTracks().forEach((t) => (t.enabled = !anf.silenciado));
    mezcla.current?.agregar("anfitrion", s, { aMonitor: false });
    mezcla.current?.volumen("anfitrion", anf.volumen);
    mezcla.current?.silenciar("anfitrion", anf.silenciado);
    refrescar();
  }

  // ——— fondo virtual del anfitrión
  async function aplicarFondo(tipo: TipoFondo) {
    const anf = partes.current.get("anfitrion");
    if (!anf?.stream) return;
    setFondo(tipo);
    guardar("fondo", tipo);
    procFondo.current?.detener();
    procFondo.current = null;
    let fuente = anf.stream;
    if (tipo !== "ninguno" && !(tipo === "foto" && !fotoFondo.current)) {
      setCargandoFondo(true);
      try {
        procFondo.current = await ProcesadorFondo.crear(anf.stream, tipo, fotoFondo.current);
        fuente = procFondo.current.salida;
      } catch {
        avisar("No se pudo activar el fondo virtual en esta computadora.");
        setFondo("ninguno");
      }
      setCargandoFondo(false);
    }
    anf.video?.remove();
    anf.video = crearVideo(fuente);
    refrescar();
  }
  async function subirFoto(f: File | undefined) {
    if (!f) return;
    try {
      fotoFondo.current = await leerFoto(f);
      await aplicarFondo("foto");
    } catch {
      avisar("No se pudo leer esa imagen.");
    }
  }

  async function listarDispositivos() {
    const d = await navigator.mediaDevices.enumerateDevices();
    setCamaras(d.filter((x) => x.kind === "videoinput"));
    setMicros(d.filter((x) => x.kind === "audioinput"));
  }

  // ——— red
  async function conectar(salaId = sala || leer("sala", "")) {
    peer.current?.destroy();
    setConexion("conectando");
    setErrorRed("");
    const p = await crearPeer(idEstudio(salaId));
    peer.current = p;
    p.on("open", () => { intentos.current = 0; setErrorRed(""); setConexion("conectado"); });
    p.on("disconnected", () => { setConexion("conectando"); try { p.reconnect(); } catch {} });
    p.on("error", (e: { type?: string; message?: string }) => {
      if (e.type === "unavailable-id") {
        intentos.current += 1;
        setErrorRed(intentos.current >= 3
          ? "OCUPADA"
          : "La sala sigue ocupada por una sesión anterior. Reintento en unos segundos…");
        setConexion("conectando");
        window.setTimeout(() => peer.current === p && conectar(salaId), 6000);
      } else if (e.type === "peer-unavailable") {
        // un invitado se fue antes de conectar: no es grave
      } else {
        setErrorRed(e.message || "Problema de conexión");
        setConexion("error");
      }
    });
    p.on("connection", (c: DataConnection) => {
      c.on("open", () => {
        datos.current.set(c.peer, c);
        estadoA(c.peer);
      });
      c.on("data", (d) => recibir(c.peer, d as Mensaje));
      c.on("close", () => datos.current.delete(c.peer));
    });
    p.on("call", (llamada: MediaConnection) => {
      const md = (llamada.metadata || {}) as { nombre?: string; rol?: string };
      setEspera((l) => [...l.filter((x) => x.id !== llamada.peer), { id: llamada.peer, nombre: md.nombre || "Invitado", rol: md.rol || "", llamada }]);
      avisar(`${md.nombre || "Un invitado"} está en la sala de espera`);
      llamada.on("close", () => setEspera((l) => l.filter((x) => x.id !== llamada.peer)));
    });
  }

  function recibir(de: string, m: Mensaje) {
    if (m.t === "chat") setChat((c) => [...c, { de: m.de, texto: m.texto, hora: m.hora }]);
    if (m.t === "hola") {
      const p = partes.current.get(de);
      if (p) { p.nombre = m.nombre; p.rol = m.rol; refrescar(); }
      setEspera((l) => l.map((x) => (x.id === de ? { ...x, nombre: m.nombre, rol: m.rol } : x)));
    }
  }

  function admitir(e: Espera) {
    const m = mezcla.current;
    const pistas: MediaStreamTrack[] = [];
    if (salidaVideo.current) pistas.push(salidaVideo.current);
    if (m) pistas.push(m.retorno(e.id));
    e.llamada.answer(new MediaStream(pistas));
    // el retorno al invitado va a media resolución: alcanza para verse y alivia la computadora y la conexión
    window.setTimeout(() => {
      for (const sn of e.llamada.peerConnection?.getSenders() || []) {
        if (sn.track?.kind !== "video") continue;
        const pr = sn.getParameters();
        if (!pr.encodings?.length) pr.encodings = [{}];
        pr.encodings[0].scaleResolutionDownBy = 2;
        pr.encodings[0].maxBitrate = 1_200_000;
        sn.setParameters(pr).catch(() => {});
      }
    }, 1500);
    const parte: Parte = { id: e.id, nombre: e.nombre, rol: e.rol, stream: null, video: null, conVideo: false, enPantalla: true, zocalo: true, silenciado: false, volumen: 1, esAnfitrion: false, llamada: e.llamada };
    partes.current.set(e.id, parte);
    e.llamada.on("stream", (s: MediaStream) => {
      parte.stream = s;
      parte.video = crearVideo(s);
      parte.conVideo = s.getVideoTracks().length > 0;
      m?.agregar(e.id, s, { aMonitor: true, esInvitado: true });
      subirCalidad(e.llamada.peerConnection, 2500);
      refrescar();
    });
    const salir = () => {
      if (!partes.current.has(e.id)) return;
      partes.current.delete(e.id);
      m?.quitar(e.id);
      avisar(`${parte.nombre} se desconectó`);
      refrescar();
    };
    e.llamada.on("close", salir);
    e.llamada.on("error", salir);
    setEspera((l) => l.filter((x) => x.id !== e.id));
    window.setTimeout(() => estadoA(e.id), 500);
    refrescar();
  }

  function rechazar(e: Espera) {
    enviar({ t: "aviso", texto: "El estudio no puede recibirte ahora. Gracias." }, e.id);
    window.setTimeout(() => e.llamada.close(), 300);
    setEspera((l) => l.filter((x) => x.id !== e.id));
  }

  function expulsar(id: string) {
    const p = partes.current.get(id);
    if (!p) return;
    enviar({ t: "aviso", texto: "Terminó tu participación. ¡Gracias!" }, id);
    window.setTimeout(() => p.llamada?.close(), 300);
    partes.current.delete(id);
    mezcla.current?.quitar(id);
    refrescar();
  }

  // ——— controles por persona
  function cambiar(id: string, f: (p: Parte) => void) {
    const p = partes.current.get(id);
    if (!p) return;
    f(p);
    refrescar();
    estadoA(id);
  }
  function silenciar(id: string) {
    cambiar(id, (p) => {
      p.silenciado = !p.silenciado;
      mezcla.current?.silenciar(id, p.silenciado);
      if (p.esAnfitrion) p.stream?.getAudioTracks().forEach((t) => (t.enabled = !p.silenciado));
    });
  }
  function volumen(id: string, v: number) {
    const p = partes.current.get(id);
    if (!p) return;
    p.volumen = v;
    mezcla.current?.volumen(id, v);
    refrescar();
  }
  function camaraAnf() {
    cambiar("anfitrion", (p) => {
      const on = !p.conVideo;
      p.stream?.getVideoTracks().forEach((t) => (t.enabled = on));
      p.conVideo = on;
    });
  }

  // ——— pantalla compartida
  async function compartir() {
    if (pantalla.current) return dejarDeCompartir();
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true });
      pantalla.current = { stream: s, video: crearVideo(s) };
      if (s.getAudioTracks().length) mezcla.current?.agregar("pantalla", s, { aMonitor: true });
      s.getVideoTracks()[0].addEventListener("ended", dejarDeCompartir);
      setCompartiendo(true);
      setEscena("pantalla");
    } catch {
      /* canceló */
    }
  }
  function dejarDeCompartir() {
    pantalla.current?.stream.getTracks().forEach((t) => t.stop());
    pantalla.current = null;
    mezcla.current?.quitar("pantalla");
    setCompartiendo(false);
    setEscena((e) => (e === "pantalla" ? "dividida" : e));
  }

  // ——— cortinas
  function pasarCortina(tipo: "apertura" | "cierre") {
    const duracion = tipo === "apertura" ? 7200 : 6000;
    cortina.current = { tipo, inicio: performance.now(), duracion };
    if (cortinaSonido) mezcla.current?.cortina(duracion / 1000 - 0.8);
    if (tipo === "apertura") window.setTimeout(() => { if (cortina.current?.tipo === "apertura") cortina.current = null; }, duracion + 50);
    refrescar();
  }
  function elegirEscena(e: Escena) {
    cortina.current = null;
    setEscena(e);
  }

  // ——— grabación
  function grabar() {
    if (grabador.current) {
      grabador.current.stop();
      return;
    }
    const s = (window as unknown as { dfPrograma?: MediaStream }).dfPrograma;
    if (!s) return;
    const tipos = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
    const tipo = tipos.find((t) => MediaRecorder.isTypeSupported(t)) || "";
    const r = new MediaRecorder(s, { mimeType: tipo || undefined, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 });
    trozos.current = [];
    r.ondataavailable = (e) => e.data.size && trozos.current.push(e.data);
    r.onstop = () => {
      const ext = (r.mimeType || "").includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(trozos.current, { type: r.mimeType });
      const a = document.createElement("a");
      const f = new Date();
      a.href = URL.createObjectURL(blob);
      a.download = `DF-Entrevista-${f.toISOString().slice(0, 10)}-${String(f.getHours()).padStart(2, "0")}${String(f.getMinutes()).padStart(2, "0")}.${ext}`;
      a.click();
      grabador.current = null;
      setGrabando(null);
      avisar("Grabación descargada");
    };
    r.start(1000);
    grabador.current = r;
    setGrabando(Date.now());
  }

  // ——— salida limpia para OBS
  function abrirSalida() {
    const w = window.open("/salida", "df-salida", "popup,width=1280,height=720");
    if (!w) avisar("El navegador bloqueó la ventana. Permití ventanas emergentes para este sitio.");
  }

  // ——— OBS (control remoto por obs-websocket, que viene incluido en OBS 28 o más nuevo)
  async function conectarObs() {
    guardar("obs-url", obsUrl);
    guardar("obs-clave", obsClave);
    try {
      const { default: OBSWebSocket } = await import("obs-websocket-js");
      obs.current?.disconnect().catch(() => {});
      const o = new OBSWebSocket();
      await o.connect(obsUrl, obsClave || undefined);
      obs.current = o;
      setObsEstado("conectado");
      o.on("StreamStateChanged", (e) => {
        if (e.outputActive) { setObsEstado("emitiendo"); setVivo(true); }
        else if (e.outputState === "OBS_WEBSOCKET_OUTPUT_STOPPED") { setObsEstado("conectado"); setVivo(false); setObsTiempo(""); }
      });
      o.on("ConnectionClosed", () => { setObsEstado("desconectado"); obs.current = null; });
      const st = await o.call("GetStreamStatus");
      if (st.outputActive) setObsEstado("emitiendo");
    } catch {
      setObsEstado("error");
    }
  }
  useEffect(() => {
    if (obsEstado !== "emitiendo") return;
    const id = window.setInterval(async () => {
      try { const st = await obs.current?.call("GetStreamStatus"); if (st) setObsTiempo(st.outputTimecode.slice(0, 8)); } catch {}
    }, 1000);
    return () => window.clearInterval(id);
  }, [obsEstado]);
  const puente = useRef<{ ws: WebSocket; rec: MediaRecorder | null } | null>(null);
  async function emitirPuente() {
    if (puente.current) {
      if (!confirmarCorte()) return;
      puente.current.rec?.stop();
      puente.current.ws.close();
      puente.current = null;
      setPuenteEstado("apagado");
      setVivo(false);
      return;
    }
    const s = (window as unknown as { dfPrograma?: MediaStream }).dfPrograma;
    if (!s) return;
    const base = puenteUrl.trim().replace(/\/+$/, "");
    guardar("puente-url", base);
    guardar("puente-clave", puenteClave);
    // el servidor gratuito se duerme si no se usa: primero se lo despierta
    setPuenteEstado("despertando");
    setPuenteMsg("Despertando el servidor (puede tardar hasta un minuto)…");
    let listo = false;
    for (let i = 0; i < 30 && !listo; i++) {
      try {
        const r = await fetch(base + "/", { cache: "no-store" });
        const j = await r.json();
        if (j.falta?.length) { setPuenteEstado("error"); setPuenteMsg("Al servidor le falta configurar: " + j.falta.join(" y ")); return; }
        listo = true;
      } catch { await new Promise((ok) => setTimeout(ok, 3000)); }
    }
    if (!listo) { setPuenteEstado("error"); setPuenteMsg("No se pudo llegar al servidor. Revisá la dirección."); return; }
    setPuenteEstado("conectando");
    setPuenteMsg("Conectando con YouTube…");
    const tipos = ["video/webm;codecs=h264,opus", "video/x-matroska;codecs=avc1,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const tipo = tipos.find((t) => MediaRecorder.isTypeSupported(t)) || "";
    const codec = /h264|avc1/.test(tipo) ? "h264" : "otro";
    const ws = new WebSocket(base.replace(/^http/, "ws") + "/emitir");
    ws.binaryType = "arraybuffer";
    puente.current = { ws, rec: null };
    ws.onopen = () => ws.send(JSON.stringify({ clave: puenteClave, codec }));
    ws.onmessage = (ev) => {
      let m: { ok?: boolean; error?: string; aviso?: string; fin?: boolean } = {};
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.error) { setPuenteEstado("error"); setPuenteMsg(m.error); return; }
      if (m.aviso) setPuenteMsg(m.aviso);
      if (m.ok && puente.current?.ws === ws) {
        const opciones = { mimeType: tipo || undefined, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 160_000, videoKeyFrameIntervalDuration: 2000 } as MediaRecorderOptions;
        const rec = new MediaRecorder(s, opciones);
        rec.ondataavailable = (e) => {
          if (!e.data.size || ws.readyState !== 1) return;
          if (ws.bufferedAmount > 25_000_000) { setPuenteMsg("Tu conexión no da abasto: la emisión puede cortarse."); return; }
          ws.send(e.data);
        };
        rec.start(500);
        puente.current.rec = rec;
        setPuenteEstado("emitiendo");
        setPuenteDesde(Date.now());
        setPuenteMsg("En vivo en YouTube (la imagen tarda unos 15 segundos en aparecer allá)");
        setVivo(true);
        if (aperturaAlEmitir) window.setTimeout(() => pasarCortina("apertura"), 1500);
      }
    };
    ws.onclose = () => {
      if (puente.current?.ws !== ws) return;
      puente.current.rec?.stop();
      puente.current = null;
      setPuenteEstado((e) => (e === "error" ? e : "error"));
      setPuenteMsg((m) => (m.startsWith("Contraseña") || m.startsWith("Al servidor") ? m : "Se cortó la conexión con el servidor. Tocá Emitir para volver a salir."));
      setVivo(false);
    };
  }

  async function emitir() {
    if (puenteUrl.trim()) return emitirPuente();
    const o = obs.current;
    if (!o) { setPanel("salidas"); avisar("Primero conectá OBS en Salidas"); return; }
    if (obsEstado === "emitiendo") {
      if (!confirmarCorte()) return;
      await o.call("StopStream").catch(() => {});
      return;
    }
    await o.call("StartStream").catch(() => avisar("OBS no pudo empezar: revisá la clave de transmisión de YouTube en OBS."));
    if (aperturaAlEmitir) window.setTimeout(() => pasarCortina("apertura"), 1500);
  }
  const [pidiendoCorte, setPidiendoCorte] = useState(0);
  function confirmarCorte() {
    if (Date.now() - pidiendoCorte < 4000) { setPidiendoCorte(0); return true; }
    setPidiendoCorte(Date.now());
    avisar("Tocá de nuevo para cortar la transmisión");
    return false;
  }

  // ——— chat
  function mandarChat(texto = textoChat) {
    const t = texto.trim();
    if (!t) return;
    const m: Chat = { de: "Estudio", texto: t, hora: hora(), mio: true };
    setChat((c) => [...c, m]);
    enviar({ t: "chat", de: "Estudio", texto: t, hora: m.hora });
    setTextoChat("");
  }
  function avisoRapido(t: string) {
    enviar({ t: "aviso", texto: t });
    setChat((c) => [...c, { de: "Estudio → invitados", texto: t, hora: hora(), mio: true }]);
  }

  function copiarEnlace() {
    const url = `${window.location.origin}/invitado/${sala}`;
    navigator.clipboard?.writeText(url).then(() => avisar("Enlace copiado: mandáselo al invitado"), () => avisar(url));
  }

  function cambiarSala() {
    if (partes.current.size > 1 && !window.confirm("Hay invitados conectados. ¿Cambiar de sala igual? Se van a desconectar.")) return;
    const s = nuevaSala();
    setSala(s);
    guardar("sala", s);
    for (const p of partes.current.values()) if (!p.esAnfitrion) expulsar(p.id);
    window.setTimeout(() => conectar(s), 50);
  }

  const lista = [...partes.current.values()];
  const anf = partes.current.get("anfitrion");
  const invitados = lista.filter((p) => !p.esAnfitrion);
  const enlace = typeof window !== "undefined" && sala ? `${window.location.origin}/invitado/${sala}` : "";

  return (
    <main className="studio">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">DF</div><div><strong>DIARIO FEDERAL <span>STUDIO</span></strong><small>CONTROL DE REALIZACIÓN</small></div></div>
        <div className="top-status">
          <span className={conexion === "conectado" ? "live-dot" : conexion === "error" ? "red-dot" : "live-dot espera-dot"} />
          {conexion === "conectado" ? `SALA ${sala.toUpperCase()} · ABIERTA` : conexion === "conectando" ? "CONECTANDO…" : conexion === "error" ? "SIN CONEXIÓN" : "ESTUDIO APAGADO"}
          <i /> {reloj(ahora - inicioSesion)}
          {grabando && <><i /><span className="rec-chip"><span className="red-dot" />REC {reloj(ahora - grabando)}</span></>}
          {obsEstado === "emitiendo" && <><i /><span className="rec-chip aire"><span className="red-dot" />YOUTUBE {obsTiempo}</span></>}
          {puenteEstado === "emitiendo" && <><i /><span className="rec-chip aire"><span className="red-dot" />YOUTUBE {reloj(ahora - puenteDesde)}</span></>}
        </div>
        <div className="top-actions"><button className="icon-btn" onClick={() => setConfig(true)} aria-label="Configuración"><Settings size={17} /></button><div className="avatar">{iniciales(nombreAnf)}</div></div>
      </header>

      <section className="workspace">
        <aside className="left-rail">
          {([["estudio", Clapperboard, "Estudio"], ["grafica", Type, "Gráfica"], ["chat", MessageSquare, "Chat"], ["salidas", Signal, "Salidas"]] as const).map(([id, Icono, t]) => (
            <button key={id} className={"rail-item " + (panel === id ? "active" : "")} onClick={() => setPanel(id)}><Icono /><span>{t}</span>{id === "estudio" && espera.length > 0 && <em className="rail-badge">{espera.length}</em>}</button>
          ))}
          <div className="rail-bottom"><button className={"rail-item " + (panel === "ajustes" ? "active" : "")} onClick={() => setPanel("ajustes")}><Settings /><span>Ajustes</span></button></div>
        </aside>

        <section className="production">
          <div className="section-heading">
            <div><div className="eyebrow">PRODUCCIÓN / SALA {sala.toUpperCase()}</div><h1>Control de entrevistas</h1></div>
            <div className="heading-actions">
              <button className="config-btn" onClick={() => setConfig(true)}><Settings size={14} /> Configuración del programa</button>
              <button className={"aire-btn " + (vivo ? "on" : "")} onClick={() => setVivo(!vivo)} title="Marca EN VIVO en pantalla y avisa a los invitados">
                <span className="red-dot" />{vivo ? "AL AIRE" : "FUERA DEL AIRE"}
              </button>
            </div>
          </div>

          <div className="monitor">
            <div className="monitor-head"><span><span className="red-dot" /> PROGRAMA</span><span>FULL HD <i /> 1920 × 1080 <i /> 30 FPS</span></div>
            <div className="program-canvas-wrap">
              <canvas ref={lienzo} width={ANCHO} height={ALTO} className="program-canvas" />
              {!abierto && (
                <div className="arranque">
                  <div className="brand-mark grande">DF</div>
                  <h2>Estudio de entrevistas</h2>
                  <p>Al abrir, el navegador te va a pedir la cámara y el micrófono. Usá auriculares para que el invitado no se escuche con eco.</p>
                  <div className="arranque-campos">
                    <label>Tu nombre en el zócalo<input value={nombreAnf} onChange={(e) => { setNombreAnf(e.target.value); guardar("nombre", e.target.value); }} /></label>
                    <label>Tu cargo<input value={rolAnf} onChange={(e) => { setRolAnf(e.target.value); guardar("rol", e.target.value); }} /></label>
                  </div>
                  <button className="abrir-btn" onClick={abrir}><Sparkles size={16} /> Abrir el estudio</button>
                </div>
              )}
              {aviso && <div className="aviso-flotante">{aviso}</div>}
            </div>
            <div className="monitor-foot">
              <span><i className="green-dot" /> {cortina.current ? (cortina.current.tipo === "apertura" ? "PASANDO APERTURA" : "CIERRE") : "SEÑAL DE PROGRAMA"}</span>
              <span>{puenteEstado === "emitiendo" ? "Transmitiendo a YouTube" : obsEstado === "emitiendo" ? "Transmitiendo a YouTube por OBS" : "Sin transmisión activa"}</span>
              <button className="plain-icon" onClick={abrirSalida} title="Abrir salida limpia"><ExternalLink size={15} /></button>
            </div>
          </div>

          <div className="scene-section">
            <div className="subheading"><strong>ESCENAS</strong><span>Lo que elijas sale al aire al instante</span></div>
            <div className="scene-grid seis">
              {ESCENAS.map((s) => (
                <button key={s.id} onClick={() => elegirEscena(s.id)} disabled={s.id === "pantalla" && !compartiendo} className={"scene-card " + (escena === s.id && !cortina.current ? "selected" : "")}>
                  <div className={"scene-thumb thumb-" + s.id}><i /><i /></div><span>{s.nombre}</span>
                </button>
              ))}
            </div>
            <div className="cortinas">
              <button className="cortina-btn" onClick={() => pasarCortina("apertura")} disabled={!abierto}><Film size={15} /> Pasar apertura <small>DF · {seccion || "Entrevistas"}</small></button>
              <button className="cortina-btn" onClick={() => pasarCortina("cierre")} disabled={!abierto}><Film size={15} /> Pasar cierre <small>Gracias por acompañarnos</small></button>
              <label className="mini-check"><input type="checkbox" checked={cortinaSonido} onChange={(e) => setCortinaSonido(e.target.checked)} /> con música</label>
              <label className="mini-check"><input type="checkbox" checked={zocalos} onChange={(e) => setZocalos(e.target.checked)} /> zócalos</label>
            </div>
          </div>

          <div className="control-strip">
            <div className="control-group">
              <button className={"control-btn " + (anf?.silenciado ? "muted" : "")} onClick={() => silenciar("anfitrion")} disabled={!abierto}>{anf?.silenciado ? <MicOff /> : <Mic />}<span>{anf?.silenciado ? "Micrófono off" : "Micrófono"}</span></button>
              <button className={"control-btn " + (anf?.conVideo ? "on" : "")} onClick={camaraAnf} disabled={!abierto}>{anf?.conVideo ? <Video /> : <VideoOff />}<span>{anf?.conVideo ? "Cámara" : "Cámara off"}</span></button>
              <button className={"control-btn " + (compartiendo ? "on" : "")} onClick={compartir} disabled={!abierto}>{compartiendo ? <MonitorOff /> : <MonitorUp />}<span>{compartiendo ? "Dejar de compartir" : "Compartir pantalla"}</span></button>
              <label className={"control-btn fondo-sel " + (fondo !== "ninguno" ? "on" : "")} title="Fondo virtual">
                <Sparkles size={15} />
                <select value={fondo} onChange={(e) => aplicarFondo(e.target.value as TipoFondo)} disabled={!abierto || cargandoFondo}>
                  {FONDOS.filter((f) => f.id !== "foto" || fotoFondo.current).map((f) => <option key={f.id} value={f.id}>{cargandoFondo && f.id === fondo ? "Cargando…" : f.nombre}</option>)}
                </select>
              </label>
              <button className={"control-btn " + (monitorOn ? "" : "muted")} onClick={() => { const on = !monitorOn; setMonitorOn(on); if (mezcla.current) mezcla.current.monitor.gain.value = on ? 1 : 0; }} disabled={!abierto}><Headphones /><span>{monitorOn ? "Escucha" : "Escucha off"}</span></button>
            </div>
            <div className="record-group">
              <button className={"record-btn " + (grabando ? "rec" : "")} onClick={grabar} disabled={!abierto}>{grabando ? <Square size={12} /> : <Circle size={13} />} {grabando ? "Detener" : "Grabar"}</button>
              <button className="control-btn" onClick={abrirSalida} disabled={!abierto}><Tv size={15} /><span>Salida limpia</span></button>
              <button className={"broadcast-btn " + (obsEstado === "emitiendo" || puenteEstado === "emitiendo" ? "emitiendo" : obsEstado === "conectado" || puenteUrl ? "listo" : "")} onClick={emitir} disabled={!abierto || puenteEstado === "despertando" || puenteEstado === "conectando"}><Radio size={15} /> {obsEstado === "emitiendo" || puenteEstado === "emitiendo" ? "Cortar emisión" : puenteEstado === "despertando" || puenteEstado === "conectando" ? "Conectando…" : "Emitir en YouTube"}</button>
            </div>
          </div>
        </section>

        <aside className="right-panel">
          {panel === "estudio" && (
            <>
              <div className="panel-title"><div><span className="eyebrow">CONTROL DE SALA</span><h2>Participantes</h2></div><span className="count">{lista.length}{espera.length ? ` · ${espera.length} esperando` : ""}</span></div>
              {espera.map((e) => (
                <div className="participant espera" key={e.id}>
                  <div className="person-avatar guest-avatar">{iniciales(e.nombre)}</div>
                  <div className="person-info"><strong>{e.nombre}</strong><small>{e.rol || "En sala de espera"}</small></div>
                  <button className="mini-btn ok" onClick={() => admitir(e)} title="Hacer pasar"><Check size={14} /> Pasar</button>
                  <button className="mini-btn" onClick={() => rechazar(e)} title="Rechazar"><X size={14} /></button>
                </div>
              ))}
              {!abierto && <p className="panel-nota">Abrí el estudio para recibir invitados.</p>}
              {lista.map((p) => (
                <div className={"participant fila " + (p.enPantalla ? "" : "fuera")} key={p.id}>
                  <div className="fila-arriba">
                    <div className="person-avatar" style={{ boxShadow: `0 0 0 ${2 + Math.round((niveles[p.id] || 0) * 5)}px ${p.silenciado ? "#70343a" : "rgba(85,197,138,.55)"}` }}>{iniciales(p.nombre)}</div>
                    <div className="person-info"><strong>{p.nombre}</strong><small>{p.esAnfitrion ? "Anfitrión" : p.stream ? (p.rol || "Invitado") : "Conectando…"}</small></div>
                    {foco === p.id && <span className="waiting-tag">FOCO</span>}
                  </div>
                  <div className="meter"><i style={{ width: `${Math.round((p.silenciado ? 0 : niveles[p.id] || 0) * 100)}%` }} /></div>
                  <div className="fila-controles">
                    <button className={"mini-btn " + (p.silenciado ? "malo" : "")} onClick={() => silenciar(p.id)} title={p.silenciado ? "Habilitar audio" : "Silenciar"}>{p.silenciado ? <MicOff size={14} /> : <Mic size={14} />}</button>
                    <input className="vol" type="range" min={0} max={1.5} step={0.05} value={p.volumen} onChange={(e) => volumen(p.id, Number(e.target.value))} title={`Volumen ${Math.round(p.volumen * 100)} %`} />
                    <button className={"mini-btn " + (p.enPantalla ? "ok" : "")} onClick={() => cambiar(p.id, (x) => (x.enPantalla = !x.enPantalla))} title="En pantalla">{p.enPantalla ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                    <button className={"mini-btn " + (p.zocalo ? "ok" : "")} onClick={() => cambiar(p.id, (x) => (x.zocalo = !x.zocalo))} title="Zócalo con el nombre"><Type size={14} /></button>
                    <button className={"mini-btn " + (foco === p.id ? "ok" : "")} onClick={() => { setFoco(foco === p.id ? null : p.id); setEscena(p.esAnfitrion ? "periodista" : "invitado"); }} title="Poner solo en pantalla"><Crosshair size={14} /></button>
                    {!p.esAnfitrion && <button className="mini-btn" onClick={() => expulsar(p.id)} title="Despedir"><UserX size={14} /></button>}
                  </div>
                </div>
              ))}
              <button className="invite-btn" onClick={copiarEnlace} disabled={!sala}><Copy size={15} /> Copiar enlace de invitación</button>
              {enlace && <p className="enlace">{enlace}</p>}
              {errorRed && (errorRed === "OCUPADA" ? (
                <div className="settings-note">
                  Esta sala está abierta en otra pestaña o ventana (puede ser en otra computadora). Cerrala y esperá un minuto, o seguí con una sala nueva (cambia el enlace del invitado).
                  <button className="invite-btn" onClick={cambiarSala}><RefreshCw size={14} /> Usar una sala nueva</button>
                </div>
              ) : <p className="settings-note">{errorRed}</p>)}
              <div className="panel-divider" />
              <div className="panel-title compact"><div><span className="eyebrow">MENSAJE AL INVITADO</span><h2>Avisos rápidos</h2></div></div>
              <div className="avisos">{AVISOS.map((a) => <button key={a} onClick={() => avisoRapido(a)} disabled={!invitados.length}>{a}</button>)}</div>
            </>
          )}

          {panel === "grafica" && (
            <>
              <div className="panel-title compact"><div><span className="eyebrow">DATOS DEL PROGRAMA</span><h2>Gráfica en pantalla</h2></div></div>
              {lista.map((p) => (
                <div key={p.id} className="zocalo-edit">
                  <label className="field-label">Zócalo · {p.esAnfitrion ? "periodista" : "invitado"}</label>
                  <input value={p.nombre} onChange={(e) => cambiar(p.id, (x) => { x.nombre = e.target.value; if (x.esAnfitrion) { setNombreAnf(e.target.value); guardar("nombre", e.target.value); } })} />
                  <input value={p.rol} placeholder="Cargo o identificación" onChange={(e) => cambiar(p.id, (x) => { x.rol = e.target.value; if (x.esAnfitrion) { setRolAnf(e.target.value); guardar("rol", e.target.value); } })} />
                </div>
              ))}
              <label className="field-label">Tema de la entrevista (aparece en la apertura)</label><input value={tema} onChange={(e) => { setTema(e.target.value); guardar("tema", e.target.value); }} placeholder="Ej.: La reforma laboral, punto por punto" />
              <label className="field-label">Titular (escena Titular)</label><input value={titular} onChange={(e) => { setTitular(e.target.value); guardar("titular", e.target.value); }} />
              <label className="field-label">Volanta del titular</label><input value={volanta} onChange={(e) => setVolanta(e.target.value)} />
              <label className="field-label">Texto de la franja inferior (vacío: usa el titular)</label><input value={cinta} onChange={(e) => setCinta(e.target.value)} />
              <label className="field-label">Sección (arriba a la izquierda y en la apertura)</label><input value={seccion} onChange={(e) => setSeccion(e.target.value)} />
              <label className="field-label">Placa de pausa: título</label><input value={placaTitulo} onChange={(e) => setPlacaTitulo(e.target.value)} />
              <label className="field-label">Placa de pausa: texto</label><input value={placaTexto} onChange={(e) => setPlacaTexto(e.target.value)} />
            </>
          )}

          {panel === "chat" && (
            <>
              <div className="panel-title compact"><div><span className="eyebrow">COMUNICACIÓN INTERNA</span><h2>Chat con invitados</h2></div></div>
              <p className="panel-nota">Esto no sale al aire: solo lo ven el estudio y los invitados.</p>
              <div className="chat-lista">
                {chat.length === 0 && <p className="panel-nota">Todavía no hay mensajes.</p>}
                {chat.map((m, i) => <div key={i} className={"chat-msg " + (m.mio ? "mio" : "")}><b>{m.de}</b> <small>{m.hora}</small><p>{m.texto}</p></div>)}
              </div>
              <form className="chat-form" onSubmit={(e) => { e.preventDefault(); mandarChat(); }}>
                <input value={textoChat} onChange={(e) => setTextoChat(e.target.value)} placeholder="Escribí un mensaje" />
                <button className="mini-btn ok" type="submit"><Send size={14} /></button>
              </form>
            </>
          )}

          {panel === "salidas" && (
            <>
              <div className="panel-title compact"><div><span className="eyebrow">YOUTUBE · DESDE CUALQUIER COMPU</span><h2>Servidor del estudio</h2></div><span className={"output-state " + (puenteEstado === "emitiendo" ? "" : "off")}>{puenteEstado.toUpperCase()}</span></div>
              <p className="panel-nota">Con el servidor del estudio no hace falta instalar nada: la consola le manda el programa y el servidor lo pasa a YouTube. La clave de YouTube queda guardada en el servidor.</p>
              <label className="field-label">Dirección del servidor</label><input value={puenteUrl} onChange={(e) => setPuenteUrl(e.target.value)} placeholder="https://usuario-df-studio-puente.hf.space" />
              <label className="field-label">Contraseña del estudio</label><input type="password" value={puenteClave} onChange={(e) => setPuenteClave(e.target.value)} />
              {puenteMsg && <p className={puenteEstado === "error" ? "settings-note" : "panel-nota"}>{puenteMsg}</p>}
              <button className={"broadcast-btn ancho " + (puenteEstado === "emitiendo" ? "emitiendo" : "listo")} onClick={emitirPuente} disabled={!abierto || !puenteUrl || puenteEstado === "despertando" || puenteEstado === "conectando"}><Radio size={15} /> {puenteEstado === "emitiendo" ? "Cortar emisión" : "Emitir en YouTube"}</button>
              <label className="mini-check"><input type="checkbox" checked={aperturaAlEmitir} onChange={(e) => setAperturaAlEmitir(e.target.checked)} /> Pasar la apertura al empezar</label>
              <div className="panel-divider" />
              <div className="panel-title compact"><div><span className="eyebrow">ALTERNATIVA</span><h2>Emitir con OBS</h2></div><span className={"output-state " + (obsEstado === "emitiendo" ? "" : "off")}>{obsEstado.toUpperCase()}</span></div>
              <p className="panel-nota">Solo si no usás el servidor (dejá vacía la dirección de arriba).</p>
              <ol className="guia">
                <li>Instalá <b>OBS Studio</b> (gratis, obsproject.com) en esta computadora.</li>
                <li>En <b>YouTube Studio → Emitir en vivo</b> copiá la <b>clave de transmisión</b>. En OBS: Ajustes → Emisión → Servicio YouTube → pegá la clave. Se hace una sola vez.</li>
                <li>Tocá <b>Salida limpia</b>. En OBS agregá una fuente <b>Captura de ventana</b>, elegí “DF Studio · Salida” y tildá <b>Capturar audio</b>. Ajustá a pantalla completa (clic derecho → Transformar → Ajustar a pantalla).</li>
                <li>En OBS: Herramientas → <b>Ajustes del servidor WebSocket</b> → Habilitar. Copiá la contraseña acá abajo y tocá Conectar.</li>
                <li>Desde acá: <b>Emitir en YouTube</b> arranca la transmisión{aperturaAlEmitir ? " y pasa la apertura" : ""}. La misma tecla, dos toques, la corta.</li>
              </ol>
              <label className="field-label">Dirección de OBS</label><input value={obsUrl} onChange={(e) => setObsUrl(e.target.value)} />
              <label className="field-label">Contraseña del WebSocket de OBS</label><input type="password" value={obsClave} onChange={(e) => setObsClave(e.target.value)} />
              <button className="invite-btn" onClick={conectarObs}><RefreshCw size={14} /> {obsEstado === "desconectado" || obsEstado === "error" ? "Conectar con OBS" : "Reconectar"}</button>
              {obsEstado === "error" && <p className="settings-note">No encontré OBS. Fijate que esté abierto, con el servidor WebSocket habilitado y la misma contraseña.</p>}
              <label className="mini-check"><input type="checkbox" checked={aperturaAlEmitir} onChange={(e) => setAperturaAlEmitir(e.target.checked)} /> Pasar la apertura al empezar</label>
              <div className="panel-divider" />
              <div className="panel-title compact"><div><span className="eyebrow">ARCHIVO</span><h2>Grabación</h2></div></div>
              <p className="panel-nota">Grabar guarda el programa completo (imagen y sonido, como sale al aire) y lo descarga al terminar. Sirve también para subirlo después a YouTube o a la web del diario.</p>
              <button className={"record-btn ancho " + (grabando ? "rec" : "")} onClick={grabar} disabled={!abierto}>{grabando ? <Square size={12} /> : <Circle size={13} />} {grabando ? `Detener · ${reloj(ahora - grabando)}` : "Empezar a grabar"}</button>
            </>
          )}

          {panel === "ajustes" && (
            <>
              <div className="panel-title compact"><div><span className="eyebrow">IMAGEN</span><h2>Fondo virtual</h2></div></div>
              <p className="panel-nota">Recorta a la persona y pone detrás un fondo de estudio con la gráfica DF. Funciona dentro del navegador, sin instalar nada.</p>
              <select value={fondo} onChange={(e) => aplicarFondo(e.target.value as TipoFondo)} disabled={!abierto || cargandoFondo}>
                {FONDOS.filter((f) => f.id !== "foto" || fotoFondo.current).map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select>
              <label className="field-label">Cómo se recorta a la persona</label>
              <div className="avisos">
                <button className={recorte === "ia" ? "elegido" : ""} onClick={() => { setRecorte("ia"); fijarRecorte("ia"); }}>Inteligencia artificial (sin nada atrás)</button>
                <button className={recorte === "verde" ? "elegido" : ""} onClick={() => { setRecorte("verde"); fijarRecorte("verde"); }}>Pantalla verde (con tela verde detrás)</button>
              </div>
              <label className="field-label">Ajuste del borde del recorte: {["mínimo", "suave", "normal", "firme", "fuerte", "máximo"][borde] || borde}</label>
              <input className="vol ancho" type="range" min={0} max={5} step={1} value={borde} onChange={(e) => { const n = Number(e.target.value); setBorde(n); fijarBorde(n); }} />
              <p className="panel-nota">Más a la derecha: menos halo claro alrededor tuyo.</p>
              <label className="field-label">Usar una foto propia de fondo (por ejemplo, una redacción real)</label>
              <input type="file" accept="image/*" onChange={(e) => subirFoto(e.target.files?.[0])} disabled={!abierto} />
              <div className="panel-divider" />
              <div className="panel-title compact"><div><span className="eyebrow">EQUIPOS</span><h2>Cámara y micrófono</h2></div></div>
              <label className="field-label">Cámara</label>
              <select value={camara} onChange={(e) => { setCamara(e.target.value); guardar("camara", e.target.value); camaraYMicro(e.target.value, micro); }} disabled={!abierto}>
                <option value="">Predeterminada</option>
                {camaras.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Cámara ${i + 1}`}</option>)}
              </select>
              <label className="field-label">Micrófono</label>
              <select value={micro} onChange={(e) => { setMicro(e.target.value); guardar("micro", e.target.value); camaraYMicro(camara, e.target.value); }} disabled={!abierto}>
                <option value="">Predeterminado</option>
                {micros.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Micrófono ${i + 1}`}</option>)}
              </select>
              <div className="panel-divider" />
              <div className="panel-title compact"><div><span className="eyebrow">SALA</span><h2>Enlace de invitados</h2></div></div>
              <p className="panel-nota">La sala <b>{sala.toUpperCase()}</b> queda fija en esta computadora: el mismo enlace sirve para todas las entrevistas. Si un enlace circuló de más, creá una sala nueva.</p>
              <button className="invite-btn" onClick={cambiarSala}><RefreshCw size={14} /> Crear sala nueva</button>
              <button className="invite-btn" onClick={() => conectar()} disabled={!abierto}><Signal size={14} /> Reconectar la sala</button>
              <div className="panel-divider" />
              <div className="output-row"><div><Volume2 size={16} /><span>Audio de programa</span></div><span className="output-state">{abierto ? "ACTIVO" : "—"}</span></div>
              <div className="output-row"><div><Users size={16} /><span>Invitados conectados</span></div><span className="output-state">{invitados.length}</span></div>
            </>
          )}

          <div className="panel-bottom"><span><Clapperboard size={13} /> DF STUDIO · 1.0</span><span>{conexion === "conectado" ? "EN LÍNEA" : conexion.toUpperCase()}</span></div>
        </aside>
      </section>
      {config && (
        <div className="modal-fondo" onClick={() => setConfig(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-cabeza">
              <div><span className="eyebrow">DIARIO FEDERAL STUDIO</span><h2>Configuración del programa</h2></div>
              <button className="icon-btn" onClick={() => setConfig(false)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="modal-cuerpo">
              <section>
                <h3>Conductor / anfitrión</h3>
                <div className="dos-col">
                  <label>Nombre en el zócalo<input value={nombreAnf} onChange={(e) => { const v = e.target.value; setNombreAnf(v); guardar("nombre", v); const a = partes.current.get("anfitrion"); if (a) a.nombre = v; refrescar(); }} /></label>
                  <label>Cargo<input value={rolAnf} onChange={(e) => { const v = e.target.value; setRolAnf(v); guardar("rol", v); const a = partes.current.get("anfitrion"); if (a) a.rol = v; refrescar(); }} /></label>
                </div>
                {invitados.length > 0 && <h3>Invitados</h3>}
                {invitados.map((p) => (
                  <div className="dos-col" key={p.id}>
                    <label>Nombre<input value={p.nombre} onChange={(e) => cambiar(p.id, (x) => (x.nombre = e.target.value))} /></label>
                    <label>Cargo<input value={p.rol} onChange={(e) => cambiar(p.id, (x) => (x.rol = e.target.value))} /></label>
                  </div>
                ))}
              </section>

              <section>
                <h3>Fondo detrás del conductor {cargandoFondo && <small>· preparando el fondo…</small>}</h3>
                <p className="panel-nota">Fondos de canal de noticias. También podés subir una foto propia, por ejemplo de un estudio o de la redacción. {!abierto && "Abrí el estudio para aplicarlos."}</p>
                <div className="fondos-grilla">
                  <button className={"fondo-tile " + (fondo === "ninguno" ? "on" : "")} onClick={() => aplicarFondo("ninguno")} disabled={!abierto || cargandoFondo}><span className="fondo-vacio">Cámara real</span><b>Sin fondo</b></button>
                  {NOTICIEROS.map((n) => (
                    <button key={n.id} className={"fondo-tile " + (fondo === n.id ? "on" : "")} onClick={() => aplicarFondo(n.id)} disabled={!abierto || cargandoFondo}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={urlFondo(n.id)} alt={n.nombre} loading="lazy" />
                      <b>{n.nombre}</b>
                    </button>
                  ))}
                  <button className={"fondo-tile " + (fondo === "desenfoque" ? "on" : "")} onClick={() => aplicarFondo("desenfoque")} disabled={!abierto || cargandoFondo}><span className="fondo-vacio desenf">Tu lugar, desenfocado</span><b>Desenfocar</b></button>
                  <label className={"fondo-tile " + (fondo === "foto" ? "on" : "")}>
                    <span className="fondo-vacio">Subir foto…</span><b>Foto propia</b>
                    <input type="file" accept="image/*" hidden onChange={(e) => subirFoto(e.target.files?.[0])} disabled={!abierto} />
                  </label>
                </div>

                <label className="field-label">Cómo se recorta a la persona</label>
                <div className="avisos">
                  <button className={recorte === "ia" ? "elegido" : ""} onClick={() => { setRecorte("ia"); fijarRecorte("ia"); }}>Inteligencia artificial (sin nada atrás)</button>
                  <button className={recorte === "verde" ? "elegido" : ""} onClick={() => { setRecorte("verde"); fijarRecorte("verde"); }}>Pantalla verde (con tela verde detrás)</button>
                </div>
                <label className="field-label">Ajuste del borde del recorte: {["mínimo", "suave", "normal", "firme", "fuerte", "máximo"][borde] || borde}</label>
                <input className="vol ancho" type="range" min={0} max={5} step={1} value={borde} onChange={(e) => { const n = Number(e.target.value); setBorde(n); fijarBorde(n); }} />
                <p className="panel-nota">Si ves un halo claro alrededor tuyo, subilo. Si te recorta el pelo o las orejas, bajalo.</p>
              </section>

              <section>
                <h3>Textos en pantalla</h3>
                <div className="dos-col">
                  <label>Sección (arriba y en la apertura)<input value={seccion} onChange={(e) => setSeccion(e.target.value)} /></label>
                  <label>Tema de la entrevista (apertura)<input value={tema} onChange={(e) => { setTema(e.target.value); guardar("tema", e.target.value); }} placeholder="Ej.: La reforma laboral, punto por punto" /></label>
                  <label>Titular<input value={titular} onChange={(e) => { setTitular(e.target.value); guardar("titular", e.target.value); }} /></label>
                  <label>Volanta del titular<input value={volanta} onChange={(e) => setVolanta(e.target.value)} /></label>
                  <label>Franja inferior (vacío: usa el titular)<input value={cinta} onChange={(e) => setCinta(e.target.value)} /></label>
                  <label>Placa de pausa<input value={placaTitulo} onChange={(e) => setPlacaTitulo(e.target.value)} /></label>
                </div>
              </section>

              <section>
                <h3>Opciones</h3>
                <label className="mini-check"><input type="checkbox" checked={zocalos} onChange={(e) => setZocalos(e.target.checked)} /> Mostrar zócalos con nombre y cargo</label>
                <label className="mini-check"><input type="checkbox" checked={cortinaSonido} onChange={(e) => setCortinaSonido(e.target.checked)} /> Música en la apertura y el cierre</label>
                <label className="mini-check"><input type="checkbox" checked={aperturaAlEmitir} onChange={(e) => setAperturaAlEmitir(e.target.checked)} /> Pasar la apertura al empezar a emitir</label>
              </section>
            </div>
            <div className="modal-pie"><button className="abrir-btn" onClick={() => setConfig(false)}>Listo</button></div>
          </div>
        </div>
      )}
      <footer><span>DIARIO FEDERAL STUDIO</span><span>Conexión directa entre navegadores · sin costo</span><span>Gráfica editorial DF</span></footer>
    </main>
  );
}
