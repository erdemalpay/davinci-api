import { BullModule } from '@nestjs/bull';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import * as config from 'config';
import Redis from 'ioredis';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { TableModule } from 'src/modules/table/table.module';
import { ButtonCallModule } from '../buttonCall/buttonCall.module';
import { GameplayModule } from '../gameplay/gameplay.module';
import { NotificationModule } from '../notification/notification.module';
import { PointModule } from '../point/point.module';
import { RedisModule } from '../redis/redis.module';
import { RedisService } from '../redis/redis.service';
import { UserModule } from '../user/user.module';
import { VisitModule } from '../visit/visit.module';
import { BullModuleOptions } from './../../../node_modules/@nestjs/bull/dist/interfaces/bull-module-options.interface.d';
import { DBConfig } from './../../app.module';
import { AccountingModule } from './../accounting/accounting.module';
import { ActivityModule } from './../activity/activity.module';
import { MenuModule } from './../menu/menu.module';
import { Collection, CollectionSchema } from './collection.schema';
import { Discount, DiscountSchema } from './discount.schema';
import { OrderConfirmationProcessor } from './order-confirmation.processor';
import { OrderController } from './order.controller';
import { Order, OrderSchema } from './order.schema';
import { OrderService } from './order.service';
import { OrderGroup, OrderGroupSchema } from './orderGroup.schema';
import { OrderNotes, OrderNotesSchema } from './orderNotes.schema';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Order.name, OrderSchema),
  createAutoIncrementConfig(OrderGroup.name, OrderGroupSchema),
  createAutoIncrementConfig(OrderNotes.name, OrderNotesSchema),
  createAutoIncrementConfig(Collection.name, CollectionSchema),
  createAutoIncrementConfig(Discount.name, DiscountSchema),
]);

const { host, port } = config.get<DBConfig>('redis');
@Module({
  imports: [
    WebSocketModule,
    mongooseModule,
    ActivityModule,
    RedisModule,
    VisitModule,
    ButtonCallModule,
    GameplayModule,
    NotificationModule,
    BullModule.forRootAsync({
      imports: [
    WebSocketModule,RedisModule],
      inject: [RedisService],
      useFactory: (redisService: RedisService): BullModuleOptions =>
        ({
          createClient: (type: 'client' | 'subscriber' | 'bclient') => {
            if (type === 'client') {
              return redisService.getClient();
            }
            return new Redis({
              host,
              port,
              enableReadyCheck: false,
              maxRetriesPerRequest: null,
            });
          },
        } as any),
    }),
    BullModule.registerQueue({
      name: 'order-confirmation',
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    }),
    forwardRef(() => AccountingModule),
    forwardRef(() => TableModule),
    forwardRef(() => MenuModule),
    forwardRef(() => UserModule),
    forwardRef(() => PointModule),
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderConfirmationProcessor],
  exports: [OrderService],
})
export class OrderModule {}
