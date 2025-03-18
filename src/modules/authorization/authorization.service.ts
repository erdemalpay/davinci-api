import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { PanelControlService } from '../panelControl/panelControl.service';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { CreateAuthorizationDto } from './authorization.dto';
import { AuthorizationGateway } from './authorization.gateway';
import { Authorization } from './authorization.schema';

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly authorizationGateway: AuthorizationGateway,
    private readonly redisService: RedisService,
    private readonly panelControlService: PanelControlService,
    @InjectModel(Authorization.name)
    private authorizationModel: Model<Authorization>,
  ) {}
  async findAllAuthorizations() {
    try {
      const redisAuthorizations = await this.redisService.get(
        RedisKeys.Authorizations,
      );
      if (redisAuthorizations) {
        return redisAuthorizations;
      }
    } catch (error) {
      console.error('Failed to retrieve authorizations from Redis:', error);
    }
    try {
      const authorizations = await this.authorizationModel.find({}).exec();
      if (authorizations.length > 0) {
        // Store retrieved authorizations in Redis for caching
        await this.redisService.set(RedisKeys.Authorizations, authorizations);
      }
      return authorizations;
    } catch (error) {
      console.error('Failed to retrieve authorizations from database:', error);
      throw new HttpException(
        'Could not retrieve authorizations',
        HttpStatus.NOT_FOUND,
      );
    }
  }
  async createAuthorization(createAuthorizationDto: CreateAuthorizationDto) {
    try {
      const authorization = await this.authorizationModel.create(
        createAuthorizationDto,
      );
      this.authorizationGateway.emitAuthorizationChanged(authorization);
      return authorization;
    } catch (error) {
      console.error('Failed to create authorization:', error);
      throw new HttpException(
        'Could not create authorization',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async updateAuthorization(id: number, updates: UpdateQuery<Authorization>) {
    const updatedAuthorization =
      await this.authorizationModel.findByIdAndUpdate(id, updates, {
        new: true,
      });
    if (!updatedAuthorization) {
      throw new Error('Authorization not found');
    }
    this.authorizationGateway.emitAuthorizationChanged(updatedAuthorization);
    return updatedAuthorization;
  }

  async removeAuthorization(id: number) {
    const deletedAuthorization =
      await this.authorizationModel.findByIdAndDelete(id);
    if (!deletedAuthorization) {
      throw new Error('Authorization not found');
    }
    this.authorizationGateway.emitAuthorizationChanged(deletedAuthorization);
    return deletedAuthorization;
  }

  async setManagerOnlyAuthorizationForAllRoutes(): Promise<void> {
    const routes = await this.panelControlService.getAllRoutes();
    await this.authorizationModel.deleteMany({});
    const authorizationsToCreate = routes.map((route) => ({
      path: route.path,
      method: route.methods[0],
      roles: [1], // setting roles to manager-only
    }));
    console.log('Creating authorizations:', authorizationsToCreate);
    await this.authorizationModel.create(authorizationsToCreate);
    await this.redisService.reset(RedisKeys.Authorizations);
    this.authorizationGateway.emitAuthorizationChanged();
  }
}
