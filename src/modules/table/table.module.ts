import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ActivityModule } from '../activity/activity.module';
import { GameplayModule } from '../gameplay/gameplay.module';
import { MenuModule } from '../menu/menu.module';
import { OrderModule } from '../order/order.module';
import { PanelControlModule } from './../panelControl/panelControl.module';
import { TableController } from './table.controller';
import { TableGateway } from './table.gateway';
import { Table, TableSchema } from './table.schema';
import { TableService } from './table.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Table.name, TableSchema),
]);

@Module({
  imports: [
    mongooseModule,
    GameplayModule,
    ActivityModule,
    PanelControlModule,
    forwardRef(() => MenuModule),
    forwardRef(() => OrderModule),
  ],
  providers: [TableService, TableGateway],
  exports: [TableService, TableGateway],
  controllers: [TableController],
})
export class TableModule {}
