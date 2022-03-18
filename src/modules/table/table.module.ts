import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TableService } from './table.service';
import { TableController } from './table.controller';
import { Table, TableSchema } from './table.schema';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { GameplayModule } from '../gameplay/gameplay.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Table.name, TableSchema),
]);
@Module({
  imports: [mongooseModule, GameplayModule],
  providers: [TableService],
  exports: [TableService],
  controllers: [TableController],
})
export class TableModule {}
