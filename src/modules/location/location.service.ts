import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { CreateStockLocationDto } from './dto/create-location.dto';
import { Location } from './location.schema';
@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    @InjectModel(Location.name) private locationModel: Model<Location>,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly redisService: RedisService,
  ) {}

  create(user: User, createLocationDto: CreateStockLocationDto) {
    const location = this.locationModel.create(createLocationDto);
    this.websocketGateway.emitLocationChanged(user);
    return location;
  }

  async findStoreLocations() {
    try {
      const redisLocations = await this.redisService.get(RedisKeys.Locations);
      if (redisLocations) {
        return redisLocations;
      }
    } catch (error) {
      this.logger.error(
        'Failed to retrieve store locations from Redis:',
        error,
      );
    }

    try {
      const locations = await this.locationModel
        .find({ type: { $in: [1] } })
        .exec();

      if (locations.length > 0) {
        await this.redisService.set(RedisKeys.Locations, locations);
      }
      return locations;
    } catch (error) {
      this.logger.error(
        'Failed to retrieve store locations from database:',
        error,
      );
      throw new HttpException(
        'Could not retrieve store locations',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOrdersSummaryLocations() {
    try {
      const locations = await this.locationModel
        .find({ seenInOrdersSummaryPage: true })
        .exec();
      return locations;
    } catch (error) {
      this.logger.error(
        'Failed to retrieve orders summary locations from database:',
        error,
      );
      throw new HttpException(
        'Could not retrieve orders summary locations',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  findStockLocations() {
    return this.locationModel.find({ type: { $in: [2] } });
  }
  findSellLocations() {
    return this.locationModel.find({ type: { $in: [1, 3] } });
  }
  async findAllLocations() {
    try {
      const redisAllLocations = await this.redisService.get(
        RedisKeys.AllLocations,
      );
      if (redisAllLocations) {
        return redisAllLocations;
      }
    } catch (error) {
      this.logger.error('Failed to retrieve all locations from Redis:', error);
    }

    try {
      const allLocations = await this.locationModel.find().exec();

      if (allLocations.length > 0) {
        await this.redisService.set(RedisKeys.AllLocations, allLocations);
      }
      return allLocations;
    } catch (error) {
      this.logger.error(
        'Failed to retrieve all locations from database:',
        error,
      );
      throw new HttpException(
        'Could not retrieve all locations',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async findByName(name: string) {
    const location = await this.locationModel.findOne({ name: name });
    return location;
  }
  async findByIkasId(id: string) {
    const location = await this.locationModel.findOne({ ikasId: id });
    return location;
  }

  async findByShopifyId(shopifyId: string) {
    const location = await this.locationModel.findOne({ shopifyId });
    return location;
  }

  async findLocationById(id: number) {
    const location = await this.locationModel.findOne({ _id: id });
    return location;
  }

  async searchLocationIds(search: string) {
    const searchLocationIds = await this.locationModel
      .find({ name: { $regex: new RegExp(search, 'i') } })
      .select('_id')
      .then((docs) => docs.map((doc) => doc._id));
    return searchLocationIds;
  }

  async updateLocation(user: User, id: number, updates: UpdateQuery<Location>) {
    // in case if someone try to update from postman or something
    if (updates?.type) {
      delete updates.type;
    }
    const location = await this.locationModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.websocketGateway.emitLocationChanged(user);
    return location;
  }

  async createStockLocation(
    user: User,
    createStockLocationDto: CreateStockLocationDto,
  ) {
    const location = await this.locationModel.create({
      ...createStockLocationDto,
      type: [2],
      active: true,
    });
    this.websocketGateway.emitLocationChanged(user);
    return location;
  }
}
