import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OldTableService } from './table.service';
import { Table, OldTableSchema } from './table.schema';

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
