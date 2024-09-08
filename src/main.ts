import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as config from 'config';
import { EventEmitter } from 'events';
import { AppModule } from './app.module';
import { setCors } from './lib/cors';
import { JwtAuthGuard } from './modules/auth/auth.guards';
EventEmitter.defaultMaxListeners = 50;
const express = require('express');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.enableCors(setCors);

  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Da Vinci API')
    .setDescription('Da Vinci API docs')
    .setVersion('0.0.1')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(config.get('app.port'));

  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
