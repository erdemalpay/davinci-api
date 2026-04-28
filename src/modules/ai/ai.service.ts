import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { FilterSchemaField, TableFilterQueryDto } from './ai.dto';

@Injectable()
export class AiService {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async getTableFilters(dto: TableFilterQueryDto) {
    const { query, tableName, schema, tableColumns } = dto;

    const schemaDescription = Object.entries(schema)
      .map(([key, field]: [string, FilterSchemaField]) => {
        let desc = `- "${key}" (${field.label}, tür: ${field.type})`;
        if (field.options?.length) {
          const optionsList = field.options
            .map((o) => `"${o.label}" → "${o.value}"`)
            .join(', ');
          desc += `, eşleşme tablosu: [${optionsList}]`;
        }
        return desc;
      })
      .join('\n');

    const columnsDescription = tableColumns?.length
      ? `\nTablodaki metin arama kolonları (searchQuery için):\n` +
        tableColumns.map((c) => `- ${c.label} (${c.searchKey})`).join('\n')
      : '';

    const systemPrompt = `Sen bir tablo filtre asistanısın. Kullanıcının doğal dil sorgusunu analiz edip tablonun mevcut filtre alanlarına veya metin aramasına uygun JSON çıktısı üretirsin.

Tablo adı: ${tableName}

Kullanılabilir filtre alanları (filters için):
${schemaDescription}
${columnsDescription}

Kurallar:
1. Filtre alanları için sadece yukarıdaki schema alanlarını kullan.
2. Tarih alanları için ISO 8601 format kullan (YYYY-MM-DD).
3. Select alanları için eşleşme tablosundaki "value" değerini döndür, "label" değerini değil.
4. Anlayamadığın veya eşleştiremediğin ifadeler için o alanı çıktıya dahil etme.
5. Bugünün tarihi: ${new Date().toISOString().split('T')[0]}
6. "Geçen hafta" = bugünden 7 gün öncesi ile bugün arası. "Bu ay" = ayın ilk günü ile bugün. "Dün" = bir önceki gün.
7. Türkçe explanation yaz.
8. Eğer sorgu bir sipariş numarası, ürün adı, perakendeci adı gibi tabloda görünen metin değerine yönelikse "searchQuery" alanını kullan.
9. "filters" ve "searchQuery" birlikte kullanılabilir.

Çıktı formatı (sadece JSON, başka hiçbir şey yazma):
{
  "filters": {
    "fieldKey": "value"
  },
  "searchQuery": "aranacak metin",
  "explanation": "Türkçe açıklama"
}

"searchQuery" gerekmiyorsa o alanı çıktıya ekleme.

Eğer sorguyu hiçbir alanla eşleştiremiyorsan:
{
  "filters": {},
  "explanation": "QUERY_NOT_UNDERSTOOD"
}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const content = response.choices[0].message.content;
    return JSON.parse(content);
  }
}
