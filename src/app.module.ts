import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import * as config from 'config';
import {
  AcceptLanguageResolver,
  CookieResolver,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';

import * as path from 'path';
import { InMemoryLoader } from './i18n/in-memory-loader';
import { AccountingModule } from './modules/accounting/accounting.module';
import { ActivityModule } from './modules/activity/activity.module';
import { AssetModule } from './modules/asset/asset.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { ButtonCallModule } from './modules/buttonCall/buttonCall.module';
import { ChecklistModule } from './modules/checklist/checklist.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { EducationModule } from './modules/education/education.module';
import { ExpirationModule } from './modules/expiration/expiration.module';
import { GameModule } from './modules/game/game.module';
import { GameplayModule } from './modules/gameplay/gameplay.module';
import { IkasModule } from './modules/ikas/ikas.module';
import { LocationModule } from './modules/location/location.module';
import { MembershipModule } from './modules/membership/membership.module';
import { MenuModule } from './modules/menu/menu.module';
import { NotificationModule } from './modules/notification/notification.module';
import { MigrationModule } from './modules/oldDbModules/migration/migration.module';
import { OrderModule } from './modules/order/order.module';
import { PanelControlModule } from './modules/panelControl/panelControl.module';
import { RedisModule } from './modules/redis/redis.module';
import { ReservationModule } from './modules/reservation/reservation.module';
import { RewardModule } from './modules/reward/reward.module';
import { ShiftModule } from './modules/shift/shift.module';
import { TableModule } from './modules/table/table.module';
import { UserModule } from './modules/user/user.module';
import { VisitModule } from './modules/visit/visit.module';

export interface DBConfig {
  host: string;
  port: number;
  name: string;
}

const { host, port, name }: DBConfig = config.get('db');
const mongoUrl = `mongodb://${host}:${port}/${name}?replicaSet=rs0&retryWrites=true&w=majority`;
const DbModule = MongooseModule.forRoot(mongoUrl, {
  ignoreUndefined: true,
});

const modules = [
  I18nModule.forRoot({
    fallbackLanguage: 'en',
    fallbacks: { 'en-*': 'en', 'tr-*': 'tr' },
    loader: InMemoryLoader, // custom loader class (no fs)
    // loaderOptions are ignored by custom loaders; ok to omit:
    loaderOptions: { path: path.resolve(process.cwd(), 'i18n') },
    resolvers: [
      { use: QueryResolver, options: ['lang', 'locale', 'l'] }, // ?lang=tr
      new HeaderResolver(['x-custom-lang']), // x-custom-lang: tr
      new AcceptLanguageResolver(), // Accept-Language: tr-TR
      new CookieResolver(['lang', 'locale']), // cookie: lang=tr
    ],
  }),
  ConfigModule.forRoot({ isGlobal: true }),
  ScheduleModule.forRoot(),
  ActivityModule,
  AuthModule,
  AssetModule,
  AuthorizationModule,
  IkasModule,
  DbModule,
  ChecklistModule,
  GameModule,
  GameplayModule,
  LocationModule,
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
  PanelControlModule,
  OrderModule,
  RedisModule,
  ButtonCallModule,
  NotificationModule,
  ShiftModule,
  ExpirationModule,
];

if (config.get('migrationEnabled')) {
  modules.push(MigrationModule);
}

@Module({
  imports: modules,
})
export class AppModule {}
