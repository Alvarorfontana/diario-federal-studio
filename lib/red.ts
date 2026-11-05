// Conexión entre el estudio y los invitados: WebRTC directo (de navegador a navegador) con PeerJS.
// La señalización usa el servidor público y gratuito de PeerJS. No hay claves privadas en el código.
// Para conexiones difíciles (redes de empresas, datos móviles con NAT estricto) se puede sumar
// un servidor TURN con las variables NEXT_PUBLIC_TURN_URL, NEXT_PUBLIC_TURN_USER y NEXT_PUBLIC_TURN_PASS.

export const PREFIJO = "dfstudio-";

export function idEstudio(sala: string) {
  return `${PREFIJO}${sala}-estudio`;
}

export function idInvitado(sala: string) {
  return `${PREFIJO}${sala}-inv-${Math.random().toString(36).slice(2, 8)}`;
}

export function nuevaSala() {
  const letras = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += letras[Math.floor(Math.random() * letras.length)];
  return s;
}

export function servidoresIce(): RTCIceServer[] {
  const lista: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: "stun:stun.cloudflare.com:3478" },
  ];
  const turn = process.env.NEXT_PUBLIC_TURN_URL;
  if (turn) {
    lista.push({
      urls: turn.split(",").map((u) => u.trim()),
      username: process.env.NEXT_PUBLIC_TURN_USER || "",
      credential: process.env.NEXT_PUBLIC_TURN_PASS || "",
    });
  }
  return lista;
}

export async function crearPeer(id?: string) {
  const { default: Peer } = await import("peerjs");
  // Servidor de señalización propio (opcional). Sin estas variables se usa el público de PeerJS.
  const host = process.env.NEXT_PUBLIC_PEER_HOST;
  const propio = host
    ? {
        host,
        port: Number(process.env.NEXT_PUBLIC_PEER_PORT || 443),
        path: process.env.NEXT_PUBLIC_PEER_PATH || "/",
        secure: process.env.NEXT_PUBLIC_PEER_SECURE !== "false",
      }
    : {};
  const opciones = { ...propio, config: { iceServers: servidoresIce() }, debug: 1 };
  return id ? new Peer(id, opciones) : new Peer(opciones);
}

// Mensajes que viajan por el canal de datos
export type Mensaje =
  | { t: "hola"; nombre: string; rol: string }
  | { t: "chat"; de: string; texto: string; hora: string }
  | { t: "estado"; alAire: boolean; silenciado: boolean; enEspera: boolean }
  | { t: "aviso"; texto: string }
  | { t: "pedido-mute"; silenciar: boolean };

// Video con buena calidad para entrevista
export const VIDEO_HD: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
};

export const AUDIO_VOZ: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

// Sube la calidad de envío del video (WebRTC por defecto limita bastante)
export function subirCalidad(pc: RTCPeerConnection | undefined, kbps = 2500) {
  if (!pc) return;
  for (const s of pc.getSenders()) {
    if (s.track?.kind !== "video") continue;
    const p = s.getParameters();
    if (!p.encodings || !p.encodings.length) p.encodings = [{}];
    p.encodings[0].maxBitrate = kbps * 1000;
    s.setParameters(p).catch(() => {});
  }
}

export function hora() {
  return new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export function iniciales(nombre: string) {
  return (
    nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0] || "")
      .join("")
      .toUpperCase() || "DF"
  );
}
