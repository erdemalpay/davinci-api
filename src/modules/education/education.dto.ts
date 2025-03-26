export class StyleDto {
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontWeight?: string;
  textAlign?: string;
  imageHeight?: string;
  imageWidth?: string;
  imageBorderRadius?: string;
  imageMargin?: string;
}

export class EducationSubheaderDto {
  componentType: string;
  subHeader?: string;
  paragraph?: string;
  imageUrl?: string;
  style?: StyleDto;
  order: number;
}

export class CreateEducationDto {
  permissionRoles: number[];
  header: string;
  order: number;
  subheaders?: EducationSubheaderDto[];
}
