import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { hash } from 'bcrypt';
import { Model } from 'mongoose';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  ConsumerQueryDto,
  CreateConsumerDto,
  UpdateConsumerDto,
} from './consumer.dto';
import { Consumer, ConsumerStatus } from './consumer.schema';

@Injectable()
export class ConsumerService {
  constructor(
    @InjectModel(Consumer.name) private consumerModel: Model<Consumer>,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  async create(createConsumerDto: CreateConsumerDto): Promise<Consumer> {
    // Check if email already exists
    const existingEmailConsumer = await this.consumerModel.findOne({
      email: createConsumerDto.email,
    });

    if (existingEmailConsumer) {
      throw new HttpException('Email already exists', HttpStatus.BAD_REQUEST);
    }

    // Check if userName already exists
    const existingUserNameConsumer = await this.consumerModel.findOne({
      userName: createConsumerDto.userName,
    });

    if (existingUserNameConsumer) {
      throw new HttpException(
        'Username already exists',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Hash password if provided, otherwise use a default password
    const hashedPassword = createConsumerDto.password
      ? await hash(createConsumerDto.password, 10)
      : await hash('default123', 10);

    // Create fullName from name and surname
    const fullName = `${createConsumerDto.name} ${createConsumerDto.surname}`;

    const consumer = await this.consumerModel.create({
      ...createConsumerDto,
      password: hashedPassword,
      fullName,
      status: ConsumerStatus.ACTIVE,
    });

    this.websocketGateway.emitConsumerChanged();
    return consumer;
  }

  async findAllActiveConsumers() {
    return this.consumerModel
      .find({ status: ConsumerStatus.ACTIVE })
      .select('_id fullName')
      .exec();
  }

  async findAll(query: ConsumerQueryDto) {
    const { search, status, page = 1, limit = 50, sort, asc } = query;
    const filter: any = {};

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: new RegExp(search, 'i') } },
        { surname: { $regex: new RegExp(search, 'i') } },
        { userName: { $regex: new RegExp(search, 'i') } },
        { email: { $regex: new RegExp(search, 'i') } },
        { fullName: { $regex: new RegExp(search, 'i') } },
      ];
    }
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build sort object
    const sortObject = {};
    if (sort) {
      sortObject[sort] = asc ? Number(asc) : -1;
    } else {
      sortObject['createdAt'] = -1;
    }

    // Get total count
    const totalNumber = await this.consumerModel.countDocuments(filter);
    const totalPages = Math.ceil(totalNumber / limitNum);

    // Get paginated data
    const data = await this.consumerModel
      .find(filter)
      .sort(sortObject)
      .skip(skip)
      .limit(limitNum)
      .exec();

    return {
      data,
      totalNumber,
      totalPages,
      page: pageNum,
      limit: limitNum,
    };
  }

  async findById(id: string | number): Promise<Consumer | null> {
    // Convert string to number if needed
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (isNaN(numericId)) {
      return null;
    }

    const consumer = await this.consumerModel.findById(numericId);
    return consumer;
  }

  async findByEmail(email: string): Promise<Consumer | null> {
    const consumer = await this.consumerModel.findOne({ email });
    return consumer;
  }

  async update(
    id: string | number,
    updateConsumerDto: UpdateConsumerDto,
  ): Promise<Consumer> {
    // Convert string to number if needed
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (isNaN(numericId)) {
      throw new HttpException('Invalid consumer ID', HttpStatus.BAD_REQUEST);
    }

    const consumer = await this.consumerModel.findById(numericId);

    if (!consumer) {
      throw new HttpException('Consumer not found', HttpStatus.NOT_FOUND);
    }

    // Check if email is being updated and if it already exists
    if (updateConsumerDto.email && updateConsumerDto.email !== consumer.email) {
      const existingConsumer = await this.consumerModel.findOne({
        email: updateConsumerDto.email,
      });

      if (existingConsumer) {
        throw new HttpException('Email already exists', HttpStatus.BAD_REQUEST);
      }
    }

    // Check if userName is being updated and if it already exists
    if (
      updateConsumerDto.userName &&
      updateConsumerDto.userName !== consumer.userName
    ) {
      const existingConsumer = await this.consumerModel.findOne({
        userName: updateConsumerDto.userName,
      });

      if (existingConsumer) {
        throw new HttpException(
          'Username already exists',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Hash password if it's being updated
    if (updateConsumerDto.password) {
      updateConsumerDto.password = await hash(updateConsumerDto.password, 10);
    }

    // Update fullName if name or surname is being updated
    if (updateConsumerDto.name || updateConsumerDto.surname) {
      const name = updateConsumerDto.name || consumer.name;
      const surname = updateConsumerDto.surname || consumer.surname;
      consumer.fullName = `${name} ${surname}`;
    }

    // Update consumer
    Object.assign(consumer, updateConsumerDto);
    consumer.updatedAt = new Date();

    await consumer.save();
    this.websocketGateway.emitConsumerChanged();
    return consumer;
  }

  async delete(id: string | number): Promise<Consumer> {
    // Convert string to number if needed
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (isNaN(numericId)) {
      throw new HttpException('Invalid consumer ID', HttpStatus.BAD_REQUEST);
    }

    const consumer = await this.consumerModel.findById(numericId);

    if (!consumer) {
      throw new HttpException('Consumer not found', HttpStatus.NOT_FOUND);
    }

    // Set status to INACTIVE instead of actually deleting
    consumer.status = ConsumerStatus.INACTIVE;
    consumer.updatedAt = new Date();

    await consumer.save();
    this.websocketGateway.emitConsumerChanged();
    return consumer;
  }
}
