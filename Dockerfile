FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node public ./public
COPY --chown=node:node integrations ./integrations
RUN mkdir -p /app/.data && chown node:node /app/.data && chmod 700 /app/.data
USER node
ENV HOST=0.0.0.0 PORT=4173 THREADLINE_DB=/app/.data/threadline.sqlite
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "require('node:http').get('http://127.0.0.1:4173/api/health',{headers:{host:process.env.APP_ORIGIN?new URL(process.env.APP_ORIGIN).host:'127.0.0.1:4173'}},r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
CMD ["node", "server.js"]
