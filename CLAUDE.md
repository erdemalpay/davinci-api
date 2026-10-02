# davinci-api

Da Vinci kutu oyunu kafesinin paneli (siparişler, masalar, menü, stok/muhasebe, vardiyalar) ve satış kanalları (Shopify, ikas, Trendyol, Hepsiburada) için NestJS 8 + Mongoose 6 backend. Frontend `../davinci-react` reposunda; özelliklerin çoğu iki repoya da dokunur.

## Komutlar

```bash
yarn start:dev                         # watch modu, NODE_ENV=development, port 4000
yarn build                             # nest build + src/assets kopyalama
yarn test                              # tüm jest spec'leri (src/**/*.spec.ts)
npx jest src/modules/order/order.service.spec.ts   # tek bir spec
npx tsc --noEmit -p tsconfig.json      # tip kontrolü
yarn lint                              # eslint --fix (dosyaları değiştirir)
npx prettier --check <dosyalar>        # format kontrolü
```

`yarn lint` `--fix` ile çalışır ve dosyaları değiştirir. Sadece kontrol için: `npx eslint "{src,apps,libs,test}/**/*.ts"`. Lint 0 hata ile geçmeli; mevcut `no-unused-vars` uyarıları biliniyor.

Swagger arayüzü `/docs` adresinde.

## Konfigürasyon

- Gizli olmayan ayarlar `config/<NODE_ENV>.json` içinde (node-config, `config.get(...)` ile okunur). Ortamlar: `development`, `staging`, `production`, `franchise1`, `migration`.
- Secret'lar `.env`'den gelir ve (global) `ConfigService` ile okunur. Kod genelde production ya da staging anahtarını `process.env.NODE_ENV === 'production'` ile seçer (bkz. `shopify.service.ts` constructor).
- Yeni bir secret `.github/workflows/node.js.yml`'a da eklenmeli (hem `env:` bloğuna hem `echo ... >> .env` satırlarına). Production deploy'u, bu workflow'un sunucuya yazdığı `.env`'i kullanır.
- Lokal geliştirme için MongoDB'nin **replica set** olarak çalışması (transaction kullanılıyor) ve Redis gerekir.

## Deploy

- `master`'a push → **staging**'e build + deploy (`node.js.yml`). `franchise1`'e push → franchise1.
- `production`'a push → production ve franchise1'e deploy (`production.yml`).
- CI deploy'dan önce test veya lint çalıştırmaz; push etmeden önce `yarn lint`, `tsc` ve `yarn test`'i kendin çalıştır.

## Mimari ve kurallar

- Her domain için `src/modules/<isim>/` altında bir klasör: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.dto.ts`, `*.schema.ts`. Swagger CLI plugin'i (`nest-cli.json`) `.dto.ts` ve `.schema.ts` class'larını otomatik dokümante eder.
- **ID'ler ObjectId değil, auto-increment sayılardır.** Modelleri `MongooseModule.forFeatureAsync([createAutoIncrementConfig(Model.name, Schema)])` ile kaydet (`src/lib/autoIncrement.ts`). Yeni schema'larda `purifySchema(Schema)` çağır.
- **Gerçek zamanlı güncellemeler:** bir yazma işleminden sonra ilgili `this.websocketGateway.emitXChanged()`'i çağır (`src/modules/websocket/websocket.gateway.ts`). Frontend React Query cache'lerini event adına göre invalidate eder; yeni bir event'i iki tarafa da ekle (bkz. `../davinci-react/src/hooks/socketConstant.ts`).
- **Transaction'lar:** session'ları `withSession(opts, session)` ile geçir (`src/utils/withSession.ts`). `SessionOpts` alan metotlar, websocket emit'lerini transaction commit olana kadar bekletmek için `deferEmit` kullanır.
- Modüller arası çağrılar servisler üzerinden yapılır. Döngüsel bağımlılıklar yaygındır ve `forwardRef(() => XModule)` / `@Inject(forwardRef(() => XService))` ile çözülür.
- Aktivite/denetim kaydı: `ActivityService.addActivity` / `addUpdateActivity` + bir `ActivityType`.
- `order.service.ts`, `shopify.service.ts` ve `accounting.service.ts` çok büyük (5–7 bin satır). Dosyanın tamamı yerine ilgili bölümü oku. Yeni mantık ayrı bir konuysa ayrı bir servise koy.

## Yetkilendirme

- Global guard'lar (`main.ts`): önce `JwtAuthGuard`, sonra `RolesGuard`. İşaretlenmemiş her route JWT ister.
- `@Public()` iki guard'ı da atlar; sadece gerçekten herkese açık uçlarda kullan.
- `@ApiTokenProtected('CONFIG_KEY')` sunucudan sunucuya uçlar içindir (bearer veya `x-api-token`).
- `@ShopifyWebhook()` Shopify webhook'ları içindir (ham body üzerinden HMAC doğrulaması, `src/modules/shopify/shopify-webhook.guard.ts`). Secret: `SHOPIFY_WEBHOOK_SECRET` / `SHOPIFY_STAGING_WEBHOOK_SECRET`, yoksa app secret.
- `RolesGuard`, `authorization` koleksiyonundaki path+method → roller kayıtlarını okur (Redis'te cache'lenir) ve route pattern'i ile eşleştirir (`req.route.path`, ör. `/order/:id`). **Kaydı olmayan route'lara giriş yapmış her kullanıcı erişebilir.** Rol ID'leri sayıdır (`user.role._id`).

## Testler

Jest + ts-jest; spec'ler kodun yanında (`*.spec.ts`). Mevcut spec'ler çoğunlukla servisleri ve guard'ları elle yazılmış mock'larla birim test eder (bkz. `src/modules/auth/api-token.guard.spec.ts`). `NODE_ENV 'test' did not match any deployment config` uyarısı beklenen bir durum.
