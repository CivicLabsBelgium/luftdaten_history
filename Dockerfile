FROM node:dubnium-alpine

RUN apk add tini --no-cache
ENTRYPOINT ["/sbin/tini", "--"]

RUN mkdir -p /server/node_modules
WORKDIR /server

COPY package*.json ./

USER node

RUN npm i --only=prod

COPY src/ ./src

CMD ["node", "src/index"]