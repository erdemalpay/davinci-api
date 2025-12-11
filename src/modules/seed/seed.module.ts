import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Table, TableSchema } from '../table/table.schema';
import { Order, OrderSchema } from '../order/order.schema';
import { Gameplay, GameplaySchema } from '../gameplay/gameplay.schema';
import { Location, LocationSchema } from '../location/location.schema';
import { User, UserSchema } from '../user/user.schema';
import { Game, GameSchema } from '../game/game.schema';
import { MenuItem, MenuItemSchema } from '../menu/item.schema';
import { RedisService } from '../redis/redis.service';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Table.name, schema: TableSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Gameplay.name, schema: GameplaySchema },
      { name: Location.name, schema: LocationSchema },
      { name: User.name, schema: UserSchema },
      { name: Game.name, schema: GameSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
    ]),
  ],
  controllers: [SeedController],
  providers: [SeedService, RedisService],
  exports: [SeedService],
})
export class SeedModule {}
