"use client";

import { useEffect, useRef, useState } from "react";
import { Radio, Video, VideoOff, Mic, MicOff, MonitorUp, Settings, Users, Clapperboard, Copy, Circle, Volume2, Maximize2, MessageSquare, ChevronDown, Signal, Play, Square } from "lucide-react";

type Scene = "split" | "guest" | "host" | "headline";

export default function StudioPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [scene, setScene] = useState<Scene>("split");
  const [guestName, setGuestName] = useState("Invitado");
  const [showSettings, setShowSettings] = useState(false);
  const [clock, setClock] = useState("00:00:00");

  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => {
      const s = Math.floor((Date.now() - start) / 1000);
      setClock([Math.floor(s/3600), Math.floor(s/60)%60, s%60].map(n=>String(n).padStart(2,"0")).join(":"));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  async function toggleCamera() {
    if (cameraOn) {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach(t => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraOn(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
    } catch { alert("No se pudo acceder a la cámara. Revisá los permisos del navegador."); }
  }

  async function copyGuestLink() {
    await navigator.clipboard?.writeText(window.location.origin + "/guest/demo");
    alert("Enlace de invitado copiado (ruta de demostración).");
  }

  return <main className="studio">
    <header className="topbar">
      <div className="brand"><div className="brand-mark">DF</div><div><strong>DIARIO FEDERAL <span>STUDIO</span></strong><small>CONTROL DE REALIZACIÓN</small></div></div>
      <div className="top-status"><span className="live-dot" /> ESTUDIO LOCAL <i /> {clock}</div>
      <div className="top-actions"><button className="icon-btn" onClick={()=>setShowSettings(!showSettings)} aria-label="Configuración"><Settings size={17}/></button><div className="avatar">AF</div></div>
    </header>

    <section className="workspace">
      <aside className="left-rail">
        <button className="rail-item active"><Clapperboard/><span>Estudio</span></button>
        <button className="rail-item"><Users/><span>Equipo</span></button>
        <button className="rail-item"><MessageSquare/><span>Chat</span></button>
        <button className="rail-item"><Signal/><span>Salidas</span></button>
        <div className="rail-bottom"><button className="rail-item"><Settings/><span>Ajustes</span></button></div>
      </aside>

      <section className="production">
        <div className="section-heading"><div><div className="eyebrow">PRODUCCIÓN / SALA PRINCIPAL</div><h1>Control de entrevistas</h1></div><div className="session-chip"><span className="green-dot"/> Sesión preparada</div></div>
        <div className="monitor">
          <div className="monitor-head"><span><span className="red-dot"/> PROGRAMA</span><span>1920 × 1080 <i/> 16:9</span></div>
          <div className={"program-frame scene-"+scene}>
            <div className="feed host-feed"><div className="feed-label">PERIODISTA</div><div className="placeholder-portrait host-portrait"><span>AF</span></div><div className="lower-third"><b>ÁLVARO FONTANA</b><small>DIARIO FEDERAL</small></div></div>
            <div className="feed guest-feed"><div className="feed-label">INVITADO</div><div className="guest-placeholder"><Video size={34}/><span>ESPERANDO AL INVITADO</span><small>El enlace de acceso todavía no está conectado</small></div><div className="lower-third"><b>{guestName.toUpperCase()}</b><small>ENTREVISTA EN VIVO</small></div></div>
            {scene==="headline" && <div className="headline-overlay">DIARIO FEDERAL <strong>ANÁLISIS Y ACTUALIDAD</strong></div>}
            <div className="program-watermark">DF</div>
          </div>
          <div className="monitor-foot"><span><i className="green-dot"/> VISTA PREVIA</span><span>Salida de programa · Sin transmisión activa</span><button className="plain-icon"><Maximize2 size={15}/></button></div>
        </div>

        <div className="scene-section"><div className="subheading"><strong>ESCENAS</strong><span>Seleccioná la composición del programa</span></div><div className="scene-grid">
          {(["split","guest","host","headline"] as Scene[]).map((s,i)=><button key={s} onClick={()=>setScene(s)} className={"scene-card "+(scene===s?"selected":"")}><div className={"scene-thumb thumb-"+s}><i/><i/></div><span>{["Pantalla dividida","Invitado","Periodista","Titular"][i]}</span></button>)}
        </div></div>

        <div className="control-strip"><div className="control-group"><button className={"control-btn "+(micOn?"":"muted")} onClick={()=>setMicOn(!micOn)}>{micOn?<Mic/>:<MicOff/>}<span>{micOn?"Micrófono":"Micrófono off"}</span></button><button className={"control-btn "+(cameraOn?"on":"")} onClick={toggleCamera}>{cameraOn?<Video/>:<VideoOff/>}<span>{cameraOn?"Cámara activa":"Activar cámara"}</span></button><button className="control-btn"><MonitorUp/><span>Compartir pantalla</span></button></div><div className="record-group"><button className="record-btn" disabled><Circle size={13}/> Grabar</button><button className="broadcast-btn" disabled><Radio size={15}/> Emitir</button></div></div>
        {showSettings && <div className="settings-note">Configuración de dispositivos y servicios remotos: pendiente de integración.</div>}
      </section>

      <aside className="right-panel">
        <div className="panel-title"><div><span className="eyebrow">CONTROL DE SALA</span><h2>Participantes</h2></div><span className="count">1 / 2</span></div>
        <div className="participant"><div className="person-avatar">AF</div><div className="person-info"><strong>Álvaro Fontana</strong><small>Periodista · Anfitrión</small></div><span className="presence"/> </div>
        <div className="participant waiting"><div className="person-avatar guest-avatar">IN</div><div className="person-info"><strong>{guestName}</strong><small>Esperando conexión</small></div><span className="waiting-tag">PENDIENTE</span></div>
        <button className="invite-btn" onClick={copyGuestLink}><Copy size={15}/> Copiar enlace de invitación</button>
        <div className="panel-divider"/>
        <div className="panel-title compact"><div><span className="eyebrow">DATOS DEL PROGRAMA</span><h2>Identificación</h2></div></div>
        <label className="field-label">Nombre del invitado</label><input value={guestName} onChange={e=>setGuestName(e.target.value)} />
        <label className="field-label">Título de la entrevista</label><input defaultValue="Entrevista · Diario Federal" />
        <div className="panel-divider"/>
        <div className="panel-title compact"><div><span className="eyebrow">MONITOREO</span><h2>Señal local</h2></div><span className="green-text">ESTABLE</span></div>
        <div className="meter-row"><span>Video local</span><span>{cameraOn?"ACTIVO":"INACTIVO"}</span></div><div className="meter"><i style={{width:cameraOn?"76%":"0%"}}/></div>
        <div className="meter-row"><span>Audio local</span><span>{micOn?"HABILITADO":"SILENCIADO"}</span></div><div className="meter"><i style={{width:micOn?"54%":"0%"}}/></div>
        <div className="panel-divider"/>
        <div className="output-row"><div><Volume2 size={16}/><span>Monitoreo de audio</span></div><span className="output-state">LOCAL</span></div>
        <div className="output-row"><div><Radio size={16}/><span>Transmisión</span></div><span className="output-state off">OFFLINE</span></div>
        <div className="panel-bottom"><span><Play size={13}/> DF STUDIO · MVP 0.1</span><ChevronDown size={15}/></div>
      </aside>
    </section>
    <footer><span>DIARIO FEDERAL STUDIO</span><span>ENTORNO DE PRODUCCIÓN · VERSIÓN 0.1.0</span><span>Todos los sistemas locales</span></footer>
  </main>;
}
