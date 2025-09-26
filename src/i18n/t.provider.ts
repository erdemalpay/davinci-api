import { Provider } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';

export type TFunction = <R = string>(
  key: string,
  args?: Record<string, any>,
  lang?: string,
) => Promise<R>;

export const T_FUNCTION = Symbol('T_FUNCTION');

export const TProvider: Provider = {
  provide: T_FUNCTION,
  useFactory: (i18n: I18nService): TFunction => {
    return async <R = string>(
      key: string,
      args?: Record<string, any>,
      lang?: string,
    ) => i18n.translate(key, { args, lang }) as Promise<R>;
  },
  inject: [I18nService],
};
