import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'crypto';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { CreateEventDto, EventQueryDto, UpdateEventStatusDto } from './dto/event.dto';
import { RedeemCodeDto, ValidateCodeDto } from './dto/redeem.dto';
import { CreateSurveyQuestionDto } from './dto/survey-question.dto';
import { SurveyResponseQueryDto, SubmitSurveyDto } from './dto/survey-response.dto';
import { EventStatus, SurveyEvent } from './schemas/event.schema';
import { RedeemChannel, RewardCode, RewardCodeStatus } from './schemas/reward-code.schema';
import { SurveyQuestion } from './schemas/survey-question.schema';
import { SurveyResponse } from './schemas/survey-response.schema';
import { User } from '../user/user.schema';

@Injectable()
export class EventSurveyService {
  constructor(
    @InjectModel(SurveyEvent.name)
    private readonly eventModel: Model<SurveyEvent>,
    @InjectModel(SurveyQuestion.name)
    private readonly questionModel: Model<SurveyQuestion>,
    @InjectModel(SurveyResponse.name)
    private readonly responseModel: Model<SurveyResponse>,
    @InjectModel(RewardCode.name)
    private readonly rewardCodeModel: Model<RewardCode>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {}

  // ─── Event (Etkinlik) ────────────────────────────────────────────────────────

  async createEvent(dto: CreateEventDto): Promise<SurveyEvent> {
    const baseSlug = usernamify(dto.name).replaceAll('_', '-');
    const slug = await this.generateUniqueSlug(baseSlug);
    return this.eventModel.create({ ...dto, slug });
  }

  async updateEvent(id: number, updates: UpdateQuery<SurveyEvent>): Promise<SurveyEvent> {
    return this.eventModel.findByIdAndUpdate(id, updates, { new: true }).exec();
  }

  async updateEventStatus(id: number, dto: UpdateEventStatusDto): Promise<SurveyEvent> {
    return this.eventModel
      .findByIdAndUpdate(id, { status: dto.status }, { new: true })
      .exec();
  }

  async queryEvents(query: EventQueryDto): Promise<SurveyEvent[]> {
    const { status, isActive } = query;
    const filter: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (status) filter.status = status;
    if (isActive !== undefined) filter.isActive = isActive;
    return this.eventModel.find(filter).sort({ _id: -1 }).exec();
  }

  async removeEvent(id: number): Promise<SurveyEvent> {
    return this.eventModel
      .findByIdAndUpdate(id, { isDeleted: true }, { new: true })
      .exec();
  }

  // Public: slug ile aktif event + sorular
  async findPublicEventBySlug(slug: string) {
    const event = await this.eventModel
      .findOne({ slug, isDeleted: { $ne: true } })
      .exec();

    if (!event) throw new NotFoundException('Etkinlik bulunamadı');

    if (event.status !== EventStatus.PUBLISHED || !event.isActive) {
      return { event, questions: [], available: false };
    }

    const questions = await this.questionModel
      .find({ eventId: event._id, isActive: true })
      .sort({ order: 1 })
      .exec();

    return { event, questions, available: true };
  }

  // ─── Sorular ─────────────────────────────────────────────────────────────────

  async getQuestions(eventId: number): Promise<SurveyQuestion[]> {
    return this.questionModel
      .find({ eventId, isActive: true })
      .sort({ order: 1 })
      .exec();
  }

  async createQuestion(eventId: number, dto: CreateSurveyQuestionDto): Promise<SurveyQuestion> {
    await this.assertEventExists(eventId);
    return this.questionModel.create({ ...dto, eventId });
  }

  async updateQuestion(
    eventId: number,
    questionId: number,
    updates: UpdateQuery<SurveyQuestion>,
  ): Promise<SurveyQuestion> {
    return this.questionModel
      .findOneAndUpdate({ _id: questionId, eventId }, updates, { new: true })
      .exec();
  }

  async removeQuestion(eventId: number, questionId: number): Promise<SurveyQuestion> {
    return this.questionModel
      .findOneAndUpdate({ _id: questionId, eventId }, { isActive: false }, { new: true })
      .exec();
  }

  // ─── Form Gönderimi (Public) ─────────────────────────────────────────────────

  async submitSurvey(dto: SubmitSurveyDto) {
    const event = await this.eventModel
      .findOne({ _id: dto.eventId, isDeleted: { $ne: true }, status: EventStatus.PUBLISHED, isActive: true })
      .exec();

    if (!event) throw new NotFoundException('Etkinlik bulunamadı veya aktif değil');

    // Aynı email aynı etkinlikte 1 kez katılabilir
    const existing = await this.responseModel
      .findOne({ eventId: dto.eventId, email: dto.email.toLowerCase() })
      .exec();

    if (existing) {
      throw new BadRequestException('Bu e-posta adresiyle bu etkinliğe zaten katıldınız');
    }

    const response = await this.responseModel.create({
      ...dto,
      email: dto.email.toLowerCase(),
    });

    const code = await this.generateUniqueCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + event.codeValidityDays);

    const rewardCode = await this.rewardCodeModel.create({
      code,
      responseId: response._id,
      eventId: event._id,
      expiresAt,
      rewardLabel: event.rewardLabel,
    });

    return {
      code: rewardCode.code,
      expiresAt: rewardCode.expiresAt,
      rewardLabel: rewardCode.rewardLabel,
      eventName: event.name,
      codeValidityDays: event.codeValidityDays,
    };
  }

  // ─── Kod Doğrulama ───────────────────────────────────────────────────────────

  async validateCode(dto: ValidateCodeDto) {
    const rewardCode = await this.rewardCodeModel.findOne({ code: dto.code }).exec();
    if (!rewardCode) throw new NotFoundException('Kod bulunamadı');

    const [event, response, redeemedByUser] = await Promise.all([
      this.eventModel.findById(rewardCode.eventId).exec(),
      this.responseModel.findById(rewardCode.responseId).exec(),
      rewardCode.redeemedByUserId
        ? this.userModel.findById(rewardCode.redeemedByUserId).exec()
        : Promise.resolve(null),
    ]);

    const now = new Date();
    const isExpired = rewardCode.status === RewardCodeStatus.ISSUED && rewardCode.expiresAt < now;

    return {
      code: rewardCode.code,
      status: isExpired ? RewardCodeStatus.EXPIRED : rewardCode.status,
      rewardLabel: rewardCode.rewardLabel,
      expiresAt: rewardCode.expiresAt,
      redeemedAt: rewardCode.redeemedAt ?? null,
      redeemChannel: rewardCode.redeemChannel ?? null,
      eventName: event?.name ?? null,
      eventStartAt: event?.startAt ?? null,
      eventEndAt: event?.endAt ?? null,
      fullName: response?.fullName ?? null,
      redeemedByUserName: redeemedByUser?.fullName ?? redeemedByUser?.name ?? null,
      createdAt: (rewardCode as { createdAt?: Date }).createdAt,
    };
  }

  async redeemCode(dto: RedeemCodeDto, userId: string) {
    const now = new Date();

    // Atomik güncelleme: yalnızca status=issued ve süresi dolmamış kodlar alınır
    const rewardCode = await this.rewardCodeModel
      .findOneAndUpdate(
        {
          code: dto.code,
          status: RewardCodeStatus.ISSUED,
          expiresAt: { $gt: now },
        },
        {
          status: RewardCodeStatus.REDEEMED,
          redeemedAt: now,
          redeemedByUserId: userId,
          redeemChannel: dto.channel,
        },
        { new: true },
      )
      .exec();

    if (!rewardCode) {
      // Kodun mevcut durumunu kontrol et
      const existing = await this.rewardCodeModel.findOne({ code: dto.code }).exec();
      if (!existing) throw new NotFoundException('Kod bulunamadı');
      if (existing.status === RewardCodeStatus.REDEEMED)
        throw new BadRequestException('Bu kod zaten kullanılmış');
      throw new BadRequestException('Kodun süresi dolmuş');
    }

    const [event, response, redeemedByUser] = await Promise.all([
      this.eventModel.findById(rewardCode.eventId).exec(),
      this.responseModel.findById(rewardCode.responseId).exec(),
      userId ? this.userModel.findById(userId).exec() : Promise.resolve(null),
    ]);

    return {
      code: rewardCode.code,
      status: rewardCode.status,
      rewardLabel: rewardCode.rewardLabel,
      redeemedAt: rewardCode.redeemedAt,
      redeemChannel: rewardCode.redeemChannel,
      eventName: event?.name ?? null,
      fullName: response?.fullName ?? null,
      redeemedByUserName: redeemedByUser?.fullName ?? redeemedByUser?.name ?? null,
    };
  }

  // ─── Analytics ───────────────────────────────────────────────────────────────

  async queryResponses(query: SurveyResponseQueryDto) {
    const { page = 1, limit = 20, eventId, startDate, endDate } = query;
    const filter: Record<string, unknown> = {};
    if (eventId) filter.eventId = Number(eventId);
    if (startDate || endDate) {
      const range: Record<string, Date> = {};
      if (startDate) range.$gte = new Date(startDate);
      if (endDate) range.$lte = new Date(endDate);
      filter.createdAt = range;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      this.responseModel.find(filter).sort({ _id: -1 }).skip(skip).limit(Number(limit)).exec(),
      this.responseModel.countDocuments(filter),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async getAnalyticsSummary(eventId?: number) {
    const baseFilter: Record<string, unknown> = {};
    if (eventId) baseFilter.eventId = Number(eventId);

    const [totalResponses, totalIssued, totalRedeemed] = await Promise.all([
      this.responseModel.countDocuments(baseFilter),
      this.rewardCodeModel.countDocuments({ ...baseFilter }),
      this.rewardCodeModel.countDocuments({ ...baseFilter, status: RewardCodeStatus.REDEEMED }),
    ]);

    // Günlük form gönderimi (son 30 gün)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyTrend = await this.responseModel.aggregate([
      {
        $match: {
          ...baseFilter,
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      totalResponses,
      totalIssued,
      totalRedeemed,
      redeemRate: totalIssued > 0 ? Math.round((totalRedeemed / totalIssued) * 100) : 0,
      dailyTrend,
    };
  }

  // ─── Yardımcı metodlar ───────────────────────────────────────────────────────

  private async generateUniqueSlug(base: string): Promise<string> {
    let slug = base;
    let counter = 2;
    while (await this.eventModel.findOne({ slug }).exec()) {
      slug = `${base}-${counter}`;
      counter++;
    }
    return slug;
  }

  private async generateUniqueCode(): Promise<string> {
    let code: string;
    let attempts = 0;
    do {
      code = String(randomInt(100000, 999999));
      attempts++;
      if (attempts > 50) throw new BadRequestException('Kod üretilemedi, lütfen tekrar deneyin');
    } while (
      await this.rewardCodeModel
        .findOne({ code, status: RewardCodeStatus.ISSUED })
        .exec()
    );
    return code;
  }

  private async assertEventExists(eventId: number): Promise<void> {
    const event = await this.eventModel.findById(eventId).exec();
    if (!event || event.isDeleted) throw new NotFoundException('Etkinlik bulunamadı');
  }
}
