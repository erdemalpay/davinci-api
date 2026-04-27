import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import * as config from 'config';
import { AccountingModule } from './modules/accounting/accounting.module';
import { ActivityModule } from './modules/activity/activity.module';
import { AssetModule } from './modules/asset/asset.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { BackInStockModule } from './modules/back-in-stock/back-in-stock.module';
import { BreakModule } from './modules/break/break.module';
import { ButtonCallModule } from './modules/buttonCall/buttonCall.module';
import { ChecklistModule } from './modules/checklist/checklist.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { ConsumerModule } from './modules/consumer/consumer.module';
import { CustomerPopupModule } from './modules/customer-popup/customer-popup.module';
import { MonthlyActivityModule } from './modules/monthly-activity/monthly-activity.module';
import { EducationModule } from './modules/education/education.module';
import { EventSurveyModule } from './modules/event-survey/event-survey.module';
import { ExpirationModule } from './modules/expiration/expiration.module';
import { GameModule } from './modules/game/game.module';
import { GameplayModule } from './modules/gameplay/gameplay.module';
import { GameplayTimeModule } from './modules/gameplaytime/gameplaytime.module';
import { HepsiburadaModule } from './modules/hepsiburada/hepsiburada.module';
import { IkasModule } from './modules/ikas/ikas.module';
import { LocationModule } from './modules/location/location.module';
import { MailModule } from './modules/mail/mail.module';
import { MembershipModule } from './modules/membership/membership.module';
import { MenuModule } from './modules/menu/menu.module';
import { MiddlemanModule } from './modules/middleman/middleman.module';
import { NotificationModule } from './modules/notification/notification.module';
import { MigrationModule } from './modules/oldDbModules/migration/migration.module';
import { OrderModule } from './modules/order/order.module';
import { PanelControlModule } from './modules/panelControl/panelControl.module';
import { PointModule } from './modules/point/point.module';
import { PriceCompareLogModule } from './modules/price-compare-log/price-compare-log.module';
import { PriceCompareModule } from './modules/price-compare/price-compare.module';
import { RedisModule } from './modules/redis/redis.module';
import { ReservationModule } from './modules/reservation/reservation.module';
import { RewardModule } from './modules/reward/reward.module';
import { ShiftModule } from './modules/shift/shift.module';
import { ShopifyModule } from './modules/shopify/shopify.module';
import { TableModule } from './modules/table/table.module';
import { TrendyolModule } from './modules/trendyol/trendyol.module';
import { UserModule } from './modules/user/user.module';
import { VisitModule } from './modules/visit/visit.module';
import { ConcurrencyLogModule } from './modules/concurrency-log/concurrency-log.module';
import { WebhookLogModule } from './modules/webhook-log/webhook-log.module';
import { WebSocketModule } from './modules/websocket/websocket.module';

export interface DBConfig {
  host: string;
  port: number;
  name: string;
}

const { host, port, name }: DBConfig = config.get('db');
const mongoUrl = `mongodb://${host}:${port}/${name}?replicaSet=rs0&retryWrites=true&w=majority&directConnection=true`;
const DbModule = MongooseModule.forRoot(mongoUrl, {
  ignoreUndefined: true,
});

const modules = [
  ConfigModule.forRoot({ isGlobal: true }),
  ScheduleModule.forRoot(),
  WebSocketModule, // Centralized WebSocket gateway
  ActivityModule,
  AuthModule,
  AssetModule,
  AuthorizationModule,
  BreakModule,
  IkasModule,
  ShopifyModule,
  TrendyolModule,
  HepsiburadaModule,
  DbModule,
  ChecklistModule,
  GameModule,
  GameplayModule,
  LocationModule,
  MailModule,
  BackInStockModule,
  MembershipModule,
  RewardModule,
  EducationModule,
  MenuModule,
  ReservationModule,
  TableModule,
  UserModule,
  VisitModule,
  AccountingModule,
  CheckoutModule,
  CustomerPopupModule,
  MonthlyActivityModule,
  EventSurveyModule,
  ConsumerModule,
  PanelControlModule,
  PointModule,
  PriceCompareModule,
  PriceCompareLogModule,
  OrderModule,
  RedisModule,
  ButtonCallModule,
  NotificationModule,
  ShiftModule,
  ExpirationModule,
  GameplayTimeModule,
  MiddlemanModule,
  WebhookLogModule,
  ConcurrencyLogModule,
];

if (config.get('migrationEnabled')) {
  modules.push(MigrationModule);
}

@Module({
  imports: modules,
})
export class AppModule {}
