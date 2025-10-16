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
import { Action } from './action.schema';
import { DisabledCondition } from './disabledCondition.schema';
import { Page } from './page.schema';
import {
  CreateActionDto,
  CreateDisabledConditionDto,
  CreatePageDto,
  CreatePanelSettingsDto,
} from './panelControl.dto';
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
  //disabled conditions
  @Get('/disabled-conditions')
  getDisabledConditions() {
    return this.panelControlService.findAllDisabledConditions();
  }
  @Post('/disabled-conditions')
  createDisabledCondition(
    @ReqUser() user: User,
    @Body() createDisabledConditionDto: CreateDisabledConditionDto,
  ) {
    return this.panelControlService.createDisabledCondition(
      user,
      createDisabledConditionDto,
    );
  }

  @Patch('/disabled-conditions/:id')
  updateDisabledCondition(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<DisabledCondition>,
  ) {
    return this.panelControlService.updateDisabledCondition(user, id, updates);
  }

  @Get('/disabled-conditions/:id')
  getDisabledCondition(@Param('id') id: string) {
    return this.panelControlService.getDisabledCondition(id);
  }

  @Delete('/disabled-conditions/:id')
  deleteDisabledCondition(@ReqUser() user: User, @Param('id') id: string) {
    return this.panelControlService.removeDisabledCondition(user, id);
  }

  //actions
  @Get('/actions')
  getActions() {
    return this.panelControlService.findAllActions();
  }

  @Post('/actions')
  createAction(@Body() createActionDto: CreateActionDto) {
    return this.panelControlService.createAction(createActionDto);
  }

  @Patch('/actions/:id')
  updateAction(@Param('id') id: string, @Body() updates: UpdateQuery<Action>) {
    return this.panelControlService.updateAction(id, updates);
  }

  @Delete('/actions/:id')
  deleteAction(@Param('id') id: string) {
    return this.panelControlService.removeAction(id);
  }
}
