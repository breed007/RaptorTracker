FROM node:20-alpine

WORKDIR /app

# Install server dependencies
COPY package*.json ./
RUN npm ci --only=production

# Build frontend
COPY client/package*.json ./client/
RUN cd client && npm ci

COPY client/ ./client/
RUN cd client && npm run build

# Copy server source
COPY server/ ./server/
COPY server.js ./

# Ensure data directories exist
RUN mkdir -p /data/uploads

EXPOSE 3000
VOLUME /data

ENV DATA_DIR=/data
ENV UPLOAD_DIR=/data/uploads
ENV NODE_ENV=production

ENTRYPOINT ["node", "server.js"]
