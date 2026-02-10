import { Module, forwardRef } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { MenuModule } from '../menu/menu.module';
import { OrderModule } from '../order/order.module';
import { UserModule } from '../user/user.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { HepsiburadaController } from './hepsiburada.controller';
import { HepsiburadaWebhookController } from './hepsiburada-webhook.controller';
import { HepsiburadaService } from './hepsiburada.service';

@Module({
  imports: [
    WebSocketModule,
    forwardRef(() => MenuModule),
    forwardRef(() => AccountingModule),
    forwardRef(() => OrderModule),
    forwardRef(() => UserModule),
  ],
  controllers: [HepsiburadaController, HepsiburadaWebhookController],
  providers: [HepsiburadaService],
  exports: [HepsiburadaService],
})
export class HepsiburadaModule {}
