import * as config from 'config';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { setCors } from './lib/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
  app.use(cookieParser());
  
  const whitelist = ['https://panelv2.davinciboardgame.com', 'http://localhost:5000', 'http://127.0.0.1:5000'];

  app.enableCors(setCors);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Da Vinci API')
    .setDescription('Da Vinci API docs')
    .setVersion('0.0.1')
    // .addCookieAuth('jwt')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(config.get('app.port'));

  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
