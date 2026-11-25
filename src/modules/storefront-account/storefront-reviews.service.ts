import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ShopifyService } from '../shopify/shopify.service';
import { customerGid } from './storefront-account.service';

const JUDGEME_API = 'https://judge.me/api/v1';
// Judge.me knows the store by its original myshopify domain.
const DEFAULT_JUDGEME_SHOP_DOMAIN = 'qu3yde-0z.myshopify.com';
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export type ReviewStatus = 'published' | 'pending' | 'hidden';

export type MyReview = {
  id: number;
  rating: number;
  title: string | null;
  body: string;
  createdAt: string;
  productTitle: string | null;
  productHandle: string | null;
  status: ReviewStatus;
  pictures: { small: string; large: string }[];
};

// Judge.me: published+visible reviews are live; "curated: not-yet" ones wait
// for approval; anything else unpublished or hidden is not shown on the site.
export function reviewStatus(review: any): ReviewStatus {
  if (review?.published && !review?.hidden) return 'published';
  if (review?.curated === 'not-yet') return 'pending';
  return 'hidden';
}

export function toMyReview(review: any): MyReview {
  return {
    id: review.id,
    rating: Number(review.rating) || 0,
    title: review.title || null,
    body: review.body || '',
    createdAt: review.created_at,
    productTitle: review.product_title || null,
    productHandle: review.product_handle || null,
    status: reviewStatus(review),
    pictures: (review.pictures ?? [])
      .filter((picture: any) => !picture?.hidden && picture?.urls)
      .map((picture: any) => ({
        small: picture.urls.small || picture.urls.compact,
        large: picture.urls.huge || picture.urls.original,
      }))
      .filter((picture: any) => picture.small && picture.large),
  };
}

// The signed-in customer's own Judge.me reviews for the "Profilim" page, so
// they don't have to leave kutuoyunual.com for Shopify's account pages.
@Injectable()
export class StorefrontReviewsService {
  private readonly logger = new Logger(StorefrontReviewsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly shopifyService: ShopifyService,
  ) {}

  private get apiToken() {
    return this.configService.get<string>('JUDGEME_API_TOKEN') || '';
  }

  private get shopDomain() {
    return (
      this.configService.get<string>('JUDGEME_SHOP_DOMAIN') ||
      DEFAULT_JUDGEME_SHOP_DOMAIN
    );
  }

  async getMyReviews(customerId: string): Promise<{ reviews: MyReview[] }> {
    if (!this.apiToken) {
      this.logger.warn('JUDGEME_API_TOKEN is not set');
      throw new HttpException(
        'Yorumların şu an yüklenemiyor.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const reviewerIds = await this.reviewerIds(customerId);
    const reviews: MyReview[] = [];
    const seen = new Set<number>();
    for (const reviewerId of reviewerIds) {
      for (const review of await this.reviewsOf(reviewerId)) {
        if (seen.has(review.id)) continue;
        seen.add(review.id);
        reviews.push(toMyReview(review));
      }
    }
    reviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { reviews };
  }

  // Reviews written while logged in carry the Shopify customer id
  // (external_id); older or guest reviews are only linked by email.
  private async reviewerIds(customerId: string): Promise<number[]> {
    const ids: number[] = [];
    const byId = await this.findReviewer({ external_id: customerId });
    if (byId) ids.push(byId);
    const email = await this.customerEmail(customerId);
    if (email) {
      const byEmail = await this.findReviewer({ email });
      if (byEmail && !ids.includes(byEmail)) ids.push(byEmail);
    }
    return ids;
  }

  private async customerEmail(customerId: string): Promise<string | null> {
    const data = await this.shopifyService.adminGraphQL<any>(
      `query CustomerEmail($id: ID!) {
        customer(id: $id) { defaultEmailAddress { emailAddress } }
      }`,
      { id: customerGid(customerId) },
    );
    return data?.customer?.defaultEmailAddress?.emailAddress || null;
  }

  private async findReviewer(query: Record<string, string>) {
    const res = await this.call('/reviewers/-1', query);
    if (res.status === 404) return null;
    return Number(this.body(res)?.reviewer?.id) || null;
  }

  private async reviewsOf(reviewerId: number): Promise<any[]> {
    const all: any[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await this.call('/reviews', {
        reviewer_id: String(reviewerId),
        per_page: String(PAGE_SIZE),
        page: String(page),
      });
      const batch = this.body(res)?.reviews ?? [];
      // Guard against the filter being ignored: keep only this reviewer's.
      all.push(
        ...batch.filter((review: any) => review?.reviewer?.id === reviewerId),
      );
      if (batch.length < PAGE_SIZE) break;
    }
    return all;
  }

  private call(path: string, query: Record<string, string>) {
    return axios.get(`${JUDGEME_API}${path}`, {
      params: {
        ...query,
        shop_domain: this.shopDomain,
        api_token: this.apiToken,
      },
      headers: { Accept: 'application/json' },
      timeout: 10_000,
      validateStatus: () => true,
    });
  }

  private body(res: { status: number; data: any }) {
    if (res.status < 200 || res.status >= 300) {
      this.logger.warn(
        `Judge.me ${res.status}: ${JSON.stringify(res.data)?.slice(0, 300)}`,
      );
      throw new HttpException(
        'Yorumların şu an yüklenemiyor.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return res.data;
  }
}
