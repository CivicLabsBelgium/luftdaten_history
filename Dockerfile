FROM node:dubnium-alpine

RUN apk add tini --no-cache
ENTRYPOINT ["/sbin/tini", "--"]

RUN mkdir -p /server/node_modules && chown -R node:node /server
WORKDIR /server

COPY package*.json ./

USER node

RUN npm i --only=prod

COPY --chown=node:node src/ ./src

CMD ["node", "src/index"]