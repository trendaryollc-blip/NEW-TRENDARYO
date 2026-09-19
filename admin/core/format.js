/**
 * TRENDARYO ADMIN — Formatters
 * Every number, date and string that reaches the screen goes through here,
 * so currency symbols, tabular numerals and relative times stay consistent
 * across all modules.
 */
(function (A) {
    'use strict';

    var DEFAULT_CURRENCY = 'USD';
    var LOCALE = 'en-US';

    var MINUTE = 60000;
    var HOUR = 60 * MINUTE;
    var DAY = 24 * HOUR;

    function toNumber(value) {
        var n = typeof value === 'number' ? value : parseFloat(value);
        return isFinite(n) ? n : 0;
    }

    function toDate(value) {
        if (!value) return null;
        if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
        if (typeof value === 'object' && typeof value.seconds === 'number') {
            return new Date(value.seconds * 1000);
        }
        if (typeof value === 'object' && typeof value.toDate === 'function') {
            return value.toDate();
        }
        var d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    /** Currency, e.g. $1,299.00 */
    A.money = function (value, currency) {
        var n = toNumber(value);
        try {
            return new Intl.NumberFormat(LOCALE, {
                style: 'currency',
                currency: currency || DEFAULT_CURRENCY,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(n);
        } catch (e) {
            return '$' + n.toFixed(2);
        }
    };

    /** Compact currency for stat tiles - $1.3K, $2.4M */
    A.moneyCompact = function (value, currency) {
        var n = toNumber(value);
        var abs = Math.abs(n);
        var sign = n < 0 ? '-' : '';
        var symbol = currency === 'EUR' ? '\u20AC' : currency === 'GBP' ? '\u00A3' : '$';
        if (abs >= 1000000) return sign + symbol + (abs / 1000000).toFixed(abs >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
        if (abs >= 1000) return sign + symbol + (abs / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
        return sign + symbol + abs.toFixed(0);
    };

    /** Plain integer with thousand separators. */
    A.number = function (value) {
        return new Intl.NumberFormat(LOCALE).format(Math.round(toNumber(value)));
    };

    /** Compact integer - 1.2K, 3.4M */
    A.numberCompact = function (value) {
        var n = toNumber(value);
        var abs = Math.abs(n);
        var sign = n < 0 ? '-' : '';
        if (abs >= 1000000) return sign + (abs / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (abs >= 1000) return sign + (abs / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return sign + Math.round(abs);
    };

    /** Percentage. Pass already-multiplied values (12.5 becomes "12.5%"). */
    A.percent = function (value, decimals) {
        var d = typeof decimals === 'number' ? decimals : 1;
        var n = toNumber(value);
        var s = n.toFixed(d);
        if (d > 0) s = s.replace(/\.?0+$/, '');
        return s + '%';
    };

    /** Ratio 0..1 as a percentage. */
    A.ratioPercent = function (value, decimals) {
        return A.percent(toNumber(value) * 100, decimals);
    };

    /** Signed delta for stat tiles - "+12.4%" / "-3.1%" / "0%" */
    A.delta = function (value, decimals) {
        var n = toNumber(value);
        if (Math.abs(n) < 0.05) return '0%';
        return (n > 0 ? '+' : '') + A.percent(n, decimals);
    };

    /** Direction keyword for a delta: 'up' | 'down' | 'flat' */
    A.deltaDir = function (value) {
        var n = toNumber(value);
        if (Math.abs(n) < 0.05) return 'flat';
        return n > 0 ? 'up' : 'down';
    };

    /** Date - 15 Sep 2026 */
    A.date = function (value) {
        var d = toDate(value);
        if (!d) return '\u2014';
        return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
    };

    /** Short date - 15 Sep */
    A.dateShort = function (value) {
        var d = toDate(value);
        if (!d) return '\u2014';
        return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
    };

    /** Date and time - 15 Sep 2026, 14:32 */
    A.dateTime = function (value) {
        var d = toDate(value);
        if (!d) return '\u2014';
        return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }) +
            ', ' + d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    /** Time only - 14:32 */
    A.time = function (value) {
        var d = toDate(value);
        if (!d) return '\u2014';
        return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    /** Relative time - "3 min ago", "in 2 days", "just now" */
    A.ago = function (value) {
        var d = toDate(value);
        if (!d) return '\u2014';
        var diff = Date.now() - d.getTime();
        var future = diff < 0;
        var abs = Math.abs(diff);
        if (abs < 45000) return 'just now';
        var unit, count;
        if (abs < HOUR) {
            count = Math.round(abs / MINUTE);
            unit = 'min';
        } else if (abs < DAY) {
            count = Math.round(abs / HOUR);
            unit = count === 1 ? 'hour' : 'hours';
        } else if (abs < 30 * DAY) {
            count = Math.round(abs / DAY);
            unit = count === 1 ? 'day' : 'days';
        } else if (abs < 365 * DAY) {
            count = Math.round(abs / (30 * DAY));
            unit = count === 1 ? 'month' : 'months';
        } else {
            count = Math.round(abs / (365 * DAY));
            unit = count === 1 ? 'year' : 'years';
        }
        return future ? 'in ' + count + ' ' + unit : count + ' ' + unit + ' ago';
    };

    /** ISO date string - 2026-09-15 */
    A.isoDate = function (value) {
        var d = toDate(value) || new Date();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + day;
    };

    /** Duration in ms as "1h 24m" / "45s" */
    A.duration = function (ms) {
        var total = Math.max(0, Math.round(toNumber(ms) / 1000));
        var h = Math.floor(total / 3600);
        var m = Math.floor((total % 3600) / 60);
        var s = total % 60;
        if (h) return h + 'h ' + m + 'm';
        if (m) return m + 'm ' + s + 's';
        return s + 's';
    };

    /** Bytes - 1.2 MB */
    A.bytes = function (value) {
        var n = toNumber(value);
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
        return (n / 1073741824).toFixed(2) + ' GB';
    };

    /** Clip text to a length on a word boundary. */
    A.truncate = function (text, max) {
        var s = String(text == null ? '' : text);
        var limit = max || 80;
        if (s.length <= limit) return s;
        return s.slice(0, limit - 1).replace(/\s+\S*$/, '') + '\u2026';
    };

    /** "wireless-headphones" and "Wireless Headphones" variants. */
    A.titleCase = function (text) {
        return String(text == null ? '' : text)
            .replace(/[-_]+/g, ' ')
            .replace(/\w\S*/g, function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); });
    };

    A.slugify = function (text) {
        return String(text == null ? '' : text)
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80);
    };

    A.initials = function (first, last) {
        var a = String(first || '').trim().charAt(0);
        var b = String(last || '').trim().charAt(0);
        var out = (a + b).toUpperCase();
        return out || '?';
    };

    A.plural = function (count, singular, plural) {
        var n = toNumber(count);
        return n === 1 ? singular : (plural || singular + 's');
    };

    A.listJoin = function (items, conj) {
        var arr = (items || []).filter(Boolean);
        if (!arr.length) return '';
        if (arr.length === 1) return arr[0];
        if (arr.length === 2) return arr[0] + ' ' + (conj || 'and') + ' ' + arr[1];
        return arr.slice(0, -1).join(', ') + ' ' + (conj || 'and') + ' ' + arr[arr.length - 1];
    };

    /** Word count, used by the AI content studio length hints. */
    A.wordCount = function (text) {
        var s = String(text || '').trim();
        return s ? s.split(/\s+/).length : 0;
    };

    /** Reading time in minutes at roughly 220 wpm. */
    A.readingTime = function (text) {
        return Math.max(1, Math.round(A.wordCount(text) / 220));
    };

    A.toDate = toDate;
    A.toNumber = toNumber;

})(window.TrendaryoAdmin = window.TrendaryoAdmin || {});
