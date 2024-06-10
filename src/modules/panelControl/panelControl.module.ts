import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Page, PageSchema } from './page.schema';
import { PanelControlController } from './panelControl.controller';
import { PanelControlService } from './panelControl.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  { name: Page.name, useFactory: () => PageSchema },
]);

@Module({
  imports: [mongooseModule],
  providers: [PanelControlService],
  controllers: [PanelControlController],
  exports: [mongooseModule, PanelControlService, PanelControlModule],
})
export class PanelControlModule {}
