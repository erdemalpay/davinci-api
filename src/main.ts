import * as config from 'config';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
  app.use(cookieParser());
  
  app.enableCors();

  await app.listen(config.get('app.port'));

  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
