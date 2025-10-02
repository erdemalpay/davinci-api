// src/i18n/in-memory.loader.ts
import { Injectable } from '@nestjs/common';
import { I18nLoader } from 'nestjs-i18n';
import { EN } from '../i18n/en/en';
import { TR } from '../i18n/tr/tr';

@Injectable()
export class InMemoryLoader implements I18nLoader {
  async languages() {
    return ['en', 'tr'];
  }
  async load() {
    return { en: EN, tr: TR };
  }
}
