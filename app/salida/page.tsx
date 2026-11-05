"use client";

import { useEffect, useRef, useState } from "react";

// Ventana limpia con la señal de programa: es la que captura OBS para mandar a YouTube.
export default function Salida() {
  const video = useRef<HTMLVideoElement>(null);
  const [lista, setLista] = useState(false);
  const [sinConsola, setSinConsola] = useState(false);
  const [sonido, setSonido] = useState(true);

  useEffect(() => {
    document.title = "DF Studio · Salida";
    let actual: MediaStream | null = null;
    const id = window.setInterval(() => {
      const s = (window.opener as { dfPrograma?: MediaStream } | null)?.dfPrograma;
      if (!s) { setSinConsola(true); return; }
      setSinConsola(false);
      if (s !== actual && video.current) {
        actual = s;
        video.current.srcObject = s;
        video.current.play().catch(() => {});
      }
    }, 1000);
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "f") document.documentElement.requestFullscreen?.().catch(() => {});
      if (e.key === "s") setSonido((x) => !x);
    };
    window.addEventListener("keydown", tecla);
    return () => { window.clearInterval(id); window.removeEventListener("keydown", tecla); };
  }, []);

  useEffect(() => {
    if (video.current) video.current.muted = !sonido;
  }, [sonido]);

  return (
    <main className="salida" onClick={() => { setLista(true); video.current?.play().catch(() => {}); }}>
      <video ref={video} autoPlay playsInline />
      {!lista && (
        <div className="salida-tapa">
          {sinConsola ? (
            <p>Esta ventana se abre desde el botón <b>Salida limpia</b> de la consola.</p>
          ) : (
            <p><b>Hacé clic para activar la salida.</b><br />En OBS: Captura de ventana → “DF Studio · Salida”, con “Capturar audio”.<br />Tecla F: pantalla completa · Tecla S: sonido.</p>
          )}
        </div>
      )}
    </main>
  );
}
