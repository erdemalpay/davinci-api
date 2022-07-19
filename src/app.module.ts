import * as config from 'config';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { GameModule } from './modules/game/game.module';
import { GameplayModule } from './modules/gameplay/gameplay.module';
import { LocationModule } from './modules/location/location.module';
import { TableModule } from './modules/table/table.module';
import { OldUserModule } from './modules/oldDbModules/oldUser/user.module';
import { MigrationModule } from './modules/oldDbModules/migration/migration.module';
import { RouterModule } from '@nestjs/core';
import { OldTableModule } from './modules/oldDbModules/oldTable/table.module';
import { OldGameplayModule } from './modules/oldDbModules/oldGameplay/gameplay.module';
import { OldGameModule } from './modules/oldDbModules/oldGame/game.module';

function getDBModule(configKey: string) {
  const { host, port, name } = config.get(configKey);
  const mongoUrl = `mongodb://${host}:${port}/${name}`;
  const databaseModule = MongooseModule.forRoot(mongoUrl, {
    ignoreUndefined: true,
    connectionName: configKey === 'olddb' ? 'olddb' : undefined,
  });
  return databaseModule;
}

const DbModule = getDBModule('db');
const OldDbModule = getDBModule('olddb');

@Module({
  imports: [
    AuthModule,
    DbModule,
    OldDbModule,
    GameModule,
    GameplayModule,
    LocationModule,
    TableModule,
    UserModule,
    MigrationModule,
    OldUserModule,
    OldTableModule,
    OldGameplayModule,
    OldGameModule,
  ],
})
export class AppModule {}
