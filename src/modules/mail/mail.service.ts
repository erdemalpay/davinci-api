import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as AWS from 'aws-sdk';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
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
import {
  MailLog,
  MailSubscription,
  MailTemplate,
  MailType,
  SubscriptionStatus,
} from './mail.schema';

@Injectable()
export class MailService {
  private ses: AWS.SES;
  private readonly logger = new Logger(MailService.name);
  private readonly defaultFromEmail: string;

  constructor(
    @InjectModel(MailSubscription.name)
    private mailSubscriptionModel: Model<MailSubscription>,
    @InjectModel(MailLog.name)
    private mailLogModel: Model<MailLog>,
    @InjectModel(MailTemplate.name)
    private mailTemplateModel: Model<MailTemplate>,
  ) {
    // Initialize AWS SES - credentials will be loaded from environment
    this.ses = new AWS.SES({
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });
    this.defaultFromEmail =
      process.env.DEFAULT_FROM_EMAIL || 'noreply@example.com';
  }

  /**
   * Subscribe a user to email list
   */
  async subscribe(subscribeDto: SubscribeDto): Promise<MailSubscription> {
    const { email, name, subscribedTypes, locale, metadata } = subscribeDto;

    // Check if subscription exists
    let subscription = await this.mailSubscriptionModel.findOne({ email });

    if (subscription) {
      // Reactivate if unsubscribed
      if (subscription.status === SubscriptionStatus.UNSUBSCRIBED) {
        subscription.status = SubscriptionStatus.ACTIVE;
        subscription.subscribedAt = new Date();
        subscription.unsubscribedAt = null;
        if (subscribedTypes) subscription.subscribedTypes = subscribedTypes;
        if (name) subscription.name = name;
        if (locale) subscription.locale = locale;
        if (metadata) subscription.metadata = metadata;
        await subscription.save();

        this.logger.log(`Reactivated subscription for ${email}`);
        return subscription;
      }

      // Update existing subscription
      if (subscribedTypes) subscription.subscribedTypes = subscribedTypes;
      if (name) subscription.name = name;
      if (locale) subscription.locale = locale;
      if (metadata) subscription.metadata = metadata;
      await subscription.save();

      this.logger.log(`Updated subscription for ${email}`);
      return subscription;
    }

    // Create new subscription
    const unsubscribeToken = uuidv4();
    subscription = new this.mailSubscriptionModel({
      email,
      name,
      subscribedTypes: subscribedTypes || [
        MailType.NEWSLETTER,
        MailType.PROMOTIONAL,
      ],
      status: SubscriptionStatus.ACTIVE,
      unsubscribeToken,
      subscribedAt: new Date(),
      locale: locale || 'en',
      metadata,
    });

    await subscription.save();
    this.logger.log(`New subscription created for ${email}`);

    // Send welcome email
    try {
      await this.sendMail({
        to: email,
        mailType: MailType.WELCOME,
        variables: { name: name || email, email },
        locale,
      });
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}:`, error);
    }

    return subscription;
  }

  /**
   * Unsubscribe a user from email list
   */
  async unsubscribe(unsubscribeDto: UnsubscribeDto): Promise<MailSubscription> {
    const { email, token } = unsubscribeDto;

    const subscription = await this.mailSubscriptionModel.findOne({ email });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Verify token if provided
    if (token && subscription.unsubscribeToken !== token) {
      throw new BadRequestException('Invalid unsubscribe token');
    }

    subscription.status = SubscriptionStatus.UNSUBSCRIBED;
    subscription.unsubscribedAt = new Date();
    await subscription.save();

    this.logger.log(`Unsubscribed ${email}`);
    return subscription;
  }

  /**
   * Update subscription preferences
   */
  async updateSubscription(
    email: string,
    updateDto: UpdateSubscriptionDto,
  ): Promise<MailSubscription> {
    const subscription = await this.mailSubscriptionModel.findOne({ email });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (updateDto.subscribedTypes)
      subscription.subscribedTypes = updateDto.subscribedTypes;
    if (updateDto.name) subscription.name = updateDto.name;
    if (updateDto.locale) subscription.locale = updateDto.locale;
    if (updateDto.metadata) subscription.metadata = updateDto.metadata;

    await subscription.save();
    this.logger.log(`Updated subscription preferences for ${email}`);
    return subscription;
  }

  /**
   * Get subscription by email
   */
  async getSubscription(email: string): Promise<MailSubscription> {
    const subscription = await this.mailSubscriptionModel.findOne({ email });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    return subscription;
  }

  /**
   * Get all active subscriptions for a mail type
   */
  async getActiveSubscriptions(
    mailType: MailType,
  ): Promise<MailSubscription[]> {
    return this.mailSubscriptionModel.find({
      status: SubscriptionStatus.ACTIVE,
      subscribedTypes: mailType,
    });
  }

  /**
   * Send email using template
   */
  async sendMail(sendMailDto: SendMailDto): Promise<MailLog> {
    const { to, mailType, variables, locale } = sendMailDto;

    // Get template
    const template = await this.getTemplate(mailType, locale);
    if (!template) {
      throw new NotFoundException(`Template not found for ${mailType}`);
    }

    // Check subscription status
    const subscription = await this.mailSubscriptionModel.findOne({
      email: to,
    });
    if (subscription) {
      if (subscription.status === SubscriptionStatus.UNSUBSCRIBED) {
        // Only allow transactional emails
        const transactionalTypes = [
          MailType.TRANSACTIONAL,
          MailType.ORDER_CONFIRMATION,
          MailType.ORDER_UPDATE,
          MailType.PASSWORD_RESET,
          MailType.ACCOUNT_VERIFICATION,
          MailType.RESERVATION_CONFIRMATION,
        ];
        if (!transactionalTypes.includes(mailType)) {
          throw new BadRequestException(
            'User has unsubscribed from marketing emails',
          );
        }
      }
    }

    // Prepare email content
    const htmlContent = this.replaceVariables(template.htmlContent, variables);
    const textContent = template.textContent
      ? this.replaceVariables(template.textContent, variables)
      : this.htmlToText(htmlContent);
    const subject = this.replaceVariables(template.subject, variables);

    // Add unsubscribe link for non-transactional emails
    let finalHtmlContent = htmlContent;
    if (subscription && !this.isTransactional(mailType)) {
      const unsubscribeLink = `${
        process.env.FRONTEND_URL || 'http://localhost:3000'
      }/unsubscribe?email=${encodeURIComponent(to)}&token=${
        subscription.unsubscribeToken
      }`;
      finalHtmlContent += `
        <br/><br/>
        <div style="text-align: center; color: #888; font-size: 12px; margin-top: 30px;">
          <p>If you wish to stop receiving these emails, you can <a href="${unsubscribeLink}" style="color: #888;">unsubscribe here</a>.</p>
        </div>
      `;
    }

    // Create mail log
    const mailLog = new this.mailLogModel({
      email: to,
      subject,
      mailType,
      status: 'pending',
      sentAt: new Date(),
      metadata: variables,
    });

    try {
      // Send email via SES
      const params: AWS.SES.SendEmailRequest = {
        Source: this.defaultFromEmail,
        Destination: {
          ToAddresses: [to],
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: finalHtmlContent,
              Charset: 'UTF-8',
            },
            Text: {
              Data: textContent,
              Charset: 'UTF-8',
            },
          },
        },
      };

      const result = await this.ses.sendEmail(params).promise();

      mailLog.messageId = result.MessageId;
      mailLog.status = 'sent';
      await mailLog.save();

      this.logger.log(
        `Email sent to ${to} with MessageId: ${result.MessageId}`,
      );
      return mailLog;
    } catch (error) {
      mailLog.status = 'failed';
      mailLog.errorMessage = error.message;
      await mailLog.save();

      this.logger.error(`Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  /**
   * Send bulk emails
   */
  async sendBulkMail(bulkMailDto: SendBulkMailDto): Promise<MailLog[]> {
    const { recipients, mailType, variables, locale } = bulkMailDto;

    const results: MailLog[] = [];

    // Send emails in batches to avoid rate limits
    const batchSize = 50;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map((email) =>
          this.sendMail({
            to: email,
            mailType,
            variables,
            locale,
          }),
        ),
      );

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          this.logger.error(
            `Failed to send email to ${batch[index]}:`,
            result.reason,
          );
        }
      });

      // Wait a bit between batches to respect rate limits
      if (i + batchSize < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    this.logger.log(
      `Sent bulk email to ${results.length}/${recipients.length} recipients`,
    );
    return results;
  }

  /**
   * Create email template
   */
  async createTemplate(
    createTemplateDto: CreateTemplateDto,
  ): Promise<MailTemplate> {
    const template = new this.mailTemplateModel(createTemplateDto);
    await template.save();
    this.logger.log(`Created template: ${createTemplateDto.name}`);
    return template;
  }

  /**
   * Update email template
   */
  async updateTemplate(
    templateId: string,
    updateTemplateDto: UpdateTemplateDto,
  ): Promise<MailTemplate> {
    const template = await this.mailTemplateModel.findByIdAndUpdate(
      templateId,
      updateTemplateDto,
      { new: true },
    );
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    this.logger.log(`Updated template: ${templateId}`);
    return template;
  }

  /**
   * Get template by mail type and locale
   */
  async getTemplate(
    mailType: MailType,
    locale?: string,
  ): Promise<MailTemplate> {
    // Try to find template with specific locale
    if (locale) {
      const template = await this.mailTemplateModel.findOne({
        mailType,
        locale,
        isActive: true,
      });
      if (template) return template;
    }

    // Fallback to default locale
    return this.mailTemplateModel.findOne({
      mailType,
      $or: [{ locale: 'en' }, { locale: null }],
      isActive: true,
    });
  }

  /**
   * Get all templates
   */
  async getAllTemplates(): Promise<MailTemplate[]> {
    return this.mailTemplateModel.find();
  }

  /**
   * Get mail logs with filters
   */
  async getMailLogs(filters: GetMailLogsDto): Promise<MailLog[]> {
    const query: any = {};
    if (filters.email) query.email = filters.email;
    if (filters.mailType) query.mailType = filters.mailType;
    if (filters.status) query.status = filters.status;

    return this.mailLogModel
      .find(query)
      .limit(filters.limit || 100)
      .skip(filters.skip || 0)
      .sort({ createdAt: -1 });
  }

  /**
   * Replace template variables
   */
  private replaceVariables(
    template: string,
    variables?: Record<string, any>,
  ): string {
    if (!variables) return template;

    let result = template;
    Object.keys(variables).forEach((key) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, variables[key] || '');
    });

    return result;
  }

  /**
   * Convert HTML to plain text (basic implementation)
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<style[^>]*>.*<\/style>/gm, '')
      .replace(/<script[^>]*>.*<\/script>/gm, '')
      .replace(/<[^>]+>/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if email type is transactional
   */
  private isTransactional(mailType: MailType): boolean {
    const transactionalTypes = [
      MailType.TRANSACTIONAL,
      MailType.ORDER_CONFIRMATION,
      MailType.ORDER_UPDATE,
      MailType.PASSWORD_RESET,
      MailType.ACCOUNT_VERIFICATION,
      MailType.RESERVATION_CONFIRMATION,
    ];
    return transactionalTypes.includes(mailType);
  }

  /**
   * Handle SES notifications (bounces, complaints)
   */
  async handleSESNotification(notification: any): Promise<void> {
    const notificationType = notification.notificationType;

    if (notificationType === 'Bounce') {
      const bouncedRecipients = notification.bounce.bouncedRecipients;
      for (const recipient of bouncedRecipients) {
        await this.mailSubscriptionModel.updateOne(
          { email: recipient.emailAddress },
          { status: SubscriptionStatus.BOUNCED },
        );
        this.logger.warn(`Marked ${recipient.emailAddress} as bounced`);
      }
    } else if (notificationType === 'Complaint') {
      const complainedRecipients = notification.complaint.complainedRecipients;
      for (const recipient of complainedRecipients) {
        await this.mailSubscriptionModel.updateOne(
          { email: recipient.emailAddress },
          { status: SubscriptionStatus.COMPLAINED },
        );
        this.logger.warn(`Marked ${recipient.emailAddress} as complained`);
      }
    }
  }
}
