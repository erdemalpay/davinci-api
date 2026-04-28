import {
  DefaultValuePipe,
  Controller,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { InstagramService } from './instagram.service';

@Controller('/instagram')
export class InstagramController {
  constructor(private readonly instagramService: InstagramService) {}

  @Public()
  @Get('/posts')
  getPosts(
    @Query('limit', new DefaultValuePipe(8), ParseIntPipe) limit: number,
  ) {
    return this.instagramService.getPosts(limit);
  }
}

