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

@Module({
  imports: [
    UserModule,
    OldUserModule,
    TableModule,
    OldTableModule,
    GameModule,
    OldGameModule,
    GameplayModule,
    OldGameplayModule,
  ],
  providers: [MigrationService],
  exports: [MigrationService],
  controllers: [MigrationController],
})
export class MigrationModule {}
