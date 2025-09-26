import { Global, Module } from '@nestjs/common';
import { TProvider } from './t.provider';

@Global()
@Module({
  providers: [TProvider],
  exports: [TProvider],
})
export class I18nExtrasModule {}
