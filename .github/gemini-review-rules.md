Bu proje NestJS + Mongoose ile yazılmış bir backend API. Her özellik `src/modules/<ad>/` altında `module`, `schema`, `dto`, `controller`, `service` ve `service.spec` dosyalarıyla aynı yapıyı izliyor.

- **Controller (`*.controller.ts`):** İnce kalmalı; sadece param/DTO alıp service'i çağırmalı. İş mantığı controller'a yazılmışsa belirt.
- **Yetkilendirme:** `JwtAuthGuard` ve `RolesGuard` global olarak uygulanıyor. Yeni eklenen `@Public()` veya `@ApiTokenProtected()` kullanımlarını güvenlik açısından mutlaka sorgula. `RolesGuard` eşleşen Authorization kaydı yoksa erişime **izin veriyor**; yeni endpoint için bu risk PR açıklamasında ele alınmamışsa hatırlat.
- **Service (`*.service.ts`):** İş mantığı burada olmalı. Birden fazla dokümanı atomik güncellemesi gereken işlemler `session` taşımalı ve Mongoose çağrıları `withSession(...)` ile sarılmalı; eksikse veri tutarsızlığı riski olarak işaretle.
- **Real-time:** Panelde görünen bir entity değiştiriliyorsa `AppWebSocketGateway` üzerindeki ilgili `emitXChanged()` çağrılmalı. Yeni bir gateway oluşturulmamalı; yeni entity için mevcut gateway'e emitter eklenmeli.
- **Eşzamanlılık:** Çift gönderime açık işlemlerde (ödeme, sipariş oluşturma, stok düşme vb.) `@RaceConditionLockDecorator` + `LockInterceptor` kullanımını değerlendir.
- **DTO (`*.dto.ts`):** Alanlarda class-validator dekoratörleri eksiksiz olmalı. `ValidationPipe` `transform: true` ve `enableImplicitConversion: true` ile çalıştığı için tip dönüşümü kaynaklı hataları (ör. "false" string'inin boolean'a dönüşümü) kontrol et.
- **Marketplace modülleri (`shopify`, `trendyol`, `ikas`, `hepsiburada`):** Aynı yapıdalar ama ortak base class yok. Birinde yapılan değişikliğin diğerlerinde de gerekip gerekmediğini belirt. Marketplace kimlik bilgileri MongoDB'de tutuluyor; koda, config'e veya log'a credential yazılmışsa kritik olarak işaretle.
- **Config ve secret'lar:** `config/*.json` dosyalarına secret (şifre, token, API key) yazılmamalı; secret'lar `.env`'de olmalı.
- **Testler:** Bir service'in davranışı değiştiyse ve değişen dosyalar listesinde o modülün `*.service.spec.ts` dosyası yoksa, bunu özette tek cümleyle belirt (satır yorumu yazma).
- **Performans:** Döngü içinde veritabanı sorgusu (N+1), index'siz alanlarda filtreleme ve sayfalama olmadan tüm koleksiyonu çekme gibi durumları işaretle.
