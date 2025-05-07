import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { CreateStockLocationDto } from './dto/create-location.dto';
import { LocationGateway } from './location.gateway';
import { Location } from './location.schema';
@Injectable()
export class LocationService {
  constructor(
    @InjectModel(Location.name) private locationModel: Model<Location>,
    private readonly locationGateway: LocationGateway,
  ) {
    this.checkDefaultLocations();
  }

  create(createLocationDto: CreateStockLocationDto) {
    const location = this.locationModel.create(createLocationDto);
    this.locationGateway.emitLocationChanged(location);
    return location;
  }

  findStoreLocations() {
    return this.locationModel.find({ type: { $in: [1] } });
  }
  findStockLocations() {
    return this.locationModel.find({ type: { $in: [2] } });
  }
  findSellLocations() {
    return this.locationModel.find({ type: { $in: [1, 3] } });
  }
  findAllLocations() {
    return this.locationModel.find();
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
    this.locationGateway.emitLocationChanged(location);
    return location;
  }

  async createStockLocation(createStockLocationDto: CreateStockLocationDto) {
    const location = await this.locationModel.create({
      ...createStockLocationDto,
      type: [2],
      active: true,
    });
    this.locationGateway.emitLocationChanged(location);
    return location;
  }
}
