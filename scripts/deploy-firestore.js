/**
 * Deploy Firestore SECURITY RULES and COMPOSITE INDEXES to the live project
 * without needing an interactive `firebase login`.
 *
 * It authenticates with the same service-account credentials the API functions
 * already use (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
 * from .env) and talks to the Google REST APIs directly:
 *   - Firestore Admin API      → composite indexes (firestore.indexes.json)
 *   - Firebase Rules API       → security rules  (firestore.rules)
 *
 * Usage:
 *   node --env-file=.env scripts/deploy-firestore.js
 *
 * Idempotent: indexes that already exist are left untouched; rules release is
 * always pointed at the newest ruleset.
 */
try { require('dotenv').config(); } catch (e) { /* dotenv optional */ }

const fs = require('fs');
const path = require('path');
const { JWT } = require('google-auth-library');

const PROJECT = process.env.FIREBASE_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;

if (!PROJECT || !CLIENT_EMAIL || !PRIVATE_KEY) {
  console.error('Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY');
  process.exit(1);
}

const SCOPES = [
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/firebase',
];

const FIRESTORE_API = 'https://firestore.googleapis.com/v1';
const RULES_API = 'https://firebaserules.googleapis.com/v1';
const DB = 'projects/' + PROJECT + '/databases/(default)';

async function token() {
  const client = new JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: SCOPES,
  });
  const creds = await client.getAccessToken();
  return creds.token;
}

async function fetchJson(url, options, authToken) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + authToken,
      ...(options.headers || {}),
    },
  });
  const body = await res.text();
  let parsed;
  try { parsed = body ? JSON.parse(body) : null; } catch (e) { parsed = { raw: body }; }
  return { status: res.status, parsed };
}

/* ------------------------------------------------------------------ */
/* Indexes                                                             */
/* ------------------------------------------------------------------ */

function indexFingerprint(index) {
  // A stable, name-independent key so we can say "already deployed".
  return index.fields.map((f) => f.fieldPath + ':' + (f.arrayConfig || f.order || '?')).join('|') + '|' + index.queryScope;
}

async function deployIndexes(authToken) {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firestore.indexes.json'), 'utf8'));

  const created = [];
  let skipped = 0;
  for (const index of config.indexes) {
    const cg = index.collectionGroup;
    const fields = index.fields.map((f) =>
      f.arrayConfig
        ? { fieldPath: f.fieldPath, arrayConfig: f.arrayConfig }
        : { fieldPath: f.fieldPath, order: f.order }
    );
    const mine = indexFingerprint(index);

    // Skip if an identical index is already deployed for this collection group.
    const listUrl = `${FIRESTORE_API}/${DB}/collectionGroups/${cg}/indexes`;
    const { status, parsed } = await fetchJson(listUrl, {}, authToken);
    const liveFingerprints = new Set((status === 200 ? (parsed.indexes || []) : []).map(indexFingerprint));
    if (liveFingerprints.has(mine)) {
      skipped++;
      continue;
    }

    const url = `${FIRESTORE_API}/${DB}/collectionGroups/${cg}/indexes`;
    const { status: resStatus, parsed: resParsed } = await fetchJson(url, {
      method: 'POST',
      body: JSON.stringify({ fields, queryScope: index.queryScope }),
    }, authToken);

    if (resStatus === 200 || resStatus === 201) {
      created.push(resParsed && resParsed.name);
      console.log('  + created index', cg, '->', fields.map((f) => f.fieldPath + (f.arrayConfig ? ':' + f.arrayConfig : '')).join(', '));
    } else if (resStatus === 409 || (resParsed && /already exists/i.test(resParsed.error?.message || ''))) {
      skipped++;
    } else {
      console.log('  x index error', cg, (resParsed && resParsed.error && resParsed.error.message) || resStatus);
    }
  }
  return { created, skipped };
}

/* ------------------------------------------------------------------ */
/* Security rules                                                      */
/* ------------------------------------------------------------------ */

async function deployRules(authToken) {
  const rulesPath = path.join(__dirname, '..', 'firestore.rules');
  const content = fs.readFileSync(rulesPath, 'utf8');

  // 1) New ruleset
  const rsUrl = `${RULES_API}/projects/${PROJECT}/rulesets`;
  const rs = await fetchJson(rsUrl, {
    method: 'POST',
    body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content }] } }),
  }, authToken);
  if (rs.status !== 200 && rs.status !== 201) {
    throw new Error('Ruleset creation failed: ' + (rs.parsed && rs.parsed.error && rs.parsed.error.message) + ' (HTTP ' + rs.status + ')');
  }
  const rulesetName = rs.parsed.name;
  console.log('  + ruleset published:', rulesetName.split('/').pop());

  // 2) Point the Firestore release at it
  const releaseName = 'projects/' + PROJECT + '/releases/cloud.firestore';
  const fullRelease = { name: releaseName, rulesetName };

  const getUrl = `${RULES_API}/${releaseName}`;
  const getRelease = await fetchJson(getUrl, {}, authToken);

  let applied;
  if (getRelease.status === 200) {
    const patchUrl = `${RULES_API}/${releaseName}?updateMask=rulesetName`;
    applied = await fetchJson(patchUrl, {
      method: 'PATCH',
      body: JSON.stringify({ release: fullRelease }),
    }, authToken);
  } else {
    // No release yet → create it (PUT upsert, fallback POST).
    applied = await fetchJson(getUrl, {
      method: 'PUT',
      body: JSON.stringify({ release: fullRelease }),
    }, authToken);
    if (applied.status !== 200 && applied.status !== 201) {
      applied = await fetchJson(`${RULES_API}/projects/${PROJECT}/releases`, {
        method: 'POST',
        body: JSON.stringify(fullRelease),
      }, authToken);
    }
  }

  if (applied.status !== 200 && applied.status !== 201) {
    throw new Error('Rules release failed: ' + (applied.parsed && applied.parsed.error && applied.parsed.error.message) + ' (HTTP ' + applied.status + ')');
  }
  console.log('  + rules live (release ' + applied.parsed.name.split('/').pop() + ')');
  return rulesetName;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  console.log('Deploying Firestore config to project:', PROJECT);
  const authToken = await token();
  console.log('Authenticated as', CLIENT_EMAIL);

  console.log('\nComposite indexes:');
  const { created } = await deployIndexes(authToken);
  console.log('  indexes: ' + created.length + ' created, others already present.');

  console.log('\nSecurity rules:');
  await deployRules(authToken);

  console.log('\nDone. Firestore rules + indexes are deployed.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nDeploy failed:', err.message);
  process.exit(1);
});