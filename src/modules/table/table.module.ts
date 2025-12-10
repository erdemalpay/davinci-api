import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ActivityModule } from '../activity/activity.module';
import { GameplayModule } from '../gameplay/gameplay.module';
import { MenuModule } from '../menu/menu.module';
import { NotificationModule } from '../notification/notification.module';
import { OrderModule } from '../order/order.module';
import { RedisModule } from '../redis/redis.module';
import { ReservationModule } from '../reservation/reservation.module';
import { PanelControlModule } from './../panelControl/panelControl.module';
import { Feedback, FeedbackSchema } from './feedback.schema';
import { TableController } from './table.controller';
import { TableSchedule } from './table.schedule';
import { Table, TableSchema } from './table.schema';
import { TableService } from './table.service';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Table.name, TableSchema),
  createAutoIncrementConfig(Feedback.name, FeedbackSchema),
]);

@Module({
  imports: [
    WebSocketModule,
    RedisModule,
    mongooseModule,
    GameplayModule,
    ActivityModule,
    PanelControlModule,
    NotificationModule,
    forwardRef(() => MenuModule),
    forwardRef(() => OrderModule),
    forwardRef(() => ReservationModule),
  ],
  providers: [TableService, TableSchedule],
  exports: [TableService, TableSchedule],
  controllers: [TableController],
})
export class TableModule {}
