import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { assertFound } from 'src/utils/serviceUtils';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  CreateGiftDto,
  CreateGiftRecipientDto,
  CreateGiftTagDto,
  UpdateGiftDto,
  UpdateGiftRecipientDto,
} from './giftTracking.dto';
import { Gift, GiftRecipient, GiftTag } from './giftTracking.schema';

@Injectable()
export class GiftTrackingService {
  constructor(
    @InjectModel(GiftTag.name)
    private giftTagModel: Model<GiftTag>,
    @InjectModel(GiftRecipient.name)
    private giftRecipientModel: Model<GiftRecipient>,
    @InjectModel(Gift.name)
    private giftModel: Model<Gift>,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  findTags() {
    return this.giftTagModel.find().sort({ _id: 1 }).lean();
  }

  async createTag(dto: CreateGiftTagDto) {
    const tag = await this.giftTagModel.create({ ...dto, active: true });
    this.websocketGateway.emitGiftTrackingChanged();
    return tag;
  }

  async updateTag(id: number, updates: UpdateQuery<GiftTag>) {
    const tag = await this.giftTagModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    assertFound(tag, 'Gift tag not found');
    this.websocketGateway.emitGiftTrackingChanged();
    return tag;
  }

  findRecipients() {
    return this.giftRecipientModel.find().sort({ name: 1 }).lean();
  }

  async createRecipient(dto: CreateGiftRecipientDto) {
    const recipient = await this.giftRecipientModel.create(dto);
    this.websocketGateway.emitGiftTrackingChanged();
    return recipient;
  }

  async updateRecipient(id: number, updates: UpdateGiftRecipientDto) {
    const recipient = await this.giftRecipientModel.findByIdAndUpdate(
      id,
      updates,
      { new: true },
    );
    assertFound(recipient, 'Recipient not found');
    this.websocketGateway.emitGiftTrackingChanged();
    return recipient;
  }

  async removeRecipient(id: number) {
    const giftCount = await this.giftModel.countDocuments({ recipient: id });
    if (giftCount > 0) {
      throw new HttpException(
        'This recipient has gifts',
        HttpStatus.BAD_REQUEST,
      );
    }
    const recipient = await this.giftRecipientModel.findByIdAndDelete(id);
    assertFound(recipient, 'Recipient not found');
    this.websocketGateway.emitGiftTrackingChanged();
    return recipient;
  }

  findGifts() {
    return this.giftModel.find().sort({ date: -1, _id: -1 }).lean();
  }

  private async assertRecipientExists(id: number) {
    if (!(await this.giftRecipientModel.exists({ _id: id }))) {
      throw new HttpException('Recipient not found', HttpStatus.BAD_REQUEST);
    }
  }

  async createGift(user: User, dto: CreateGiftDto) {
    await this.assertRecipientExists(dto.recipient);
    const gift = await this.giftModel.create({ ...dto, createdBy: user._id });
    this.websocketGateway.emitGiftTrackingChanged();
    return gift;
  }

  async updateGift(id: number, updates: UpdateGiftDto) {
    if (updates.recipient !== undefined) {
      await this.assertRecipientExists(updates.recipient);
    }
    const gift = await this.giftModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    assertFound(gift, 'Gift not found');
    this.websocketGateway.emitGiftTrackingChanged();
    return gift;
  }

  async removeGift(id: number) {
    const gift = await this.giftModel.findByIdAndDelete(id);
    assertFound(gift, 'Gift not found');
    this.websocketGateway.emitGiftTrackingChanged();
    return gift;
  }
}
