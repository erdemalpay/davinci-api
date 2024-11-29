export const convertStockLocation = (location: string) => {
  if (location === 'bahceli') {
    return 1;
  } else if (location === 'neorama') {
    return 2;
  } else if (location === 'amazon') {
    return 3;
  }
};
