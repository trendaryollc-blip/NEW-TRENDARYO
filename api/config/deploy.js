'use strict';
const { handleCors } = require('../_lib/cors');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const gitSha = process.env.GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'local';
  const deployedAt = process.env.DEPLOYED_AT || process.env.VERCEL_DEPLOYMENT_CREATED_AT || null;
  const env = process.env.NODE_ENV || 'development';

  res.status(200).json({
    data: {
      gitSha: String(gitSha).slice(0, 12),
      deployedAt,
      env,
    },
  });
};
