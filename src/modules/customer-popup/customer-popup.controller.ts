import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UpdateQuery } from 'mongoose';
import { Public } from '../auth/public.decorator';
import { CreateCustomerPopupDto } from './customer-popup.dto';
import { CustomerPopup } from './customer-popup.schema';
import { CustomerPopupService } from './customer-popup.service';

@Controller('/menu/customer-popup')
export class CustomerPopupController {
  constructor(private readonly customerPopupService: CustomerPopupService) {}

  @Get()
  findAll() {
    return this.customerPopupService.findAll();
  }

  @Public()
  @Get('/active')
  findActive(@Query('location') location: string) {
    return this.customerPopupService.findActive(Number(location));
  }

  @Post()
  create(@Body() dto: CreateCustomerPopupDto) {
    return this.customerPopupService.create(dto);
  }

  @Patch('/:id')
  update(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<CustomerPopup>,
  ) {
    return this.customerPopupService.update(id, updates);
  }

  @Delete('/:id')
  remove(@Param('id') id: number) {
    return this.customerPopupService.remove(id);
  }
}
