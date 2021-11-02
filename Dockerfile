FROM node:16

WORKDIR /app

COPY package.json .
COPY yarn.lock .
COPY ./dist ./dist
COPY ./config ./config

RUN yarn global add @nestjs/cli
RUN yarn install --production

EXPOSE 4000
ENV NODE_ENV production

CMD ["yarn", "start:prod"]