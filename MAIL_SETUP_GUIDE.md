# Mail Module Setup Guide

## ✅ Installation Complete!

The professional email system using Amazon SES has been successfully installed in your DaVinci API.

## 📦 What Was Created

### Core Files

- **Schemas**: [mail.schema.ts](src/modules/mail/mail.schema.ts) - Database models for subscriptions, logs, and templates
- **Service**: [mail.service.ts](src/modules/mail/mail.service.ts) - Core email logic with SES integration
- **Controller**: [mail.controller.ts](src/modules/mail/mail.controller.ts) - API endpoints
- **DTOs**: [mail.dto.ts](src/modules/mail/mail.dto.ts) - Request validation
- **Module**: [mail.module.ts](src/modules/mail/mail.module.ts) - Module configuration
- **Seeder**: [mail.seeder.ts](src/modules/mail/mail.seeder.ts) - Template initialization

### Email Templates

Located in [templates/mail-templates.ts](src/modules/mail/templates/mail-templates.ts):

1. ✉️ **Welcome Email** - For new user onboarding
2. 📰 **Newsletter** - Regular newsletter emails
3. 📦 **Order Confirmation** - Order confirmation emails
4. 🔒 **Password Reset** - Secure password reset emails
5. 🎟️ **Reservation Confirmation** - Table/event reservations
6. 🎁 **Promotional** - Special offers and discounts
7. 🎲 **Game Night** - Game night invitations

### Documentation

- **Full Guide**: [README.md](src/modules/mail/README.md) - Complete documentation
- **Setup Instructions**: This file
- **Example Environment**: [.env.mail.example](.env.mail.example)

### Dependencies Installed

- ✅ `aws-sdk` - Amazon Web Services SDK for SES
- ✅ `uuid` - Unique identifier generation
- ✅ `@types/uuid` - TypeScript types for UUID

## 🚀 Quick Start (Next Steps)

### Step 1: Set Up AWS SES

1. **Create AWS Account** (if you don't have one)

   - Go to https://aws.amazon.com/
   - Sign up for an account

2. **Create IAM User**

   ```
   a. Go to AWS IAM Console
   b. Create new user with "Programmatic access"
   c. Attach policy: "AmazonSESFullAccess"
   d. Save the Access Key ID and Secret Access Key
   ```

3. **Verify Your Email/Domain in SES**

   ```
   a. Go to AWS SES Console
   b. Navigate to "Verified identities"
   c. Click "Create identity"
   d. Choose "Email address" or "Domain"
   e. Follow verification steps
   ```

4. **Request Production Access** (Optional but recommended)
   ```
   a. By default, SES is in "Sandbox mode"
   b. In Sandbox, you can only send to verified emails
   c. Request production access to send to any email
   d. Go to SES Console → Account dashboard → Request production access
   ```

### Step 2: Configure Environment Variables

Add these to your `.env` file:

```env
# AWS SES Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY_HERE
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY_HERE

# Email Configuration
DEFAULT_FROM_EMAIL=noreply@yourdomain.com
FRONTEND_URL=https://yourdomain.com
SUPPORT_EMAIL=support@yourdomain.com
```

**Important Notes:**

- Replace `YOUR_ACCESS_KEY_HERE` with your actual AWS Access Key
- Replace `YOUR_SECRET_KEY_HERE` with your actual AWS Secret Key
- Use a verified email address for `DEFAULT_FROM_EMAIL`
- Update `FRONTEND_URL` to your actual frontend URL
- Update `SUPPORT_EMAIL` to your support email address

### Step 3: Seed Email Templates

Run this command to populate the database with email templates:

```bash
npm run seed:mail-templates
```

You should see:

```
🌱 Starting mail template seeding...
Seeded template: welcome-email-en
Seeded template: newsletter-en
Seeded template: order-confirmation-en
... (more templates)
✅ Mail templates seeded successfully!
```

### Step 4: Test the Integration

#### Option A: Using API (Recommended)

1. **Start your development server**

   ```bash
   npm run start:dev
   ```

2. **Subscribe to emails** (using curl, Postman, or your frontend)

   ```bash
   curl -X POST http://localhost:3000/mail/subscribe \
     -H "Content-Type: application/json" \
     -d '{
       "email": "your-verified-email@example.com",
       "name": "Test User"
     }'
   ```

3. **Send a test email**
   ```bash
   curl -X POST http://localhost:3000/mail/send \
     -H "Content-Type: application/json" \
     -d '{
       "to": "your-verified-email@example.com",
       "mailType": "welcome",
       "variables": {
         "name": "Test User",
         "actionUrl": "https://yourdomain.com/dashboard",
         "supportEmail": "support@yourdomain.com"
       }
     }'
   ```

#### Option B: Using Code

```typescript
import { MailService } from './modules/mail/mail.service';
import { MailType } from './modules/mail/mail.schema';

// In your service or controller
constructor(private mailService: MailService) {}

async testEmail() {
  await this.mailService.sendMail({
    to: 'test@example.com',
    mailType: MailType.WELCOME,
    variables: {
      name: 'Test User',
      actionUrl: 'https://yourdomain.com/dashboard',
      supportEmail: 'support@yourdomain.com',
    },
  });
}
```

## 📚 Common Use Cases

### 1. Send Welcome Email on User Registration

```typescript
// In your auth/user service
async registerUser(userData: any) {
  const user = await this.userRepository.create(userData);

  await this.mailService.sendMail({
    to: user.email,
    mailType: MailType.WELCOME,
    variables: {
      name: user.name,
      actionUrl: `${process.env.FRONTEND_URL}/dashboard`,
      supportEmail: process.env.SUPPORT_EMAIL,
    },
  });

  return user;
}
```

### 2. Send Order Confirmation

```typescript
async confirmOrder(order: Order) {
  await this.mailService.sendMail({
    to: order.customerEmail,
    mailType: MailType.ORDER_CONFIRMATION,
    variables: {
      orderNumber: order.number,
      customerName: order.customerName,
      items: order.items,
      total: order.total,
      orderUrl: `${process.env.FRONTEND_URL}/orders/${order.id}`,
      supportEmail: process.env.SUPPORT_EMAIL,
    },
  });
}
```

### 3. Send Reservation Confirmation

```typescript
async confirmReservation(reservation: Reservation) {
  await this.mailService.sendMail({
    to: reservation.email,
    mailType: MailType.RESERVATION_CONFIRMATION,
    variables: {
      customerName: reservation.name,
      reservationDate: reservation.date,
      reservationTime: reservation.time,
      partySize: reservation.partySize,
      reservationCode: reservation.code,
      manageReservationUrl: `${process.env.FRONTEND_URL}/reservations/${reservation.id}`,
      directionsUrl: `${process.env.FRONTEND_URL}/directions`,
      supportEmail: process.env.SUPPORT_EMAIL,
    },
  });
}
```

### 4. Send Bulk Newsletter

```typescript
async sendMonthlyNewsletter() {
  const subscribers = await this.mailService.getActiveSubscriptions(MailType.NEWSLETTER);
  const recipients = subscribers.map(sub => sub.email);

  await this.mailService.sendBulkMail({
    recipients,
    mailType: MailType.NEWSLETTER,
    variables: {
      month: 'February',
      year: '2026',
      headline: 'New Games This Month!',
      content: 'Check out our latest additions...',
      readMoreUrl: `${process.env.FRONTEND_URL}/newsletter`,
    },
  });
}
```

## 🔧 Available API Endpoints

### Subscription Endpoints

- `POST /mail/subscribe` - Subscribe to email list
- `POST /mail/unsubscribe` - Unsubscribe from emails
- `GET /mail/subscription/:email` - Get subscription details
- `PUT /mail/subscription/:email` - Update subscription preferences

### Email Sending Endpoints

- `POST /mail/send` - Send single email
- `POST /mail/send-bulk` - Send bulk emails

### Template Management

- `POST /mail/template` - Create new template
- `PUT /mail/template/:id` - Update template
- `GET /mail/templates` - Get all templates

### Analytics & Logs

- `GET /mail/logs` - Get email logs with filters

### Webhooks

- `POST /mail/webhook/ses` - Handle SES notifications

## 🎨 Customizing Templates

To customize email templates:

1. **Edit existing templates** in [templates/mail-templates.ts](src/modules/mail/templates/mail-templates.ts)
2. **Update template variables** as needed
3. **Re-seed templates**: `npm run seed:mail-templates`

Or create new templates via API:

```typescript
await this.mailService.createTemplate({
  name: 'custom-template-en',
  mailType: MailType.PROMOTIONAL,
  subject: 'Custom Subject {{name}}',
  htmlContent: '<h1>Hello {{name}}!</h1>...',
  requiredVariables: ['name'],
  locale: 'en',
  isActive: true,
});
```

## 📊 Monitoring & Analytics

Check email logs:

```bash
curl http://localhost:3000/mail/logs?limit=50
```

Filter logs:

```bash
curl "http://localhost:3000/mail/logs?email=user@example.com&mailType=welcome&status=sent"
```

## 🔒 Security Best Practices

1. ✅ **Never commit AWS credentials** to version control
2. ✅ **Use environment variables** for sensitive data
3. ✅ **Verify email addresses** in SES before production
4. ✅ **Set up SPF/DKIM records** for your domain
5. ✅ **Handle bounces and complaints** properly
6. ✅ **Respect unsubscribe requests** (handled automatically)

## 🐛 Troubleshooting

### Email not sending?

1. Check AWS credentials are correct
2. Verify sender email in AWS SES
3. Check SES sandbox mode (can only send to verified emails)
4. Review logs in database or console

### Email going to spam?

1. Set up SPF/DKIM records for your domain
2. Verify domain (not just email) in SES
3. Avoid spam trigger words
4. Include unsubscribe link (added automatically)

### Rate limit errors?

1. Request limit increase in AWS SES
2. Reduce batch size in bulk sender
3. Increase delay between batches

## 📖 Full Documentation

For complete documentation, see [README.md](src/modules/mail/README.md)

## 🎉 You're All Set!

Your professional email system is ready to use. Start sending beautiful, transactional and marketing emails with Amazon SES!

### Need Help?

- Check the [Full README](src/modules/mail/README.md)
- Review AWS SES documentation
- Test with verified emails first
- Monitor logs for debugging

Happy emailing! ✉️
