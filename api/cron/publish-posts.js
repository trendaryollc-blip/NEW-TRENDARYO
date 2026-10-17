const { initFirebase } = require('../_lib/firebase');
const { beat } = require('../_lib/health');

/**
 * Scheduled publishing for the blog.
 * Flips any draft whose scheduledFor is in the past to published, stamps
 * publishedAt and reports what went live. Runs every 15 minutes via cron.
 */
module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  const started = Date.now();
  try {
    const { db } = initFirebase();
    const now = new Date().toISOString();

    const snap = await db.collection('blog')
      .where('status', '==', 'draft')
      .get();

    const due = snap.docs.filter((doc) => {
      const when = doc.data().scheduledFor;
      return when && when <= now;
    });

    const published = [];
    for (const doc of due) {
      await doc.ref.update({
        status: 'published',
        publishedAt: now,
        updatedAt: now,
        scheduledFor: null,
      });
      published.push({ slug: doc.id, title: doc.data().title });
    }

    await beat(db, 'cron:publish-posts', {
      status: 'ok',
      detail: published.length + ' post(s) published',
      durationMs: Date.now() - started,
    });

    return res.status(200).json({
      ok: true,
      published: published.length,
      data: published,
    });
  } catch (error) {
    console.error('Publish posts cron error:', error);
    try {
      const { db } = initFirebase();
      await beat(db, 'cron:publish-posts', {
        status: 'error',
        detail: error.message,
        durationMs: Date.now() - started,
      });
    } catch (ignored) { /* health must never mask the failure */ }
    return res.status(500).json({ error: { message: error.message } });
  }
};
