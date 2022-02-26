import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TableService } from './table.service';
import { TableController } from './table.controller';
import { Table, TableSchema } from './table.schema';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Table.name, TableSchema),
]);
@Module({
  imports: [mongooseModule],
  providers: [TableService],
  exports: [TableService],
  controllers: [TableController],
})
export class TableModule {}
