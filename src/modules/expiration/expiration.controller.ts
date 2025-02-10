import { Controller } from '@nestjs/common';
import { ExpirationService } from './expiration.service';

@Controller('expiration')
export class ExpirationController {
  constructor(private readonly expirationService: ExpirationService) {}
  // Add controller methods here
}
