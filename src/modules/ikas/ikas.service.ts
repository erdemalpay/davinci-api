import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { IkasGateway } from './ikas.gateway';

@Injectable()
export class IkasService {
  private readonly tokenPayload: Record<string, string>;

  constructor(
    private readonly configService: ConfigService,
    private readonly ikasGateway: IkasGateway,
    private readonly redisService: RedisService,
    private readonly httpService: HttpService,
  ) {
    this.tokenPayload = {
      grant_type: 'client_credentials',
      client_id: this.configService.get<string>('IKAS_CLIENT_ID'),
      client_secret: this.configService.get<string>('IKAS_API_SECRET'),
    };
  }

  isTokenExpired(createdAt: number, expiresIn: number): boolean {
    const expiresInMs = expiresIn * 1000;
    const currentTime = new Date().getTime();
    return currentTime - createdAt > expiresInMs;
  }

  async getToken() {
    let ikasToken = await this.redisService.get(RedisKeys.IkasToken);
    if (
      !ikasToken ||
      this.isTokenExpired(ikasToken.createdAt, ikasToken.expiresIn)
    ) {
      const apiUrl = 'https://davinci.myikas.com/api/admin/oauth/token';
      await this.redisService.reset(RedisKeys.IkasToken);
      try {
        const response = await this.httpService
          .post(apiUrl, this.tokenPayload, {
            headers: { 'Content-Type': 'application/json' },
          })
          .toPromise();
        ikasToken = {
          token: response.data.access_token,
          createdAt: new Date().getTime(),
          expiresIn: response.data.expires_in,
        };
        await this.redisService.set(RedisKeys.IkasToken, ikasToken);

        return ikasToken.token;
      } catch (error) {
        console.error('Error fetching Ikas token:', error.message);
        throw new Error('Unable to fetch Ikas token');
      }
    }
    return ikasToken.token;
  }
  async getAllProducts(): Promise<any> {
    const token = await this.getToken();
    const apiUrl = 'https://api.myikas.com/api/v1/admin/graphql';

    const query = {
      query: `{
    listProduct {
      data {
        id
        name
        createdAt
        variants {
          id
          images {
             fileName
             imageId
          }
        }
      }
    }
  }`,
    };

    try {
      const response = await this.httpService
        .post(apiUrl, query, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })
        .toPromise();

      return response.data;
    } catch (error) {
      if (error.response) {
        console.error(
          'Error fetching products:',
          JSON.stringify(error.response.data),
        );
      } else {
        console.error('Error fetching products:', error.message);
      }
      throw new Error('Unable to fetch products from Ikas.');
    }
  }
}
