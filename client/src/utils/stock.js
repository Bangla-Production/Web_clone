// Helpers for menu-item stock. `stockQty` is optional:
//   number  -> quantity tracked (0 means sold out)
//   null/undefined -> unlimited (not tracked)
export const LOW_STOCK_THRESHOLD = 5;

export function getStockQty(item) {
  return typeof item?.stockQty === 'number' ? item.stockQty : null;
}

export function isItemSoldOut(item) {
  const qty = getStockQty(item);
  return !item?.isAvailable || (qty !== null && qty <= 0);
}

export function isLowStock(item) {
  const qty = getStockQty(item);
  return qty !== null && qty > 0 && qty <= LOW_STOCK_THRESHOLD;
}
