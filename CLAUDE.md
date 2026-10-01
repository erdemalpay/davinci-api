# davinci-api

NestJS 8 + Mongoose 6 backend for the Da Vinci board game cafe panel (orders, tables, menu, stock/accounting, shifts) and its sales channels (Shopify, ikas, Trendyol, Hepsiburada). The frontend is `../davinci-react`; most features touch both repos.

## Commands

```bash
yarn start:dev                         # watch mode, NODE_ENV=development, port 4000
yarn build                             # nest build + copy src/assets
yarn test                              # all jest specs (src/**/*.spec.ts)
npx jest src/modules/order/order.service.spec.ts   # single spec
npx tsc --noEmit -p tsconfig.json      # typecheck
npx prettier --check <files>           # formatting
```

`yarn lint` is currently broken (`.eslintrc.js` extends `prettier/@typescript-eslint`, removed in eslint-config-prettier 8). Use `tsc` + `prettier` until it is fixed.

Swagger UI is served at `/docs`.

## Configuration

- Non-secret settings live in `config/<NODE_ENV>.json` (node-config, read with `config.get(...)`). Environments: `development`, `staging`, `production`, `franchise1`, `migration`.
- Secrets come from `.env` and are read with `ConfigService` (global). Code usually picks the production or staging key with `process.env.NODE_ENV === 'production'` (see `shopify.service.ts` constructor).
- A new secret must also be added to `.github/workflows/node.js.yml` (both the `env:` block and the `echo ... >> .env` lines). The production deploy reuses the `.env` that workflow writes to the server.
- Local dev needs MongoDB as a **replica set** (transactions are used) and Redis.

## Deploy

- Push to `master` → builds and deploys **staging** (`node.js.yml`). Push to `franchise1` → franchise1.
- Push to `production` → deploys production and franchise1 (`production.yml`).
- CI runs no tests or lint before deploying, so run `yarn test` and `tsc` yourself before pushing.

## Architecture and conventions

- One folder per domain under `src/modules/<name>/` with `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.dto.ts`, `*.schema.ts`. The Swagger CLI plugin (`nest-cli.json`) documents `.dto.ts` and `.schema.ts` classes automatically.
- **IDs are auto-increment numbers**, not ObjectIds. Register models with `MongooseModule.forFeatureAsync([createAutoIncrementConfig(Model.name, Schema)])` (`src/lib/autoIncrement.ts`). Call `purifySchema(Schema)` on new schemas.
- **Realtime updates:** after a write, call the matching `this.websocketGateway.emitXChanged()` (`src/modules/websocket/websocket.gateway.ts`). The frontend invalidates React Query caches by event name, so add a new event in both places (see `../davinci-react/src/hooks/socketConstant.ts`).
- **Transactions:** pass sessions with `withSession(opts, session)` (`src/utils/withSession.ts`). Methods that accept `SessionOpts` use `deferEmit` to hold websocket emits until the transaction commits.
- Cross-module calls go through services. Circular dependencies are common and are resolved with `forwardRef(() => XModule)` / `@Inject(forwardRef(() => XService))`.
- Activity/audit logging: `ActivityService.addActivity` / `addUpdateActivity` with an `ActivityType`.
- `order.service.ts`, `shopify.service.ts` and `accounting.service.ts` are very large (5–7k lines). Read the relevant section instead of the whole file, and put new logic in a separate service when it is a distinct concern.

## Auth

- Global guards (`main.ts`): `JwtAuthGuard` then `RolesGuard`. Every route requires a JWT unless marked.
- `@Public()` skips both guards. Use it only for truly public endpoints.
- `@ApiTokenProtected('CONFIG_KEY')` is for server-to-server endpoints (bearer or `x-api-token`).
- `RolesGuard` reads path+method → roles records from the `authorization` collection (cached in Redis) and matches on `req.path`. **Routes without a record are allowed for any logged-in user.** Role IDs are numbers (`user.role._id`).

## Tests

Jest + ts-jest, specs next to the code (`*.spec.ts`). Existing specs mostly unit-test services and guards with hand-written mocks (see `src/modules/auth/api-token.guard.spec.ts`). The `NODE_ENV 'test' did not match any deployment config` warning is expected.
