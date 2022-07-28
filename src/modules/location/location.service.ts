import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateLocationDto } from './dto/create-location.dto';
import { Location } from './location.schema';

@Injectable()
export class LocationService {
  constructor(
    @InjectModel(Location.name) private locationModel: Model<Location>,
  ) {
    this.checkDefaultLocations();
  }

  create(createLocationDto: CreateLocationDto) {
    return this.locationModel.create(createLocationDto);
  }

  findAll() {
    return this.locationModel.find();
  }

  async checkDefaultLocations() {
    const locations = await this.findAll();
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
}
