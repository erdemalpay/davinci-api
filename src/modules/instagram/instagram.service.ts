import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '../redis/redis.service';

type InstagramMediaItem = {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  permalink?: string;
  thumbnail_url?: string;
  timestamp?: string;
  username?: string;
};

type InstagramGraphResponse = {
  data?: InstagramMediaItem[];
};

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private readonly baseUrl = 'https://graph.instagram.com';
  private readonly accessToken: string;
  private readonly cacheTtlSeconds = 600;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly redisService: RedisService,
  ) {
    this.accessToken = this.configService.get<string>('INSTAGRAM_ACCESS_TOKEN');
  }

  async getPosts(rawLimit: number) {
    if (!this.accessToken) {
      throw new InternalServerErrorException(
        'Instagram access token is not configured',
      );
    }

    const limit = Math.max(1, Math.min(rawLimit || 8, 12));
    const cacheKey = `instagram-posts:${limit}`;
    const staleFallbackKey = `instagram-posts:last-success:${limit}`;

    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const fields =
        'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username';

      const { data } = await firstValueFrom(
        this.httpService.get<InstagramGraphResponse>(`${this.baseUrl}/me/media`, {
          params: {
            fields,
            limit,
            access_token: this.accessToken,
          },
          timeout: 10000,
        }),
      );

      const posts = (data?.data ?? []).filter(
        (post) => Boolean(post?.id && post?.permalink),
      );

      const payload = { data: posts };
      await this.redisService.set(cacheKey, payload, this.cacheTtlSeconds);
      await this.redisService.set(staleFallbackKey, payload, 60 * 60 * 24 * 14);
      return payload;
    } catch (error: any) {
      const errorCode = error?.response?.data?.error?.code;
      const errorMessage =
        error?.response?.data?.error?.message || error?.message || 'unknown error';
      if (errorCode === 190) {
        this.logger.error(
          `Instagram access token is invalid or expired (code: ${errorCode}). Message: ${errorMessage}`,
        );
      }
      this.logger.error(
        `Instagram posts fetch failed: ${errorMessage}`,
      );

      const stalePayload = await this.redisService.get(staleFallbackKey);
      if (stalePayload?.data?.length) {
        this.logger.warn(
          'Serving stale Instagram posts from cache due to upstream failure',
        );
        return stalePayload;
      }

      throw new HttpException(
        'Failed to fetch Instagram posts',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}

