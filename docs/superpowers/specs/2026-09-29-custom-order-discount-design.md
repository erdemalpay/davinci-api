# Custom Order Discount Design

## Goal

Allow staff to apply one administrator-configured custom discount directly from an unpaid order row. At payment time, staff enter a total discount amount and the number of unpaid units affected. The total discount is shared evenly across those units.

## Scope

This feature spans the NestJS API in `davinci-api` and the React client in `davinci-react`.

Included:

- A new `isCustom` property on order discounts.
- Configuration of that property on the Order Discount administration page.
- Enforcement that no more than one active custom discount exists.
- A row-level custom-discount action for eligible unpaid orders.
- Runtime entry and validation of the total discount amount, affected quantity, and required note.
- Reuse of the existing order-discount splitting behavior for partial quantities.

Not included:

- Multiple simultaneous custom discount definitions.
- Combining a custom discount with another discount on the same order unit.
- Changes to Shopify discounts or other external-platform discount models.
- A new discount calculation model on stored orders; discounted orders continue to store a per-unit `discountAmount`.

## Discount Configuration

The order discount schema and API DTO expose `isCustom` as a boolean with a default value of `false`. The React `OrderDiscount` type exposes the same optional property for backward compatibility with existing records.

The Order Discount administration page adds Custom Discount to its add/edit form and table. When `isCustom` is enabled:

- preset percentage and amount inputs are cleared and disabled;
- the existing store-order, online-order, note-required, payment-screen-visibility, and status options remain available;
- creating or activating another custom discount while an active custom discount already exists is rejected by the API.

An inactive/deleted custom discount does not prevent another discount from becoming custom. Historical orders retain their discount reference if a custom discount later becomes inactive.

## Unpaid-Order Interaction

The payment screen resolves the single active custom discount from the existing order-discount list. An action icon is shown on an unpaid order row only when:

- an active custom discount exists;
- the order has remaining unpaid quantity;
- the order does not already have a discount; and
- the custom discount is enabled for the table's order type (`isStoreOrder` or `isOnlineOrder`).

Selecting the icon opens a compact dialog for that specific order. The dialog shows the product name and remaining unpaid quantity and contains:

- Total Discount Amount, required and greater than zero.
- Affected Quantity, required, integer, defaulting to `1`, and bounded by the remaining unpaid quantity.
- Discount Note when the configured custom discount requires a note.

Submitting sends the custom discount ID, the chosen quantity, the entered total amount, and any required note through the existing `POST /order/create_order_for_discount` flow. Success closes the dialog and lets the existing query/websocket refresh update the order display. API errors keep the dialog open and show the returned message.

## Calculation and Persistence

The entered value is the total discount across all affected units. The API calculates:

`perUnitDiscount = totalDiscountAmount / affectedQuantity`

The request is rejected when the amount is zero, negative, non-finite, or greater than `unitPrice * affectedQuantity`. The quantity is rejected when it is not a positive integer or exceeds the order's remaining unpaid quantity.

If the affected quantity equals the source order's total quantity, the existing order is updated. Otherwise, including when an order is partially paid and all remaining units are selected, the existing split behavior creates a new order containing the affected quantity and applies the discount to that new order. The discounted order stores the custom discount ID and calculated per-unit `discountAmount` so existing totals, reports, cancellation, and payment calculations continue to work.

The API derives and validates the custom-discount definition rather than trusting the client-supplied amount or discount classification. Fixed discounts keep their current behavior.

## Error Handling and Concurrency

- The API is the authority for uniqueness, quantity, amount, and note validation.
- Missing, inactive, or non-custom discount IDs used in the custom flow return a bad-request response.
- An order that no longer exists or has insufficient unpaid quantity returns a bad-request response without applying a discount.
- Duplicate custom-discount configuration is rejected with a clear conflict/bad-request message.
- Existing failures during order update/split retain the current error handling and websocket behavior; no partial client-side state is treated as successful.

## Testing

API tests cover:

- default and persisted `isCustom` values;
- creating/updating the single active custom discount and rejecting a second one;
- positive amount and integer quantity validation;
- rejecting an amount greater than the selected units' total price;
- equal per-unit distribution of the total discount;
- full-quantity updates and partial-quantity splits;
- required-note validation; and
- rejection of inactive, missing, or non-custom discount definitions in the custom path.

React tests cover:

- Order Discount form behavior when Custom Discount is toggled;
- the unpaid-row icon eligibility rules;
- dialog defaults and validation messages;
- the submitted payload for total amount, affected quantity, and note; and
- retaining the dialog on an API error and closing it on success.

Regression verification covers the existing fixed-percentage and fixed-amount discount flows in both projects.
