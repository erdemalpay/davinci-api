import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MenuService } from '../menu/menu.service';
import { LocalComparison } from './local-comparison.schema';

export interface SiteItemPrice {
  site: string;
  name: string;
  normalizedName: string;
  price: number;
  rawPrice: string;
}

export interface PriceHashmapValue {
  name: string;
  prices: Record<string, number>;
}

export interface SiteItemsResponse {
  site: string;
  totalItems: number;
  items: SiteItemPrice[];
}

export interface GlobalHashmapResponse {
  sites: Record<string, string>;
  totalItems: number;
  totalKeys: number;
  hashmap: Record<string, PriceHashmapValue>;
}

export interface LocalComparisonSyncResult {
  totalItems: number;
  totalKeys: number;
  inserted: number;
  updated: number;
  unchanged: number;
}

interface NeotroyAjaxResponse {
  html?: string;
  data?: unknown;
  content?: unknown;
  markup?: unknown;
  response?: unknown;
  result?: unknown;
}

interface KutugoAlgoliaHit {
  name?: string;
  price?: number | null;
  salePrice?: number | null;
}

interface KutugoAlgoliaResponse {
  hits?: KutugoAlgoliaHit[];
}

interface DaVinciMenuItem {
  name?: string;
  price?: number | null;
}

interface SimurgGraphqlPrice {
  discountPrice?: number | null;
  sellPrice?: number | null;
}

interface SimurgGraphqlVariant {
  prices?: SimurgGraphqlPrice[];
  sku?: string;
}

interface SimurgGraphqlProduct {
  name?: string;
  variants?: SimurgGraphqlVariant[];
}

interface SimurgSearchProductsResponse {
  count?: number;
  page?: number;
  limit?: number;
  results?: SimurgGraphqlProduct[];
}

interface SimurgGraphqlResponse {
  data?: {
    searchProducts?: SimurgSearchProductsResponse;
  };
}

interface SimurgSearchProductsRequestBody {
  query: string;
  variables: {
    input: {
      locale: string;
      page: number;
      perPage: number;
      filterList: unknown[];
      facetList: unknown[];
      categoryIdList: string[];
      salesChannelId: string;
      query: string;
      order: Array<{ direction: 'ASC' | 'DESC'; type: string }>;
      showStockOption: string;
    };
  };
}

@Injectable()
export class PriceCompareService {
  private readonly neotroySiteName = 'neotroy';
  private readonly neotroyUrl =
    'https://neotroygames.com/kutu-oyunlari/?product_cat=tum-oyunlar';
  private readonly neotroyAjaxUrl =
    'https://neotroygames.com/wp-admin/admin-ajax.php';
  private readonly neotroyAjaxNonce = '4ce9048cf9';
  private readonly neotroyAjaxCookies =
    '_fbp=fb.1.1775319837376.1254754023.AQ; rtsb_recently_viewed=47823; _gcl_au=1.1.209765330.1775319839; sbjs_migrations=1418474375998%3D1; sbjs_current_add=fd%3D2026-04-04%2016%3A23%3A58%7C%7C%7Cep%3Dhttps%3A%2F%2Fneotroygames.com%2Furun%2Fkingdom-builder%2F%7C%7C%7Crf%3D%28none%29; sbjs_first_add=fd%3D2026-04-04%2016%3A23%3A58%7C%7C%7Cep%3Dhttps%3A%2F%2Fneotroygames.com%2Furun%2Fkingdom-builder%2F%7C%7C%7Crf%3D%28none%29; sbjs_current=typ%3Dtypein%7C%7C%7Csrc%3D%28direct%29%7C%7C%7Cmdm%3D%28none%29%7C%7C%7Ccmp%3D%28none%29%7C%7C%7Ccnt%3D%28none%29%7C%7C%7Ctrm%3D%28none%29%7C%7C%7Cid%3D%28none%29%7C%7C%7Cplt%3D%28none%29%7C%7C%7Cfmt%3D%28none%29%7C%7C%7Ctct%3D%28none%29; sbjs_first=typ%3Dtypein%7C%7C%7Csrc%3D%28direct%29%7C%7C%7Cmdm%3D%28none%29%7C%7C%7Ccmp%3D%28none%29%7C%7C%7Ccnt%3D%28none%29%7C%7C%7Ctrm%3D%28none%29%7C%7C%7Cid%3D%28none%29%7C%7C%7Cplt%3D%28none%29%7C%7C%7Cfmt%3D%28none%29%7C%7C%7Ctct%3D%28none%29; _ga=GA1.1.1753338727.1775319839; cookie_notice_accepted=true; sbjs_udata=vst%3D4%7C%7C%7Cuip%3D%28none%29%7C%7C%7Cuag%3DMozilla%2F5.0%20%28Macintosh%3B%20Intel%20Mac%20OS%20X%2010_15_7%29%20AppleWebKit%2F537.36%20%28KHTML%2C%20like%20Gecko%29%20Chrome%2F145.0.0.0%20Safari%2F537.36; cf_clearance=dCQcUS8KXeTh1afPS2gugf8jAAhQsNvdpS9KN4h3Evs-1775497809-1.2.1.1-nRdyYh5S0wr8GzOxH7ObAcCN6iFIs3OoL1w6TNKx3uuHo4TJ3btI4csrGjgzp0F1USg1Kq2EIIAo9KcmU7b3G1TgpCWgGd0PBMj9Gr1eU6hnkR3HhnoiU1CFUJn9_NzbkkpmtYxVSEMwAOR4EgizJXak.kMOtRT34ZdSB26O..6JtCJre0aC9CBQE1.FzmF.DBkO3hCvobY7sNHxwUoUDyWLZt4X54hiOtbbfaqyGV8KI647sbpqH0TEhSMHsCou16UgZwPvm_M2nyfqNa9L1omGPTrMGoqHourTpXKVAGKKfrUktavCTn4AAdeAcTo3prqajT7zV.v6bmRNrToy0g; _lscache_vary=050ef426d4848d678684bc54cfc7f456; sbjs_session=pgs%3D3%7C%7C%7Ccpg%3Dhttps%3A%2F%2Fneotroygames.com%2Fkutu-oyunlari%2F; _ga_44WCG6860S=GS2.1.s1775497809$o4$g1$t1775498048$j60$l0$h1188741246';
  private readonly neotroyArchiveAjaxData = {
    widget: 'default',
    template: 'elementor/archive/archive-product',
    view_mode: 'grid',
    show_flash_sale: true,
    wishlist_button: true,
    comparison_button: false,
    quick_view_button: true,
    show_rating: true,
    show_pagination: true,
    cart_icon: { value: '', library: '' },
    wishlist_icon: {
      value: 'rtsb-icon rtsb-icon-heart-empty',
      library: 'rtsb-fonts',
    },
    wishlist_icon_added: {
      value: 'rtsb-icon rtsb-icon-heart',
      library: 'rtsb-fonts',
    },
    comparison_icon: { value: ' icon-toyup-alt-compare', library: 'flaticon' },
    comparison_icon_added: [],
    quick_view_icon: {
      value: 'rtsb-icon rtsb-icon-eye',
      library: 'rtsb-fonts',
    },
    prev_icon: { value: '', library: '' },
    next_icon: { value: '', library: '' },
    posts_per_page: 200,
    rtsb_order: 'ASC',
    rtsb_orderby: 'menu_order',
    tooltip_position: 'top',
  };
  private readonly neotroyFilterAjaxData = {
    taxonomy: 'product_cat',
    input: 'checkbox',
    multiple: true,
    relation: 'AND',
    tax_data: {
      'tum-oyunlar': 'Tüm Oyunlar',
      aile: 'Aile',
      aksesuarlar: 'Aksesuarlar',
      kooperatif: 'Kooperatif',
      parti: 'Parti',
      strateji: 'Strateji',
      yakinda: 'Yakında',
    },
  };
  private readonly kutugoSiteName = 'kutugo';
  private readonly kutugoUrl =
    'https://q4j3cpez1a-dsn.algolia.net/1/indexes/products/query?x-algolia-agent=Algolia%20for%20JavaScript%20(5.48.0)%3B%20Search%20(5.48.0)%3B%20Browser&x-algolia-api-key=d608ffa1823842a65bb837fd39ff95d3&x-algolia-application-id=Q4J3CPEZ1A';
  private readonly daVinciSiteName = 'davinci';
  private readonly d20TabletopSiteName = 'd20tabletop';
  private readonly d20TabletopBaseUrl =
    'https://d20tabletopgames.com/urun-kategori/kutu-oyunlari';
  private readonly goblinSiteName = 'goblin';
  private readonly goblinBaseUrl =
    'https://goblin-store.com/categories/kutu-oyunlari';
  private readonly simurgSiteName = 'simurg';
  private readonly simurgGraphqlUrl =
    'https://api.myikas.com/api/sf/graphql?op=searchProducts';
  private readonly simurgGraphqlQuery = `query searchProducts ($input: SearchInput!) {
				searchProducts (
					input: $input,
				) {count limit page results {name variants {prices {discountPrice sellPrice currencyCode currencySymbol}}}}
			}`;
  private readonly simurgCategoryId = 'dc07ce20-4dd5-4b63-9c42-c77dbbe4f675';
  private readonly simurgSalesChannelId =
    '13c4a747-2ac8-4abf-85a0-606826246d86';
  private readonly simurgGraphqlHeaders = {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    'content-type': 'application/json',
    origin: 'https://simurgoyun.com',
    priority: 'u=1, i',
    referer: 'https://simurgoyun.com/',
    'sec-ch-ua':
      '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    'x-api-key':
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJtIjoiZTFjNzBmNjktNmIwMy00ODY1LTk3M2UtZGFhOGM0ZjFjZTNmIiwic2YiOiJhYTc2OGQ4Zi01ZjExLTQ0MzktOTgwMS1lNmUxMDcwODUzYzkiLCJzZnQiOjEsInNsIjoiMTNjNGE3NDctMmFjOC00YWJmLTg1YTAtNjA2ODI2MjQ2ZDg2In0.loqI2M-HcoXmSFzQjB8hG2YAJQBcsCPmXmByv1fR2LI',
    'x-jid': '7d872d55-8dc6-460f-8ba6-3c4672f09ff1',
    'x-sfid': 'aa768d8f-5f11-4439-9801-e6e1070853c9',
    'x-sfrid': '829e4770-bf51-4964-9a55-2ba67208cc39',
    'x-sid': 'd06bc905-bfc8-4d97-b20e-ec43904af109',
    'x-timezone': 'America/Chicago',
    'x-vid': 'f18707e0-234d-4f46-9f46-a8bac8e80a81',
  };

  constructor(
    private readonly httpService: HttpService,
    private readonly menuService: MenuService,
    @InjectModel(LocalComparison.name)
    private readonly localComparisonModel: Model<LocalComparison>,
  ) {}

  normalizeItemName(name: string): string {
    return name
      .toLocaleLowerCase('tr-TR')
      .replace(/[^\p{L}\p{N}]+/gu, '')
      .trim();
  }

  async fetchNeotroyItems(): Promise<SiteItemsResponse> {
    const headers = {
      Accept: '*/*',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Origin: 'https://neotroygames.com',
      Referer: this.neotroyUrl,
      'Upgrade-Insecure-Requests': '1',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      Cookie: this.neotroyAjaxCookies,
      'sec-ch-ua':
        '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'X-Requested-With': 'XMLHttpRequest',
    };

    const payload = new URLSearchParams({
      action: 'rtsb_load_archive_template',
      __rtsb_wpnonce: this.neotroyAjaxNonce,
      loadMore: 'false',
      paged: '1',
      maxPage: '1',
      filterAjaxData: JSON.stringify(this.neotroyFilterAjaxData),
      archiveAjaxData: JSON.stringify(this.neotroyArchiveAjaxData),
      'terms[product_cat]': 'tum-oyunlar',
    });

    const response = await this.httpService.axiosRef.post<NeotroyAjaxResponse>(
      this.neotroyAjaxUrl,
      payload.toString(),
      {
        headers,
        timeout: 20000,
        validateStatus: (status) => status < 500,
      },
    );

    if (response.status >= 400) {
      throw new Error(`Neotroy request failed with status ${response.status}`);
    }

    const items = this.extractNeotroyItemsFromHtml(
      this.extractNeotroyHtmlFromResponse(response.data),
    );

    return {
      site: this.neotroySiteName,
      totalItems: items.length,
      items,
    };
  }

  async fetchKutugoItems(): Promise<SiteItemsResponse> {
    const payload = {
      query: '',
      hitsPerPage: 10000,
      page: 0,
      filters:
        'isUpcomingFlag = 0 AND (category.id:"1c89199a-beaa-46d3-9748-b3a57a568b9e" OR category.id:"c8f36e92-91c2-4a72-be26-5a1f5975860c")',
      attributesToHighlight: ['name', 'description', 'category.name'],
      highlightPreTag: '<mark>',
      highlightPostTag: '</mark>',
      clickAnalytics: true,
    };

    const response =
      await this.httpService.axiosRef.post<KutugoAlgoliaResponse>(
        this.kutugoUrl,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 20000,
        },
      );

    const items = this.extractKutugoItemsFromResponse(response.data || {});

    return {
      site: this.kutugoSiteName,
      totalItems: items.length,
      items,
    };
  }

  async fetchDaVinciItems(): Promise<SiteItemsResponse> {
    const menuItems =
      await this.menuService.findOyunAlItemsWithoutStockFilter();
    const items = this.extractDaVinciItemsFromMenuService(menuItems || []);

    return {
      site: this.daVinciSiteName,
      totalItems: items.length,
      items,
    };
  }

  async fetchD20TabletopItems(): Promise<SiteItemsResponse> {
    const headers = {
      Referer: `${this.d20TabletopBaseUrl}/`,
      'Upgrade-Insecure-Requests': '1',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      'sec-ch-ua':
        '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
    };

    const allItems: SiteItemPrice[] = [];
    let page = 1;
    const maxPages = 200;

    while (page <= maxPages) {
      const pageUrl =
        page === 1
          ? `${this.d20TabletopBaseUrl}/`
          : `${this.d20TabletopBaseUrl}/page/${page}/`;
      const response = await this.httpService.axiosRef.get<string>(pageUrl, {
        headers,
        timeout: 20000,
        responseType: 'text',
        validateStatus: (status) => status < 500,
      });

      if (response.status === 404) {
        break;
      }

      if (response.status >= 400) {
        throw new Error(`D20 request failed with status ${response.status}`);
      }

      const pageItems = this.extractWooCommerceItemsFromHtml(
        response.data || '',
        this.d20TabletopSiteName,
      );

      if (!pageItems.length) {
        break;
      }

      allItems.push(...pageItems);
      page += 1;
    }

    return {
      site: this.d20TabletopSiteName,
      totalItems: allItems.length,
      items: allItems,
    };
  }

  async fetchGoblinItems(): Promise<SiteItemsResponse> {
    const headers = {
      accept: '*/*',
      'accept-language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      priority: 'u=1, i',
      referer: `${this.goblinBaseUrl}?per_page=36&page=2`,
      'sec-ch-ua':
        '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      'x-livewire-navigate': '',
    };

    const allItems: SiteItemPrice[] = [];
    let page = 1;
    const maxPages = 200;

    while (page <= maxPages) {
      const pageUrl = `${this.goblinBaseUrl}?per_page=36&page=${page}`;
      const response = await this.httpService.axiosRef.get<string>(pageUrl, {
        headers,
        timeout: 20000,
        responseType: 'text',
        validateStatus: (status) => status < 500,
      });

      if (response.status === 404) {
        break;
      }

      if (response.status >= 400) {
        throw new Error(`Goblin request failed with status ${response.status}`);
      }

      const pageHtml = response.data || '';
      const rawProductCount = this.countGoblinProductCards(pageHtml);
      if (!rawProductCount) {
        break;
      }

      const pageItems = this.extractGoblinItemsFromHtml(pageHtml);

      allItems.push(...pageItems);
      page += 1;
    }

    return {
      site: this.goblinSiteName,
      totalItems: allItems.length,
      items: allItems,
    };
  }

  async fetchSimurgItems(): Promise<SiteItemsResponse> {
    const allItems: SiteItemPrice[] = [];
    const perPage = 20;
    let page = 1;
    let totalCount = 0;

    while (page <= 50) {
      const { items, count } = await this.fetchSimurgGraphqlPage(page, perPage);

      if (!totalCount && typeof count === 'number' && Number.isFinite(count)) {
        totalCount = count;
      }

      if (!items.length) {
        break;
      }

      allItems.push(...items);

      if (totalCount && allItems.length >= totalCount) {
        break;
      }

      if (items.length < perPage) {
        break;
      }

      page += 1;
    }

    return {
      site: this.simurgSiteName,
      totalItems: allItems.length,
      items: allItems,
    };
  }

  async fetchAllSiteItems(): Promise<SiteItemsResponse[]> {
    // Add new website providers here and they will be merged into one hashmap.
    const results = await Promise.allSettled([
      this.fetchNeotroyItems(),
      this.fetchKutugoItems(),
      this.fetchDaVinciItems(),
      this.fetchD20TabletopItems(),
      this.fetchGoblinItems(),
      this.fetchSimurgItems(),
    ]);

    return results
      .filter(
        (result): result is PromiseFulfilledResult<SiteItemsResponse> =>
          result.status === 'fulfilled',
      )
      .map((result) => result.value);
  }

  async fetchLocalComparisonHashmap(): Promise<GlobalHashmapResponse> {
    const storedComparisons = await this.localComparisonModel
      .find({})
      .select('_id normalizedName name prices')
      .lean();

    const hashmap = storedComparisons.reduce<Record<string, PriceHashmapValue>>(
      (acc, comparison) => {
        acc[comparison._id] = {
          name: comparison.name,
          prices: comparison.prices ?? {},
        };

        return acc;
      },
      {},
    );

    const sites = Array.from(
      new Set(
        storedComparisons.flatMap((comparison) =>
          Object.keys(comparison.prices ?? {}),
        ),
      ),
    ).reduce<Record<string, string>>((acc, site) => {
      acc[site] = this.getSiteDisplayName(site);
      return acc;
    }, {});

    const totalItems = storedComparisons.reduce(
      (count, comparison) =>
        count + Object.keys(comparison.prices ?? {}).length,
      0,
    );

    return {
      sites,
      totalItems,
      totalKeys: storedComparisons.length,
      hashmap,
    };
  }

  async syncLocalComparisonToDb(): Promise<LocalComparisonSyncResult> {
    const siteResults = await this.fetchAllSiteItems();
    const allItems = siteResults.flatMap((result) => result.items);
    const hashmap = this.buildPriceHashmap(allItems);
    const keys = Object.keys(hashmap);

    const existingDocuments = await this.localComparisonModel
      .find({ _id: { $in: keys } })
      .select('_id name normalizedName prices')
      .lean();

    const existingMap = new Map(
      existingDocuments.map((document) => [document._id, document]),
    );

    const bulkOperations: any[] = [];
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    for (const [normalizedName, value] of Object.entries(hashmap)) {
      const existing = existingMap.get(normalizedName) as
        | {
            name?: string;
            normalizedName?: string;
            prices?: Record<string, number>;
          }
        | undefined;

      if (!existing) {
        bulkOperations.push({
          updateOne: {
            filter: { _id: normalizedName },
            update: {
              $set: {
                _id: normalizedName,
                normalizedName,
                name: value.name,
                prices: value.prices,
                lastSyncedAt: new Date(),
              },
            },
            upsert: true,
          },
        });
        inserted += 1;
        continue;
      }

      const setUpdates: Record<string, unknown> = {};

      if ((!existing.name || existing.name.trim() === '') && value.name) {
        setUpdates.name = value.name;
      }

      for (const [site, price] of Object.entries(value.prices)) {
        if (existing.prices?.[site] !== price) {
          setUpdates[`prices.${site}`] = price;
        }
      }

      if (Object.keys(setUpdates).length > 0) {
        setUpdates.lastSyncedAt = new Date();
        bulkOperations.push({
          updateOne: {
            filter: { _id: normalizedName },
            update: { $set: setUpdates },
          },
        });
        updated += 1;
      } else {
        unchanged += 1;
      }
    }

    if (bulkOperations.length > 0) {
      await this.localComparisonModel.bulkWrite(bulkOperations, {
        ordered: false,
      });
    }

    return {
      totalItems: allItems.length,
      totalKeys: keys.length,
      inserted,
      updated,
      unchanged,
    };
  }

  async fetchNeotroyHashmap(): Promise<{
    site: string;
    totalKeys: number;
    hashmap: Record<string, PriceHashmapValue>;
  }> {
    const { items } = await this.fetchNeotroyItems();
    const hashmap = this.buildPriceHashmap(items);

    return {
      site: this.neotroySiteName,
      totalKeys: Object.keys(hashmap).length,
      hashmap,
    };
  }

  async fetchKutugoHashmap(): Promise<{
    site: string;
    totalKeys: number;
    hashmap: Record<string, PriceHashmapValue>;
  }> {
    const { items } = await this.fetchKutugoItems();
    const hashmap = this.buildPriceHashmap(items);

    return {
      site: this.kutugoSiteName,
      totalKeys: Object.keys(hashmap).length,
      hashmap,
    };
  }

  async fetchDaVinciHashmap(): Promise<{
    site: string;
    totalKeys: number;
    hashmap: Record<string, PriceHashmapValue>;
  }> {
    const { items } = await this.fetchDaVinciItems();
    const hashmap = this.buildPriceHashmap(items);

    return {
      site: this.daVinciSiteName,
      totalKeys: Object.keys(hashmap).length,
      hashmap,
    };
  }

  async fetchD20TabletopHashmap(): Promise<{
    site: string;
    totalKeys: number;
    hashmap: Record<string, PriceHashmapValue>;
  }> {
    const { items } = await this.fetchD20TabletopItems();
    const hashmap = this.buildPriceHashmap(items);

    return {
      site: this.d20TabletopSiteName,
      totalKeys: Object.keys(hashmap).length,
      hashmap,
    };
  }

  async fetchGoblinHashmap(): Promise<{
    site: string;
    totalKeys: number;
    hashmap: Record<string, PriceHashmapValue>;
  }> {
    const { items } = await this.fetchGoblinItems();
    const hashmap = this.buildPriceHashmap(items);

    return {
      site: this.goblinSiteName,
      totalKeys: Object.keys(hashmap).length,
      hashmap,
    };
  }

  async fetchSimurgHashmap(): Promise<{
    site: string;
    totalKeys: number;
    hashmap: Record<string, PriceHashmapValue>;
  }> {
    const { items } = await this.fetchSimurgItems();
    const hashmap = this.buildPriceHashmap(items);

    return {
      site: this.simurgSiteName,
      totalKeys: Object.keys(hashmap).length,
      hashmap,
    };
  }

  buildPriceHashmap(items: SiteItemPrice[]): Record<string, PriceHashmapValue> {
    const hashmap: Record<string, PriceHashmapValue> = {};

    for (const item of items) {
      if (!hashmap[item.normalizedName]) {
        hashmap[item.normalizedName] = {
          name: item.name,
          prices: {},
        };
      }

      hashmap[item.normalizedName].prices[item.site] = item.price;
    }

    return hashmap;
  }

  private getSiteDisplayName(siteKey: string): string {
    const siteNames: Record<string, string> = {
      neotroy: 'Neotroy',
      kutugo: 'Kutugo',
      davinci: 'Da Vinci',
      d20tabletop: 'D20tabletop',
      goblin: 'Goblin',
      simurg: 'Simurg',
    };

    return siteNames[siteKey] ?? siteKey;
  }

  private extractNeotroyItemsFromHtml(html: string): SiteItemPrice[] {
    const productBlocks = html.match(/<li class="product[\s\S]*?<\/li>/g) || [];
    const parsed: SiteItemPrice[] = [];

    for (const block of productBlocks) {
      const titleMatch = block.match(
        /<h3 class="rt-title">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,
      );
      if (!titleMatch) {
        continue;
      }

      const cleanName = this.decodeHtmlEntities(
        this.stripTags(titleMatch[1]),
      ).trim();
      if (!cleanName) {
        continue;
      }

      const selectedPriceRaw = this.extractLastPriceText(block);
      if (!selectedPriceRaw) {
        continue;
      }

      const parsedPrice = this.parseTurkishPrice(selectedPriceRaw);
      if (parsedPrice == null) {
        continue;
      }

      parsed.push({
        site: this.neotroySiteName,
        name: cleanName,
        normalizedName: this.normalizeItemName(cleanName),
        price: parsedPrice,
        rawPrice: selectedPriceRaw,
      });
    }

    return parsed;
  }

  private extractNeotroyHtmlFromResponse(
    responseData: NeotroyAjaxResponse | string | null | undefined,
  ): string {
    if (typeof responseData === 'string') {
      return responseData;
    }

    if (!responseData || typeof responseData !== 'object') {
      return '';
    }

    const candidateKeys: Array<keyof NeotroyAjaxResponse> = [
      'html',
      'data',
      'content',
      'markup',
      'response',
      'result',
    ];

    for (const key of candidateKeys) {
      const candidate = responseData[key];
      const extracted = this.findHtmlString(candidate);
      if (extracted) {
        return extracted;
      }
    }

    return this.findHtmlString(responseData) || '';
  }

  private findHtmlString(value: unknown): string | null {
    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        const extracted = this.findHtmlString(entry);
        if (extracted) {
          return extracted;
        }
      }

      return null;
    }

    if (!value || typeof value !== 'object') {
      return null;
    }

    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      const extracted = this.findHtmlString(nestedValue);
      if (extracted) {
        return extracted;
      }
    }

    return null;
  }

  private extractWooCommerceItemsFromHtml(
    html: string,
    siteName: string,
  ): SiteItemPrice[] {
    const productBlocks =
      html.match(/<li[^>]*class="[^"]*\bproduct\b[^"]*"[\s\S]*?<\/li>/g) || [];
    const parsed: SiteItemPrice[] = [];

    for (const block of productBlocks) {
      const titleMatch =
        block.match(
          /<h2[^>]*class="[^"]*woocommerce-loop-product__title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i,
        ) ||
        block.match(/<h3 class="rt-title">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);

      if (!titleMatch) {
        continue;
      }

      const cleanName = this.decodeHtmlEntities(
        this.stripTags(titleMatch[1]),
      ).trim();

      if (!cleanName) {
        continue;
      }

      const selectedPriceRaw = this.extractLastPriceText(block);
      if (!selectedPriceRaw) {
        continue;
      }

      const parsedPrice = this.parseTurkishPrice(selectedPriceRaw);
      if (parsedPrice == null) {
        continue;
      }

      parsed.push({
        site: siteName,
        name: cleanName,
        normalizedName: this.normalizeItemName(cleanName),
        price: parsedPrice,
        rawPrice: selectedPriceRaw,
      });
    }

    return parsed;
  }

  private extractLastPriceText(block: string): string | null {
    const bdiPriceMatches = Array.from(
      block.matchAll(/<bdi>([\s\S]*?)<\/bdi>/g),
    );
    if (bdiPriceMatches.length) {
      return this.decodeHtmlEntities(
        this.stripTags(bdiPriceMatches[bdiPriceMatches.length - 1][1]),
      ).trim();
    }

    const amountPriceMatches = Array.from(
      block.matchAll(
        /<span class="woocommerce-Price-amount amount">([\s\S]*?)<\/span>/g,
      ),
    );

    if (!amountPriceMatches.length) {
      return null;
    }

    return this.decodeHtmlEntities(
      this.stripTags(amountPriceMatches[amountPriceMatches.length - 1][1]),
    ).trim();
  }

  private extractGoblinItemsFromHtml(html: string): SiteItemPrice[] {
    const productBlocks =
      html.match(
        /<article[^>]*class="[^"]*product-card[^"]*"[\s\S]*?<\/article>/g,
      ) || [];
    const parsed: SiteItemPrice[] = [];

    for (const block of productBlocks) {
      const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      const ariaLabelMatch = block.match(/aria-label="([^"]+)"/i);

      const cleanName = this.decodeHtmlEntities(
        this.stripTags(titleMatch?.[1] || ariaLabelMatch?.[1] || ''),
      ).trim();
      if (!cleanName) {
        continue;
      }

      const parsedPriceResult = this.extractGoblinPriceFromBlock(block);
      if (!parsedPriceResult) {
        continue;
      }

      const { rawPrice, price } = parsedPriceResult;

      parsed.push({
        site: this.goblinSiteName,
        name: cleanName,
        normalizedName: this.normalizeItemName(cleanName),
        price,
        rawPrice,
      });
    }

    return parsed;
  }

  private extractGoblinPriceFromBlock(
    block: string,
  ): { rawPrice: string; price: number } | null {
    const boldSpanMatches = Array.from(
      block.matchAll(
        /<span[^>]*class="[^"]*font-bold[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
      ),
    );

    for (const match of boldSpanMatches) {
      const rawCandidate = this.decodeHtmlEntities(
        this.stripTags(match[1]),
      ).trim();
      const parsedCandidate = this.parseTurkishPrice(rawCandidate);
      if (parsedCandidate != null) {
        return { rawPrice: rawCandidate, price: parsedCandidate };
      }
    }

    const currencyMatch = block.match(
      /((?:₺|&#8378;|TL)\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/i,
    );

    if (!currencyMatch) {
      return null;
    }

    const rawFallback = this.decodeHtmlEntities(
      this.stripTags(currencyMatch[1]),
    ).trim();
    const parsedFallback = this.parseTurkishPrice(rawFallback);

    if (parsedFallback == null) {
      return null;
    }

    return { rawPrice: rawFallback, price: parsedFallback };
  }

  private async fetchSimurgGraphqlPage(
    page: number,
    perPage: number,
  ): Promise<{ items: SiteItemPrice[]; count: number }> {
    const body: SimurgSearchProductsRequestBody = {
      query: this.simurgGraphqlQuery,
      variables: {
        input: {
          locale: 'tr',
          page,
          perPage,
          filterList: [],
          facetList: [],
          categoryIdList: [this.simurgCategoryId],
          salesChannelId: this.simurgSalesChannelId,
          query: '',
          order: [{ direction: 'ASC', type: 'MANUAL_SORT' }],
          showStockOption: 'SHOW_ALL',
        },
      },
    };

    const response =
      await this.httpService.axiosRef.post<SimurgGraphqlResponse>(
        this.simurgGraphqlUrl,
        body,
        {
          headers: this.simurgGraphqlHeaders,
          timeout: 20000,
          validateStatus: (status) => status < 500,
        },
      );

    if (response.status >= 400) {
      throw new Error(`Simurg request failed with status ${response.status}`);
    }

    const searchProducts = response.data?.data?.searchProducts;
    return {
      count: searchProducts?.count || 0,
      items: this.extractSimurgProducts(searchProducts?.results || []),
    };
  }

  private extractSimurgProducts(
    productItems: SimurgGraphqlProduct[],
  ): SiteItemPrice[] {
    const parsed: SiteItemPrice[] = [];

    for (const item of productItems) {
      const cleanName = String(item.name || '').trim();
      if (!cleanName) {
        continue;
      }

      const variant = item.variants?.find((entry) =>
        Boolean(entry?.prices?.length),
      );
      const priceEntry = variant?.prices?.[0];
      const rawPriceNumber =
        priceEntry?.discountPrice ?? priceEntry?.sellPrice ?? null;

      if (
        typeof rawPriceNumber !== 'number' ||
        !Number.isFinite(rawPriceNumber) ||
        rawPriceNumber <= 0
      ) {
        continue;
      }

      parsed.push({
        site: this.simurgSiteName,
        name: cleanName,
        normalizedName: this.normalizeItemName(cleanName),
        price: rawPriceNumber,
        rawPrice: String(rawPriceNumber),
      });
    }

    return parsed;
  }

  private countGoblinProductCards(html: string): number {
    return (
      html.match(
        /<article[^>]*class="[^"]*product-card[^"]*"[\s\S]*?<\/article>/g,
      ) || []
    ).length;
  }

  private extractKutugoItemsFromResponse(
    response: KutugoAlgoliaResponse,
  ): SiteItemPrice[] {
    const hits = response.hits || [];
    const parsed: SiteItemPrice[] = [];

    for (const hit of hits) {
      const cleanName = String(hit.name || '').trim();
      if (!cleanName) {
        continue;
      }

      const selectedPriceRaw =
        typeof hit.salePrice === 'number' && Number.isFinite(hit.salePrice)
          ? hit.salePrice
          : hit.price;

      if (
        typeof selectedPriceRaw !== 'number' ||
        !Number.isFinite(selectedPriceRaw)
      ) {
        continue;
      }

      // Kutugo values are returned in kurus/cents-like units.
      const parsedPrice = selectedPriceRaw / 100;

      parsed.push({
        site: this.kutugoSiteName,
        name: cleanName,
        normalizedName: this.normalizeItemName(cleanName),
        price: parsedPrice,
        rawPrice: String(selectedPriceRaw),
      });
    }

    return parsed;
  }

  private extractDaVinciItemsFromMenuService(
    menuItems: DaVinciMenuItem[],
  ): SiteItemPrice[] {
    const parsed: SiteItemPrice[] = [];

    for (const item of menuItems) {
      const cleanName = String(item.name || '').trim();
      if (!cleanName) {
        continue;
      }

      const rawPriceNumber =
        typeof item.price === 'number' ? item.price : Number(item.price);

      if (!Number.isFinite(rawPriceNumber)) {
        continue;
      }

      parsed.push({
        site: this.daVinciSiteName,
        name: cleanName,
        normalizedName: this.normalizeItemName(cleanName),
        price: rawPriceNumber,
        rawPrice: String(rawPriceNumber),
      });
    }

    return parsed;
  }

  private parseTurkishPrice(priceText: string): number | null {
    const cleaned = priceText.replace(/[^\d.,-]/g, '');
    if (!cleaned) {
      return null;
    }

    let normalized = cleaned;

    if (normalized.includes(',')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }

    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  private stripTags(value: string): string {
    return value.replace(/<[^>]*>/g, ' ');
  }

  private decodeHtmlEntities(value: string): string {
    const withNamedEntities = value
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    return withNamedEntities
      .replace(/&#(\d+);/g, (_, dec: string) =>
        String.fromCharCode(Number(dec)),
      )
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
  }
}
