import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountingModule } from '../accounting/accounting.module';
import { MenuModule } from '../menu/menu.module';
import { OrderModule } from '../order/order.module';
import { UserModule } from '../user/user.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { HepsiburadaCronService } from './hepsiburada.cron.service';
import { HepsiburadaController } from './hepsiburada.controller';
import { HepsiburadaWebhookController } from './hepsiburada-webhook.controller';
import { HepsiburadaService } from './hepsiburada.service';
import {
  ProcessedHepsiburadaClaim,
  ProcessedHepsiburadaClaimSchema,
} from './processed-hepsiburada-claim.schema';

@Module({
  imports: [
    WebSocketModule,
    forwardRef(() => MenuModule),
    forwardRef(() => AccountingModule),
    forwardRef(() => OrderModule),
    forwardRef(() => UserModule),
    MongooseModule.forFeature([
      {
        name: ProcessedHepsiburadaClaim.name,
        schema: ProcessedHepsiburadaClaimSchema,
      },
    ]),
  ],
  controllers: [HepsiburadaController, HepsiburadaWebhookController],
  providers: [HepsiburadaService, HepsiburadaCronService],
  exports: [HepsiburadaService],
})
export class HepsiburadaModule {}
