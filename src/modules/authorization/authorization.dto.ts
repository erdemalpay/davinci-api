export class CreateAuthorizationDto {
  path: string;
  method: string;
  roles: number[];
  relatedPages?: string[];
}
