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

  @Post('/set-authorizations')
  setAuthorizationForAllRoutes() {
    return this.authorizationService.setAuthorizationForAllRoutes();
  }

  @Patch('/:id')
  updateAuthorization(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Authorization>,
  ) {
    return this.authorizationService.updateAuthorization(user, id, updates);
  }

  @Delete('/:id')
  deleteAuthorization(@Param('id') id: number) {
    return this.authorizationService.removeAuthorization(id);
  }
}
