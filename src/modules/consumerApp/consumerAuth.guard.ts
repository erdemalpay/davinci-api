import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ExtractJwt } from 'passport-jwt';
import { ConsumerStatus } from '../consumer/consumer.schema';
import { ConsumerService } from '../consumer/consumer.service';
import {
  CONSUMER_PROTECTED_METADATA,
  isConsumerTokenPayload,
} from './consumerToken';

// Routes of the customer app: the global JwtAuthGuard and RolesGuard skip
// them (like @ApiTokenProtected) and ConsumerAuthGuard checks the token.
export const ConsumerProtected = () =>
  applyDecorators(
    SetMetadata(CONSUMER_PROTECTED_METADATA, true),
    UseGuards(ConsumerAuthGuard),
  );

export const ReqConsumer = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.consumer;
  },
);

@Injectable()
export class ConsumerAuthGuard implements CanActivate {
  private readonly logger = new Logger(ConsumerAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly consumerService: ConsumerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
    if (!token) {
      throw new UnauthorizedException('Unauthorized');
    }

    let payload: unknown;
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }
    if (!isConsumerTokenPayload(payload)) {
      throw new UnauthorizedException('Unauthorized');
    }

    // The token couldn't be checked (e.g. the database timed out at a busy
    // hour). Not a 401: the app logs people out on a 401.
    let consumer;
    try {
      consumer = await this.consumerService.findById(payload.consumer);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Could not check the token', error);
      throw new ServiceUnavailableException('Could not check the session');
    }
    if (!consumer || consumer.status !== ConsumerStatus.ACTIVE) {
      throw new UnauthorizedException('Unauthorized');
    }

    request.consumer = consumer;
    return true;
  }
}
