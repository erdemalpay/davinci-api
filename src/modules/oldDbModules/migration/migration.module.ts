import * as config from 'config';
import { Module } from '@nestjs/common';
import { OldUserModule } from '../oldUser/user.module';
import { UserModule } from '../../user/user.module';
import { MigrationService } from './ migration.service';
import { MigrationController } from './migration.controller';
import { TableModule } from 'src/modules/table/table.module';
import { OldTableModule } from '../oldTable/table.module';
import { GameModule } from 'src/modules/game/game.module';
import { OldGameModule } from '../oldGame/game.module';
import { GameplayModule } from 'src/modules/gameplay/gameplay.module';
import { OldGameplayModule } from '../oldGameplay/gameplay.module';
import { MongooseModule } from '@nestjs/mongoose';
import { VisitModule } from 'src/modules/visit/visit.module';
import { OldVisitModule } from '../oldVisit/visit.module';

const { host, port, name } = config.get('olddb');
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
