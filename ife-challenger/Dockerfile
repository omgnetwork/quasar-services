FROM node:12.16.1-alpine3.11

RUN apk update && apk upgrade && \
    apk add --no-cache git openssh make gcc g++ python

USER node

COPY --chown=node:node . /app
WORKDIR /app

RUN npm install

CMD ["npm", "run", "start"]