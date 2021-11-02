import * as config from 'config';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';

const { host, port, name } = config.get('db');
const mongoUrl = `mongodb://${host}:${port}/${name}`;
const DbModule = MongooseModule.forRoot(mongoUrl, {
  ignoreUndefined: true,
});

@Module({
  imports: [DbModule, UserModule, AuthModule],
})
export class AppModule {}
