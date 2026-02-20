export const welcomeEmailTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to DaVinci</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 0; text-align: center; background-color: #f4f4f4;">
                <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700;">Welcome to DaVinci!</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h2 style="margin: 0 0 20px; color: #333333; font-size: 24px; font-weight: 600;">Hello {{name}}!</h2>
                            <p style="margin: 0 0 15px; color: #666666; font-size: 16px; line-height: 1.6;">
                                We're thrilled to have you join our community! At DaVinci, we're passionate about bringing people together through the joy of board games and great experiences.
                            </p>
                            <p style="margin: 0 0 15px; color: #666666; font-size: 16px; line-height: 1.6;">
                                Here's what you can look forward to:
                            </p>
                            <ul style="margin: 0 0 25px; color: #666666; font-size: 16px; line-height: 1.8; padding-left: 20px;">
                                <li>Exclusive access to our extensive game library</li>
                                <li>Special member discounts and promotions</li>
                                <li>Early reservations for game nights and events</li>
                                <li>Personalized game recommendations</li>
                            </ul>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="{{actionUrl}}" style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: 600;">Get Started</a>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
                            <p style="margin: 0 0 10px; color: #888888; font-size: 14px;">
                                If you have any questions, feel free to reach out to us at 
                                <a href="mailto:{{supportEmail}}" style="color: #667eea; text-decoration: none;">{{supportEmail}}</a>
                            </p>
                            <p style="margin: 0; color: #888888; font-size: 12px;">
                                © 2026 DaVinci. All rights reserved.
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

export const newsletterTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DaVinci Newsletter</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 0; text-align: center; background-color: #f4f4f4;">
                <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #2c3e50; padding: 30px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">DaVinci Newsletter</h1>
                            <p style="margin: 10px 0 0; color: #ecf0f1; font-size: 14px;">{{month}} {{year}}</p>
                        </td>
                    </tr>
                    
                    <!-- Featured Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h2 style="margin: 0 0 20px; color: #2c3e50; font-size: 24px; font-weight: 600;">{{headline}}</h2>
                            <div style="margin-bottom: 30px;">
                                {{#if featuredImage}}
                                <img src="{{featuredImage}}" alt="Featured" style="width: 100%; height: auto; border-radius: 8px; margin-bottom: 20px;">
                                {{/if}}
                                <p style="margin: 0 0 15px; color: #555555; font-size: 16px; line-height: 1.6;">
                                    {{content}}
                                </p>
                            </div>
                            
                            <!-- News Items -->
                            <div style="border-top: 2px solid #ecf0f1; padding-top: 30px; margin-top: 30px;">
                                <h3 style="margin: 0 0 20px; color: #2c3e50; font-size: 20px; font-weight: 600;">What's New</h3>
                                {{#each newsItems}}
                                <div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid #ecf0f1;">
                                    <h4 style="margin: 0 0 10px; color: #34495e; font-size: 18px; font-weight: 600;">{{this.title}}</h4>
                                    <p style="margin: 0; color: #666666; font-size: 15px; line-height: 1.6;">{{this.description}}</p>
                                </div>
                                {{/each}}
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="{{readMoreUrl}}" style="display: inline-block; padding: 15px 40px; background-color: #3498db; color: #ffffff; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: 600;">Read More</a>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 30px; text-align: center;">
                            <p style="margin: 0 0 10px; color: #888888; font-size: 14px;">
                                You're receiving this because you subscribed to our newsletter.
                            </p>
                            <p style="margin: 0; color: #888888; font-size: 12px;">
                                © 2026 DaVinci. All rights reserved.
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

export const orderConfirmationTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 0; text-align: center; background-color: #f4f4f4;">
                <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #27ae60; padding: 40px 30px; text-align: center;">
                            <div style="width: 60px; height: 60px; background-color: #ffffff; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                                <span style="color: #27ae60; font-size: 30px;">✓</span>
                            </div>
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Order Confirmed!</h1>
                            <p style="margin: 10px 0 0; color: #ffffff; font-size: 16px;">Order #{{orderNumber}}</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                                Hi {{customerName}},
                            </p>
                            <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                                Thank you for your order! We've received your order and will notify you when it's ready.
                            </p>
                            
                            <!-- Order Details -->
                            <div style="background-color: #f8f9fa; border-radius: 8px; padding: 25px; margin-bottom: 30px;">
                                <h2 style="margin: 0 0 20px; color: #2c3e50; font-size: 20px; font-weight: 600;">Order Details</h2>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <thead>
                                        <tr style="border-bottom: 2px solid #dee2e6;">
                                            <th style="padding: 10px; text-align: left; color: #495057; font-size: 14px; font-weight: 600;">Item</th>
                                            <th style="padding: 10px; text-align: center; color: #495057; font-size: 14px; font-weight: 600;">Qty</th>
                                            <th style="padding: 10px; text-align: right; color: #495057; font-size: 14px; font-weight: 600;">Price</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {{#each items}}
                                        <tr style="border-bottom: 1px solid #dee2e6;">
                                            <td style="padding: 15px 10px; color: #333333; font-size: 14px;">{{this.name}}</td>
                                            <td style="padding: 15px 10px; text-align: center; color: #666666; font-size: 14px;">{{this.quantity}}</td>
                                            <td style="padding: 15px 10px; text-align: right; color: #333333; font-size: 14px;">{{this.price}}</td>
                                        </tr>
                                        {{/each}}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colspan="2" style="padding: 20px 10px 10px; text-align: right; color: #495057; font-size: 16px; font-weight: 600;">Total:</td>
                                            <td style="padding: 20px 10px 10px; text-align: right; color: #27ae60; font-size: 18px; font-weight: 700;">{{total}}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                            
                            <!-- Delivery Info -->
                            {{#if deliveryTime}}
                            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-bottom: 30px; border-radius: 4px;">
                                <p style="margin: 0; color: #856404; font-size: 14px;">
                                    <strong>Estimated Delivery:</strong> {{deliveryTime}}
                                </p>
                            </div>
                            {{/if}}
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="{{orderUrl}}" style="display: inline-block; padding: 15px 40px; background-color: #27ae60; color: #ffffff; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: 600;">View Order</a>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 30px; text-align: center;">
                            <p style="margin: 0 0 10px; color: #888888; font-size: 14px;">
                                Questions? Contact us at <a href="mailto:{{supportEmail}}" style="color: #27ae60; text-decoration: none;">{{supportEmail}}</a>
                            </p>
                            <p style="margin: 0; color: #888888; font-size: 12px;">
                                © 2026 DaVinci. All rights reserved.
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

export const passwordResetTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 0; text-align: center; background-color: #f4f4f4;">
                <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #e74c3c; padding: 40px 30px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Reset Your Password</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                                Hi {{name}},
                            </p>
                            <p style="margin: 0 0 20px; color: #666666; font-size: 16px; line-height: 1.6;">
                                We received a request to reset your password. Click the button below to create a new password:
                            </p>
                            
                            <div style="text-align: center; margin: 35px 0;">
                                <a href="{{resetUrl}}" style="display: inline-block; padding: 15px 40px; background-color: #e74c3c; color: #ffffff; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: 600;">Reset Password</a>
                            </div>
                            
                            <p style="margin: 0 0 15px; color: #666666; font-size: 14px; line-height: 1.6;">
                                Or copy and paste this link into your browser:
                            </p>
                            <p style="margin: 0 0 30px; color: #3498db; font-size: 14px; word-break: break-all;">
                                {{resetUrl}}
                            </p>
                            
                            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                                <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.5;">
                                    <strong>Security Note:</strong> This link will expire in {{expirationTime}} hours. If you didn't request a password reset, please ignore this email or contact support if you have concerns.
                                </p>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 30px; text-align: center;">
                            <p style="margin: 0 0 10px; color: #888888; font-size: 14px;">
                                Need help? Contact us at <a href="mailto:{{supportEmail}}" style="color: #e74c3c; text-decoration: none;">{{supportEmail}}</a>
                            </p>
                            <p style="margin: 0; color: #888888; font-size: 12px;">
                                © 2026 DaVinci. All rights reserved.
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

export const reservationConfirmationTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reservation Confirmed</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 0; text-align: center; background-color: #f4f4f4;">
                <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 40px 30px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Reservation Confirmed! 🎲</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                                Hi {{customerName}},
                            </p>
                            <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                                Your reservation is confirmed! We're excited to see you soon.
                            </p>
                            
                            <!-- Reservation Details -->
                            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 30px; margin-bottom: 30px; color: #ffffff;">
                                <h2 style="margin: 0 0 25px; font-size: 22px; font-weight: 600; text-align: center;">Reservation Details</h2>
                                
                                <table style="width: 100%;">
                                    <tr>
                                        <td style="padding: 10px 0;">
                                            <div style="font-size: 14px; opacity: 0.9;">Date & Time</div>
                                            <div style="font-size: 18px; font-weight: 600; margin-top: 5px;">{{reservationDate}} at {{reservationTime}}</div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.2);">
                                            <div style="font-size: 14px; opacity: 0.9;">Party Size</div>
                                            <div style="font-size: 18px; font-weight: 600; margin-top: 5px;">{{partySize}} guests</div>
                                        </td>
                                    </tr>
                                    {{#if tableName}}
                                    <tr>
                                        <td style="padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.2);">
                                            <div style="font-size: 14px; opacity: 0.9;">Table</div>
                                            <div style="font-size: 18px; font-weight: 600; margin-top: 5px;">{{tableName}}</div>
                                        </td>
                                    </tr>
                                    {{/if}}
                                    <tr>
                                        <td style="padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.2);">
                                            <div style="font-size: 14px; opacity: 0.9;">Reservation Code</div>
                                            <div style="font-size: 20px; font-weight: 700; margin-top: 5px; letter-spacing: 2px;">{{reservationCode}}</div>
                                        </td>
                                    </tr>
                                </table>
                            </div>
                            
                            {{#if specialRequests}}
                            <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                                <h3 style="margin: 0 0 10px; color: #2c3e50; font-size: 16px; font-weight: 600;">Special Requests</h3>
                                <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.6;">{{specialRequests}}</p>
                            </div>
                            {{/if}}
                            
                            <!-- Important Info -->
                            <div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin-bottom: 30px; border-radius: 4px;">
                                <p style="margin: 0 0 10px; color: #1565c0; font-size: 14px; font-weight: 600;">Important Information:</p>
                                <ul style="margin: 0; padding-left: 20px; color: #1976d2; font-size: 14px; line-height: 1.6;">
                                    <li>Please arrive 10 minutes early</li>
                                    <li>Reservations held for 15 minutes</li>
                                    <li>Contact us to modify or cancel</li>
                                </ul>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="{{manageReservationUrl}}" style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: 600; margin-right: 10px;">Manage Reservation</a>
                                <a href="{{directionsUrl}}" style="display: inline-block; padding: 15px 40px; background-color: #2196f3; color: #ffffff; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: 600;">Get Directions</a>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 30px; text-align: center;">
                            <p style="margin: 0 0 10px; color: #888888; font-size: 14px;">
                                Questions? Contact us at <a href="mailto:{{supportEmail}}" style="color: #667eea; text-decoration: none;">{{supportEmail}}</a>
                            </p>
                            <p style="margin: 0; color: #888888; font-size: 12px;">
                                © 2026 DaVinci. All rights reserved.
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

export const promotionalTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Special Offer</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 0; text-align: center; background-color: #f4f4f4;">
                <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header Banner -->
                    <tr>
                        <td style="padding: 0; position: relative;">
                            {{#if bannerImage}}
                            <img src="{{bannerImage}}" alt="Promotion" style="width: 100%; height: auto; display: block;">
                            {{else}}
                            <div style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); padding: 60px 30px; text-align: center;">
                                <h1 style="margin: 0; color: #ffffff; font-size: 36px; font-weight: 700; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);">{{offerTitle}}</h1>
                            </div>
                            {{/if}}
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <div style="text-align: center; margin-bottom: 30px;">
                                <h2 style="margin: 0 0 15px; color: #2c3e50; font-size: 28px; font-weight: 700;">{{offerHeadline}}</h2>
                                <p style="margin: 0; color: #e74c3c; font-size: 24px; font-weight: 600;">{{discount}} OFF!</p>
                            </div>
                            
                            <p style="margin: 0 0 25px; color: #666666; font-size: 16px; line-height: 1.6; text-align: center;">
                                {{offerDescription}}
                            </p>
                            
                            <!-- Promo Code -->
                            {{#if promoCode}}
                            <div style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); border-radius: 8px; padding: 25px; margin: 30px 0; text-align: center;">
                                <p style="margin: 0 0 10px; color: #ffffff; font-size: 14px; font-weight: 600; text-transform: uppercase;">Use Promo Code</p>
                                <div style="background-color: #ffffff; border-radius: 5px; padding: 15px; display: inline-block;">
                                    <span style="color: #2c3e50; font-size: 24px; font-weight: 700; letter-spacing: 3px;">{{promoCode}}</span>
                                </div>
                            </div>
                            {{/if}}
                            
                            <!-- Features/Benefits -->
                            {{#if benefits}}
                            <div style="margin: 30px 0;">
                                <h3 style="margin: 0 0 20px; color: #2c3e50; font-size: 20px; font-weight: 600; text-align: center;">What's Included:</h3>
                                <ul style="margin: 0; padding-left: 20px; color: #666666; font-size: 15px; line-height: 2;">
                                    {{#each benefits}}
                                    <li>{{this}}</li>
                                    {{/each}}
                                </ul>
                            </div>
                            {{/if}}
                            
                            <!-- Urgency -->
                            {{#if expiryDate}}
                            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 25px 0; border-radius: 4px;">
                                <p style="margin: 0; color: #856404; font-size: 14px; text-align: center;">
                                    ⏰ <strong>Hurry! Offer expires {{expiryDate}}</strong>
                                </p>
                            </div>
                            {{/if}}
                            
                            <div style="text-align: center; margin: 35px 0;">
                                <a href="{{ctaUrl}}" style="display: inline-block; padding: 18px 50px; background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: #ffffff; text-decoration: none; border-radius: 50px; font-size: 18px; font-weight: 700; text-transform: uppercase; box-shadow: 0 4px 15px rgba(250, 112, 154, 0.4);">{{ctaText}}</a>
                            </div>
                            
                            <p style="margin: 25px 0 0; color: #999999; font-size: 12px; line-height: 1.5; text-align: center;">
                                {{termsAndConditions}}
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 30px; text-align: center;">
                            <p style="margin: 0 0 10px; color: #888888; font-size: 14px;">
                                You're receiving this because you subscribed to promotional emails.
                            </p>
                            <p style="margin: 0; color: #888888; font-size: 12px;">
                                © 2026 DaVinci. All rights reserved.
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

export const gameNightTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Game Night Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 0; text-align: center; background-color: #f4f4f4;">
                <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #4a00e0 0%, #8e2de2 100%); padding: 50px 30px; text-align: center;">
                            <div style="font-size: 60px; margin-bottom: 15px;">🎲🎮🃏</div>
                            <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700;">Game Night!</h1>
                            <p style="margin: 10px 0 0; color: #ffffff; font-size: 18px; opacity: 0.9;">{{eventName}}</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                                Hey {{name}}! 👋
                            </p>
                            <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                                {{eventDescription}}
                            </p>
                            
                            <!-- Event Details Card -->
                            <div style="background-color: #f8f9fa; border-radius: 12px; padding: 30px; margin-bottom: 30px; border: 2px solid #e9ecef;">
                                <h2 style="margin: 0 0 25px; color: #2c3e50; font-size: 22px; font-weight: 600; text-align: center;">Event Details</h2>
                                
                                <div style="display: table; width: 100%;">
                                    <div style="display: table-row;">
                                        <div style="display: table-cell; padding: 12px 0; width: 30px; vertical-align: top;">
                                            <span style="font-size: 20px;">📅</span>
                                        </div>
                                        <div style="display: table-cell; padding: 12px 0; vertical-align: top;">
                                            <div style="color: #666666; font-size: 13px; margin-bottom: 3px;">Date & Time</div>
                                            <div style="color: #2c3e50; font-size: 16px; font-weight: 600;">{{eventDate}} at {{eventTime}}</div>
                                        </div>
                                    </div>
                                    
                                    <div style="display: table-row;">
                                        <div style="display: table-cell; padding: 12px 0; width: 30px; vertical-align: top;">
                                            <span style="font-size: 20px;">📍</span>
                                        </div>
                                        <div style="display: table-cell; padding: 12px 0; vertical-align: top;">
                                            <div style="color: #666666; font-size: 13px; margin-bottom: 3px;">Location</div>
                                            <div style="color: #2c3e50; font-size: 16px; font-weight: 600;">{{location}}</div>
                                        </div>
                                    </div>
                                    
                                    {{#if gamesPlaying}}
                                    <div style="display: table-row;">
                                        <div style="display: table-cell; padding: 12px 0; width: 30px; vertical-align: top;">
                                            <span style="font-size: 20px;">🎲</span>
                                        </div>
                                        <div style="display: table-cell; padding: 12px 0; vertical-align: top;">
                                            <div style="color: #666666; font-size: 13px; margin-bottom: 3px;">Featured Games</div>
                                            <div style="color: #2c3e50; font-size: 16px; font-weight: 600;">{{gamesPlaying}}</div>
                                        </div>
                                    </div>
                                    {{/if}}
                                    
                                    {{#if skillLevel}}
                                    <div style="display: table-row;">
                                        <div style="display: table-cell; padding: 12px 0; width: 30px; vertical-align: top;">
                                            <span style="font-size: 20px;">⭐</span>
                                        </div>
                                        <div style="display: table-cell; padding: 12px 0; vertical-align: top;">
                                            <div style="color: #666666; font-size: 13px; margin-bottom: 3px;">Skill Level</div>
                                            <div style="color: #2c3e50; font-size: 16px; font-weight: 600;">{{skillLevel}}</div>
                                        </div>
                                    </div>
                                    {{/if}}
                                </div>
                            </div>
                            
                            {{#if maxAttendees}}
                            <div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin-bottom: 30px; border-radius: 4px;">
                                <p style="margin: 0; color: #1565c0; font-size: 14px;">
                                    <strong>Limited Spots:</strong> Only {{spotsRemaining}} spots remaining out of {{maxAttendees}}!
                                </p>
                            </div>
                            {{/if}}
                            
                            <div style="text-align: center; margin: 35px 0;">
                                <a href="{{rsvpUrl}}" style="display: inline-block; padding: 18px 50px; background: linear-gradient(135deg, #4a00e0 0%, #8e2de2 100%); color: #ffffff; text-decoration: none; border-radius: 50px; font-size: 18px; font-weight: 700; box-shadow: 0 4px 15px rgba(74, 0, 224, 0.3);">RSVP Now</a>
                            </div>
                            
                            <p style="margin: 25px 0 0; color: #666666; font-size: 14px; line-height: 1.6; text-align: center;">
                                Can't make it? No worries! We have game nights every week.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 30px; text-align: center;">
                            <p style="margin: 0 0 10px; color: #888888; font-size: 14px;">
                                Questions? Contact us at <a href="mailto:{{supportEmail}}" style="color: #4a00e0; text-decoration: none;">{{supportEmail}}</a>
                            </p>
                            <p style="margin: 0; color: #888888; font-size: 12px;">
                                © 2026 DaVinci. All rights reserved.
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
