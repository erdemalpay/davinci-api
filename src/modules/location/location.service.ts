import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateLocationDto } from './dto/create-location.dto';
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

  create(createLocationDto: CreateLocationDto) {
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

  async checkDefaultLocations() {
    const locations = await this.findStoreLocations();
    if (locations.length > 0) {
      return;
    }
    const location1: CreateLocationDto = {
      name: 'Bahçeli',
    };
    const location2: CreateLocationDto = {
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
}
