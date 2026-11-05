// Puente de Diario Federal Studio.
// La consola manda el programa (imagen y sonido) por WebSocket; este servidor lo pasa a YouTube con ffmpeg.
// Secretos (se cargan en la configuración del servidor, nunca en el código):
//   YOUTUBE_CLAVE  clave de transmisión del canal de YouTube
//   CLAVE_ESTUDIO  contraseña que se escribe en la consola para poder emitir
const http = require("http");
const { spawn } = require("child_process");
const { WebSocketServer } = require("ws");

const PUERTO = Number(process.env.PORT || 7860);
const YT = process.env.YOUTUBE_CLAVE || "";
const CLAVE = process.env.CLAVE_ESTUDIO || "";
const DESTINO = process.env.DESTINO_RTMP || "rtmps://a.rtmps.youtube.com:443/live2";

let emision = null; // { ffmpeg, inicio, ws }

const servidor = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({
    servicio: "DF Studio · puente a YouTube",
    listo: Boolean(YT && CLAVE),
    falta: [!YT && "YOUTUBE_CLAVE", !CLAVE && "CLAVE_ESTUDIO"].filter(Boolean),
    emitiendo: Boolean(emision),
    desde: emision ? new Date(emision.inicio).toISOString() : null,
  }));
});

const wss = new WebSocketServer({ server: servidor, path: "/emitir", maxPayload: 32 * 1024 * 1024 });

function args(codec) {
  const entrada = ["-hide_banner", "-loglevel", "warning", "-fflags", "+genpts", "-thread_queue_size", "1024", "-i", "pipe:0"];
  // Si el navegador ya manda H.264, la imagen pasa tal cual (sin gastar procesador); si no, se recodifica.
  const video = codec === "h264" && process.env.RECODIFICAR !== "1"
    ? ["-c:v", "copy"]
    : ["-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-pix_fmt", "yuv420p",
       "-vf", `scale=${process.env.RESOLUCION || "1280:720"}`, "-r", "30", "-g", "60", "-keyint_min", "60",
       "-b:v", process.env.BITRATE || "4000k", "-maxrate", process.env.BITRATE || "4000k", "-bufsize", "8000k"];
  const audio = ["-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2"];
  return [...entrada, ...video, ...audio, "-f", "flv", `${DESTINO}/${YT}`];
}

wss.on("connection", (ws) => {
  let autorizado = false;
  const decir = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));

  ws.on("message", (dato, binario) => {
    if (!autorizado) {
      let m = {};
      try { m = JSON.parse(dato.toString()); } catch {}
      if (!CLAVE || !YT) return decir({ error: "Al servidor le falta configurar " + [!YT && "YOUTUBE_CLAVE", !CLAVE && "CLAVE_ESTUDIO"].filter(Boolean).join(" y ") }), ws.close();
      if (m.clave !== CLAVE) return decir({ error: "Contraseña del estudio incorrecta" }), ws.close();
      if (emision) {
        // una sola emisión por vez: la nueva reemplaza a la anterior (por ejemplo, si se cortó internet y se volvió a entrar)
        try { emision.ws.close(); } catch {}
        try { emision.ffmpeg.stdin.end(); emision.ffmpeg.kill("SIGINT"); } catch {}
      }
      autorizado = true;
      const ff = spawn("ffmpeg", args(m.codec), { stdio: ["pipe", "ignore", "pipe"] });
      emision = { ffmpeg: ff, inicio: Date.now(), ws };
      ff.stderr.on("data", (d) => { const t = d.toString().trim(); if (t) { console.log(t); decir({ aviso: t.slice(0, 300) }); } });
      ff.stdin.on("error", () => {});
      ff.on("exit", (codigo) => {
        if (emision?.ffmpeg === ff) emision = null;
        decir({ fin: true, codigo });
        try { ws.close(); } catch {}
      });
      decir({ ok: true });
      return;
    }
    if (binario && emision?.ws === ws) emision.ffmpeg.stdin.write(dato);
  });

  ws.on("close", () => {
    if (emision?.ws === ws) {
      try { emision.ffmpeg.stdin.end(); } catch {}
      const ff = emision.ffmpeg;
      setTimeout(() => { try { ff.kill("SIGINT"); } catch {} }, 3000);
      emision = null;
    }
  });
});

servidor.listen(PUERTO, () => console.log("Puente DF escuchando en", PUERTO));
