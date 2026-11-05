// Enciende o apaga el codespace del puente a YouTube, para que cualquiera del equipo pueda emitir
// sin la cuenta de GitHub de Álvaro. Se protege con la contraseña del estudio.
// Variables en Vercel (Settings → Environment Variables), nunca en el código:
//   GITHUB_TOKEN_CODESPACE  llave de GitHub con permiso "codespace"
//   CODESPACE_NOMBRE        nombre del codespace (por ejemplo curly-eureka-4gvvv7wpxrhjqq5)
//   CLAVE_ESTUDIO           la misma contraseña del estudio
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API = "https://api.github.com/user/codespaces/";

function config() {
  return {
    token: process.env.GITHUB_TOKEN_CODESPACE || "",
    nombre: process.env.CODESPACE_NOMBRE || "",
    clave: process.env.CLAVE_ESTUDIO || "",
  };
}

async function gh(ruta: string, metodo = "GET") {
  const { token } = config();
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

export async function GET() {
  const c = config();
  if (!c.token || !c.nombre) return NextResponse.json({ configurado: false });
  const r = await gh(c.nombre);
  return NextResponse.json({ configurado: true, estado: r.ok ? r.j.state : "desconocido" });
}

export async function POST(req: Request) {
  const c = config();
  if (!c.token || !c.nombre || !c.clave) return NextResponse.json({ error: "Falta configurar el encendido en Vercel." }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  if (b.clave !== c.clave) return NextResponse.json({ error: "Contraseña del estudio incorrecta" }, { status: 401 });
  const accion = b.accion === "apagar" ? "stop" : "start";
  const r = await gh(`${c.nombre}/${accion}`, "POST");
  if (!r.ok && !(accion === "start" && r.status === 409)) {
    return NextResponse.json({ error: `GitHub respondió ${r.status}: ${r.j.message || ""}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, estado: r.j.state || (accion === "start" ? "Starting" : "ShuttingDown") });
}
