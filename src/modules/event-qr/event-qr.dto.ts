import { IsOptional, IsString, Matches } from 'class-validator';

// Hem oluşturma hem güncelleme için; alanlar isteğe bağlı, boş kayıt herkese açık sayfada görünmez
export class SaveEventQrDto {
  @IsOptional()
  @IsString()
  title?: string;

  // Panelden girilen linkin herkese açık sayfada güvenli olması için sadece https
  @IsOptional()
  @IsString()
  @Matches(/^$|^https:\/\//, { message: 'url must start with https://' })
  url?: string;

  @IsOptional()
  @IsString()
  @Matches(/^$|^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format or empty',
  })
  date?: string;
}
