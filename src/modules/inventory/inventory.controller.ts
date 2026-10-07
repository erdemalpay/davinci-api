import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UpdateQuery } from 'mongoose';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import {
  CreateInventoryBoxesDto,
  CreateInventoryLocationDto,
  DeactivateInventoryBoxesDto,
  MoveInventoryBoxesDto,
} from './inventory.dto';
import { InventoryLocation } from './inventory.schema';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('/locations')
  findLocations() {
    return this.inventoryService.findLocations();
  }

  @Post('/locations')
  createLocation(@Body() dto: CreateInventoryLocationDto) {
    return this.inventoryService.createLocation(dto);
  }

  @Patch('/locations/:id')
  updateLocation(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<InventoryLocation>,
  ) {
    return this.inventoryService.updateLocation(id, updates);
  }

  @Get('/boxes')
  findBoxes() {
    return this.inventoryService.findBoxes();
  }

  @Post('/boxes')
  addBoxes(@ReqUser() user: User, @Body() dto: CreateInventoryBoxesDto) {
    return this.inventoryService.addBoxes(user, dto);
  }

  @Post('/boxes/move')
  moveBoxes(@ReqUser() user: User, @Body() dto: MoveInventoryBoxesDto) {
    return this.inventoryService.moveBoxes(user, dto);
  }

  @Post('/boxes/deactivate')
  deactivateBoxes(
    @ReqUser() user: User,
    @Body() dto: DeactivateInventoryBoxesDto,
  ) {
    return this.inventoryService.deactivateBoxes(user, dto);
  }

  @Get('/movements')
  findMovements() {
    return this.inventoryService.findMovements();
  }

  @Get('/linkable-games')
  findLinkableGames() {
    return this.inventoryService.findLinkableGames();
  }
}
