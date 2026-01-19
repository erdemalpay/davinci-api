import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as config from 'config';
import { EventEmitter } from 'events';
import { AppModule } from './app.module';
import { setCors } from './lib/cors';
import { JwtAuthGuard } from './modules/auth/auth.guards';
import { RolesGuard } from './modules/authorization/authorization.guard';

EventEmitter.defaultMaxListeners = 50;
const express = require('express');
const logger = new Logger('Bootstrap');

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Log the error but don't crash the process in production
  // In production, you might want to use a logging service
  if (process.env.NODE_ENV === 'production') {
    logger.error('Unhandled rejection details:', {
      reason: reason?.message || reason,
      stack: reason?.stack,
      timestamp: new Date().toISOString(),
    });
  } else {
    // In development, log more details
    logger.error('Full error:', reason);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  logger.error('Stack:', error.stack);
  // Log the error but allow the process to continue
  // In production, you might want to gracefully shutdown
  if (process.env.NODE_ENV === 'production') {
    logger.error('Uncaught exception details:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.enableCors(setCors);

  const reflector = app.get(Reflector);
  const rolesGuard = app.get(RolesGuard);
  app.useGlobalGuards(new JwtAuthGuard(reflector), rolesGuard);
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Da Vinci API')
    .setDescription('Da Vinci API docs')
    .setVersion('0.0.1')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(config.get('app.port'));

  const logger = new Logger('Bootstrap');
  logger.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
