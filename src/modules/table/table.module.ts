import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ActivityModule } from '../activity/activity.module';
import { GameplayModule } from '../gameplay/gameplay.module';
import { MenuModule } from '../menu/menu.module';
import { NotificationModule } from '../notification/notification.module';
import { OrderModule } from '../order/order.module';
import { ReservationModule } from '../reservation/reservation.module';
import { PanelControlModule } from './../panelControl/panelControl.module';
import { TableController } from './table.controller';
import { TableGateway } from './table.gateway';
import { TableSchedule } from './table.schedule';
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
    NotificationModule,
    forwardRef(() => MenuModule),
    forwardRef(() => OrderModule),
    forwardRef(() => ReservationModule),
  ],
  providers: [TableService, TableGateway, TableSchedule],
  exports: [TableService, TableGateway, TableSchedule],
  controllers: [TableController],
})
export class TableModule {}
