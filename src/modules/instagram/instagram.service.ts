import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { firstValueFrom } from 'rxjs';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { InstagramToken } from './instagram-token.schema';

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

type InstagramRefreshResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

const TOKEN_KEY = 'default';

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  private readonly baseUrl = 'https://graph.instagram.com';

  private readonly seedToken?: string;

  private readonly cacheTtlSeconds = 3 * 60 * 60; // 3 saat

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly redisService: RedisService,
    @InjectModel(InstagramToken.name)
    private readonly instagramTokenModel: Model<InstagramToken>,
  ) {
    this.seedToken = this.configService.get<string>('INSTAGRAM_ACCESS_TOKEN');
  }

  private async getAccessToken(): Promise<string> {
    const stored = await this.instagramTokenModel
      .findOne({ key: TOKEN_KEY })
      .lean();
    if (stored?.accessToken) {
      return stored.accessToken;
    }

    if (!this.seedToken) {
      throw new InternalServerErrorException(
        'Instagram access token is not configured',
      );
    }

    await this.instagramTokenModel.updateOne(
      { key: TOKEN_KEY },
      { $set: { accessToken: this.seedToken } },
      { upsert: true },
    );
    this.logger.log('Seeded Instagram access token from environment variable');
    return this.seedToken;
  }

  async refreshAccessToken(): Promise<{
    accessToken: string;
    expiresAt: Date;
  }> {
    const currentToken = await this.getAccessToken();

    const { data } = await firstValueFrom(
      this.httpService.get<InstagramRefreshResponse>(
        `${this.baseUrl}/refresh_access_token`,
        {
          params: {
            grant_type: 'ig_refresh_token',
            access_token: currentToken,
          },
          timeout: 10000,
        },
      ),
    );

    if (!data?.access_token) {
      throw new InternalServerErrorException(
        'Instagram token refresh returned no access token',
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (data.expires_in ?? 0) * 1000);

    await this.instagramTokenModel.updateOne(
      { key: TOKEN_KEY },
      {
        $set: {
          accessToken: data.access_token,
          expiresAt,
          lastRefreshedAt: now,
        },
      },
      { upsert: true },
    );

    return { accessToken: data.access_token, expiresAt };
  }

  async getPosts(rawLimit: number) {
    const limit = Math.max(1, Math.min(rawLimit || 8, 12));
    const cacheKey = `${RedisKeys.InstagramPosts}:${limit}`;
    const staleFallbackKey = `${RedisKeys.InstagramPosts}:last-success:${limit}`;

    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const accessToken = await this.getAccessToken();
      const posts = await this.fetchPosts(accessToken, limit);

      const payload = { data: posts };
      await Promise.all([
        this.redisService.set(cacheKey, payload, this.cacheTtlSeconds),
        this.redisService.set(staleFallbackKey, payload, 60 * 60 * 24 * 14),
      ]);
      return payload;
    } catch (error: any) {
      const errorCode = error?.response?.data?.error?.code;
      const errorMessage =
        error?.response?.data?.error?.message ||
        error?.message ||
        'unknown error';
      if (errorCode === 190) {
        this.logger.error(
          `Instagram access token is invalid or expired (code: ${errorCode}). Message: ${errorMessage}`,
        );
      }
      this.logger.error(`Instagram posts fetch failed: ${errorMessage}`);

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

  private async fetchPosts(
    accessToken: string,
    limit: number,
  ): Promise<InstagramMediaItem[]> {
    const fields =
      'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username';

    const { data } = await firstValueFrom(
      this.httpService.get<InstagramGraphResponse>(`${this.baseUrl}/me/media`, {
        params: {
          fields,
          limit,
          access_token: accessToken,
        },
        timeout: 10000,
      }),
    );

    return (data?.data ?? []).filter((post) =>
      Boolean(post?.id && post?.permalink),
    );
  }
}
