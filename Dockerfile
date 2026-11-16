FROM node:22-slim

WORKDIR /app

COPY package.json .npmrc ./
RUN npm install --include=dev --legacy-peer-deps

COPY . .

RUN npm run build && npm prune --omit=dev --legacy-peer-deps

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
