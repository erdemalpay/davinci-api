import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import {
  CreateTemplateDto,
  GetMailLogsDto,
  SendBulkMailDto,
  SendMailDto,
  SubscribeDto,
  UnsubscribeDto,
  UpdateSubscriptionDto,
  UpdateTemplateDto,
} from './mail.dto';
import { MailService } from './mail.service';

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Public()
  @Post('subscribe')
  async subscribe(@Body() subscribeDto: SubscribeDto) {
    return this.mailService.subscribe(subscribeDto);
  }

  @Public()
  @Post('unsubscribe')
  async unsubscribe(@Body() unsubscribeDto: UnsubscribeDto) {
    return this.mailService.unsubscribe(unsubscribeDto);
  }

  @Get('subscription/:email')
  async getSubscription(@Param('email') email: string) {
    return this.mailService.getSubscription(email);
  }

  @Put('subscription/:email')
  async updateSubscription(
    @Param('email') email: string,
    @Body() updateDto: UpdateSubscriptionDto,
  ) {
    return this.mailService.updateSubscription(email, updateDto);
  }

  // ==================== Mail Sending Endpoints ====================

  @Post('send')
  async sendMail(@Body() sendMailDto: SendMailDto) {
    return this.mailService.sendMail(sendMailDto);
  }

  @Post('send-bulk')
  async sendBulkMail(@Body() bulkMailDto: SendBulkMailDto) {
    return this.mailService.sendBulkMail(bulkMailDto);
  }

  // ==================== Template Management Endpoints ====================

  @Post('template')
  async createTemplate(@Body() createTemplateDto: CreateTemplateDto) {
    return this.mailService.createTemplate(createTemplateDto);
  }

  @Put('template/:id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
  ) {
    return this.mailService.updateTemplate(id, updateTemplateDto);
  }

  @Get('templates')
  async getAllTemplates() {
    return this.mailService.getAllTemplates();
  }

  // ==================== Logs Endpoints ====================

  @Get('logs')
  async getMailLogs(@Query() filters: GetMailLogsDto) {
    return this.mailService.getMailLogs(filters);
  }

  // ==================== Webhook Endpoints ====================

  @Public()
  @Post('webhook/ses')
  async handleSESWebhook(@Body() notification: any) {
    await this.mailService.handleSESNotification(notification);
    return { success: true };
  }
}
