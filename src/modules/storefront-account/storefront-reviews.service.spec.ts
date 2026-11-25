import { HttpException } from '@nestjs/common';

jest.mock('../shopify/shopify.service', () => ({
  ShopifyService: class {},
}));
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }));

import axios from 'axios';

import {
  reviewStatus,
  StorefrontReviewsService,
  toMyReview,
} from './storefront-reviews.service';

const review = (overrides: Record<string, any> = {}) => ({
  id: 1,
  title: null,
  body: 'Çok güzel',
  rating: 5,
  reviewer: { id: 10 },
  curated: 'ok',
  published: true,
  hidden: false,
  created_at: '2026-11-20T10:00:00+00:00',
  product_title: 'Trio (Türkçe)',
  product_handle: 'trio',
  pictures: [],
  ...overrides,
});

const jsonResponse = (status: number, data: any) => ({ status, data });

describe('reviewStatus', () => {
  it('maps Judge.me flags', () => {
    expect(reviewStatus(review())).toBe('published');
    expect(reviewStatus(review({ published: false, curated: 'not-yet' }))).toBe(
      'pending',
    );
    expect(reviewStatus(review({ hidden: true }))).toBe('hidden');
    expect(reviewStatus(review({ published: false, curated: 'spam' }))).toBe(
      'hidden',
    );
  });
});

describe('toMyReview', () => {
  it('keeps visible pictures only', () => {
    const result = toMyReview(
      review({
        pictures: [
          { hidden: false, urls: { small: 's.jpg', huge: 'h.jpg' } },
          { hidden: true, urls: { small: 'x.jpg', huge: 'y.jpg' } },
        ],
      }),
    );
    expect(result.pictures).toEqual([{ small: 's.jpg', large: 'h.jpg' }]);
    expect(result.productHandle).toBe('trio');
  });
});

describe('StorefrontReviewsService.getMyReviews', () => {
  const config = (token = 'tok') => ({
    get: (key: string) => (key === 'JUDGEME_API_TOKEN' ? token : undefined),
  });
  const shopify = (email: string | null) => ({
    adminGraphQL: jest.fn(async () => ({
      customer: { defaultEmailAddress: email ? { emailAddress: email } : null },
    })),
  });
  const fetchMock = axios.get as jest.Mock;

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('merges reviews found by customer id and by email, newest first', async () => {
    fetchMock.mockImplementation(async (url: string, { params }: any) => {
      expect(params.api_token).toBe('tok');
      if (url.endsWith('/reviewers/-1')) {
        if (params.external_id === '555') {
          return jsonResponse(200, { reviewer: { id: 10 } });
        }
        return jsonResponse(200, { reviewer: { id: 20 } });
      }
      const reviewerId = Number(params.reviewer_id);
      if (reviewerId === 10) {
        return jsonResponse(200, {
          reviews: [review({ id: 1, reviewer: { id: 10 } })],
        });
      }
      return jsonResponse(200, {
        reviews: [
          review({
            id: 2,
            reviewer: { id: 20 },
            created_at: '2026-11-24T10:00:00+00:00',
          }),
          // a review of someone else must never leak through
          review({ id: 3, reviewer: { id: 99 } }),
        ],
      });
    });
    const service = new StorefrontReviewsService(
      config() as any,
      shopify('a@b.com') as any,
    );
    const { reviews } = await service.getMyReviews('555');
    expect(reviews.map((r) => r.id)).toEqual([2, 1]);
  });

  it('returns an empty list when the customer never reviewed', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { error: 'Reviewer not found' }),
    );
    const service = new StorefrontReviewsService(
      config() as any,
      shopify('a@b.com') as any,
    );
    await expect(service.getMyReviews('555')).resolves.toEqual({
      reviews: [],
    });
  });

  it('fails cleanly without a token', async () => {
    const service = new StorefrontReviewsService(
      config('') as any,
      shopify(null) as any,
    );
    await expect(service.getMyReviews('555')).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
