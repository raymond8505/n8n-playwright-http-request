FROM node:20-slim

# Install dependencies for WebKit (using playwright-install script handles all correctly)
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

# Install WebKit browser for Playwright (lighter on resources)
# The install script will handle all system dependencies
RUN npx playwright install --with-deps webkit

COPY server.js .

EXPOSE 3000

CMD ["npm", "start"]