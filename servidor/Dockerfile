FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json servidor.js ./
RUN npm install --omit=dev
USER node
ENV PORT=7860
EXPOSE 7860
CMD ["node", "servidor.js"]
