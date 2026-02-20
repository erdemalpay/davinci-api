import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailTemplate, MailType } from './mail.schema';
import {
  gameNightTemplate,
  newsletterTemplate,
  orderConfirmationTemplate,
  passwordResetTemplate,
  promotionalTemplate,
  reservationConfirmationTemplate,
  welcomeEmailTemplate,
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
        name: 'welcome-email-en',
        mailType: MailType.WELCOME,
        subject: 'Welcome to DaVinci! 🎲',
        htmlContent: welcomeEmailTemplate,
        textContent:
          "Welcome to DaVinci! We're thrilled to have you join our community.",
        requiredVariables: ['name', 'actionUrl', 'supportEmail'],
        locale: 'en',
        isActive: true,
      },
      {
        name: 'newsletter-en',
        mailType: MailType.NEWSLETTER,
        subject: 'DaVinci Newsletter - {{month}} {{year}}',
        htmlContent: newsletterTemplate,
        textContent: 'DaVinci Newsletter',
        requiredVariables: [
          'month',
          'year',
          'headline',
          'content',
          'readMoreUrl',
        ],
        locale: 'en',
        isActive: true,
      },
      {
        name: 'order-confirmation-en',
        mailType: MailType.ORDER_CONFIRMATION,
        subject: 'Order Confirmation - #{{orderNumber}}',
        htmlContent: orderConfirmationTemplate,
        textContent: 'Thank you for your order!',
        requiredVariables: [
          'orderNumber',
          'customerName',
          'items',
          'total',
          'orderUrl',
          'supportEmail',
        ],
        locale: 'en',
        isActive: true,
      },
      {
        name: 'password-reset-en',
        mailType: MailType.PASSWORD_RESET,
        subject: 'Reset Your Password - DaVinci',
        htmlContent: passwordResetTemplate,
        textContent: 'Reset your password by clicking the link.',
        requiredVariables: [
          'name',
          'resetUrl',
          'expirationTime',
          'supportEmail',
        ],
        locale: 'en',
        isActive: true,
      },
      {
        name: 'reservation-confirmation-en',
        mailType: MailType.RESERVATION_CONFIRMATION,
        subject: 'Reservation Confirmed - {{reservationCode}}',
        htmlContent: reservationConfirmationTemplate,
        textContent: 'Your reservation is confirmed!',
        requiredVariables: [
          'customerName',
          'reservationDate',
          'reservationTime',
          'partySize',
          'reservationCode',
          'manageReservationUrl',
          'directionsUrl',
          'supportEmail',
        ],
        locale: 'en',
        isActive: true,
      },
      {
        name: 'promotional-en',
        mailType: MailType.PROMOTIONAL,
        subject: '{{offerTitle}} - Special Offer Inside! 🎉',
        htmlContent: promotionalTemplate,
        textContent: 'Special offer available!',
        requiredVariables: [
          'offerTitle',
          'offerHeadline',
          'discount',
          'offerDescription',
          'ctaText',
          'ctaUrl',
        ],
        locale: 'en',
        isActive: true,
      },
      {
        name: 'special-offer-en',
        mailType: MailType.SPECIAL_OFFER,
        subject: 'Exclusive Offer - {{offerTitle}}',
        htmlContent: promotionalTemplate,
        textContent: 'Exclusive offer for you!',
        requiredVariables: [
          'offerTitle',
          'offerHeadline',
          'discount',
          'offerDescription',
          'ctaText',
          'ctaUrl',
        ],
        locale: 'en',
        isActive: true,
      },
      {
        name: 'game-night-en',
        mailType: MailType.GAME_NIGHT,
        subject: 'Join Us for Game Night! 🎲 {{eventName}}',
        htmlContent: gameNightTemplate,
        textContent: "You're invited to game night!",
        requiredVariables: [
          'name',
          'eventName',
          'eventDescription',
          'eventDate',
          'eventTime',
          'location',
          'rsvpUrl',
          'supportEmail',
        ],
        locale: 'en',
        isActive: true,
      },
    ];

    for (const template of templates) {
      try {
        await this.mailTemplateModel.updateOne(
          { name: template.name },
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
