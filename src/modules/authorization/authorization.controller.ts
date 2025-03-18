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
import { CreateAuthorizationDto } from './authorization.dto';
import { Authorization } from './authorization.schema';
import { AuthorizationService } from './authorization.service';

@Controller('authorization')
export class AuthorizationController {
  constructor(private readonly authorizationService: AuthorizationService) {}

  @Get('/')
  getProducts() {
    return this.authorizationService.findAllAuthorizations();
  }

  @Post()
  createAuthorization(@Body() createAuthorizationDto: CreateAuthorizationDto) {
    return this.authorizationService.createAuthorization(
      createAuthorizationDto,
    );
  }

  @Post('/set-manager-only')
  setManagerOnly() {
    return this.authorizationService.setManagerOnlyAuthorizationForAllRoutes();
  }

  @Patch('/:id')
  updateAuthorization(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Authorization>,
  ) {
    return this.authorizationService.updateAuthorization(id, updates);
  }

  @Delete('/:id')
  deleteAuthorization(@Param('id') id: number) {
    return this.authorizationService.removeAuthorization(id);
  }
}
