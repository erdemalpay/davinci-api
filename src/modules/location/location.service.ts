import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { CreateStockLocationDto } from './dto/create-location.dto';
import { Location } from './location.schema';
@Injectable()
export class LocationService {
  constructor(
    @InjectModel(Location.name) private locationModel: Model<Location>,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly redisService: RedisService,
  ) {
    this.checkDefaultLocations();
  }

  create(createLocationDto: CreateStockLocationDto) {
    const location = this.locationModel.create(createLocationDto);
    this.websocketGateway.emitLocationChanged();
    return location;
  }

  async findStoreLocations() {
    try {
      const redisLocations = await this.redisService.get(RedisKeys.Locations);
      if (redisLocations) {
        return redisLocations;
      }
    } catch (error) {
      console.error('Failed to retrieve store locations from Redis:', error);
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
      console.error('Failed to retrieve store locations from database:', error);
      throw new HttpException(
        'Could not retrieve store locations',
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
      console.error('Failed to retrieve all locations from Redis:', error);
    }

    try {
      const allLocations = await this.locationModel.find().exec();

      if (allLocations.length > 0) {
        await this.redisService.set(RedisKeys.AllLocations, allLocations);
      }
      return allLocations;
    } catch (error) {
      console.error('Failed to retrieve all locations from database:', error);
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

  async findLocationById(id: number) {
    const location = await this.locationModel.findOne({ _id: id });
    return location;
  }

  async checkDefaultLocations() {
    const locations = await this.findStoreLocations();
    if (locations.length > 0) {
      return;
    }
    const location1: CreateStockLocationDto = {
      name: 'Bahçeli',
    };
    const location2: CreateStockLocationDto = {
      name: 'Neorama',
    };
    await this.create(location1);
    await this.create(location2);

    console.log('Created default locations.'); // eslint-disable-line no-console
  }
  async searchLocationIds(search: string) {
    const searchLocationIds = await this.locationModel
      .find({ name: { $regex: new RegExp(search, 'i') } })
      .select('_id')
      .then((docs) => docs.map((doc) => doc._id));
    return searchLocationIds;
  }

  async updateLocation(id: number, updates: UpdateQuery<Location>) {
    // in case if someone try to update from postman or something
    if (updates?.type) {
      delete updates.type;
    }
    const location = await this.locationModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.websocketGateway.emitLocationChanged();
    return location;
  }

  async createStockLocation(createStockLocationDto: CreateStockLocationDto) {
    const location = await this.locationModel.create({
      ...createStockLocationDto,
      type: [2],
      active: true,
    });
    this.websocketGateway.emitLocationChanged();
    return location;
  }
}
