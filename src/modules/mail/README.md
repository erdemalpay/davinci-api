# Mail Module - DaVinci API

Professional email service integration using Amazon SES with subscription management, multiple mail types, and HTML templates.

## Features

✨ **Complete Email Solution**

- Amazon SES integration for reliable email delivery
- Subscription management with opt-in/opt-out
- Multiple pre-built HTML email templates
- Transactional and marketing email support
- Email logging and tracking
- Bounce and complaint handling
- Bulk email sending with rate limiting

## Mail Types

The system supports the following email types:

- `WELCOME` - Welcome emails for new users
- `NEWSLETTER` - Regular newsletters
- `PROMOTIONAL` - Marketing and promotional emails
- `TRANSACTIONAL` - Order confirmations, password resets, etc.
- `ORDER_CONFIRMATION` - Order confirmation emails
- `ORDER_UPDATE` - Order status updates
- `PASSWORD_RESET` - Password reset emails
- `ACCOUNT_VERIFICATION` - Email verification
- `RESERVATION_CONFIRMATION` - Table/event reservations
- `GAME_NIGHT` - Game night event invitations
- `SPECIAL_OFFER` - Special offers and discounts
- `MEMBERSHIP_UPDATE` - Membership status updates

## Setup

### 1. Environment Variables

Add the following to your `.env` file:

```env
# AWS SES Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here

# Email Configuration
DEFAULT_FROM_EMAIL=noreply@yourdomain.com
FRONTEND_URL=https://yourdomain.com
```

### 2. Install Dependencies

The following packages are required:

```bash
npm install aws-sdk uuid
npm install @types/uuid --save-dev
```

### 3. Import Module

Add `MailModule` to your `app.module.ts`:

```typescript
import { MailModule } from './modules/mail/mail.module';

@Module({
  imports: [
    // ... other modules
    MailModule,
  ],
})
export class AppModule {}
```

### 4. Seed Templates

On first run, seed the email templates:

```typescript
import { MailSeeder } from './modules/mail/mail.seeder';

// In your bootstrap or migration
const mailSeeder = app.get(MailSeeder);
await mailSeeder.seedTemplates();
```

### 5. Verify SES Domain/Email

Before sending emails, verify your domain or email address in AWS SES:

1. Go to AWS SES Console
2. Navigate to "Verified identities"
3. Add and verify your domain or email address
4. If in sandbox mode, also verify recipient emails

## API Endpoints

### Subscription Management

#### Subscribe to Email List

```http
POST /mail/subscribe
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "John Doe",
  "subscribedTypes": ["newsletter", "promotional"],
  "locale": "en"
}
```

#### Unsubscribe

```http
POST /mail/unsubscribe
Content-Type: application/json

{
  "email": "user@example.com",
  "token": "optional-unsubscribe-token"
}
```

#### Update Subscription Preferences

```http
PUT /mail/subscription/{email}
Content-Type: application/json

{
  "subscribedTypes": ["newsletter"],
  "locale": "en"
}
```

#### Get Subscription Details

```http
GET /mail/subscription/{email}
```

### Sending Emails

#### Send Single Email

```http
POST /mail/send
Content-Type: application/json

{
  "to": "user@example.com",
  "mailType": "welcome",
  "variables": {
    "name": "John Doe",
    "actionUrl": "https://yourdomain.com/dashboard",
    "supportEmail": "support@yourdomain.com"
  },
  "locale": "en"
}
```

#### Send Bulk Emails

```http
POST /mail/send-bulk
Content-Type: application/json

{
  "recipients": ["user1@example.com", "user2@example.com"],
  "mailType": "newsletter",
  "variables": {
    "month": "February",
    "year": "2026",
    "headline": "What's New This Month",
    "content": "Check out our latest updates..."
  }
}
```

### Template Management

#### Create Template

```http
POST /mail/template
Content-Type: application/json

{
  "name": "custom-template-en",
  "mailType": "promotional",
  "subject": "Special Offer for {{name}}",
  "htmlContent": "<h1>Hello {{name}}!</h1>...",
  "textContent": "Hello {{name}}!...",
  "requiredVariables": ["name"],
  "locale": "en",
  "isActive": true
}
```

#### Update Template

```http
PUT /mail/template/{templateId}
Content-Type: application/json

{
  "subject": "Updated Subject",
  "htmlContent": "<h1>Updated Content</h1>"
}
```

#### Get All Templates

```http
GET /mail/templates
```

### Logs and Analytics

#### Get Mail Logs

```http
GET /mail/logs?email=user@example.com&mailType=welcome&status=sent&limit=50
```

### Webhooks

#### SES Notification Webhook

```http
POST /mail/webhook/ses
Content-Type: application/json

{
  "notificationType": "Bounce",
  "bounce": {
    "bouncedRecipients": [...]
  }
}
```

## Usage Examples

### Example 1: Send Welcome Email

```typescript
import { MailService } from './modules/mail/mail.service';

@Injectable()
export class UserService {
  constructor(private mailService: MailService) {}

  async createUser(userData: any) {
    const user = await this.userRepository.create(userData);

    // Send welcome email
    await this.mailService.sendMail({
      to: user.email,
      mailType: MailType.WELCOME,
      variables: {
        name: user.name,
        actionUrl: `${process.env.FRONTEND_URL}/dashboard`,
        supportEmail: 'support@davinci.com',
      },
    });

    return user;
  }
}
```

### Example 2: Send Order Confirmation

```typescript
async confirmOrder(order: Order) {
  await this.mailService.sendMail({
    to: order.customerEmail,
    mailType: MailType.ORDER_CONFIRMATION,
    variables: {
      orderNumber: order.number,
      customerName: order.customerName,
      items: order.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: `$${item.price}`,
      })),
      total: `$${order.total}`,
      orderUrl: `${process.env.FRONTEND_URL}/orders/${order.id}`,
      supportEmail: 'support@davinci.com',
    },
  });
}
```

### Example 3: Send Monthly Newsletter

```typescript
async sendMonthlyNewsletter() {
  // Get all active newsletter subscribers
  const subscribers = await this.mailService.getActiveSubscriptions(
    MailType.NEWSLETTER,
  );

  const recipients = subscribers.map(sub => sub.email);

  await this.mailService.sendBulkMail({
    recipients,
    mailType: MailType.NEWSLETTER,
    variables: {
      month: 'February',
      year: '2026',
      headline: 'New Board Games Just Arrived!',
      content: 'We've added 20 new games to our collection...',
      newsItems: [
        {
          title: 'New Games Added',
          description: 'Check out our latest additions...',
        },
        {
          title: 'Upcoming Events',
          description: 'Join us for game night this Friday...',
        },
      ],
      readMoreUrl: `${process.env.FRONTEND_URL}/newsletter`,
    },
  });
}
```

### Example 4: Send Reservation Confirmation

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
      tableName: reservation.table?.name,
      manageReservationUrl: `${process.env.FRONTEND_URL}/reservations/${reservation.id}`,
      directionsUrl: `${process.env.FRONTEND_URL}/directions`,
      supportEmail: 'reservations@davinci.com',
    },
  });
}
```

## Email Template Variables

Each email template supports different variables. Here are the common ones:

### Welcome Email

- `name` - User's name
- `email` - User's email
- `actionUrl` - CTA button URL
- `supportEmail` - Support contact email

### Order Confirmation

- `orderNumber` - Order number
- `customerName` - Customer name
- `items` - Array of order items
- `total` - Order total
- `deliveryTime` - Estimated delivery time
- `orderUrl` - View order URL
- `supportEmail` - Support email

### Password Reset

- `name` - User's name
- `resetUrl` - Password reset URL
- `expirationTime` - Link expiration (hours)
- `supportEmail` - Support email

### Reservation Confirmation

- `customerName` - Customer name
- `reservationDate` - Reservation date
- `reservationTime` - Reservation time
- `partySize` - Number of guests
- `reservationCode` - Confirmation code
- `tableName` - Table name (optional)
- `specialRequests` - Special requests (optional)
- `manageReservationUrl` - Manage reservation URL
- `directionsUrl` - Get directions URL
- `supportEmail` - Support email

### Game Night Invitation

- `name` - Recipient's name
- `eventName` - Event name
- `eventDescription` - Event description
- `eventDate` - Event date
- `eventTime` - Event time
- `location` - Event location
- `gamesPlaying` - Featured games (optional)
- `skillLevel` - Skill level (optional)
- `maxAttendees` - Maximum attendees (optional)
- `spotsRemaining` - Spots remaining (optional)
- `rsvpUrl` - RSVP URL
- `supportEmail` - Support email

## Subscription Management

### Auto-Unsubscribe Links

Non-transactional emails automatically include an unsubscribe link in the footer. The link format is:

```
https://yourdomain.com/unsubscribe?email=user@example.com&token=xxx
```

### Transactional vs Marketing Emails

The system respects subscription status:

- **Transactional emails** (order confirmations, password resets, etc.) are always sent
- **Marketing emails** (newsletters, promotions) are only sent to active subscribers

### Bounce and Complaint Handling

The system automatically handles SES notifications:

- **Bounces** - Marks email as `BOUNCED` status
- **Complaints** - Marks email as `COMPLAINED` status

Set up SNS topics in AWS SES to send notifications to `/mail/webhook/ses`.

## Rate Limiting

The bulk email sender includes built-in rate limiting:

- Sends in batches of 50 emails
- 1-second delay between batches
- Prevents SES rate limit errors

## Monitoring and Logs

All sent emails are logged in the database with:

- Email address
- Subject
- Mail type
- Message ID (from SES)
- Status (sent, delivered, bounced, failed)
- Timestamp
- Error messages (if failed)

Query logs using:

```typescript
const logs = await mailService.getMailLogs({
  email: 'user@example.com',
  mailType: MailType.WELCOME,
  status: 'sent',
  limit: 100,
});
```

## Troubleshooting

### Email Not Sending

1. **Check SES verification**: Ensure your domain/email is verified in AWS SES
2. **Sandbox mode**: In SES sandbox, you can only send to verified email addresses
3. **Credentials**: Verify AWS credentials are correct in environment variables
4. **Template exists**: Ensure the template for the mail type exists in the database

### Email Going to Spam

1. **SPF/DKIM records**: Configure proper DNS records for your domain
2. **From address**: Use a verified domain email address
3. **Content**: Avoid spam trigger words in subject/content
4. **Unsubscribe link**: Always include (automatically added for marketing emails)

### Rate Limiting Issues

If hitting SES rate limits:

1. Request limit increase in AWS SES console
2. Reduce batch size in bulk email sender
3. Increase delay between batches

## Security Best Practices

1. **Never expose AWS credentials** - Use environment variables
2. **Validate email addresses** - Use class-validator decorators
3. **Sanitize user input** - Prevent email injection attacks
4. **Use HTTPS** - For unsubscribe links and webhooks
5. **Verify webhook signatures** - When implementing SNS webhooks

## License

This module is part of the DaVinci API project.
