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
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { Page } from './page.schema';
import { CreatePageDto, CreatePanelSettingsDto } from './panelControl.dto';
import { PanelControlService } from './panelControl.service';

@Controller('panel-control')
export class PanelControlController {
  constructor(private readonly panelControlService: PanelControlService) {}

  // Pages
  @Get('/pages')
  getPages() {
    return this.panelControlService.findAllPages();
  }
  @Get('routes')
  getAllRoutes() {
    return this.panelControlService.getAllRoutes();
  }

  @Post('/pages')
  createPage(@ReqUser() user: User, @Body() createPageDto: CreatePageDto) {
    return this.panelControlService.createPage(user, createPageDto);
  }

  @Post('/pages/multiple')
  createMultiplePages(
    @ReqUser() user: User,
    @Body() createPageDto: CreatePageDto[],
  ) {
    return this.panelControlService.createMultiplePages(user, createPageDto);
  }

  @Patch('/pages/:id')
  updatePage(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Page>,
  ) {
    return this.panelControlService.updatePage(user, id, updates);
  }

  @Delete('/pages/:id')
  deletePage(@ReqUser() user: User, @Param('id') id: string) {
    return this.panelControlService.removePage(user, id);
  }
  //panel settings
  @Get('/panel-settings')
  getPanelSettings() {
    return this.panelControlService.findPanelSettings();
  }

  @Post('/panel-settings')
  createPanelSettings(
    @ReqUser() user: User,
    @Body() createPanelSettingsDto: CreatePanelSettingsDto,
  ) {
    return this.panelControlService.createPanelSetting(
      user,
      createPanelSettingsDto,
    );
  }
  @Post('/whatsapp')
  sendWhatsAppMessage(
    @Body('to') to: string,
    @Body('message') message: string,
    @Body('languageCode') languageCode: string,
  ) {
    return this.panelControlService.sendWhatsAppMessage(
      to,
      message,
      languageCode,
    );
  }
}
