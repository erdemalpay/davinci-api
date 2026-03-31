import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { UpdateQuery } from 'mongoose';
import { Public } from '../auth/public.decorator';
import { CreateEventDto, EventQueryDto, UpdateEventStatusDto } from './dto/event.dto';
import { RedeemCodeDto, ValidateCodeDto } from './dto/redeem.dto';
import { CreateSurveyQuestionDto } from './dto/survey-question.dto';
import { SubmitSurveyDto, SurveyResponseQueryDto } from './dto/survey-response.dto';
import { EventSurveyService } from './event-survey.service';
import { SurveyEvent } from './schemas/event.schema';
import { SurveyQuestion } from './schemas/survey-question.schema';

@Controller('/event-survey')
export class EventSurveyController {
  constructor(private readonly eventSurveyService: EventSurveyService) {}

  // ─── Public (JWT gerektirmez) ─────────────────────────────────────────────

  @Public()
  @Get('/public/event/:slug')
  findPublicEvent(@Param('slug') slug: string) {
    return this.eventSurveyService.findPublicEventBySlug(slug);
  }

  @Public()
  @Post('/public/submit')
  submitSurvey(@Body() dto: SubmitSurveyDto) {
    return this.eventSurveyService.submitSurvey(dto);
  }

  // ─── Operasyon (Barista / GM) ─────────────────────────────────────────────

  @Post('/validate')
  validateCode(@Body() dto: ValidateCodeDto) {
    return this.eventSurveyService.validateCode(dto);
  }

  @Post('/redeem')
  redeemCode(@Body() dto: RedeemCodeDto, @Request() req: ExpressRequest & { user?: { _id: string } }) {
    return this.eventSurveyService.redeemCode(dto, req.user?._id);
  }

  // ─── Yönetim — Etkinlikler ────────────────────────────────────────────────

  @Get('/events')
  queryEvents(@Query() query: EventQueryDto) {
    return this.eventSurveyService.queryEvents(query);
  }

  @Post('/events')
  createEvent(@Body() dto: CreateEventDto) {
    return this.eventSurveyService.createEvent(dto);
  }

  @Patch('/events/:id')
  updateEvent(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<SurveyEvent>,
  ) {
    return this.eventSurveyService.updateEvent(id, updates);
  }

  @Patch('/events/:id/status')
  updateEventStatus(
    @Param('id') id: number,
    @Body() dto: UpdateEventStatusDto,
  ) {
    return this.eventSurveyService.updateEventStatus(id, dto);
  }

  @Delete('/events/:id')
  removeEvent(@Param('id') id: number) {
    return this.eventSurveyService.removeEvent(id);
  }

  // ─── Yönetim — Sorular ───────────────────────────────────────────────────

  @Get('/events/:eventId/questions')
  getQuestions(@Param('eventId') eventId: number) {
    return this.eventSurveyService.getQuestions(eventId);
  }

  @Post('/events/:eventId/questions')
  createQuestion(
    @Param('eventId') eventId: number,
    @Body() dto: CreateSurveyQuestionDto,
  ) {
    return this.eventSurveyService.createQuestion(eventId, dto);
  }

  @Patch('/events/:eventId/questions/:questionId')
  updateQuestion(
    @Param('eventId') eventId: number,
    @Param('questionId') questionId: number,
    @Body() updates: UpdateQuery<SurveyQuestion>,
  ) {
    return this.eventSurveyService.updateQuestion(eventId, questionId, updates);
  }

  @Delete('/events/:eventId/questions/:questionId')
  removeQuestion(
    @Param('eventId') eventId: number,
    @Param('questionId') questionId: number,
  ) {
    return this.eventSurveyService.removeQuestion(eventId, questionId);
  }

  // ─── Analytics ───────────────────────────────────────────────────────────

  @Get('/responses')
  queryResponses(@Query() query: SurveyResponseQueryDto) {
    return this.eventSurveyService.queryResponses(query);
  }

  @Get('/analytics/summary')
  getAnalyticsSummary(@Query('eventId') eventId?: number) {
    return this.eventSurveyService.getAnalyticsSummary(eventId);
  }
}
