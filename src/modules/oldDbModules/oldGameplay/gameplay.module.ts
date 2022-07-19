import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OldGameplayService } from './gameplay.service';
import { Gameplay, OldGameplaySchema } from './gameplay.schema';

const mongooseModule = MongooseModule.forFeature(
  [{ name: Gameplay.name, schema: OldGameplaySchema }],
  'olddb',
);

@Module({
  imports: [mongooseModule],
  providers: [OldGameplayService],
  exports: [OldGameplayService],
})
export class OldGameplayModule {}
