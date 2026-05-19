import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import {
  CreateMailDraftDto,
  CreateTemplateDto,
  GetMailDraftsDto,
  GetMailLogsDto,
  GetMailLogsWithPaginationDto,
  GetSubscriptionsDto,
  SendBulkMailDto,
  SendMailDraftDto,
  SendMailDto,
  SubscribeDto,
  UnsubscribeDto,
  UpdateMailDraftDto,
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

  @Public()
  @Get('unsubscribe')
  async unsubscribeViaLink(
    @Query() query: UnsubscribeDto,
    @Res() res: Response,
  ) {
    try {
      await this.mailService.unsubscribe(query);
      const html = this.mailService.generateUnsubscribeSuccessPage(query.email);
      return res.send(html);
    } catch (error) {
      const html = this.mailService.generateUnsubscribeErrorPage(error.message);
      return res.send(html);
    }
  }
  @Get('subscription/active')
  async getActiveSubscriptions() {
    return this.mailService.getActiveSubscriptions();
  }

  @Get('subscription/:email')
  async getSubscription(@Param('email') email: string) {
    return this.mailService.getSubscription(email);
  }

  @Get('subscriptions')
  async getSubscriptions(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query() filter: GetSubscriptionsDto,
  ) {
    return this.mailService.getSubscriptionsWithPagination(page, limit, filter);
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

  // ==================== Draft Management Endpoints ====================

  @Post('draft')
  async createMailDraft(@Body() createMailDraftDto: CreateMailDraftDto) {
    return this.mailService.createMailDraft(createMailDraftDto);
  }

  @Get('drafts')
  async getMailDrafts(@Query() filters: GetMailDraftsDto) {
    return this.mailService.getMailDrafts(filters);
  }

  @Get('draft/:id')
  async getMailDraft(@Param('id') id: string) {
    return this.mailService.getMailDraft(id);
  }

  @Put('draft/:id')
  async updateMailDraft(
    @Param('id') id: string,
    @Body() updateMailDraftDto: UpdateMailDraftDto,
  ) {
    return this.mailService.updateMailDraft(id, updateMailDraftDto);
  }

  @Delete('draft/:id')
  async deleteMailDraft(@Param('id') id: string) {
    return this.mailService.deleteMailDraft(id);
  }

  @Post('draft/:id/send')
  async sendMailDraft(
    @Param('id') id: string,
    @Body() sendMailDraftDto: SendMailDraftDto,
  ) {
    return this.mailService.sendMailDraft(id, sendMailDraftDto);
  }

  // ==================== Logs Endpoints ====================

  @Get('logs')
  async getMailLogs(@Query() filters: GetMailLogsDto) {
    return this.mailService.getMailLogs(filters);
  }

  @Get('logs-paginated')
  async getMailLogsWithPagination(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query() filter: GetMailLogsWithPaginationDto,
  ) {
    return this.mailService.getMailLogsWithPagination(page, limit, filter);
  }

  // ==================== Webhook Endpoints ====================

  @Public()
  @Post('webhook/ses')
  async handleSESWebhook(@Body() notification: any) {
    await this.mailService.handleSESNotification(notification);
    return { success: true };
  }

  // ==================== Click Tracking Endpoint ====================

  @Public()
  @Get('track-click')
  async trackClick(
    @Query('token') token: string,
    @Query('messageId') messageId: string, // For backwards compatibility
    @Query('url') url: string,
    @Res() res: Response,
  ) {
    // Track the click using token (preferred) or messageId (fallback)
    const trackingId = token || messageId;

    if (trackingId) {
      await this.mailService.trackClick(trackingId);
    }

    // Redirect to the actual URL
    if (url) {
      return res.redirect(url);
    }

    return res.status(404).send('URL not found');
  }
}
