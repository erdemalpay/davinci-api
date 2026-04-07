import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { User, UserSchema } from '../user/user.schema';
import { EventSurveyController } from './event-survey.controller';
import { EventSurveyService } from './event-survey.service';
import { SurveyEvent, SurveyEventSchema } from './schemas/event.schema';
import { RewardCode, RewardCodeSchema } from './schemas/reward-code.schema';
import { SurveyQuestion, SurveyQuestionSchema } from './schemas/survey-question.schema';
import { SurveyResponse, SurveyResponseSchema } from './schemas/survey-response.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(SurveyEvent.name, SurveyEventSchema),
  createAutoIncrementConfig(SurveyQuestion.name, SurveyQuestionSchema),
  createAutoIncrementConfig(SurveyResponse.name, SurveyResponseSchema),
  createAutoIncrementConfig(RewardCode.name, RewardCodeSchema),
  { name: User.name, useFactory: () => UserSchema },
]);

@Module({
  imports: [mongooseModule],
  controllers: [EventSurveyController],
  providers: [EventSurveyService],
  exports: [EventSurveyService],
})
export class EventSurveyModule {}
