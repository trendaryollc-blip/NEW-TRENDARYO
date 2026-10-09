/**
 * CJ Dropshipping API client.
 * Docs: https://developers.cjdropshipping.com
 * Settings live in Firestore `settings/cj` ({ email, apiKey, accessToken, tokenExpiry }).
 */
'use strict';

const BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

async function getSettings(db) {
  const snap = await db.collection('settings').doc('cj').get();
  return snap.exists ? snap.data() : null;
}

async function saveSettings(db, data) {
  await db.collection('settings').doc('cj').set({ ...data, updatedAt: new Date().toISOString() }, { merge: true });
}

async function request(path, { method = 'GET', token, body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '')).toString() : '';
  const res = await fetch(BASE + path + qs, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'CJ-Access-Token': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* ignore */ }
  if (!res.ok || (json && json.result === false)) {
    const msg = (json && (json.message || json.msg)) || `CJ request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json && json.data !== undefined ? json.data : json;
}

async function getToken(db) {
  let s = await getSettings(db);
  if (!s || !s.email || !s.apiKey) throw new Error('CJ not configured - add your email and API key first');
  if (s.accessToken && s.tokenExpiry && Date.now() < new Date(s.tokenExpiry).getTime() - 60000) {
    return s.accessToken;
  }
  const data = await request('/authentication/getAccessTokenV2', {
    method: 'POST',
    body: { email: s.email, apiKey: s.apiKey },
  });
  const accessToken = data.accessToken;
  if (!accessToken) throw new Error('CJ did not return an access token - check your API key');
  await saveSettings(db, { accessToken, tokenExpiry: data.accessTokenExpiryDate || new Date(Date.now() + 14 * 86400000).toISOString() });
  return accessToken;
}

async function call(db, path, opts = {}) {
  const token = await getToken(db);
  try {
    return await request(path, { ...opts, token });
  } catch (err) {
    if (err.message && /token|unauthori[sz]ed|login/i.test(err.message)) {
      const s = await getSettings(db);
      await saveSettings(db, { accessToken: null, tokenExpiry: null });
      const fresh = await getToken(db);
      return request(path, { ...opts, token: fresh || s.accessToken });
    }
    throw err;
  }
}

async function searchProducts(db, q, { page = 1, size = 20 } = {}) {
  const data = await call(db, '/product/list', { query: { productNameEn: q, pageNum: page, pageSize: size } });
  const list = (data && data.list) || [];
  return {
    total: data && data.total,
    products: list.map((p) => ({
      pid: p.pid,
      name: p.productNameEn,
      image: p.productImage,
      price: parseFloat(p.sellPrice) || 0,
      category: p.categoryName,
      vid: (p.productSkuList && p.productSkuList[0] && p.productSkuList[0].vid) || p.vid || null,
    })),
  };
}

async function createOrder(db, order, lineItems) {
  const addr = order.shippingAddress || {};
  const body = {
    orderNumber: String(order.orderNumber || order.id),
    platform: 'Api',
    payType: 3,
    shippingCountryCode: (addr.country || '').slice(0, 2).toUpperCase() || 'US',
    shippingCountry: addr.country || '',
    shippingProvince: addr.state || '',
    shippingCity: addr.city || '',
    shippingZip: addr.zipCode || addr.postalCode || '',
    shippingAddress: addr.street || '',
    shippingCustomerName: addr.fullName || '',
    shippingPhone: addr.phone || '',
    products: lineItems.map((it) => ({ vid: it.vid, quantity: it.quantity })),
  };
  return call(db, '/shopping/order/createOrderV2', { method: 'POST', body });
}

async function getOrderDetail(db, cjOrderId) {
  return call(db, '/shopping/order/getOrderDetail', { query: { orderId: cjOrderId } });
}

async function getTrackInfo(db, logisticName, trackNumber) {
  return call(db, '/logistic/getTrackInfo', { query: { logisticName, trackNumber } });
}

module.exports = { getSettings, saveSettings, getToken, searchProducts, createOrder, getOrderDetail, getTrackInfo };
