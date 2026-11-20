# First Roll: one small Node server, no dependencies to install.
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN node build.js
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
