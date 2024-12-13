import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IkasGateway } from './ikas.gateway';

@Injectable()
export class IkasService {
  constructor(
    configService: ConfigService,
    private readonly ikasGateway: IkasGateway,
  ) {}
}
