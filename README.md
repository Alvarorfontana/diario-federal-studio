# Diario Federal Studio

Consola web de producción audiovisual para entrevistas remotas de Diario Federal.

## Estado
Primera versión de interfaz (MVP visual). Incluye consola de realización, escenas, panel de participantes y controles locales de cámara/micrófono. La conexión remota, grabación persistente y emisión RTMP requieren configurar LiveKit y un servicio de medios; los botones de emisión/archivo todavía son de interfaz.

## Requisitos
- Node.js 20+
- npm

## Desarrollo
```bash
npm install
npm run dev
```
Abrir http://localhost:3000.

## Próximas etapas
1. Integrar LiveKit y tokens firmados desde backend.
2. Sala de espera y admisión de invitados.
3. Grabación con LiveKit Egress y almacenamiento S3 compatible.
4. Salida RTMP para YouTube y reproductor web.
5. Clips verticales y archivo.

## Seguridad
No incluir claves privadas ni tokens en el frontend. Configurar secretos únicamente en variables de entorno del servidor.
