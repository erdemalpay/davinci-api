import * as config from 'config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(config.get('app.port'));

  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
