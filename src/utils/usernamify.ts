export function usernamify(str: string) {
  return str
    .toLocaleLowerCase()
    .replaceAll(' ', '_')
    .replaceAll('ü', 'u')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c')
    .replaceAll('ğ', 'g')
    .replaceAll('ş', 's')
    .replaceAll('ı', 'i')
    .replace(/\W/g, '');
}
