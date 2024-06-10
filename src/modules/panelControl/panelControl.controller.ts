import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UpdateQuery } from 'mongoose';
import { Page } from './page.schema';
import { CreatePageDto } from './panelControl.dto';
import { PanelControlService } from './panelControl.service';

@Controller('panel-control')
export class PanelControlController {
  constructor(private readonly panelControlService: PanelControlService) {}

  // Pages
  @Get('/pages')
  getPages() {
    return this.panelControlService.findAllPages();
  }

  @Post('/pages')
  createPage(@Body() createPageDto: CreatePageDto) {
    return this.panelControlService.createPage(createPageDto);
  }

  @Patch('/pages/:id')
  updatePage(@Param('id') id: string, @Body() updates: UpdateQuery<Page>) {
    return this.panelControlService.updatePage(id, updates);
  }

  @Delete('/pages/:id')
  deletePage(@Param('id') id: string) {
    return this.panelControlService.removePage(id);
  }
}
