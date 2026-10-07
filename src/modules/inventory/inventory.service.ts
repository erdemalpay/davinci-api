import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, UpdateQuery } from 'mongoose';
import { Game } from '../game/game.schema';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  CreateInventoryLocationDto,
  CreateInventoryBoxesDto,
  DeactivateInventoryBoxesDto,
  MoveInventoryBoxesDto,
} from './inventory.dto';
import {
  InventoryBox,
  InventoryBoxSource,
  InventoryGameCode,
  InventoryLocation,
  InventoryMovement,
  InventoryMovementType,
} from './inventory.schema';

// Oyun kısaltması: 2-5 büyük harf veya rakam (kutu kodu: CAT-1).
const SHORT_CODE_REGEX = /^[A-Z0-9]{2,5}$/;

type CreateBoxesInput = {
  game: number;
  quantity: number;
  location: number;
  source: InventoryBoxSource;
  shortCode?: string;
  stockHistory?: number;
};

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(InventoryBox.name) private boxModel: Model<InventoryBox>,
    @InjectModel(InventoryMovement.name)
    private movementModel: Model<InventoryMovement>,
    @InjectModel(Game.name) private gameModel: Model<Game>,
    @InjectModel(InventoryLocation.name)
    private locationModel: Model<InventoryLocation>,
    @InjectModel(InventoryGameCode.name)
    private gameCodeModel: Model<InventoryGameCode>,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  // Tek atomik $inc; iptal edilen kutuların numarası geri verilmez.
  async allocateNumbers(gameId: number, count: number): Promise<number[]> {
    const code = await this.gameCodeModel
      .findOneAndUpdate(
        { _id: gameId },
        { $inc: { seq: count } },
        { new: true, projection: { seq: 1 } },
      )
      .lean();
    if (!code) {
      throw new HttpException('Short code not set', HttpStatus.BAD_REQUEST);
    }
    return Array.from({ length: count }, (_, i) => code.seq - count + 1 + i);
  }

  private async findShortCode(gameId: number): Promise<string | undefined> {
    const code = await this.gameCodeModel
      .findOne({ _id: gameId }, { shortCode: 1 })
      .lean();
    return code?.shortCode;
  }

  // Kilit ve biçim kuralı; yazma yapmaz.
  private checkShortCode(current?: string, requested?: string): void {
    if (current) {
      if (requested && requested !== current) {
        throw new HttpException(
          'Short code is locked for this game',
          HttpStatus.BAD_REQUEST,
        );
      }
      return;
    }
    // regex.test sayıyı string'e çevirir; tip ayrıca denetlenir.
    if (typeof requested !== 'string' || !SHORT_CODE_REGEX.test(requested)) {
      throw new HttpException(
        'Short code must be 2-5 letters or digits',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // Oyunun kısaltmasını döner; yoksa gönderileni kaydeder (benzersizlik index'te).
  private async ensureShortCode(
    gameId: number,
    requested?: string,
  ): Promise<string> {
    const current = await this.findShortCode(gameId);
    this.checkShortCode(current, requested);
    if (current) return current;
    try {
      const saved = await this.gameCodeModel
        .findOneAndUpdate(
          { _id: gameId },
          { $setOnInsert: { shortCode: requested, seq: 0 } },
          { upsert: true, new: true },
        )
        .lean();
      // Eşzamanlı bir istek başka bir kısaltma yazmış olabilir.
      if (saved.shortCode !== requested) {
        throw new HttpException(
          'Short code is locked for this game',
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (error) {
      if (error?.code === 11000) {
        throw new HttpException(
          'Short code is already used by another game',
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    }
    return requested;
  }

  async createBoxes(user: User, input: CreateBoxesInput): Promise<string[]> {
    const ids = await this.insertBoxes(user, input);
    this.websocketGateway.emitInventoryChanged();
    return ids;
  }

  // Envanter sayfasından elle ekleme: tüketim kaydı gerektirmez.
  async addBoxes(user: User, dto: CreateInventoryBoxesDto): Promise<string[]> {
    await this.assertActiveLocation(dto.location);
    return this.createBoxes(user, {
      ...dto,
      source: InventoryBoxSource.MANUAL,
    });
  }

  private async insertBoxes(
    user: User,
    input: CreateBoxesInput,
  ): Promise<string[]> {
    if (!(await this.gameModel.exists({ _id: input.game }))) {
      throw new HttpException('Game not found', HttpStatus.NOT_FOUND);
    }
    const shortCode = await this.ensureShortCode(input.game, input.shortCode);
    const numbers = await this.allocateNumbers(input.game, input.quantity);
    const boxes = numbers.map((n) => ({
      _id: `${shortCode}-${n}`,
      game: input.game,
      location: input.location,
      source: input.source,
      stockHistory: input.stockHistory,
      active: true,
    }));
    await this.boxModel.create(boxes);
    await this.movementModel.create(
      boxes.map((box) => ({
        box: box._id,
        game: box.game,
        type: InventoryMovementType.CREATE,
        toLocation: input.location,
        user: user._id,
      })),
    );
    return boxes.map((box) => box._id);
  }

  // Tüketimden (stok düşmeden) önce çağrılır; yazma yapmaz.
  async validateConsumption(input: {
    product: string;
    location: number;
    shortCode?: string;
  }) {
    const games = await this.gameModel.find({ product: input.product }).lean();
    if (games.length !== 1) {
      throw new HttpException(
        'Product must be linked to exactly one game',
        HttpStatus.BAD_REQUEST,
      );
    }
    const game = games[0];
    await this.assertActiveLocation(input.location);
    const current = await this.findShortCode(game._id);
    this.checkShortCode(current, input.shortCode);
    if (
      !current &&
      (await this.gameCodeModel.exists({ shortCode: input.shortCode }))
    ) {
      throw new HttpException(
        'Short code is already used by another game',
        HttpStatus.BAD_REQUEST,
      );
    }
    return game;
  }

  private async assertActiveLocation(id: number): Promise<void> {
    const location = await this.locationModel.findOne({ _id: id }).lean();
    if (!location?.active) {
      throw new HttpException(
        'Inventory location not found or inactive',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  findLocations() {
    return this.locationModel.find().sort({ _id: 1 }).lean();
  }

  async createLocation(dto: CreateInventoryLocationDto) {
    const location = await this.locationModel.create({ ...dto, active: true });
    this.websocketGateway.emitInventoryChanged();
    return location;
  }

  async updateLocation(id: number, updates: UpdateQuery<InventoryLocation>) {
    const location = await this.locationModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.websocketGateway.emitInventoryChanged();
    return location;
  }

  findBoxes() {
    return this.boxModel.find({ active: true }).sort({ createdAt: -1 }).lean();
  }

  // Verilen stok geçmişi id'lerinden kutu üretmiş olanlar (pasif kutular dahil).
  findStockHistoryIdsWithBoxes(ids: number[]) {
    return this.boxModel.distinct('stockHistory', {
      stockHistory: { $in: ids },
    });
  }

  // Sınırsız büyümesin diye son 1000 hareket.
  findMovements() {
    return this.movementModel.find().sort({ _id: -1 }).limit(1000).lean();
  }

  async moveBoxes(user: User, dto: MoveInventoryBoxesDto) {
    await this.assertActiveLocation(dto.location);
    const boxes = await this.findActiveBoxes(dto.ids, {
      location: { $ne: dto.location },
    });
    const result = await this.boxModel.updateMany(
      { _id: { $in: boxes.map((box) => box._id) }, active: true },
      { $set: { location: dto.location } },
    );
    await this.movementModel.create(
      boxes.map((box) => ({
        box: box._id,
        game: box.game,
        type: InventoryMovementType.MOVE,
        fromLocation: box.location,
        toLocation: dto.location,
        note: dto.note,
        user: user._id,
      })),
    );
    this.websocketGateway.emitInventoryChanged();
    return { moved: result.modifiedCount };
  }

  async deactivateBoxes(user: User, dto: DeactivateInventoryBoxesDto) {
    const boxes = await this.findActiveBoxes(dto.ids);
    const deactivated = await this.deactivate(
      user,
      boxes,
      InventoryMovementType.DEACTIVATE,
      dto.note,
    );
    return { deactivated };
  }

  // Tüketim iptali: o tüketimden üretilen kutular pasife alınır.
  async handleConsumptionCancel(user: User, stockHistoryId: number) {
    const boxes = await this.boxModel
      .find({ stockHistory: stockHistoryId, active: true })
      .lean();
    if (!boxes.length) return;
    await this.deactivate(user, boxes, InventoryMovementType.CANCEL);
  }

  private async deactivate(
    user: User,
    boxes: Pick<InventoryBox, '_id' | 'game' | 'location'>[],
    type: InventoryMovementType,
    note?: string,
  ) {
    const result = await this.boxModel.updateMany(
      { _id: { $in: boxes.map((box) => box._id) }, active: true },
      { $set: { active: false } },
    );
    await this.movementModel.create(
      boxes.map((box) => ({
        box: box._id,
        game: box.game,
        type,
        fromLocation: box.location,
        note,
        user: user._id,
      })),
    );
    this.websocketGateway.emitInventoryChanged();
    return result.modifiedCount;
  }

  private async findActiveBoxes(
    ids: string[],
    filter: FilterQuery<InventoryBox> = {},
  ) {
    const boxes = await this.boxModel
      .find({ _id: { $in: ids }, active: true, ...filter })
      .lean();
    if (!boxes.length) {
      throw new HttpException('No active boxes found', HttpStatus.BAD_REQUEST);
    }
    return boxes;
  }

  // Ürüne bağlı TAM BİR oyunu olan oyunlar.
  async findLinkableGames() {
    const games = await this.gameModel
      .find(
        { product: { $exists: true, $nin: [null, ''] } },
        { name: 1, product: 1 },
      )
      .lean();
    const countByProduct = new Map<string, number>();
    games.forEach((game) =>
      countByProduct.set(
        game.product,
        (countByProduct.get(game.product) ?? 0) + 1,
      ),
    );
    const linkable = games.filter(
      (game) => countByProduct.get(game.product) === 1,
    );
    const codes = await this.gameCodeModel
      .find({ _id: { $in: linkable.map((game) => game._id) } })
      .lean();
    const codeByGame = new Map(codes.map((code) => [code._id, code.shortCode]));
    return linkable.map((game) => ({
      ...game,
      shortCode: codeByGame.get(game._id),
    }));
  }
}
