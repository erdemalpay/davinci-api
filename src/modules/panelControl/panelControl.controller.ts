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
import { Action } from './action.schema';
import { DisabledCondition } from './disabledCondition.schema';
import { Page } from './page.schema';
import {
  CreateActionDto,
  CreateDisabledConditionDto,
  CreatePageDto,
  CreatePanelSettingsDto,
  CreateTaskTrackDto,
} from './panelControl.dto';
import { PanelControlService } from './panelControl.service';
import { TaskTrack } from './taskTrack.schema';

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
  createPage(@Body() createPageDto: CreatePageDto) {
    return this.panelControlService.createPage(createPageDto);
  }

  @Post('/pages/multiple')
  createMultiplePages(@Body() createPageDto: CreatePageDto[]) {
    return this.panelControlService.createMultiplePages(createPageDto);
  }

  @Patch('/pages/:id')
  updatePage(@Param('id') id: string, @Body() updates: UpdateQuery<Page>) {
    return this.panelControlService.updatePage(id, updates);
  }

  @Delete('/pages/:id')
  deletePage(@Param('id') id: string) {
    return this.panelControlService.removePage(id);
  }
  //panel settings
  @Get('/panel-settings')
  getPanelSettings() {
    return this.panelControlService.findPanelSettings();
  }

  @Post('/panel-settings')
  createPanelSettings(@Body() createPanelSettingsDto: CreatePanelSettingsDto) {
    return this.panelControlService.createPanelSetting(createPanelSettingsDto);
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
    @Body() createDisabledConditionDto: CreateDisabledConditionDto,
  ) {
    return this.panelControlService.createDisabledCondition(
      createDisabledConditionDto,
    );
  }

  @Patch('/disabled-conditions/:id')
  updateDisabledCondition(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<DisabledCondition>,
  ) {
    return this.panelControlService.updateDisabledCondition(id, updates);
  }

  @Get('/disabled-conditions/:id')
  getDisabledCondition(@Param('id') id: string) {
    return this.panelControlService.getDisabledCondition(id);
  }

  @Delete('/disabled-conditions/:id')
  deleteDisabledCondition(@Param('id') id: string) {
    return this.panelControlService.removeDisabledCondition(id);
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

  //task tracks
  @Get('/task-tracks')
  getTaskTracks() {
    return this.panelControlService.findAllTaskTracks();
  }

  @Post('/task-tracks')
  createTaskTrack(@Body() createTaskTrackDto: CreateTaskTrackDto) {
    return this.panelControlService.createTaskTrack(createTaskTrackDto);
  }

  @Patch('/task-tracks/:id')
  updateTaskTrack(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<TaskTrack>,
  ) {
    return this.panelControlService.updateTaskTrack(id, updates);
  }

  @Delete('/task-tracks/:id')
  deleteTaskTrack(@Param('id') id: number) {
    return this.panelControlService.removeTaskTrack(id);
  }
}
