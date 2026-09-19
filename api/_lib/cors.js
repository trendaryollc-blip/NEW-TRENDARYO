const PROD_ORIGINS = [
  'https://trendaryo.com',
  'https://www.trendaryo.com',
];

const DEV_ORIGINS = [
  'http://localhost:5500',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
];

const ALLOWED_ORIGINS = process.env.VERCEL_ENV === 'production'
  ? PROD_ORIGINS
  : [...PROD_ORIGINS, ...DEV_ORIGINS];

function cors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (process.env.VERCEL_ENV !== 'production' && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function handleCors(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

module.exports = { cors, handleCors };
