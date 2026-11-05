# Diario Federal Studio

Estudio de entrevistas a distancia de Diario Federal. Todo corre en el navegador y es gratis.

## Cómo se usa
1. **Abrir el estudio** en la computadora del periodista. El navegador pide cámara y micrófono. Conviene usar auriculares.
2. **Copiar el enlace de invitación** (`/invitado/<sala>`) y mandárselo al entrevistado. Lo abre desde su casa, en la compu o en el celular, sin instalar nada.
3. El invitado queda en la **sala de espera**. Desde la consola tocás **Pasar**.
4. Desde la consola manejás:
   - las escenas: pantalla dividida, invitado, periodista, titular, pantalla compartida y placa de pausa;
   - la apertura y el cierre animados con música;
   - el zócalo de cada persona;
   - el volumen y el silencio de cada uno;
   - el chat y los avisos rápidos al invitado.
5. **Grabar** guarda el programa completo (imagen y sonido) y lo descarga al terminar.
6. **YouTube**: con OBS Studio (gratis), que toma la ventana *Salida limpia* y la emite con la clave de transmisión de YouTube. La guía paso a paso está en la pestaña **Salidas** de la consola. Con el servidor WebSocket de OBS habilitado, el botón **Emitir en YouTube** arranca y corta la transmisión desde la consola.

## Cómo funciona
- Video y audio van directo de navegador a navegador (WebRTC, con PeerJS). Para encontrarse usan el servidor público y gratuito de PeerJS.
- El programa se arma en un lienzo de 1920 × 1080 con la gráfica DF. Lo que ves en el monitor es lo que se graba y sale al aire.
- El sonido pasa por una mesa en el navegador (WebAudio):
  - cada invitado escucha a todos menos a sí mismo, así no hay eco;
  - el operador escucha a los invitados por auriculares.

## Variables opcionales (Vercel → Settings → Environment Variables)
- `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USER`, `NEXT_PUBLIC_TURN_PASS`: un servidor TURN para invitados en redes muy cerradas (empresas, algunos datos móviles). Hay planes gratuitos, por ejemplo Metered Open Relay.
- `NEXT_PUBLIC_PEER_HOST`, `NEXT_PUBLIC_PEER_PORT`, `NEXT_PUBLIC_PEER_PATH`, `NEXT_PUBLIC_PEER_SECURE`: un servidor de señalización propio, en lugar del público.

## Desarrollo
```bash
npm install
npm run dev
```

## Seguridad
No hay claves en el código. La clave de YouTube queda solo en OBS, en la computadora del estudio.
