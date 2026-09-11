// API for custom forms: the host's builder, the public fill page, responses
// and export. Standalone forms have their own public link (/f/:slug); an
// event's RSVP questions are a form of kind 'rsvp', answered through the RSVP
// endpoint instead (see server.js).

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const {
  normalizeFields,
  normalizeSettings,
  validateAnswers,
  closedReason,
  summarize,
  emailField,
  FIELD_TYPES,
  LIMITS,
} = require('./forms');
const { FORM_TEMPLATES, findFormTemplate } = require('./form-templates');
const { toCsv, csvFilename } = require('./csv');

const cleanText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function registerFormRoutes(app, { pool, requireAuth, verifySameOrigin, baseUrl }) {
  const responseLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many submissions from here. Please try again later.' },
  });

  function status(form) {
    if (form.kind === 'rsvp') return form.event_published_at ? 'open' : 'draft';
    if (!form.published_at) return 'draft';
    return closedReason(form, Number(form.response_count) || 0) ? 'closed' : 'open';
  }

  function shape(req, form) {
    return {
      id: form.id,
      slug: form.slug,
      kind: form.kind,
      title: form.title,
      description: form.description || '',
      fields: form.fields,
      settings: form.settings || {},
      templateId: form.template_id,
      status: status(form),
      publishedAt: form.published_at,
      closedAt: form.closed_at,
      eventId: form.event_id,
      eventName: form.event_name || null,
      responseCount: Number(form.response_count) || 0,
      questionCount: (form.fields || []).filter((f) => FIELD_TYPES[f.type]?.answer).length,
      shareUrl: form.kind === 'standalone' ? `${baseUrl(req)}/f/${form.slug}` : null,
      createdAt: form.created_at,
      updatedAt: form.updated_at,
    };
  }

  // Every host route goes through this: the form must exist AND belong to the
  // signed-in host. id::text keeps a malformed id a 404 instead of a SQL error.
  async function ownedForm(req) {
    const { rows } = await pool.query(
      `SELECT f.*, e.name AS event_name, e.published_at AS event_published_at,
              (SELECT count(*) FROM form_responses r WHERE r.form_id = f.id)::int AS response_count
       FROM forms f LEFT JOIN events e ON e.id = f.event_id
       WHERE f.id::text = $1 AND f.owner_id = $2`,
      [req.params.formId, req.user.id]
    );
    return rows[0] || null;
  }

  // ------------------------------------------------------------ Templates

  app.get('/api/form-templates', (req, res) => {
    res.json(
      FORM_TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        kind: t.kind,
        questions: t.fields.filter((f) => FIELD_TYPES[f.type]?.answer).map((f) => f.label),
      }))
    );
  });

  // ------------------------------------------------------------ Host: forms

  app.get('/api/forms', requireAuth, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT f.*, e.name AS event_name, e.published_at AS event_published_at,
              (SELECT count(*) FROM form_responses r WHERE r.form_id = f.id)::int AS response_count
       FROM forms f LEFT JOIN events e ON e.id = f.event_id
       WHERE f.owner_id = $1
       ORDER BY f.updated_at DESC`,
      [req.user.id]
    );
    res.json(rows.map((f) => shape(req, f)));
  });

  app.post('/api/forms', requireAuth, verifySameOrigin, async (req, res) => {
    const body = req.body || {};
    const eventId = typeof body.eventId === 'string' && body.eventId ? body.eventId : null;

    // RSVP questions: at most one form per event, so asking again opens the
    // existing one rather than failing or making a second.
    if (eventId) {
      const { rows: ev } = await pool.query('SELECT id FROM events WHERE id::text = $1 AND owner_id = $2', [
        eventId,
        req.user.id,
      ]);
      if (!ev[0]) return res.status(404).json({ error: 'Event not found.' });
      const { rows: existing } = await pool.query(`SELECT id FROM forms WHERE event_id = $1 AND kind = 'rsvp'`, [eventId]);
      if (existing[0]) return res.json({ id: existing[0].id, existing: true });
    }

    const template = findFormTemplate(body.templateId) || findFormTemplate(eventId ? 'rsvp-extras' : 'blank');
    const kind = eventId ? 'rsvp' : 'standalone';
    // RSVP questions sit under the RSVP's own name and email, so a template
    // built to stand alone loses its duplicate name/email questions here.
    let source = template.fields;
    if (kind === 'rsvp' && template.kind !== 'rsvp') {
      source = source.filter((f) => f.type !== 'email' && !/^(your |full )?name$/i.test(f.label));
    }

    let fields;
    try {
      fields = normalizeFields(source);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const id = crypto.randomUUID();
    const slug = crypto.randomBytes(6).toString('base64url');
    const title = cleanText(body.title, LIMITS.title) || (kind === 'rsvp' ? 'RSVP questions' : template.title);
    try {
      await pool.query(
        `INSERT INTO forms (id, slug, owner_id, event_id, kind, title, description, fields, template_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        // The template's description is for the gallery, not the respondent,
        // so a new form starts with an empty one for the host to write.
        [id, slug, req.user.id, eventId, kind, title, '', JSON.stringify(fields), template.id]
      );
    } catch (err) {
      // Two tabs creating RSVP questions for the same event at once: the
      // unique index lets exactly one through; hand the other the winner.
      if (err.code === '23505' && eventId) {
        const { rows } = await pool.query(`SELECT id FROM forms WHERE event_id = $1 AND kind = 'rsvp'`, [eventId]);
        return res.json({ id: rows[0].id, existing: true });
      }
      throw err;
    }
    res.json({ id, slug });
  });

  app.get('/api/forms/:formId', requireAuth, async (req, res) => {
    const form = await ownedForm(req);
    if (!form) return res.status(404).json({ error: 'Form not found.' });
    res.json(shape(req, form));
  });

  // Saves whichever of title, description, questions and settings were sent.
  app.put('/api/forms/:formId', requireAuth, verifySameOrigin, async (req, res) => {
    const form = await ownedForm(req);
    if (!form) return res.status(404).json({ error: 'Form not found.' });
    const body = req.body || {};

    let fields = form.fields;
    if (body.fields !== undefined) {
      try {
        fields = normalizeFields(body.fields);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }
    const title = body.title !== undefined ? cleanText(body.title, LIMITS.title) : form.title;
    if (!title) return res.status(400).json({ error: 'Give the form a title.' });
    const description = body.description !== undefined ? cleanText(body.description, LIMITS.description) : form.description;
    const settings = body.settings !== undefined ? normalizeSettings(body.settings) : form.settings;

    await pool.query(
      `UPDATE forms SET title = $1, description = $2, fields = $3, settings = $4, updated_at = now() WHERE id = $5`,
      [title, description, JSON.stringify(fields), JSON.stringify(settings), form.id]
    );
    res.json(shape(req, { ...form, title, description, fields, settings, updated_at: new Date() }));
  });

  app.post('/api/forms/:formId/publish', requireAuth, verifySameOrigin, async (req, res) => {
    const form = await ownedForm(req);
    if (!form) return res.status(404).json({ error: 'Form not found.' });
    if (form.kind !== 'standalone') {
      return res.status(400).json({ error: 'RSVP questions go live with their event.' });
    }
    const publish = req.body?.published !== false;
    if (publish && !form.fields.some((f) => FIELD_TYPES[f.type]?.answer)) {
      return res.status(400).json({ error: 'Add at least one question before publishing.' });
    }
    const { rows } = await pool.query(
      `UPDATE forms SET published_at = CASE WHEN $1 THEN COALESCE(published_at, now()) ELSE NULL END,
                        updated_at = now()
       WHERE id = $2 RETURNING published_at`,
      [publish, form.id]
    );
    res.json({ ok: true, published: Boolean(rows[0].published_at) });
  });

  app.post('/api/forms/:formId/close', requireAuth, verifySameOrigin, async (req, res) => {
    const form = await ownedForm(req);
    if (!form) return res.status(404).json({ error: 'Form not found.' });
    const close = req.body?.closed !== false;
    await pool.query(
      `UPDATE forms SET closed_at = CASE WHEN $1 THEN COALESCE(closed_at, now()) ELSE NULL END, updated_at = now()
       WHERE id = $2`,
      [close, form.id]
    );
    res.json({ ok: true, closed: close });
  });

  app.post('/api/forms/:formId/duplicate', requireAuth, verifySameOrigin, async (req, res) => {
    const form = await ownedForm(req);
    if (!form) return res.status(404).json({ error: 'Form not found.' });
    const id = crypto.randomUUID();
    const slug = crypto.randomBytes(6).toString('base64url');
    // A copy always stands alone: an event can only have one set of RSVP questions.
    await pool.query(
      `INSERT INTO forms (id, slug, owner_id, kind, title, description, fields, settings, template_id)
       VALUES ($1, $2, $3, 'standalone', $4, $5, $6, $7, $8)`,
      [id, slug, req.user.id, `${form.title} (copy)`.slice(0, LIMITS.title), form.description, JSON.stringify(form.fields),
        JSON.stringify(form.settings || {}), form.template_id]
    );
    res.json({ ok: true, id });
  });

  app.delete('/api/forms/:formId', requireAuth, verifySameOrigin, async (req, res) => {
    const form = await ownedForm(req);
    if (!form) return res.status(404).json({ error: 'Form not found.' });
    await pool.query('DELETE FROM forms WHERE id = $1', [form.id]);
    res.json({ ok: true });
  });

  // ------------------------------------------------------------ Host: responses

  async function loadResponses(form) {
    const { rows } = await pool.query(
      `SELECT fr.id, fr.answers, fr.respondent_email, fr.created_at,
              r.name AS guest_name, r.email AS guest_email, r.status AS guest_status
       FROM form_responses fr LEFT JOIN rsvps r ON r.id = fr.rsvp_id
       WHERE fr.form_id = $1
       ORDER BY fr.created_at DESC
       LIMIT 5000`,
      [form.id]
    );
    return rows;
  }

  app.get('/api/forms/:formId/responses', requireAuth, async (req, res) => {
    const form = await ownedForm(req);
    if (!form) return res.status(404).json({ error: 'Form not found.' });
    const rows = await loadResponses(form);
    res.json({
      form: shape(req, form),
      summary: summarize(form.fields, rows),
      responses: rows.map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        answers: r.answers,
        email: r.respondent_email,
        guest: r.guest_name ? { name: r.guest_name, email: r.guest_email, status: r.guest_status } : null,
      })),
    });
  });

  app.get('/api/forms/:formId/responses.csv', requireAuth, async (req, res) => {
    const form = await ownedForm(req);
    if (!form) return res.status(404).json({ error: 'Form not found.' });
    const rows = await loadResponses(form);
    const questions = form.fields.filter((f) => FIELD_TYPES[f.type]?.answer);
    const asCell = (v) => (Array.isArray(v) ? v.join('; ') : v);
    const columns = [
      { label: 'Submitted at', value: (r) => new Date(r.created_at).toISOString() },
      ...(form.kind === 'rsvp'
        ? [
            { label: 'Guest name', value: (r) => r.guest_name },
            { label: 'Guest email', value: (r) => r.guest_email },
            { label: 'RSVP status', value: (r) => r.guest_status },
          ]
        : []),
      ...questions.map((f) => ({ label: f.label, value: (r) => asCell(r.answers?.[f.id]) })),
    ];
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${csvFilename(form.title, 'responses')}"`);
    // Oldest first reads more naturally in a spreadsheet.
    res.send(toCsv(columns, rows.slice().reverse()));
  });

  app.delete('/api/forms/:formId/responses/:responseId', requireAuth, verifySameOrigin, async (req, res) => {
    const form = await ownedForm(req);
    if (!form) return res.status(404).json({ error: 'Form not found.' });
    const { rowCount } = await pool.query('DELETE FROM form_responses WHERE id::text = $1 AND form_id = $2', [
      req.params.responseId,
      form.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Response not found.' });
    res.json({ ok: true });
  });

  // ------------------------------------------------------------ Public

  async function publicForm(slug) {
    const { rows } = await pool.query(
      `SELECT f.*, u.name AS host_name,
              (SELECT count(*) FROM form_responses r WHERE r.form_id = f.id)::int AS response_count
       FROM forms f JOIN users u ON u.id = f.owner_id
       WHERE f.slug = $1 AND f.kind = 'standalone'`,
      [slug]
    );
    return rows[0] || null;
  }

  app.get('/api/f/:slug', async (req, res) => {
    const form = await publicForm(req.params.slug);
    if (!form) return res.status(404).json({ error: 'Form not found.' });
    const isOwner = Boolean(req.user && req.user.id === form.owner_id);
    if (!form.published_at && !isOwner) {
      return res.status(404).json({ error: "This form isn't open yet.", draft: true });
    }
    const reason = form.published_at ? closedReason(form, form.response_count) : null;
    res.json({
      title: form.title,
      description: form.description || '',
      fields: form.fields,
      draft: !form.published_at,
      isOwner,
      ...(isOwner ? { formId: form.id } : {}),
      closed: Boolean(reason),
      closedReason: reason,
    });
  });

  app.post('/api/f/:slug/responses', responseLimiter, async (req, res) => {
    const body = req.body || {};
    // A field real people never see: anything typed into it is a bot. Answer
    // as if it worked, so the bot learns nothing.
    if (typeof body.website === 'string' && body.website.trim()) return res.json({ ok: true });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock the form so a response limit or one-per-email rule can't be
      // slipped past by two submissions arriving together.
      const { rows } = await client.query(
        `SELECT * FROM forms WHERE slug = $1 AND kind = 'standalone' FOR UPDATE`,
        [req.params.slug]
      );
      const form = rows[0];
      if (!form || !form.published_at) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: "This form isn't open." });
      }
      const { rows: countRows } = await client.query(
        'SELECT count(*)::int AS n FROM form_responses WHERE form_id = $1',
        [form.id]
      );
      const reason = closedReason(form, countRows[0].n);
      if (reason) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: reason, closed: true });
      }

      const result = validateAnswers(form.fields, body.answers);
      if (!result.ok) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Please check the highlighted questions.', fieldErrors: result.errors });
      }

      const ef = emailField(form.fields);
      const email = ef ? result.answers[ef.id] || null : null;
      if (form.settings?.onePerEmail && email) {
        const { rows: dup } = await client.query(
          'SELECT 1 FROM form_responses WHERE form_id = $1 AND lower(respondent_email) = lower($2) LIMIT 1',
          [form.id, email]
        );
        if (dup[0]) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: 'This email address has already responded.',
            fieldErrors: { [ef.id]: 'This email address has already responded.' },
          });
        }
      }

      await client.query(
        `INSERT INTO form_responses (id, form_id, respondent_email, answers) VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), form.id, email, JSON.stringify(result.answers)]
      );
      await client.query('COMMIT');
      res.json({ ok: true, confirmationMessage: form.settings?.confirmationMessage || '' });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Form response failed:', err);
      res.status(500).json({ error: 'Could not save your response. Please try again.' });
    } finally {
      client.release();
    }
  });
}

module.exports = { registerFormRoutes };
