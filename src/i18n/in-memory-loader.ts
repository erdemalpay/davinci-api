import { I18nLoader } from 'nestjs-i18n';
import en from './en/common.json';
import tr from './tr/common.json';

export class InMemoryLoader implements I18nLoader {
  async languages(): Promise<string[]> {
    return ['en', 'tr'];
  }
  async load() {
    return {
      en: { common: en },
      tr: { common: tr },
    };
  }
}
