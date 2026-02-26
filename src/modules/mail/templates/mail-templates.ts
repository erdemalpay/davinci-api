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
                                {{#if variantTitle}}
                                <p style="margin: 0 0 10px; color: #666666; font-size: 15px;">
                                    <strong>Varyant:</strong> {{variantTitle}}
                                </p>
                                {{/if}}
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
