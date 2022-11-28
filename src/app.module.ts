import * as config from 'config';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { GameModule } from './modules/game/game.module';
import { GameplayModule } from './modules/gameplay/gameplay.module';
import { LocationModule } from './modules/location/location.module';
import { MigrationModule } from './modules/oldDbModules/migration/migration.module';
import { ShiftModule } from './modules/shift/shift.module';
import { TableModule } from './modules/table/table.module';
import { VisitModule } from './modules/visit/visit.module';
import { MembershipModule } from './modules/membership/membership.module';
import { MenuModule } from './modules/menu/menu.module';
import { ReservationModule } from './modules/reservation/reservation.module';

const { host, port, name } = config.get('db');
const mongoUrl = `mongodb://${host}:${port}/${name}`;
const DbModule = MongooseModule.forRoot(mongoUrl, {
  ignoreUndefined: true,
});

const modules = [
  AuthModule,
  DbModule,
  GameModule,
  GameplayModule,
  LocationModule,
  MembershipModule,
  MenuModule,
  ReservationModule,
  ShiftModule,
  TableModule,
  UserModule,
  VisitModule,
];

if (config.get('migrationEnabled')) {
  modules.push(MigrationModule);
}

@Module({
  imports: modules,
})
export class AppModule {}
