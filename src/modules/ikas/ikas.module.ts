import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { UserModule } from 'src/modules/user/user.module';
import { RedisModule } from '../redis/redis.module';
import { AccountingModule } from './../accounting/accounting.module';
import { LocationModule } from './../location/location.module';
import { MenuModule } from './../menu/menu.module';
import { IkasController } from './ikas.controller';
import { IkasGateway } from './ikas.gateway';
import { IkasService } from './ikas.service';

@Module({
  imports: [
    RedisModule,
    HttpModule,
    forwardRef(() => AccountingModule),
    UserModule,
    LocationModule,
    MenuModule,
  ],
  providers: [IkasService, IkasGateway],
  exports: [IkasService, IkasGateway],
  controllers: [IkasController],
})
export class IkasModule {}
