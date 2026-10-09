'use strict';

/* Product operations fields (F7): reorder point, supplier lead time and
   cost price. Shared by the product write endpoints, the low-stock rule and
   the reorder report so every path clamps and interprets them the same way. */

function nonNegativeNumber(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/* Returns only the ops keys present in the input, normalised:
   costPrice / reorderPoint / leadTimeDays are numbers >= 0 or null. */
function normalizeOpsFields(body) {
  const out = {};
  if (!body || typeof body !== 'object') return out;
  for (const key of ['costPrice', 'reorderPoint', 'leadTimeDays']) {
    if (!(key in body)) continue;
    out[key] = nonNegativeNumber(body[key]);
  }
  return out;
}

/* Threshold precedence: rule override > product reorder point > store default. */
function effectiveThreshold(product, cfgThreshold, storeLowStock) {
  const override = Number(cfgThreshold);
  if (Number.isFinite(override) && override > 0) return override;
  const reorder = Number(product && product.reorderPoint);
  if (Number.isFinite(reorder) && reorder > 0) return reorder;
  const store = Number(storeLowStock);
  return Number.isFinite(store) && store > 0 ? store : 0;
}

/* Gross margin percentage, or null when cost/price is unknown. */
function marginPct(product) {
  const price = Number(product && product.price);
  const cost = Number(product && product.costPrice);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost < 0) return null;
  return Math.round(((price - cost) / price) * 1000) / 10;
}

module.exports = { normalizeOpsFields, effectiveThreshold, marginPct, nonNegativeNumber };
