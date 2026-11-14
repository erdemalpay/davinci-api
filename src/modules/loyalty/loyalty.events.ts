// Shopify webhooks the loyalty program listens to. ShopifyService emits them
// after its own processing, so a loyalty failure never blocks an order.
export const SHOPIFY_ORDER_CREATED = 'shopify.order.created';
export const SHOPIFY_ORDER_FULFILLED = 'shopify.order.fulfilled';
// orders/cancelled or refunds/create (both arrive on the cancel webhook).
export const SHOPIFY_ORDER_REFUNDED_OR_CANCELLED =
  'shopify.order.refunded_or_cancelled';

export interface ShopifyWebhookEvent {
  data: any;
}
