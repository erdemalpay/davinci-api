import { MailType } from '../mail.schema';

export type MailTemplateParameterType =
  | 'string'
  | 'email'
  | 'url'
  | 'date'
  | 'currency'
  | 'multiline';

export interface MailTemplateParameterDefinition {
  key: string;
  label: string;
  type: MailTemplateParameterType;
  required: boolean;
  description: string;
  example?: string;
}

// Tek satırlık tanım yazmak için; alan sırası MailTemplateParameterDefinition ile aynıdır
const definition = (
  key: string,
  label: string,
  type: MailTemplateParameterType,
  required: boolean,
  description: string,
  example?: string,
): MailTemplateParameterDefinition => ({
  key,
  label,
  type,
  required,
  description,
  example,
});

export const mailTemplateParameterDefinitions: Record<
  MailType,
  MailTemplateParameterDefinition[]
> = {
  [MailType.BACK_IN_STOCK]: [
    {
      key: 'productName',
      label: 'Product name',
      type: 'string',
      required: true,
      description: 'Name of the product that is available again.',
      example: 'DaVinci Premium Kahve Makinesi',
    },
    {
      key: 'email',
      label: 'Customer email',
      type: 'email',
      required: true,
      description: 'Recipient email address.',
      example: 'customer@example.com',
    },
    {
      key: 'productUrl',
      label: 'Product URL',
      type: 'url',
      required: true,
      description: 'URL where the customer can view or buy the product.',
      example: 'https://example.com/products/coffee-machine',
    },
    {
      key: 'supportEmail',
      label: 'Support email',
      type: 'email',
      required: true,
      description: 'Email address customers can contact for support.',
      example: 'support@example.com',
    },
    {
      key: 'productImage',
      label: 'Product image',
      type: 'url',
      required: false,
      description: 'Optional image URL for the product.',
    },
    {
      key: 'price',
      label: 'Price',
      type: 'currency',
      required: false,
      description: 'Optional product price shown in the email.',
      example: '2.499 TL',
    },
  ],
  [MailType.CUSTOMER_MESSAGE]: [
    {
      key: 'headline',
      label: 'Headline',
      type: 'string',
      required: true,
      description: 'Main title of the email.',
      example: 'Sizin icin kisa bir bilgilendirme',
    },
    {
      key: 'message',
      label: 'Message',
      type: 'multiline',
      required: true,
      description: 'Main email body prepared by the frontend draft editor.',
      example: 'Talebinizle ilgili detaylari sizinle paylasmak istedik.',
    },
    {
      key: 'imageUrl',
      label: 'Image URL',
      type: 'url',
      required: false,
      description: 'Optional image displayed above the message body.',
      example: 'https://example.com/images/customer-message.jpg',
    },
    {
      key: 'imageAlt',
      label: 'Image alt text',
      type: 'string',
      required: false,
      description: 'Optional accessible description for the image.',
      example: 'Kampanya gorseli',
    },
    {
      key: 'ctaText',
      label: 'Button text',
      type: 'string',
      required: false,
      description: 'Optional call-to-action button label.',
      example: 'Detaylari Gor',
    },
    {
      key: 'ctaUrl',
      label: 'Button URL',
      type: 'url',
      required: false,
      description: 'Optional call-to-action button URL.',
      example: 'https://example.com/account',
    },
    {
      key: 'note',
      label: 'Footer note',
      type: 'multiline',
      required: false,
      description: 'Optional note displayed below the main message.',
    },
  ],
  [MailType.ORDER_UPDATE]: [
    {
      key: 'statusTitle',
      label: 'Status title',
      type: 'string',
      required: true,
      description: 'Short status headline for the order update.',
      example: 'Siparisiniz kargoya verildi',
    },
    {
      key: 'statusMessage',
      label: 'Status message',
      type: 'multiline',
      required: true,
      description: 'Detailed order status message.',
      example: 'Paketiniz bugun kargo firmasina teslim edildi.',
    },
    {
      key: 'orderNumber',
      label: 'Order number',
      type: 'string',
      required: false,
      description: 'Optional customer-facing order number.',
      example: 'DV-10482',
    },
    {
      key: 'trackingUrl',
      label: 'Tracking URL',
      type: 'url',
      required: false,
      description: 'Optional shipping or order tracking URL.',
    },
    {
      key: 'estimatedDeliveryDate',
      label: 'Estimated delivery date',
      type: 'date',
      required: false,
      description: 'Optional estimated delivery date.',
      example: '2026-05-20',
    },
  ],
  [MailType.CAMPAIGN_ANNOUNCEMENT]: [
    {
      key: 'campaignTitle',
      label: 'Campaign title',
      type: 'string',
      required: true,
      description: 'Main title of the campaign.',
      example: 'Hafta Sonuna Ozel Firsatlar',
    },
    {
      key: 'campaignMessage',
      label: 'Campaign message',
      type: 'multiline',
      required: true,
      description: 'Main campaign description prepared in the draft editor.',
      example: 'Secili urunlerde sinirli sureli indirimleri kesfedin.',
    },
    {
      key: 'ctaText',
      label: 'Button text',
      type: 'string',
      required: true,
      description: 'Call-to-action button label.',
      example: 'Kampanyayi Incele',
    },
    {
      key: 'ctaUrl',
      label: 'Button URL',
      type: 'url',
      required: true,
      description: 'Campaign landing page URL.',
      example: 'https://example.com/campaigns/weekend',
    },
    {
      key: 'discountCode',
      label: 'Discount code',
      type: 'string',
      required: false,
      description: 'Optional discount code shown in the email.',
      example: 'DAVINCI20',
    },
    {
      key: 'expiresAt',
      label: 'Expiration date',
      type: 'date',
      required: false,
      description: 'Optional campaign expiration date.',
      example: '2026-05-31',
    },
  ],
  [MailType.TOURNAMENT_REGISTRATION]: [
    definition(
      'fullName',
      'Full name',
      'string',
      true,
      'Name of the person who registered.',
      'Ayse Yilmaz',
    ),
    definition(
      'tournamentName',
      'Tournament name',
      'string',
      true,
      'Name of the tournament the person registered for.',
      'AZUL TURNUVASI',
    ),
    definition(
      'tournamentDate',
      'Tournament date',
      'date',
      true,
      'Tournament date, already formatted for the customer.',
      '11 Ekim 2026, Pazar',
    ),
    definition(
      'startTime',
      'Start time',
      'string',
      false,
      'Optional start time in HH:mm format.',
      '13:00',
    ),
    definition(
      'gameName',
      'Game name',
      'string',
      false,
      'Optional name of the game played in the tournament.',
      'Azul',
    ),
    definition(
      'locationName',
      'Location name',
      'string',
      false,
      'Optional name of the venue.',
      'Neorama',
    ),
    definition(
      'locationAddress',
      'Location address',
      'multiline',
      false,
      'Optional venue address shown below the venue name.',
      'Beştepe Mah., Yaşam Cd., Adalet Sok. No:4/B, Ankara',
    ),
    definition(
      'mapsUrl',
      'Directions URL',
      'url',
      false,
      'Optional Google Maps link for the directions button.',
      'https://maps.app.goo.gl/4xoub996g5PpadzL7',
    ),
    definition(
      'logoUrl',
      'Logo URL',
      'url',
      false,
      'Optional publicly reachable logo image URL.',
    ),
  ],
};

export const getRequiredMailTemplateParameters = (
  mailType: MailType,
): string[] =>
  mailTemplateParameterDefinitions[mailType]
    .filter((parameter) => parameter.required)
    .map((parameter) => parameter.key);

export const customerMessageTemplate = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{headline}}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f5f7fb;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 32px 16px; text-align: center;">
                <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e6eaf0;">
                    <tr>
                        <td style="padding: 32px 30px; background-color: #1f2937; text-align: left;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px; line-height: 1.3;">{{headline}}</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px 30px; text-align: left;">
                            {{#if imageUrl}}
                            <div style="text-align: center; margin: 0 0 24px;">
                                <img src="{{imageUrl}}" alt="{{#if imageAlt}}{{imageAlt}}{{else}}{{headline}}{{/if}}" style="display: block; width: 100%; max-width: 540px; height: auto; border-radius: 8px; border: 1px solid #e5e7eb;">
                            </div>
                            {{/if}}
                            <div style="color: #374151; font-size: 16px; line-height: 1.7; white-space: pre-line;">{{message}}</div>
                            {{#if ctaUrl}}
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="{{ctaUrl}}" style="display: inline-block; padding: 14px 28px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 700;">{{#if ctaText}}{{ctaText}}{{else}}Detaylari Gor{{/if}}</a>
                            </div>
                            {{/if}}
                            {{#if note}}
                            <div style="margin-top: 26px; padding: 16px; background-color: #f9fafb; border-left: 4px solid #9ca3af; border-radius: 4px; color: #4b5563; font-size: 14px; line-height: 1.6; white-space: pre-line;">{{note}}</div>
                            {{/if}}
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

export const orderUpdateTemplate = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{statusTitle}}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f5f7fb;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 32px 16px; text-align: center;">
                <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e6eaf0;">
                    <tr>
                        <td style="padding: 32px 30px; background-color: #0f766e; text-align: left;">
                            {{#if orderNumber}}
                            <p style="margin: 0 0 8px; color: #ccfbf1; font-size: 14px;">Siparis #{{orderNumber}}</p>
                            {{/if}}
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px; line-height: 1.3;">{{statusTitle}}</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px 30px; text-align: left;">
                            <div style="color: #374151; font-size: 16px; line-height: 1.7; white-space: pre-line;">{{statusMessage}}</div>
                            {{#if estimatedDeliveryDate}}
                            <div style="margin-top: 24px; padding: 16px; background-color: #ecfdf5; border-radius: 6px; color: #065f46; font-size: 15px;">
                                Tahmini teslim tarihi: <strong>{{estimatedDeliveryDate}}</strong>
                            </div>
                            {{/if}}
                            {{#if trackingUrl}}
                            <div style="text-align: center; margin: 30px 0 4px;">
                                <a href="{{trackingUrl}}" style="display: inline-block; padding: 14px 28px; background-color: #0f766e; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 700;">Siparisi Takip Et</a>
                            </div>
                            {{/if}}
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

export const campaignAnnouncementTemplate = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{campaignTitle}}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f5f7fb;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 32px 16px; text-align: center;">
                <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e6eaf0;">
                    <tr>
                        <td style="padding: 34px 30px; background-color: #7c2d12; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 26px; line-height: 1.3;">{{campaignTitle}}</h1>
                            {{#if expiresAt}}
                            <p style="margin: 12px 0 0; color: #ffedd5; font-size: 14px;">Son tarih: {{expiresAt}}</p>
                            {{/if}}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px 30px; text-align: left;">
                            <div style="color: #374151; font-size: 16px; line-height: 1.7; white-space: pre-line;">{{campaignMessage}}</div>
                            {{#if discountCode}}
                            <div style="margin: 26px 0; padding: 18px; background-color: #fff7ed; border: 1px dashed #f97316; border-radius: 6px; text-align: center;">
                                <p style="margin: 0 0 8px; color: #9a3412; font-size: 13px;">Indirim kodu</p>
                                <p style="margin: 0; color: #7c2d12; font-size: 22px; font-weight: 700; letter-spacing: 1px;">{{discountCode}}</p>
                            </div>
                            {{/if}}
                            <div style="text-align: center; margin: 30px 0 4px;">
                                <a href="{{ctaUrl}}" style="display: inline-block; padding: 14px 28px; background-color: #ea580c; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 700;">{{ctaText}}</a>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

export const backInStockTemplate = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ürün Stoklarda!</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 0; text-align: center; background-color: #f4f4f4;">
                <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%); padding: 40px 30px; text-align: center;">
                            <div style="font-size: 50px; margin-bottom: 20px;">✨</div>
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Harika Haber!</h1>
                            <p style="margin: 10px 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">Beklediğiniz ürün stoklara geldi</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                                Merhaba,
                            </p>
                            <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                                Stok bildirimi için kayıt olduğunuz ürün tekrar stoklarımızda! Hemen sipariş vererek ürünü kaçırmayın.
                            </p>
                            
                            <!-- Product Details -->
                            {{#if productImage}}
                            <div style="text-align: center; margin-bottom: 30px;">
                                <img src="{{productImage}}" alt="{{productName}}" style="width: 100%; max-width: 400px; height: auto; border-radius: 8px; border: 1px solid #e9ecef;">
                            </div>
                            {{/if}}
                            
                            <div style="background-color: #f8f9fa; border-radius: 8px; padding: 25px; margin-bottom: 30px; border-left: 4px solid #27ae60;">
                                <h2 style="margin: 0 0 15px; color: #2c3e50; font-size: 20px; font-weight: 600;">{{productName}}</h2>
                                {{#if price}}
                                <p style="margin: 0; color: #27ae60; font-size: 24px; font-weight: 700;">
                                    {{price}}
                                </p>
                                {{/if}}
                            </div>
                            
                            <!-- Important Info -->
                            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-bottom: 30px; border-radius: 4px;">
                                <p style="margin: 0; color: #856404; font-size: 14px;">
                                    <strong>⚡ Hızlı Davranın!</strong> Ürün stokları sınırlıdır, tükenmeden sipariş verin.
                                </p>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="{{productUrl}}" style="display: inline-block; padding: 18px 50px; background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%); color: #ffffff; text-decoration: none; border-radius: 50px; font-size: 18px; font-weight: 700; box-shadow: 0 4px 15px rgba(39, 174, 96, 0.3);">Şimdi Satın Al</a>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
                            <p style="margin: 0 0 10px; color: #888888; font-size: 14px;">
                                Sorularınız için bizimle iletişime geçin:
                                <a href="mailto:{{supportEmail}}" style="color: #27ae60; text-decoration: none;">{{supportEmail}}</a>
                            </p>
                            <p style="margin: 0; color: #888888; font-size: 12px;">
                                © 2026 DaVinci. Tüm hakları saklıdır.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

export const tournamentRegistrationTemplate = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kaydınız alınmıştır</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f2ee;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 16px; text-align: center;">
                <table role="presentation" style="width: 100%; max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 6px; overflow: hidden; border: 1px solid #e7e3dc;">
                    <tr>
                        <td style="height: 4px; line-height: 4px; font-size: 0; background-color: #a80000;">&nbsp;</td>
                    </tr>
                    <tr>
                        <td style="padding: 34px 40px 0; text-align: left;">
                            <table role="presentation" style="border-collapse: collapse;">
                                <tr>
                                    {{#if logoUrl}}
                                    <td style="vertical-align: middle; padding-right: 16px;">
                                        <img src="{{logoUrl}}" alt="Da Vinci" width="64" style="display: block; height: auto; border: 0;">
                                    </td>
                                    {{/if}}
                                    <td style="vertical-align: middle; text-align: left;">
                                        <span style="color: #1c1917; font-family: Georgia, 'Times New Roman', serif; font-size: 26px; line-height: 1.2; font-weight: bold; letter-spacing: 1px;">DA VINCI </span>
                                        <span style="color: #a80000; font-family: Georgia, 'Times New Roman', serif; font-size: 26px; line-height: 1.2; font-weight: bold; letter-spacing: 1px;">BOARD GAME</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 24px 40px 0; text-align: left;">
                            <h1 style="margin: 0; color: #1c1917; font-family: Georgia, 'Times New Roman', serif; font-size: 32px; line-height: 1.2; font-weight: normal;">Kaydınız alınmıştır</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px 40px 0; text-align: left;">
                            <p style="margin: 0 0 12px; color: #44403c; font-size: 16px; line-height: 1.7;">Merhaba {{fullName}},</p>
                            <p style="margin: 0; color: #44403c; font-size: 16px; line-height: 1.7;"><strong style="color: #1c1917;">{{tournamentName}}</strong> için başvurunuz bize ulaştı. Masada görüşmek üzere.</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 28px 40px 0;">
                            <table role="presentation" style="width: 100%; border-collapse: collapse; border-top: 1px solid #ece8e1; border-bottom: 1px solid #ece8e1;">
                                {{#if gameName}}
                                <tr>
                                    <td style="padding: 14px 0; border-bottom: 1px solid #ece8e1; color: #8b8579; font-size: 13px; width: 110px; text-align: left;">Oyun</td>
                                    <td style="padding: 14px 0; border-bottom: 1px solid #ece8e1; color: #1c1917; font-size: 16px; text-align: left;">{{gameName}}</td>
                                </tr>
                                {{/if}}
                                <tr>
                                    <td style="padding: 14px 0;{{#if locationName}} border-bottom: 1px solid #ece8e1;{{/if}} color: #8b8579; font-size: 13px; text-align: left;">Tarih</td>
                                    <td style="padding: 14px 0;{{#if locationName}} border-bottom: 1px solid #ece8e1;{{/if}} color: #1c1917; font-size: 16px; text-align: left;">{{tournamentDate}}{{#if startTime}} &middot; {{startTime}}{{/if}}</td>
                                </tr>
                                {{#if locationName}}
                                <tr>
                                    <td style="padding: 14px 0; color: #8b8579; font-size: 13px; text-align: left; vertical-align: top;">Mekan</td>
                                    <td style="padding: 14px 0; color: #1c1917; font-size: 16px; text-align: left;">{{locationName}}
                                        {{#if locationAddress}}
                                        <div style="margin-top: 4px; color: #6b6560; font-size: 13px; line-height: 1.5;">{{locationAddress}}</div>
                                        {{/if}}
                                    </td>
                                </tr>
                                {{/if}}
                            </table>
                        </td>
                    </tr>
                    {{#if mapsUrl}}
                    <tr>
                        <td style="padding: 24px 40px 0; text-align: left;">
                            <a href="{{mapsUrl}}" style="display: inline-block; padding: 13px 26px; background-color: #a80000; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: bold;">Yol tarifi al</a>
                        </td>
                    </tr>
                    {{/if}}
                    <tr>
                        <td style="padding: 24px 40px 36px; text-align: left; color: #8b8579; font-size: 13px; line-height: 1.6;">Bu başvuruyu siz yapmadıysanız bu maili dikkate almayabilirsiniz.</td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;
