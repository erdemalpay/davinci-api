import { IsOptional, IsString, Matches } from 'class-validator';

export class SaveEventQrDto {
  @IsString()
  title: string;

  // Panelden girilen linkin herkese açık sayfada güvenli olması için sadece https
  @IsString()
  @Matches(/^$|^https:\/\//, { message: 'url must start with https://' })
  url: string;

  // "YYYY-MM-DD" ya da ISO tarih; boş olabilir
  @IsOptional()
  @IsString()
  @Matches(/^$|^\d{4}-\d{2}-\d{2}/, {
    message: 'date must start with YYYY-MM-DD or be empty',
  })
  date?: string;
}
