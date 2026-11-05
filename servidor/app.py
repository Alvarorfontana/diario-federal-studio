# Puente de Diario Federal Studio (versión para Hugging Face Spaces, SDK Gradio, gratis).
# La consola manda el programa (imagen y sonido) por WebSocket; este servidor lo pasa a YouTube con ffmpeg.
# Secretos (Settings -> Variables and secrets):
#   YOUTUBE_CLAVE  clave de transmisión del canal de YouTube
#   CLAVE_ESTUDIO  contraseña que se escribe en la consola para poder emitir
import asyncio
import json
import os
import time

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

YT = os.environ.get("YOUTUBE_CLAVE", "")
CLAVE = os.environ.get("CLAVE_ESTUDIO", "")
DESTINO = os.environ.get("DESTINO_RTMP", "rtmps://a.rtmps.youtube.com:443/live2")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

emision = {"proc": None, "ws": None, "inicio": None}


def faltan():
    return [n for n, v in (("YOUTUBE_CLAVE", YT), ("CLAVE_ESTUDIO", CLAVE)) if not v]


@app.get("/")
def estado():
    return {
        "servicio": "DF Studio · puente a YouTube",
        "listo": not faltan(),
        "falta": faltan(),
        "emitiendo": emision["proc"] is not None,
        "desde": emision["inicio"],
    }


def argumentos(codec):
    entrada = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-fflags", "+genpts",
               "-thread_queue_size", "1024", "-i", "pipe:0"]
    if codec == "h264" and os.environ.get("RECODIFICAR") != "1":
        video = ["-c:v", "copy"]  # el navegador ya manda H.264: pasa tal cual, sin gastar procesador
    else:
        br = os.environ.get("BITRATE", "4000k")
        video = ["-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-pix_fmt", "yuv420p",
                 "-vf", "scale=" + os.environ.get("RESOLUCION", "1280:720"), "-r", "30", "-g", "60",
                 "-keyint_min", "60", "-b:v", br, "-maxrate", br, "-bufsize", "8000k"]
    audio = ["-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2"]
    return entrada + video + audio + ["-f", "flv", f"{DESTINO}/{YT}"]


async def terminar(proc):
    if proc is None:
        return
    try:
        if proc.stdin and not proc.stdin.is_closing():
            proc.stdin.close()
    except Exception:
        pass
    try:
        await asyncio.wait_for(proc.wait(), timeout=4)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


@app.websocket("/emitir")
async def emitir(ws: WebSocket):
    await ws.accept()

    async def decir(o):
        try:
            await ws.send_text(json.dumps(o))
        except Exception:
            pass

    try:
        m = json.loads(await ws.receive_text())
    except Exception:
        m = {}
    if faltan():
        await decir({"error": "Al servidor le falta configurar " + " y ".join(faltan())})
        await ws.close()
        return
    if m.get("clave") != CLAVE:
        await decir({"error": "Contraseña del estudio incorrecta"})
        await ws.close()
        return

    # una sola emisión por vez: la nueva reemplaza a la anterior (por ejemplo, si se cortó internet)
    if emision["proc"] is not None:
        viejo, viejo_ws = emision["proc"], emision["ws"]
        emision.update(proc=None, ws=None, inicio=None)
        try:
            await viejo_ws.close()
        except Exception:
            pass
        await terminar(viejo)

    proc = await asyncio.create_subprocess_exec(*argumentos(m.get("codec")), stdin=asyncio.subprocess.PIPE,
                                                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
    emision.update(proc=proc, ws=ws, inicio=time.time())

    async def avisos():
        while True:
            linea = await proc.stderr.readline()
            if not linea:
                break
            t = linea.decode(errors="ignore").strip()
            if t:
                print(t, flush=True)
                await decir({"aviso": t[:300]})
        await decir({"fin": True, "codigo": await proc.wait()})
        try:
            await ws.close()
        except Exception:
            pass

    tarea = asyncio.create_task(avisos())
    await decir({"ok": True})
    try:
        while True:
            dato = await ws.receive()
            if dato.get("type") == "websocket.disconnect":
                break
            b = dato.get("bytes")
            if b and emision["proc"] is proc:
                proc.stdin.write(b)
                await proc.stdin.drain()
    except (WebSocketDisconnect, ConnectionResetError, BrokenPipeError, RuntimeError):
        pass
    finally:
        if emision["proc"] is proc:
            emision.update(proc=None, ws=None, inicio=None)
        await terminar(proc)
        tarea.cancel()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "7860")), ws_max_size=32 * 1024 * 1024)
