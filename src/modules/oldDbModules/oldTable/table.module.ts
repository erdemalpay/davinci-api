import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OldTableSchema, Table } from './table.schema';
import { OldTableService } from './table.service';

const mongooseModule = MongooseModule.forFeature(
  [{ name: Table.name, schema: OldTableSchema }],
  'olddb',
);

@Module({
  imports: [mongooseModule],
  providers: [OldTableService],
  exports: [OldTableService],
})
export class OldTableModule {}
