import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ActivityModule } from '../activity/activity.module';
import { GameplayModule } from '../gameplay/gameplay.module';
import { TableController } from './table.controller';
import { TableGateway } from './table.gateway';
import { Table, TableSchema } from './table.schema';
import { TableService } from './table.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Table.name, TableSchema),
]);

@Module({
  imports: [mongooseModule, GameplayModule, ActivityModule],
  providers: [TableService, TableGateway],
  exports: [TableService, TableGateway],
  controllers: [TableController],
})
export class TableModule {}
