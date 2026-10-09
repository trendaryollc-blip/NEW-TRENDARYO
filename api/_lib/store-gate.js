'use strict';

async function assertStoreOpen(db, { country } = {}) {
  try {
    const { getSettings } = require('./pricing');
    const st = await getSettings(db);
    if (st.checkoutEnabled === false) {
      const err = new Error('checkout_disabled');
      err.statusCode = 403;
      err.code = 'checkout_disabled';
      throw err;
    }
    if (st.maintenanceMode === true) {
      const err = new Error('maintenance');
      err.statusCode = 503;
      err.code = 'maintenance';
      throw err;
    }
    const blocked = Array.isArray(st.blockedCountries) ? st.blockedCountries : [];
    if (country && blocked.map(x=>String(x).toUpperCase()).includes(String(country).toUpperCase())) {
      const err = new Error('checkout_disabled');
      err.statusCode = 403;
      err.code = 'checkout_disabled';
      throw err;
    }
  } catch (e) {
    if (e.statusCode) throw e;
  }
}

module.exports = { assertStoreOpen };
