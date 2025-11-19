import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import * as config from 'config';
import { GameModule } from 'src/modules/game/game.module';
import { GameplayModule } from 'src/modules/gameplay/gameplay.module';
import { TableModule } from 'src/modules/table/table.module';
import { VisitModule } from 'src/modules/visit/visit.module';
import { UserModule } from '../../user/user.module';
import { OldGameModule } from '../oldGame/game.module';
import { OldGameplayModule } from '../oldGameplay/gameplay.module';
import { OldTableModule } from '../oldTable/table.module';
import { OldUserModule } from '../oldUser/user.module';
import { OldVisitModule } from '../oldVisit/visit.module';
import { MigrationService } from './migration.service';
import { DBConfig } from './../../../app.module';
import { MigrationController } from './migration.controller';

const { host, port, name }: DBConfig = config.get('olddb');
const mongoUrl = `mongodb://${host}:${port}/${name}`;
const OldDbModule = MongooseModule.forRoot(mongoUrl, {
  ignoreUndefined: true,
  connectionName: 'olddb',
});

@Module({
  imports: [
    OldDbModule,
    UserModule,
    OldUserModule,
    TableModule,
    OldTableModule,
    GameModule,
    OldGameModule,
    GameplayModule,
    OldGameplayModule,
    VisitModule,
    OldVisitModule,
  ],
  providers: [MigrationService],
  exports: [MigrationService],
  controllers: [MigrationController],
})
export class MigrationModule {}
