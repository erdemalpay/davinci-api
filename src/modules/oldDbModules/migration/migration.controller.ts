import { Controller, Get, SetMetadata } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/modules/auth/public.decorator';

import { MigrationService } from './ migration.service';

@ApiTags('Migration')
@Controller('migrate')
export class MigrationController {
  constructor(private readonly migrationService: MigrationService) {}

  @Public()
  @Get('/users')
  migrateUsers() {
    return this.migrationService.migrateUsers();
  }

  @Public()
  @Get('/tables')
  migrateTables() {
    return this.migrationService.migrateTablesAndGameplays();
  }

  @Public()
  @Get('/games')
  migrateGames() {
    return this.migrationService.migrateGames();
  }

  @Public()
  @Get('/visits')
  migrateVisits() {
    return this.migrationService.migrateVisits();
  }
}
