export type RefundAction =
  | {
      type: 'cancel';
      lineItemId: string;
      quantity: number;
      restock: boolean;
    }
  | {
      type: 'refund';
      lineItemId: string;
      refundAmount: number;
      refundId?: string;
    }
  | {
      type: 'shipping_refund';
      amount: number;
      refundId: string;
    };

type RefundGroup = {
  refundId?: string;
  lineItems: any[];
  shippingLines: any[];
  transactions: any[];
};

const NO_RESTOCK = 'no_restock';

const toNumber = (value: any): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const collectRefundGroups = (data: any): RefundGroup[] => {
  if (!data?.refunds && Array.isArray(data?.refund_line_items)) {
    return [
      {
        refundId: data?.id != null ? String(data.id) : undefined,
        lineItems: data.refund_line_items,
        shippingLines: data?.refund_shipping_lines ?? [],
        transactions: Array.isArray(data?.transactions)
          ? data.transactions
          : [],
      },
    ];
  }

  return (data?.refunds ?? []).map((refund: any) => ({
    refundId: refund?.id != null ? String(refund.id) : undefined,
    lineItems: refund?.refund_line_items ?? [],
    shippingLines: refund?.refund_shipping_lines ?? [],
    transactions: Array.isArray(refund?.transactions)
      ? refund.transactions
      : Array.isArray(data?.transactions)
      ? data.transactions
      : [],
  }));
};

const totalRefundedAmount = (transactions: any[]): number =>
  transactions
    .filter((tx) => String(tx?.kind).toLowerCase() === 'refund')
    .reduce((sum, tx) => sum + toNumber(tx?.amount), 0);

const shippingRefundTotal = (shippingLines: any[]): number =>
  shippingLines.reduce(
    (sum, line) =>
      sum +
      toNumber(
        line?.subtotal_amount_set?.shop_money?.amount ?? line?.subtotal_amount,
      ),
    0,
  );

const lineSubtotal = (item: any): number => {
  const subtotal = toNumber(item?.subtotal);
  if (subtotal) return subtotal;
  return toNumber(item?.line_item?.price) * toNumber(item?.quantity);
};

const planGroup = (group: RefundGroup): RefundAction[] => {
  const shippingAmount =
    Math.round(shippingRefundTotal(group.shippingLines) * 100) / 100;
  const shippingActions: RefundAction[] =
    shippingAmount > 0 && group.refundId
      ? [
          {
            type: 'shipping_refund',
            amount: shippingAmount,
            refundId: group.refundId,
          },
        ]
      : [];

  const lineItems = group.lineItems.filter(
    (item) => item?.line_item_id != null && toNumber(item?.quantity) > 0,
  );

  if (lineItems.length === 0) {
    return shippingActions;
  }

  const isNoRestock = (item: any) => item?.restock_type === NO_RESTOCK;

  const cancelledTotal = lineItems
    .filter((item) => !isNoRestock(item))
    .reduce((sum, item) => sum + lineSubtotal(item), 0);
  const noRestockTotal = lineItems
    .filter(isNoRestock)
    .reduce((sum, item) => sum + lineSubtotal(item), 0);
  const remainingRefund = Math.max(
    totalRefundedAmount(group.transactions) - shippingAmount - cancelledTotal,
    0,
  );

  const lineActions = lineItems.map((item): RefundAction => {
    const lineItemId = String(item.line_item_id);

    if (!isNoRestock(item)) {
      return {
        type: 'cancel',
        lineItemId,
        quantity: toNumber(item.quantity),
        restock: true,
      };
    }

    const subtotal = lineSubtotal(item);
    const share = noRestockTotal > 0 ? subtotal / noRestockTotal : 0;
    const allocated = remainingRefund * share;

    if (allocated >= subtotal) {
      return {
        type: 'cancel',
        lineItemId,
        quantity: toNumber(item.quantity),
        restock: false,
      };
    }

    return {
      type: 'refund',
      lineItemId,
      refundAmount: Math.round(allocated * 100) / 100,
      ...(group.refundId && { refundId: group.refundId }),
    };
  });

  return [...lineActions, ...shippingActions];
};

export function planRefundActions(data: any): RefundAction[] {
  return collectRefundGroups(data).flatMap(planGroup);
}
