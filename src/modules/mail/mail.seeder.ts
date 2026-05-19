import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailTemplate, MailType } from './mail.schema';
import {
  backInStockTemplate,
  campaignAnnouncementTemplate,
  customerMessageTemplate,
  getRequiredMailTemplateParameters,
  orderUpdateTemplate,
} from './templates/mail-templates';

@Injectable()
export class MailSeeder {
  private readonly logger = new Logger(MailSeeder.name);

  constructor(
    @InjectModel(MailTemplate.name)
    private mailTemplateModel: Model<MailTemplate>,
  ) {}

  async seedTemplates(): Promise<void> {
    this.logger.log('Starting mail template seeding...');

    const templates = [
      {
        _id: 1,
        name: 'back-in-stock-tr',
        mailType: MailType.BACK_IN_STOCK,
        subject: 'Ürün Stoklara Geldi! - {{productName}}',
        htmlContent: backInStockTemplate,
        textContent:
          'Beklediğiniz ürün tekrar stoklarımızda! Hemen sipariş verin.',
        requiredVariables: getRequiredMailTemplateParameters(
          MailType.BACK_IN_STOCK,
        ),
        locale: 'tr',
        isActive: true,
      },
      {
        _id: 2,
        name: 'customer-message-tr',
        mailType: MailType.CUSTOMER_MESSAGE,
        subject: '{{headline}}',
        htmlContent: customerMessageTemplate,
        textContent: '{{message}}',
        requiredVariables: getRequiredMailTemplateParameters(
          MailType.CUSTOMER_MESSAGE,
        ),
        locale: 'tr',
        isActive: true,
      },
      {
        _id: 3,
        name: 'order-update-tr',
        mailType: MailType.ORDER_UPDATE,
        subject:
          '{{#if orderNumber}}Siparis #{{orderNumber}} - {{/if}}{{statusTitle}}',
        htmlContent: orderUpdateTemplate,
        textContent: '{{statusMessage}}',
        requiredVariables: getRequiredMailTemplateParameters(
          MailType.ORDER_UPDATE,
        ),
        locale: 'tr',
        isActive: true,
      },
      {
        _id: 4,
        name: 'campaign-announcement-tr',
        mailType: MailType.CAMPAIGN_ANNOUNCEMENT,
        subject: '{{campaignTitle}}',
        htmlContent: campaignAnnouncementTemplate,
        textContent: '{{campaignMessage}}',
        requiredVariables: getRequiredMailTemplateParameters(
          MailType.CAMPAIGN_ANNOUNCEMENT,
        ),
        locale: 'tr',
        isActive: true,
      },
    ];

    for (const template of templates) {
      try {
        await this.mailTemplateModel.updateOne(
          { _id: template._id },
          { $set: template },
          { upsert: true },
        );
        this.logger.log(`Seeded template: ${template.name}`);
      } catch (error) {
        this.logger.error(`Failed to seed template ${template.name}:`, error);
      }
    }

    this.logger.log('Mail template seeding completed!');
  }

  async removeAllTemplates(): Promise<void> {
    await this.mailTemplateModel.deleteMany({});
    this.logger.log('All mail templates removed');
  }
}
