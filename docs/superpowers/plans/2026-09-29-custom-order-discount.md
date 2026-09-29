# Custom Order Discount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let payment staff apply the single configured custom discount from an unpaid order row by entering one total discount amount and the number of unpaid units it affects.

**Architecture:** Extend the existing order discount definition with `isCustom`, enforce one active custom definition in the NestJS service, and keep `POST /order/create_order_for_discount` as the application boundary. The API validates custom requests against current order state and persists the total as an equal per-unit `discountAmount`; the React client adds administration controls plus a focused row-level dialog.

**Tech Stack:** NestJS 8, Mongoose 6, class-validator, Jest 27, React 18, TypeScript 5, TanStack Query 5, Headless UI, Vitest 1, React Testing Library

**Spec:** `docs/superpowers/specs/2026-09-29-custom-order-discount-design.md`

## Global Constraints

- The entered value is the total discount across all affected units, not a per-unit amount.
- At most one discount whose `isCustom` is `true` and whose status is not `deleted` may exist.
- Custom discounts do not store preset `percentage` or `amount` values.
- A custom discount cannot be combined with an existing discount on the same order unit.
- Custom quantity is limited to the order's current remaining unpaid integer quantity.
- Custom total discount must be finite, greater than zero, and no greater than `unitPrice * affectedQuantity`.
- Existing percentage and fixed-amount discount behavior must remain unchanged.
- Do not modify the user's unrelated changes in `src/modules/auth/auth.service.ts` or `src/modules/user/user.schema.ts`.

## Review Focus

- Reactivating a deleted custom discount while another active custom discount exists must fail; Task 1 adds the service test.
- A stale client quantity after part of an order is paid must fail without changing or splitting the order; Task 2 adds the service test.
- A total discount exactly equal to the selected units' total price must mark only those units fully discounted; Task 2 adds the service test.
- A total that does not divide evenly by quantity must retain the calculated numeric per-unit value without rounding it prematurely; Task 2 adds the service test.
- Deleted custom discounts and custom discounts for the wrong store/online channel must not render an action icon; Task 6 adds the eligibility and rendering tests.

---

### Task 1: Custom Discount Definition and Single-Active Enforcement

**Files:**
- Modify: `src/modules/order/discount.schema.ts`
- Modify: `src/modules/order/order.dto.ts`
- Modify: `src/modules/order/order.service.ts`
- Create: `src/modules/order/discount.schema.spec.ts`
- Create: `src/modules/order/order.custom-discount.spec.ts`

**Interfaces:**
- Produces: `Discount.isCustom: boolean` with schema default `false`.
- Produces: `CreateDiscountDto.isCustom?: boolean` guarded by `@IsOptional()` and `@IsBoolean()`.
- Produces: private `OrderService.assertNoOtherActiveCustomDiscount(excludeId?: number): Promise<void>`.
- Produces: API error message `Only one active custom discount is allowed` for duplicate active definitions.

- [ ] **Step 1: Write the failing schema tests**

Create `discount.schema.spec.ts` with assertions that `DiscountSchema.path('isCustom')` exists, is Boolean, and has `default === false`.

- [ ] **Step 2: Write the failing configuration service tests**

In `order.custom-discount.spec.ts`, build `OrderService` with focused mocks in the constructor's actual order: `orderModel` at argument 3, `discountModel` at argument 6, `tableService` at argument 10, `websocketGateway` at argument 13, `activityService` at argument 14, and `redisService` at argument 17. Cover:

```ts
it('creates the first active custom discount without preset values')
it('rejects a second active custom discount')
it('allows another custom discount when the existing one is deleted')
it('rejects reactivating a deleted custom discount while another is active')
it('unsets preset values when an existing discount becomes custom')
```

Assert duplicate cases reject with `HttpStatus.BAD_REQUEST` and the exact message, and assert custom writes omit or `$unset` both `percentage` and `amount`.

- [ ] **Step 3: Run the new API tests and verify they fail**

Run: `yarn test discount.schema.spec.ts order.custom-discount.spec.ts --runInBand`

Expected: FAIL because `isCustom` and the single-active guard do not exist.

- [ ] **Step 4: Add the schema and DTO field**

Add `isCustom?: boolean` using `@Prop({ required: false, type: Boolean, default: false })` in the schema and the existing optional boolean validation decorators in the DTO.

- [ ] **Step 5: Enforce one active custom discount during create and update**

Implement the guard with `discountModel.findOne({ isCustom: true, status: { $ne: 'deleted' }, ...exclude })`. Call it when the effective post-write state is custom and active, including a status-only reactivation. For custom creates, omit `percentage` and `amount`; for updates whose effective state is custom, add both fields to `$unset` and do not allow them in `$set`.

Preserve the existing percentage-versus-amount unset behavior for non-custom discounts and emit the existing `discountChanged` event after successful writes.

- [ ] **Step 6: Run the focused tests and verify they pass**

Run: `yarn test discount.schema.spec.ts order.custom-discount.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit the API definition change**

```bash
git add src/modules/order/discount.schema.ts src/modules/order/order.dto.ts src/modules/order/order.service.ts src/modules/order/discount.schema.spec.ts src/modules/order/order.custom-discount.spec.ts
git commit -m "feat: add custom order discount definition"
```

### Task 2: Server-Authoritative Custom Discount Application

**Files:**
- Modify: `src/modules/order/order.dto.ts`
- Modify: `src/modules/order/order.controller.ts`
- Modify: `src/modules/order/order.service.ts`
- Modify: `src/modules/order/order.custom-discount.spec.ts`

**Interfaces:**
- Produces: `ApplyOrderDiscountItemDto` with numeric `totalQuantity`, `selectedQuantity`, and `orderId`.
- Produces: `ApplyOrderDiscountDto` with validated `orders`, numeric `discount`, optional numeric `discountPercentage`, optional numeric `discountAmount`, optional numeric `customDiscountAmount`, and optional string `discountNote`.
- Consumes: `Discount.isCustom` from Task 1.
- Extends: `OrderService.createOrderForDiscount(user, orders, discount, discountPercentage?, discountAmount?, discountNote?, customDiscountAmount?)`; the new trailing optional parameter preserves existing callers.

- [ ] **Step 1: Extend the service tests with failing custom-application cases**

Add mocked order documents with `quantity`, `paidQuantity`, `unitPrice`, `save()`, and `toObject()`. Cover:

```ts
it('shares a custom total evenly across the selected quantity')
it('does not round a non-even per-unit custom amount prematurely')
it('splits only the affected quantity and preserves the source remainder')
it('fully discounts only the selected units when total equals their price')
it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid custom totals')
it('rejects a custom total greater than the selected units total')
it('rejects zero, fractional, or excessive affected quantity')
it('rejects a stale quantity after units have been paid without writing')
it('requires a note when the custom definition requires one')
it('rejects missing, deleted, and non-custom discount definitions in the custom path')
it('preserves the existing fixed amount and percentage paths')
```

For `total=10` and `selectedQuantity=3`, assert stored `discountAmount` is `10 / 3`, not `3.33`. For a full-price custom total, assert the newly discounted order's `paidQuantity` equals only `selectedQuantity`.

- [ ] **Step 2: Run the application tests and verify they fail**

Run: `yarn test order.custom-discount.spec.ts --runInBand`

Expected: FAIL because the service currently trusts the payload, accepts invalid quantities, and does not load the custom definition.

- [ ] **Step 3: Add request DTOs and use them in the controller**

Define `ApplyOrderDiscountItemDto` and `ApplyOrderDiscountDto` in `order.dto.ts` with `@ValidateNested({ each: true })`, `@Type(() => ApplyOrderDiscountItemDto)`, `@IsArray()`, and the existing scalar validators. Replace the inline controller body type for `POST /order/create_order_for_discount` with `ApplyOrderDiscountDto` while keeping the service call stable.

- [ ] **Step 4: Validate and resolve custom applications in the service**

Before any writes, load the referenced discount. Treat `customDiscountAmount` as an explicit request for the custom path, then verify the stored definition has `isCustom === true`; a stored custom definition also requires that field. Custom requests must contain exactly one order selection. This distinguishes runtime totals from the existing fixed-discount `discountAmount` without trusting the client to classify the referenced definition.

For that order:

- derive `remainingQuantity = oldOrder.quantity - oldOrder.paidQuantity` from the database;
- require payload `totalQuantity === oldOrder.quantity`;
- require integer `selectedQuantity` in `[1, remainingQuantity]`;
- require finite `customDiscountAmount` in `(0, oldOrder.unitPrice * selectedQuantity]`;
- require `discountNote` when the definition has `isNoteRequired`;
- calculate `perUnitDiscount = customDiscountAmount / selectedQuantity` exactly once;
- use database quantity for update-versus-split and source remainder calculations.

Perform all custom validation before saving or updating. Keep fixed discounts on their existing behavior path and retain existing activity and websocket emissions.

- [ ] **Step 5: Run focused API tests**

Run: `yarn test order.custom-discount.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 6: Run API regression tests and build**

Run: `yarn test --runInBand`

Expected: all Jest suites PASS.

Run: `yarn build`

Expected: Nest build and asset copy complete successfully.

- [ ] **Step 7: Commit the API application change**

```bash
git add src/modules/order/order.dto.ts src/modules/order/order.controller.ts src/modules/order/order.service.ts src/modules/order/order.custom-discount.spec.ts
git commit -m "feat: validate custom discounts on orders"
```

### Task 3: Add Focused React Test Infrastructure

**Files:**
- Modify: `../davinci-react/package.json`
- Modify: `../davinci-react/yarn.lock`
- Create: `../davinci-react/vitest.config.ts`
- Create: `../davinci-react/src/test/setup.ts`

**Interfaces:**
- Produces: `yarn test` running `vitest run` in `davinci-react`.
- Produces: jsdom plus `@testing-library/jest-dom` matchers for `*.test.ts` and `*.test.tsx` files.

- [ ] **Step 1: Add compatible test dependencies and script**

From `davinci-react`, add dev dependencies `vitest@1.6.1`, `jsdom@24.1.0`, `@testing-library/react@14.3.1`, `@testing-library/user-event@14.5.2`, and `@testing-library/jest-dom@6.4.5`. Add `"test": "vitest run"` to scripts.

- [ ] **Step 2: Configure Vitest**

Create `vitest.config.ts` with the React and tsconfig-path plugins already used by Vite, `environment: "jsdom"`, `setupFiles: ["./src/test/setup.ts"]`, `clearMocks: true`, and CSS disabled for tests. In `src/test/setup.ts`, import `@testing-library/jest-dom/vitest` and run Testing Library `cleanup` after each test.

- [ ] **Step 3: Verify the empty test runner and existing build**

Run: `yarn test --passWithNoTests`

Expected: PASS with no tests found.

Run: `yarn build`

Expected: TypeScript and Vite build PASS.

- [ ] **Step 4: Commit the test setup**

```bash
git add package.json yarn.lock vitest.config.ts src/test/setup.ts
git commit -m "test: add React component test setup"
```

### Task 4: Configure Custom Discounts on the Order Discount Page

**Files:**
- Modify: `../davinci-react/src/types/index.ts`
- Create: `../davinci-react/src/components/accounting/orderDiscountForm.ts`
- Create: `../davinci-react/src/components/accounting/orderDiscountForm.test.ts`
- Modify: `../davinci-react/src/components/accounting/OrderDiscountPage.tsx`
- Modify: `../davinci-react/src/locales/en/translation.json`
- Modify: `../davinci-react/src/locales/tr/translation.json`

**Interfaces:**
- Produces: `OrderDiscount.isCustom?: boolean`.
- Produces: `getDiscountValueFieldState(form): { typeRequired: boolean; typeDisabled: boolean; percentageRequired: boolean; percentageDisabled: boolean; amountRequired: boolean; amountDisabled: boolean }`.
- Consumes: existing `useOrderDiscountMutations()` with `isCustom` in create/update payloads.

- [ ] **Step 1: Write failing form-state tests**

Test that custom mode disables and makes optional the type, percentage, and amount fields; percentage mode requires only percentage; amount mode requires only amount; and leaving custom mode requires a type again.

- [ ] **Step 2: Run the form-state test and verify it fails**

Run from `davinci-react`: `yarn test src/components/accounting/orderDiscountForm.test.ts`

Expected: FAIL because the helper and type do not exist.

- [ ] **Step 3: Add the type and form-state helper**

Add `isCustom?: boolean` to `OrderDiscount`. Implement the typed pure helper and use it as the sole source of required/disabled state for the three preset-value inputs.

- [ ] **Step 4: Add Custom Discount controls to the administration UI**

In `OrderDiscountPage.tsx`:

- add `isCustom: false` to initial form state and `formKeys`;
- add a Custom Discount checkbox before Type;
- give it invalidation entries for `type`, `percentage`, and `amount`;
- add a Custom Discount table column and check/close renderer;
- in edit mode, populate `type` only for non-custom records;
- add an editable `CheckSwitch` handler for `isCustom` and rely on the API to reject a conflicting record.

Add English and Turkish strings for `Custom Discount` (`Özel İndirim`).

- [ ] **Step 5: Run the focused test, lint, and build**

Run: `yarn test src/components/accounting/orderDiscountForm.test.ts`

Expected: PASS.

Run: `yarn lint`

Expected: no new lint errors.

Run: `yarn build`

Expected: PASS.

- [ ] **Step 6: Commit the administration UI**

```bash
git add src/types/index.ts src/components/accounting/orderDiscountForm.ts src/components/accounting/orderDiscountForm.test.ts src/components/accounting/OrderDiscountPage.tsx src/locales/en/translation.json src/locales/tr/translation.json
git commit -m "feat: configure custom order discounts"
```

### Task 5: Build the Custom Discount Dialog

**Files:**
- Create: `../davinci-react/src/components/orders/orderPayment/orderList/customDiscount.ts`
- Create: `../davinci-react/src/components/orders/orderPayment/orderList/customDiscount.test.ts`
- Create: `../davinci-react/src/components/orders/orderPayment/orderList/CustomDiscountDialog.tsx`
- Create: `../davinci-react/src/components/orders/orderPayment/orderList/CustomDiscountDialog.test.tsx`
- Modify: `../davinci-react/src/locales/en/translation.json`
- Modify: `../davinci-react/src/locales/tr/translation.json`

**Interfaces:**
- Produces: `CustomDiscountValues = { totalDiscountAmount: number; affectedQuantity: number; note: string }`.
- Produces: `validateCustomDiscountValues(values, { maxQuantity, unitPrice, noteRequired }): string | null`, returning a translation key.
- Produces: `CustomDiscountDialog` props `{ isOpen, order, itemName, discount, isPending, close, submit }`, where `submit(values: CustomDiscountValues): void`.

- [ ] **Step 1: Write failing validation tests**

Cover amount `0`, negative, `NaN`, `Infinity`, above `unitPrice * quantity`, quantity `0`, fractional, above remaining, missing required note, and valid boundary values. Assert a total exactly equal to the selected items total is valid.

- [ ] **Step 2: Write failing dialog interaction tests**

Render a two-unit order and assert product name and remaining quantity are visible, affected quantity defaults to `1`, invalid values do not call `submit`, valid amount/quantity/note values call `submit` exactly, the dialog remains mounted after `submit`, and Apply is disabled while pending.

- [ ] **Step 3: Run the new tests and verify they fail**

Run: `yarn test src/components/orders/orderPayment/orderList/customDiscount.test.ts src/components/orders/orderPayment/orderList/CustomDiscountDialog.test.tsx`

Expected: FAIL because the helper and dialog do not exist.

- [ ] **Step 4: Implement validation and the dialog**

Use the existing Headless UI `Dialog`/`Transition` pattern and `GenericButton`. Compute `maxQuantity = order.quantity - order.paidQuantity`; keep input strings until submit; reset fields to amount empty, quantity `1`, and note empty when a different order opens.

Add localized strings for Apply Custom Discount, Total Discount Amount, Affected Quantity, remaining quantity, and every validation error in English and Turkish.

- [ ] **Step 5: Run focused tests and build**

Run: `yarn test src/components/orders/orderPayment/orderList/customDiscount.test.ts src/components/orders/orderPayment/orderList/CustomDiscountDialog.test.tsx`

Expected: PASS.

Run: `yarn build`

Expected: PASS.

- [ ] **Step 6: Commit the dialog**

```bash
git add src/components/orders/orderPayment/orderList/customDiscount.ts src/components/orders/orderPayment/orderList/customDiscount.test.ts src/components/orders/orderPayment/orderList/CustomDiscountDialog.tsx src/components/orders/orderPayment/orderList/CustomDiscountDialog.test.tsx src/locales/en/translation.json src/locales/tr/translation.json
git commit -m "feat: add custom discount entry dialog"
```

### Task 6: Integrate the Unpaid-Order Action and API Payload

**Files:**
- Modify: `../davinci-react/src/utils/api/order/order.ts`
- Modify: `../davinci-react/src/components/orders/orderPayment/orderList/customDiscount.ts`
- Modify: `../davinci-react/src/components/orders/orderPayment/orderList/customDiscount.test.ts`
- Modify: `../davinci-react/src/components/orders/orderPayment/orderList/UnpaidOrders.tsx`
- Modify: `../davinci-react/src/components/orders/orderPayment/orderList/OrderLists.tsx`
- Create: `../davinci-react/src/components/orders/orderPayment/orderList/UnpaidOrders.test.tsx`

**Interfaces:**
- Produces: exported `CreateOrderForDiscountPayload` in `utils/api/order/order.ts`, including optional `customDiscountAmount?: number`.
- Produces: `findApplicableCustomDiscount(discounts: OrderDiscount[], isOnlineSale: boolean): OrderDiscount | undefined`.
- Produces: `buildCustomDiscountPayload(order: Order, discount: OrderDiscount, values: CustomDiscountValues): CreateOrderForDiscountPayload`.
- Consumes: `CustomDiscountDialog` and `useCreateOrderForDiscountMutation()`.
- Changes: `UnpaidOrders` receives `table: Table` in addition to existing props.

- [ ] **Step 1: Write failing eligibility and payload tests**

Test that only a non-deleted `isCustom` discount enabled for the current online/store channel is returned. Test deleted and wrong-channel definitions return `undefined`. Test the payload contains one order with current total quantity, selected affected quantity, order ID, custom discount ID, entered total as `customDiscountAmount`, and optional trimmed note; it must not populate the fixed-discount `discountAmount` field.

- [ ] **Step 2: Write failing unpaid-row rendering tests**

Mock data, discount, and mutation hooks. Assert the accessible Apply Custom Discount icon appears only for an undiscounted order with remaining unpaid quantity and an applicable definition; opens the clicked order's dialog; submits the exact payload; and closes only through mutation `onSuccess`, while `onError` leaves it open.

- [ ] **Step 3: Run integration tests and verify they fail**

Run: `yarn test src/components/orders/orderPayment/orderList/customDiscount.test.ts src/components/orders/orderPayment/orderList/UnpaidOrders.test.tsx`

Expected: FAIL because eligibility, payload construction, and row integration do not exist.

- [ ] **Step 4: Export the payload type and implement helpers**

Rename local `CreateOrderForDiscount` to exported `CreateOrderForDiscountPayload` and update the function/hook generics. Implement the pure eligibility and payload builders.

- [ ] **Step 5: Add the icon, dialog state, and mutation flow**

Pass `table` from `OrderLists` to `UnpaidOrders`. Resolve the applicable custom definition once, keep the clicked order in local state, and render an icon with `aria-label={t('Apply Custom Discount')}` only for an eligible undiscounted row. Stop propagation so the icon does not select payment units.

On submit, call `mutate(buildCustomDiscountPayload(...), { onSuccess: closeDialog })`; do not close optimistically. Render one dialog outside the row map for the selected order and mutation pending state.

- [ ] **Step 6: Run all React checks**

Run: `yarn test`

Expected: all Vitest suites PASS.

Run: `yarn lint`

Expected: no new lint errors.

Run: `yarn build`

Expected: PASS.

- [ ] **Step 7: Commit the unpaid-order integration**

```bash
git add src/utils/api/order/order.ts src/components/orders/orderPayment/orderList/customDiscount.ts src/components/orders/orderPayment/orderList/customDiscount.test.ts src/components/orders/orderPayment/orderList/UnpaidOrders.tsx src/components/orders/orderPayment/orderList/OrderLists.tsx src/components/orders/orderPayment/orderList/UnpaidOrders.test.tsx
git commit -m "feat: apply custom discounts from unpaid orders"
```

### Task 7: Cross-Project Regression Verification

**Files:**
- Verify only; modify a file only if a failing check identifies a feature regression.

**Interfaces:**
- Consumes: all API and React interfaces from Tasks 1–6.
- Produces: a verified feature with no uncommitted generated build artifacts.

- [ ] **Step 1: Run complete API verification**

From `davinci-api` run `yarn test --runInBand`, `yarn build`, and `git diff --check`.

Expected: all commands PASS.

- [ ] **Step 2: Run complete React verification**

From `davinci-react` run `yarn test`, `yarn lint`, `yarn build`, and `git diff --check`.

Expected: all commands PASS with no new warnings attributable to the feature.

- [ ] **Step 3: Inspect final repository state**

Run `git status --short` and `git log -5 --oneline` in both repositories. Confirm only the user's pre-existing API edits remain uncommitted and all custom-discount work is committed in logical changes.

- [ ] **Step 4: Perform a focused code review**

Verify custom totals are not rounded before persistence, validation occurs before writes, mutation errors leave the dialog open, fixed discounts still use their existing workflow, and no Shopify discount code changed.
