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
    };

type RefundGroup = {
  refundId?: string;
  lineItems: any[];
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
        transactions: Array.isArray(data?.transactions)
          ? data.transactions
          : [],
      },
    ];
  }

  return (data?.refunds ?? []).map((refund: any) => ({
    refundId: refund?.id != null ? String(refund.id) : undefined,
    lineItems: refund?.refund_line_items ?? [],
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

const lineSubtotal = (item: any): number => {
  const subtotal = toNumber(item?.subtotal);
  if (subtotal) return subtotal;
  return toNumber(item?.line_item?.price) * toNumber(item?.quantity);
};

const planGroup = (group: RefundGroup): RefundAction[] => {
  const lineItems = group.lineItems.filter(
    (item) => item?.line_item_id != null && toNumber(item?.quantity) > 0,
  );

  if (lineItems.length === 0) {
    return [];
  }

  const isNoRestock = (item: any) => item?.restock_type === NO_RESTOCK;

  const cancelledTotal = lineItems
    .filter((item) => !isNoRestock(item))
    .reduce((sum, item) => sum + lineSubtotal(item), 0);
  const noRestockTotal = lineItems
    .filter(isNoRestock)
    .reduce((sum, item) => sum + lineSubtotal(item), 0);
  const remainingRefund = Math.max(
    totalRefundedAmount(group.transactions) - cancelledTotal,
    0,
  );

  return lineItems.map((item): RefundAction => {
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
};

export function planRefundActions(data: any): RefundAction[] {
  return collectRefundGroups(data).flatMap(planGroup);
}
