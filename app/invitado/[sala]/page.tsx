"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { DataConnection, MediaConnection, default as PeerT } from "peerjs";
import { Mic, MicOff, Video, VideoOff, Send, LogOut, Headphones } from "lucide-react";
import { FONDOS, ProcesadorFondo, type TipoFondo } from "@/lib/fondos";
import { crearPeer, idEstudio, idInvitado, hora, subirCalidad, VIDEO_HD, AUDIO_VOZ, type Mensaje } from "@/lib/red";

type Estado = "preparando" | "conectando" | "espera" | "conectado" | "terminado";

function leer(k: string, d: string) {
  try { return localStorage.getItem("dfi-" + k) ?? d; } catch { return d; }
}
function guardar(k: string, v: string) {
  try { localStorage.setItem("dfi-" + k, v); } catch {}
}

export default function Invitado() {
  const { sala } = useParams<{ sala: string }>();
  const [estado, setEstado] = useState<Estado>("preparando");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("");
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [alAire, setAlAire] = useState(false);
  const [silenciadoPorEstudio, setSilenciadoPorEstudio] = useState(false);
  const [aviso, setAviso] = useState("");
  const [nota, setNota] = useState("");
  const [nivel, setNivel] = useState(0);
  const [chat, setChat] = useState<{ de: string; texto: string; hora: string; mio?: boolean }[]>([]);
  const [texto, setTexto] = useState("");
  const [camaras, setCamaras] = useState<MediaDeviceInfo[]>([]);
  const [micros, setMicros] = useState<MediaDeviceInfo[]>([]);
  const [camara, setCamara] = useState("");
  const [micro, setMicro] = useState("");
  const propio = useRef<HTMLVideoElement>(null);
  const retorno = useRef<HTMLVideoElement>(null);
  const local = useRef<MediaStream | null>(null);
  const crudo = useRef<MediaStream | null>(null);
  const procFondo = useRef<ProcesadorFondo | null>(null);
  const [fondo, setFondo] = useState<TipoFondo>("ninguno");
  const [cargandoFondo, setCargandoFondo] = useState(false);
  const peer = useRef<PeerT | null>(null);
  const llamada = useRef<MediaConnection | null>(null);
  const datos = useRef<DataConnection | null>(null);
  const reintento = useRef<number>(0);

  useEffect(() => {
    setNombre(leer("nombre", ""));
    setRol(leer("rol", ""));
    const f = (leer("fondo", "ninguno") as TipoFondo) || "ninguno";
    setFondo(f);
    prender("", "", f);
    return () => { crudo.current?.getTracks().forEach((t) => t.stop()); procFondo.current?.detener(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function prender(c: string, m: string, tipoFondo: TipoFondo = fondo) {
    crudo.current?.getTracks().forEach((t) => t.stop());
    procFondo.current?.detener();
    procFondo.current = null;
    try {
      const cam0 = await navigator.mediaDevices.getUserMedia({
        video: { ...VIDEO_HD, ...(c ? { deviceId: { exact: c } } : { facingMode: "user" }) },
        audio: { ...AUDIO_VOZ, ...(m ? { deviceId: { exact: m } } : {}) },
      });
      crudo.current = cam0;
      let s = cam0;
      if (tipoFondo !== "ninguno" && tipoFondo !== "foto") {
        setCargandoFondo(true);
        try {
          procFondo.current = await ProcesadorFondo.crear(cam0, tipoFondo);
          s = procFondo.current.salida;
        } catch {
          setNota("Tu equipo no pudo activar el fondo virtual; seguís con la cámara normal.");
        }
        setCargandoFondo(false);
      }
      local.current = s;
      if (propio.current) propio.current.srcObject = s;
      s.getAudioTracks().forEach((t) => (t.enabled = mic));
      s.getVideoTracks().forEach((t) => (t.enabled = cam));
      medidor(cam0);
      const d = await navigator.mediaDevices.enumerateDevices();
      setCamaras(d.filter((x) => x.kind === "videoinput"));
      setMicros(d.filter((x) => x.kind === "audioinput"));
      // si ya estaba en la entrevista, se cambian las pistas sin cortar
      const pc = llamada.current?.peerConnection;
      if (pc) for (const sn of pc.getSenders()) {
        const nueva = s.getTracks().find((t) => t.kind === sn.track?.kind);
        if (nueva) sn.replaceTrack(nueva).catch(() => {});
      }
      setNota("");
    } catch {
      setNota("No pudimos usar tu cámara o micrófono. Tocá el candado de la barra de direcciones y permití cámara y micrófono; después recargá la página.");
    }
  }

  const medidorCtx = useRef<AudioContext | null>(null);
  function medidor(s: MediaStream) {
    try {
      medidorCtx.current?.close();
      const ctx = new AudioContext();
      medidorCtx.current = ctx;
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(an);
      const d = new Float32Array(an.fftSize);
      const loop = () => {
        if (ctx.state === "closed") return;
        an.getFloatTimeDomainData(d);
        let x = 0;
        for (const v of d) x += v * v;
        const db = 20 * Math.log10(Math.sqrt(x / d.length) || 1e-8);
        setNivel(Math.max(0, Math.min(1, (db + 60) / 60)));
        window.setTimeout(loop, 100);
      };
      loop();
    } catch {}
  }

  async function entrar() {
    if (!nombre.trim()) { setNota("Escribí tu nombre: es el que aparece en pantalla."); return; }
    if (!local.current) { setNota("Falta habilitar la cámara y el micrófono."); return; }
    guardar("nombre", nombre);
    guardar("rol", rol);
    medidorCtx.current?.resume();
    setEstado("conectando");
    setNota("");
    peer.current?.destroy();
    const p = await crearPeer(idInvitado(sala));
    peer.current = p;
    p.on("open", () => llamar(p));
    p.on("error", (e: { type?: string }) => {
      if (e.type === "peer-unavailable") {
        setNota("El estudio todavía no abrió la sala. Esperá, reintentamos solos cada 5 segundos.");
        setEstado("conectando");
        window.clearTimeout(reintento.current);
        reintento.current = window.setTimeout(() => llamar(p), 5000);
      } else if (e.type === "network" || e.type === "server-error" || e.type === "socket-error") {
        setNota("Se cortó la conexión a internet. Reintentando…");
        window.clearTimeout(reintento.current);
        reintento.current = window.setTimeout(entrar, 5000);
      }
    });
    p.on("disconnected", () => { try { p.reconnect(); } catch {} });
  }

  function llamar(p: PeerT) {
    const destino = idEstudio(sala);
    const meta = { nombre: nombre.trim(), rol: rol.trim() };
    const c = p.connect(destino, { reliable: true, metadata: meta });
    datos.current = c;
    c.on("open", () => c.send({ t: "hola", ...meta } satisfies Mensaje));
    c.on("data", (d) => recibir(d as Mensaje));
    const ll = p.call(destino, local.current!, { metadata: meta });
    llamada.current = ll;
    setEstado("espera");
    ll.on("stream", (s) => {
      if (retorno.current) {
        retorno.current.srcObject = s;
        retorno.current.play().catch(() => {});
      }
      subirCalidad(ll.peerConnection, 2500);
      setEstado("conectado");
      setNota("");
    });
    ll.on("close", () => {
      setEstado((e) => (e === "terminado" ? e : "terminado"));
      setAlAire(false);
    });
    ll.on("error", () => setEstado("terminado"));
  }

  function recibir(m: Mensaje) {
    if (m.t === "chat") setChat((c) => [...c, { de: m.de, texto: m.texto, hora: m.hora }]);
    if (m.t === "estado") {
      setAlAire(m.alAire);
      setSilenciadoPorEstudio(m.silenciado);
    }
    if (m.t === "aviso") {
      setAviso(m.texto);
      window.setTimeout(() => setAviso((a) => (a === m.texto ? "" : a)), 6000);
    }
    if (m.t === "pedido-mute") alternarMic(!m.silenciar);
  }

  function alternarMic(on = !mic) {
    setMic(on);
    local.current?.getAudioTracks().forEach((t) => (t.enabled = on));
    crudo.current?.getAudioTracks().forEach((t) => (t.enabled = on));
  }
  function alternarCam() {
    const on = !cam;
    setCam(on);
    local.current?.getVideoTracks().forEach((t) => (t.enabled = on));
    crudo.current?.getVideoTracks().forEach((t) => (t.enabled = on));
  }
  function cambiarFondo(f: TipoFondo) {
    setFondo(f);
    guardar("fondo", f);
    prender(camara, micro, f);
  }
  function mandar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || !datos.current?.open) return;
    const m = { t: "chat" as const, de: nombre || "Invitado", texto: t, hora: hora() };
    datos.current.send(m);
    setChat((c) => [...c, { ...m, mio: true }]);
    setTexto("");
  }
  function salir() {
    llamada.current?.close();
    peer.current?.destroy();
    setEstado("terminado");
  }

  const dentro = estado === "espera" || estado === "conectado";

  return (
    <main className="inv">
      <header className="inv-top">
        <div className="brand"><div className="brand-mark">DF</div><div><strong>DIARIO FEDERAL <span>STUDIO</span></strong><small>SALA DE INVITADOS</small></div></div>
        {dentro && (
          <span className={"inv-estado " + (alAire ? "aire" : estado)}>
            <span className="red-dot" />{alAire ? "AL AIRE" : estado === "espera" ? "EN SALA DE ESPERA" : "CONECTADO · FUERA DEL AIRE"}
          </span>
        )}
      </header>

      {estado === "terminado" ? (
        <section className="inv-fin">
          <div className="brand-mark grande">DF</div>
          <h1>¡Gracias por participar!</h1>
          <p>La comunicación con el estudio terminó. Ya podés cerrar esta ventana.</p>
          <button className="abrir-btn" onClick={() => { setEstado("preparando"); prender(camara, micro); }}>Volver a entrar</button>
        </section>
      ) : (
        <section className={"inv-cuerpo " + (dentro ? "dentro" : "")}>
          <div className="inv-video">
            <video ref={retorno} autoPlay playsInline className={"inv-retorno " + (estado === "conectado" ? "visible" : "")} />
            {estado !== "conectado" && (
              <div className="inv-bienvenida">
                {dentro || estado === "conectando" ? (
                  <>
                    <div className="pulso" />
                    <h1>{estado === "espera" ? "Ya te avisamos al estudio" : "Conectando con el estudio…"}</h1>
                    <p>{estado === "espera" ? "En un momento te hacen pasar. Mientras, revisá que se te vea y se te escuche bien." : nota || "Esto tarda unos segundos."}</p>
                  </>
                ) : (
                  <>
                    <span className="eyebrow">ENTREVISTA · DIARIO FEDERAL</span>
                    <h1>Te invitaron al estudio</h1>
                    <p>Antes de entrar: usá auriculares si podés, buscá luz de frente y una conexión estable. No hace falta instalar nada.</p>
                    <div className="arranque-campos">
                      <label>Tu nombre y apellido (sale en pantalla)<input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: María Pérez" /></label>
                      <label>Cargo o identificación<input value={rol} onChange={(e) => setRol(e.target.value)} placeholder="Ej.: Economista, UBA" /></label>
                    </div>
                    <button className="abrir-btn" onClick={entrar}>Entrar al estudio</button>
                    {nota && <p className="settings-note">{nota}</p>}
                  </>
                )}
              </div>
            )}
            {aviso && <div className="inv-aviso">{aviso}</div>}
            <div className="inv-propio">
              <video ref={propio} autoPlay muted playsInline />
              {!cam && <span>Cámara apagada</span>}
              <div className="meter"><i style={{ width: `${Math.round((mic ? nivel : 0) * 100)}%` }} /></div>
            </div>
          </div>

          <aside className="inv-lado">
            <div className="inv-controles">
              <button className={"control-btn " + (mic ? "" : "muted")} onClick={() => alternarMic()}>{mic ? <Mic /> : <MicOff />}<span>{mic ? "Micrófono" : "Silenciado"}</span></button>
              <button className={"control-btn " + (cam ? "on" : "")} onClick={alternarCam}>{cam ? <Video /> : <VideoOff />}<span>{cam ? "Cámara" : "Cámara off"}</span></button>
              {dentro && <button className="control-btn muted" onClick={salir}><LogOut /><span>Salir</span></button>}
            </div>
            {silenciadoPorEstudio && <p className="settings-note">El estudio bajó tu audio por el momento. Te van a avisar cuando vuelvas.</p>}
            <label className="field-label">Cámara</label>
            <select value={camara} onChange={(e) => { setCamara(e.target.value); prender(e.target.value, micro); }}>
              <option value="">Predeterminada</option>
              {camaras.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Cámara ${i + 1}`}</option>)}
            </select>
            <label className="field-label">Micrófono</label>
            <select value={micro} onChange={(e) => { setMicro(e.target.value); prender(camara, e.target.value); }}>
              <option value="">Predeterminado</option>
              {micros.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Micrófono ${i + 1}`}</option>)}
            </select>
            <label className="field-label">Fondo {cargandoFondo && "· cargando…"}</label>
            <div className="fondos-inv">
              {FONDOS.filter((f) => f.id !== "foto").map((f) => (
                <button key={f.id} className={fondo === f.id ? "on" : ""} onClick={() => cambiarFondo(f.id)} disabled={cargandoFondo}>{f.nombre}</button>
              ))}
            </div>
            <p className="panel-nota"><Headphones size={12} /> Con auriculares se evita el eco.</p>
            {dentro && (
              <>
                <div className="panel-divider" />
                <span className="eyebrow">CHAT CON EL ESTUDIO</span>
                <div className="chat-lista">
                  {chat.map((m, i) => <div key={i} className={"chat-msg " + (m.mio ? "mio" : "")}><b>{m.de}</b> <small>{m.hora}</small><p>{m.texto}</p></div>)}
                </div>
                <form className="chat-form" onSubmit={mandar}>
                  <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensaje al estudio" />
                  <button className="mini-btn ok" type="submit"><Send size={14} /></button>
                </form>
              </>
            )}
          </aside>
        </section>
      )}
    </main>
  );
}
