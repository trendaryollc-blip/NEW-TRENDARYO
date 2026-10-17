'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { MockFirestore } = require('./helpers/fake-firestore');

const { ensureBlogBrief, missingBriefs } = require('../api/_lib/content-briefs');

/* ---------- the shared brief creator ---------- */

test('brief creator: builds the shell from the approved snapshot', async () => {
    const db = new MockFirestore();
    const published = {
        sections: { title: 'Aurora ANC Headphones - quiet that lasts | Trendaryo', shortDescription: 'Hybrid ANC.' },
        faqs: [{ q: 'How loud is the ANC?', a: 'Most low-frequency noise, gone.' }],
        seo: { keywords: ['anc headphones', 'noise cancelling'], metaDescription: 'Quiet that lasts.' },
        publishedAt: '2026-02-01T00:00:00.000Z'
    };
    const res = await ensureBlogBrief(db, 'p1', published, { uid: 'a1' }, { price: 149, category: 'tech' });
    assert.strictEqual(res.created, true);
    const brief = db.raw('blog_briefs', 'brief-p1');
    assert.strictEqual(brief.status, 'READY_FOR_GENERATION');
    assert.strictEqual(brief.primaryKeyword, 'anc headphones');
    assert.strictEqual(brief.source.price, 149);
    assert.strictEqual(brief.source.category, 'tech');
    assert.strictEqual(brief.faqs.length, 1);
});

test('brief creator: an enriched brief keeps its plan, only the source refreshes', async () => {
    const db = new MockFirestore({
        blog_briefs: [{ id: 'brief-p1', productId: 'p1', status: 'BRIEF_READY', primaryKeyword: 'best anc headphones 2026', h2Suggestions: [{ text: 'Planned', note: '' }], source: {} }]
    });
    const res = await ensureBlogBrief(db, 'p1', { sections: { title: 'Edited title' }, seo: {} }, null, null);
    assert.strictEqual(res.created, false);
    assert.strictEqual(db.rawAll('blog_briefs').length, 1);
    assert.strictEqual(db.raw('blog_briefs', 'brief-p1').primaryKeyword, 'best anc headphones 2026');
    assert.strictEqual(db.raw('blog_briefs', 'brief-p1').source.contentTitle, 'Edited title');
});

test('brief creator: missingBriefs finds published content without a brief', async () => {
    const db = new MockFirestore({
        product_content: [
            { id: 'p1', status: 'published', published: { sections: { title: 'Live one' } } },
            { id: 'p2', status: 'draft', sections: { title: 'Draft one' } },
            { id: 'p3', status: 'published', published: { sections: { title: 'Covered one' } } }
        ],
        blog_briefs: [{ id: 'brief-p3', productId: 'p3', status: 'BRIEF_READY' }]
    });
    const missing = await missingBriefs(db, 10);
    assert.strictEqual(missing.length, 1);
    assert.strictEqual(missing[0].id, 'p1');
});

/* ---------- Phase 27: the pipeline automation rules ---------- */

test('automation: missing-brief-backfill creates the missing shells', async () => {
    /* Fresh module so mail stubs in other suites cannot leak here. */
    const automations = require('../api/_lib/automations');
    const db = new MockFirestore({
        product_content: [
            {
                id: 'p1', status: 'published',
                published: { sections: { title: 'Live title' }, faqs: [], seo: { keywords: ['anc headphones'] }, publishedAt: '2026-02-01T00:00:00.000Z' }
            }
        ],
        products: [{ id: 'p1', name: 'Aurora', price: 149, category: 'tech' }]
    });
    await automations.ensureSeeded(db);
    await automations.updateRule(db, 'missing-brief-backfill', { enabled: true });
    const dry = await automations.runRule(db, 'missing-brief-backfill', { trigger: 'manual', dryRun: true });
    assert.strictEqual(dry.matched, 1, 'the orphaned product matches');

    const run = await automations.runRule(db, 'missing-brief-backfill', { trigger: 'manual' });
    assert.ok(run.acted >= 1, 'the brief was created');
    const brief = db.raw('blog_briefs', 'brief-p1');
    assert.ok(brief, 'shell exists in the database');
    assert.strictEqual(brief.status, 'READY_FOR_GENERATION');
    assert.strictEqual(brief.source.price, 149);

    const again = await automations.runRule(db, 'missing-brief-backfill', { trigger: 'manual', dryRun: true });
    assert.strictEqual(again.matched, 0, 'no second run once the brief exists');
});

test('automation: content-draft-escalation flags stale drafts and ignores fresh ones', async () => {
    const automations = require('../api/_lib/automations');
    const stale = new Date(Date.now() - 10 * 86400000).toISOString();
    const fresh = new Date().toISOString();
    const db = new MockFirestore({
        product_content: [
            { id: 'stale-draft', status: 'draft', sections: { title: 'Forgotten' }, updatedAt: stale },
            { id: 'stale-review', status: 'review_pending', sections: { title: 'Waiting' }, updatedAt: stale },
            { id: 'fresh-draft', status: 'draft', sections: { title: 'New' }, updatedAt: fresh },
            { id: 'ready-live', status: 'ready_to_publish', sections: { title: 'Ready' }, updatedAt: stale }
        ]
    });
    await automations.ensureSeeded(db);
    await automations.updateRule(db, 'content-draft-escalation', { enabled: true, config: { days: 5 } });
    const dry = await automations.runRule(db, 'content-draft-escalation', { trigger: 'manual', dryRun: true });
    assert.strictEqual(dry.matched, 2, 'only stale draft/review rows match');
    const ids = dry.results.map((r) => r.entity).sort();
    assert.deepStrictEqual(ids, ['stale-draft', 'stale-review']);

    await automations.runRule(db, 'content-draft-escalation', { trigger: 'manual' });
    assert.ok(db.raw('automation_alerts', 'content-stale-draft'), 'alert raised');
    assert.ok(db.raw('automation_alerts', 'content-stale-review'), 'alert raised for review_pending');
});
