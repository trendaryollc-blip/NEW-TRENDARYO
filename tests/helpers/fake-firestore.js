'use strict';

function clone(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(clone);
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = clone(v[k]);
    return out;
  }
  return v;
}

function id() {
  return Math.random().toString(36).slice(2, 10);
}

class MockFirestore {
  constructor(data = {}) {
    this._data = {};
    for (const col of Object.keys(data)) {
      this._data[col] = (data[col] || []).map((d) => ({ id: d.id || col + '-' + id(), data: clone(d) }));
    }
    this.FieldValue = {
      increment: (n) => ({ _fv: 'increment', n }),
      serverTimestamp: () => new Date().toISOString(),
      arrayUnion: (...vals) => ({ _fv: 'arrayUnion', vals }),
      arrayRemove: (...vals) => ({ _fv: 'arrayRemove', vals }),
      delete: () => ({ _fv: 'delete' }),
    };
  }

  collection(name) {
    const self = this;
    const q = {
      _col: name,
      _f: [],
      _order: null,
      _lim: Infinity,
      _off: 0,
      where(field, op, val) { q._f.push({ field, op, val }); return q; },
      orderBy(field, dir) { q._order = { field, dir: dir || 'asc' }; return q; },
      limit(n) { q._lim = n; return q; },
      offset(n) { q._off = n; return q; },
      get: async () => self._query(q),
      doc: (did) => self._doc(name, did),
      add: async (rec) => {
        const store = self._getStore(name);
        const did = rec.id || name + '-' + (store.length + 1);
        store.push({ id: did, data: clone({ ...rec, id: did }) });
        return { id: did };
      },
    };
    return q;
  }

  _getStore(col) {
    if (!this._data[col]) this._data[col] = [];
    return this._data[col];
  }

  /* Convenience for assertions: returns the raw doc data (with id). */
  raw(col, id) {
    const d = this._getStore(col).find((x) => x.id === id);
    return d ? d.data : undefined;
  }

  rawAll(col) {
    return this._getStore(col).map((d) => d.data);
  }

  _doc(col, did) {
    const self = this;
    return {
      id: did,
      _col: col,
      get: async () => {
        const d = self._getStore(col).find((x) => x.id === did);
        return { exists: !!d, data: () => (d ? clone(d.data) : undefined), id: did };
      },
      set: async (rec, opts) => {
        const store = self._getStore(col);
        const cur = store.find((x) => x.id === did);
        if (cur && opts && opts.merge) {
          cur.data = self._merge(cur.data, rec);
        } else if (cur) {
          cur.data = self._merge({}, rec);
        } else {
          store.push({ id: did, data: self._merge({}, rec) });
        }
      },
      update: async (rec) => {
        const store = self._getStore(col);
        const cur = store.find((x) => x.id === did);
        if (!cur) throw new Error('missing doc ' + col + '/' + did);
        cur.data = self._merge(cur.data, rec);
      },
      delete: async () => {
        const store = self._getStore(col);
        const idx = store.findIndex((x) => x.id === did);
        if (idx >= 0) store.splice(idx, 1);
      },
    };
  }

  _merge(cur, rec) {
    const plain = (v) => v && typeof v === 'object' && !Array.isArray(v) && !v._fv;
    const out = clone(cur);
    for (const k of Object.keys(rec)) {
      const v = rec[k];
      if (v && v._fv === 'increment') {
        out[k] = Number(out[k] || 0) + v.n;
        continue;
      }
      if (v && v._fv === 'delete') {
        delete out[k];
        continue;
      }
      if (v && v._fv === 'arrayUnion') {
        const arr = Array.isArray(out[k]) ? out[k].slice() : [];
        for (const item of v.vals) if (!arr.includes(item)) arr.push(item);
        out[k] = arr;
        continue;
      }
      if (v && v._fv === 'arrayRemove') {
        out[k] = (Array.isArray(out[k]) ? out[k] : []).filter((x) => !v.vals.includes(x));
        continue;
      }
      if (plain(v) && plain(out[k])) out[k] = Object.assign({}, out[k], v);
      else out[k] = clone(v);
    }
    return out;
  }

  _query(q) {
    const store = this._getStore(q._col);
    let list = store.filter((d) => {
      for (const f of q._f) {
        const dv = d.data[f.field];
        if (f.op === '==') { if (dv !== f.val) return false; }
        else if (f.op === '!=') { if (dv === f.val) return false; }
        else if (f.op === '<') { if (dv >= f.val) return false; }
        else if (f.op === '<=') { if (dv > f.val) return false; }
        else if (f.op === '>') { if (dv <= f.val) return false; }
        else if (f.op === '>=') { if (dv < f.val) return false; }
        else if (f.op === 'array-contains') { if (!Array.isArray(dv) || !dv.includes(f.val)) return false; }
        else if (f.op === 'in') { if (!f.val || !f.val.includes(dv)) return false; }
      }
      return true;
    });
    if (q._order) {
      const { field, dir } = q._order;
      list = list.slice().sort((a, b) => {
        const av = a.data[field] == null ? '' : String(a.data[field]);
        const bv = b.data[field] == null ? '' : String(b.data[field]);
        return dir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
      });
    }
    list = list.slice(q._off, q._off + q._lim);
    const docs = list.map((d) => ({ id: d.id, data: () => clone(d.data), ref: this._doc(q._col, d.id) }));
    return Promise.resolve({
      empty: docs.length === 0,
      size: docs.length,
      docs,
    });
  }

  runTransaction(fn) {
    return fn({
      get: async (ref) => ref.get(),
      set: async (ref, rec, opts) => { await ref.set(rec, opts); },
      update: async (ref, rec) => { await ref.update(rec); },
      delete: async (ref) => { await ref.delete(); },
    });
  }

  batch() {
    const ops = [];
    return {
      set: (ref, rec, opts) => { ops.push({ t: 'set', ref, rec, opts }); return this; },
      update: (ref, rec) => { ops.push({ t: 'update', ref, rec }); return this; },
      delete: (ref) => { ops.push({ t: 'delete', ref }); return this; },
      commit: async () => {
        for (const op of ops) {
          if (op.t === 'set') await op.ref.set(op.rec, op.opts);
          else if (op.t === 'update') await op.ref.update(op.rec);
          else if (op.t === 'delete') await op.ref.delete();
        }
      },
    };
  }
}

module.exports = { MockFirestore };
