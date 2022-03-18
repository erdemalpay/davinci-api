import * as config from 'config';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { GameModule } from './modules/game/game.module';
import { GameplayModule } from './modules/gameplay/gameplay.module';
import { LocationModule } from './modules/location/location.module';
import { TableModule } from './modules/table/table.module';

const { host, port, name } = config.get('db');
const mongoUrl = `mongodb://${host}:${port}/${name}`;
const DbModule = MongooseModule.forRoot(mongoUrl, {
  ignoreUndefined: true,
});

@Module({
  imports: [
    AuthModule,
    DbModule,
    GameModule,
    GameplayModule,
    LocationModule,
    TableModule,
    UserModule,
  ],
})
export class AppModule {}
