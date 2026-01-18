const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const ical = require('ical-generator').default;
const axios = require('axios');
const { authenticateToken, authenticateAny, requireRole } = require('./auth-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Dispatch API für E-Mails
const DISPATCH_API = process.env.DISPATCH_API_URL || 'http://api-dispatch:3000';

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'api-events', version: process.env.APP_VERSION || '0.0.0' });
});

// ============================================
// EVENTS
// ============================================

app.get('/events', async (req, res) => {
    try {
        const { upcoming, category } = req.query;
        let query = 'SELECT * FROM events WHERE 1=1';
        const params = [];

        if (upcoming === 'true') {
            query += ' AND start_date >= NOW()';
        }
        if (category) {
            params.push(category);
            query += ` AND category = $${params.length}`;
        }

        query += ' ORDER BY start_date';
        const eventsResult = await pool.query(query, params);

        // Fetch shifts for all events with registration info
        const events = await Promise.all(eventsResult.rows.map(async (event) => {
            const shifts = await pool.query(
                'SELECT * FROM shifts WHERE event_id = $1 ORDER BY date, start_time',
                [event.id]
            );

            // Get registrations for each shift
            const shiftsWithRegistrations = await Promise.all(shifts.rows.map(async (shift) => {
                const registrations = await pool.query(`
                    SELECT r.id, r.guest_name, r.status, r.member_id, m.vorname, m.nachname
                    FROM registrations r
                    LEFT JOIN members m ON r.member_id = m.id
                    WHERE $1 = ANY(r.shift_ids)
                `, [shift.id]);

                const approved = registrations.rows.filter(r => r.status === 'approved');
                const pending = registrations.rows.filter(r => r.status === 'pending');

                return {
                    ...shift,
                    registrations: {
                        approved: approved.map(r => ({
                            id: r.id,
                            name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name
                        })),
                        pending: pending.map(r => ({
                            id: r.id,
                            name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name
                        })),
                        approvedCount: approved.length,
                        pendingCount: pending.length,
                        spotsLeft: shift.needed - approved.length
                    }
                };
            }));

            return { ...event, shifts: shiftsWithRegistrations };
        }));

        res.json(events);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/events/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Try UUID first, then slug
        let event;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (uuidRegex.test(id)) {
            event = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
        } else {
            event = await pool.query('SELECT * FROM events WHERE slug = $1', [id]);
        }

        if (event.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        // Get shifts with registration info
        const shifts = await pool.query(
            'SELECT * FROM shifts WHERE event_id = $1 ORDER BY date, start_time',
            [event.rows[0].id]
        );

        // Get registrations for each shift
        const shiftsWithRegistrations = await Promise.all(shifts.rows.map(async (shift) => {
            const registrations = await pool.query(`
                SELECT r.id, r.guest_name, r.status, r.member_id, m.vorname, m.nachname
                FROM registrations r
                LEFT JOIN members m ON r.member_id = m.id
                WHERE $1 = ANY(r.shift_ids)
            `, [shift.id]);

            const approved = registrations.rows.filter(r => r.status === 'approved');
            const pending = registrations.rows.filter(r => r.status === 'pending');

            return {
                ...shift,
                registrations: {
                    approved: approved.map(r => ({
                        id: r.id,
                        name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name
                    })),
                    pending: pending.map(r => ({
                        id: r.id,
                        name: r.member_id ? `${r.vorname} ${r.nachname}` : r.guest_name
                    })),
                    approvedCount: approved.length,
                    pendingCount: pending.length,
                    spotsLeft: shift.needed - approved.length
                }
            };
        }));

        res.json({ ...event.rows[0], shifts: shiftsWithRegistrations });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/events', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const {
            slug, title, subtitle, description, start_date, end_date,
            location, organizer_id, category, registration_required,
            registration_deadline, max_participants, cost, status, image_url, tags
        } = req.body;

        const result = await pool.query(`
            INSERT INTO events (
                slug, title, subtitle, description, start_date, end_date,
                location, organizer_id, category, registration_required,
                registration_deadline, max_participants, cost, status, image_url, tags
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
            RETURNING *
        `, [
            slug, title, subtitle, description, start_date, end_date,
            location, organizer_id, category, registration_required,
            registration_deadline, max_participants, cost, status || 'planned', image_url, tags
        ]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/events/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const fields = Object.keys(updates);
        const values = Object.values(updates);

        const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
        values.push(id);

        const result = await pool.query(`
            UPDATE events SET ${setClause}, updated_at = NOW()
            WHERE id = $${values.length}
            RETURNING *
        `, values);

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/events/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM events WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json({ message: 'Event deleted', id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SHIFTS
// ============================================

app.get('/shifts', async (req, res) => {
    try {
        const { event_id } = req.query;
        let query = 'SELECT s.*, e.title as event_title FROM shifts s JOIN events e ON s.event_id = e.id';

        if (event_id) {
            query += ' WHERE s.event_id = $1';
            const result = await pool.query(query, [event_id]);
            return res.json(result.rows);
        }

        const result = await pool.query(query + ' ORDER BY s.date, s.start_time');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/shifts', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { event_id, name, description, date, start_time, end_time, needed, bereich } = req.body;

        const result = await pool.query(`
            INSERT INTO shifts (event_id, name, description, date, start_time, end_time, needed, bereich)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [event_id, name, description, date, start_time, end_time, needed, bereich || 'Allgemein']);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/shifts/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, date, start_time, end_time, needed, bereich } = req.body;

        const result = await pool.query(`
            UPDATE shifts SET
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                date = COALESCE($3, date),
                start_time = COALESCE($4, start_time),
                end_time = COALESCE($5, end_time),
                needed = COALESCE($6, needed),
                bereich = COALESCE($7, bereich)
            WHERE id = $8
            RETURNING *
        `, [name, description, date, start_time, end_time, needed, bereich, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Shift not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/shifts/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM shifts WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Shift not found' });
        }

        res.json({ message: 'Shift deleted', id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// REGISTRATIONS
// ============================================

app.get('/registrations', authenticateAny, async (req, res) => {
    try {
        const { event_id, member_id } = req.query;
        let query = `
            SELECT r.*, m.vorname, m.nachname, e.title as event_title
            FROM registrations r
            LEFT JOIN members m ON r.member_id = m.id
            JOIN events e ON r.event_id = e.id
            WHERE 1=1
        `;
        const params = [];

        if (event_id) {
            params.push(event_id);
            query += ` AND r.event_id = $${params.length}`;
        }
        if (member_id) {
            params.push(member_id);
            query += ` AND r.member_id = $${params.length}`;
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/registrations', authenticateAny, async (req, res) => {
    try {
        const { event_id, member_id, guest_name, guest_email, shift_ids, notes } = req.body;

        const result = await pool.query(`
            INSERT INTO registrations (event_id, member_id, guest_name, guest_email, shift_ids, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [event_id, member_id, guest_name, guest_email, shift_ids, notes]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Öffentliche Registrierung (Website-Formular, ersetzt n8n)
app.post('/registrations/public', async (req, res) => {
    try {
        const {
            type, eventId, eventTitle, organizerEmail,
            name, email, phone,
            shifts, shiftIds, // für Schicht-Anmeldung
            participants, // für Teilnehmer-Anmeldung
            notes,
            skipMemberCheck // Falls der User trotzdem als Gast anmelden möchte
        } = req.body;

        // Prüfen ob die E-Mail zu einem Mitglied gehört
        if (!skipMemberCheck && email) {
            const memberCheck = await pool.query(
                'SELECT id, vorname, nachname, email FROM members WHERE LOWER(email) = LOWER($1)',
                [email]
            );

            if (memberCheck.rows.length > 0) {
                const member = memberCheck.rows[0];
                return res.status(409).json({
                    success: false,
                    isMember: true,
                    message: `Diese E-Mail-Adresse gehört zu einem Mitglied (${member.vorname} ${member.nachname}). Bitte melden Sie sich zuerst an, um sich als Mitglied zu registrieren.`,
                    memberName: `${member.vorname} ${member.nachname}`
                });
            }
        }

        // Event laden (UUID oder Slug)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        let event;
        if (uuidRegex.test(eventId)) {
            event = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
        } else {
            event = await pool.query('SELECT * FROM events WHERE slug = $1', [eventId]);
        }
        if (event.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Event nicht gefunden' });
        }

        // Registrierung speichern
        const registration = await pool.query(`
            INSERT INTO registrations (event_id, guest_name, guest_email, shift_ids, notes, status)
            VALUES ($1, $2, $3, $4, $5, 'pending')
            RETURNING *
        `, [
            event.rows[0].id,
            name,
            email,
            type === 'shift' ? shiftIds : null,
            JSON.stringify({ phone, participants, shifts, notes })
        ]);

        // Shift-Namen für E-Mail zusammenstellen
        let shiftInfo = '';
        if (type === 'shift' && shifts) {
            shiftInfo = `\nGewählte Schichten:\n${shifts.map(s => `- ${s}`).join('\n')}`;
        }

        // Bestätigung an Anmelder
        const confirmSubject = `Bestätigung Ihrer Anmeldung - ${eventTitle}`;
        const confirmBody = `
Guten Tag ${name},

Vielen Dank für Ihre Anmeldung${type === 'shift' ? ' als Helfer/in' : ''}!

Event: ${eventTitle}
${shiftInfo}
${participants ? `Anzahl Personen: ${participants}` : ''}
${notes ? `\nBemerkungen: ${notes}` : ''}

Wir werden Ihre Anmeldung bearbeiten und uns bei Ihnen melden.

Mit freundlichen Grüssen
Feuerwehrverein Raura
        `.trim();

        try {
            await axios.post(`${DISPATCH_API}/email/send`, {
                to: email,
                subject: confirmSubject,
                body: confirmBody
            });
        } catch (emailError) {
            console.error('Bestätigungs-E-Mail konnte nicht gesendet werden:', emailError.message);
        }

        // Benachrichtigung an Organisator
        const orgSubject = `Neue Anmeldung für ${eventTitle}`;
        const orgBody = `
Neue ${type === 'shift' ? 'Helfer-' : 'Teilnehmer-'}Anmeldung eingegangen!

Name: ${name}
E-Mail: ${email}
${phone ? `Telefon: ${phone}` : ''}
${shiftInfo}
${participants ? `Anzahl Personen: ${participants}` : ''}
${notes ? `\nBemerkungen: ${notes}` : ''}
        `.trim();

        try {
            await axios.post(`${DISPATCH_API}/email/send`, {
                to: organizerEmail || process.env.CONTACT_EMAIL || 'kontakt@fwv-raura.ch',
                subject: orgSubject,
                body: orgBody,
                event_id: event.rows[0].id
            });
        } catch (emailError) {
            console.error('Organisator-E-Mail konnte nicht gesendet werden:', emailError.message);
        }

        res.json({
            success: true,
            message: 'Anmeldung erfolgreich',
            registrationId: registration.rows[0].id
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// REGISTRATION MANAGEMENT (Vorstand)
// ============================================

// Get all registrations with filters (Vorstand only)
app.get('/registrations/manage', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { event_id, status } = req.query;
        let query = `
            SELECT r.*, e.title as event_title, e.slug as event_slug,
                   m.vorname, m.nachname
            FROM registrations r
            JOIN events e ON r.event_id = e.id
            LEFT JOIN members m ON r.member_id = m.id
            WHERE 1=1
        `;
        const params = [];

        if (event_id) {
            params.push(event_id);
            query += ` AND r.event_id = $${params.length}`;
        }
        if (status) {
            params.push(status);
            query += ` AND r.status = $${params.length}`;
        }

        query += ' ORDER BY r.created_at DESC';

        const result = await pool.query(query, params);

        // Parse notes JSON and add shift names
        for (const reg of result.rows) {
            if (reg.notes) {
                try {
                    reg.notes_data = JSON.parse(reg.notes);
                } catch (e) {
                    reg.notes_data = { notes: reg.notes };
                }
            }
            // Get shift names
            if (reg.shift_ids && reg.shift_ids.length > 0) {
                const shifts = await pool.query(
                    'SELECT id, name, date, start_time, end_time FROM shifts WHERE id = ANY($1)',
                    [reg.shift_ids]
                );
                reg.shifts = shifts.rows;
            }
        }

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Approve registration
app.post('/registrations/:id/approve', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            UPDATE registrations
            SET status = 'approved', approved_by = $2, approved_at = NOW(), confirmed_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id, req.user.email || req.user.name]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        const reg = result.rows[0];

        // Send approval email
        if (reg.guest_email) {
            const event = await pool.query('SELECT title FROM events WHERE id = $1', [reg.event_id]);
            try {
                await axios.post(`${DISPATCH_API}/email/send`, {
                    to: reg.guest_email,
                    subject: `Ihre Anmeldung wurde bestätigt - ${event.rows[0]?.title}`,
                    body: `Guten Tag ${reg.guest_name},\n\nIhre Anmeldung für "${event.rows[0]?.title}" wurde bestätigt.\n\nWir freuen uns auf Sie!\n\nMit freundlichen Grüssen\nFeuerwehrverein Raura`
                });
            } catch (emailErr) {
                console.error('Approval email failed:', emailErr.message);
            }
        }

        res.json({ success: true, registration: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reject registration
app.post('/registrations/:id/reject', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const result = await pool.query(`
            UPDATE registrations
            SET status = 'rejected', approved_by = $2, approved_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id, req.user.email || req.user.name]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        const reg = result.rows[0];

        // Send rejection email
        if (reg.guest_email) {
            const event = await pool.query('SELECT title FROM events WHERE id = $1', [reg.event_id]);
            try {
                await axios.post(`${DISPATCH_API}/email/send`, {
                    to: reg.guest_email,
                    subject: `Ihre Anmeldung - ${event.rows[0]?.title}`,
                    body: `Guten Tag ${reg.guest_name},\n\nLeider können wir Ihre Anmeldung für "${event.rows[0]?.title}" nicht berücksichtigen.\n\n${reason ? `Grund: ${reason}\n\n` : ''}Bei Fragen kontaktieren Sie uns bitte.\n\nMit freundlichen Grüssen\nFeuerwehrverein Raura`
                });
            } catch (emailErr) {
                console.error('Rejection email failed:', emailErr.message);
            }
        }

        res.json({ success: true, registration: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update registration (Vorstand)
app.put('/registrations/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { guest_name, guest_email, phone, shift_ids, notes, status } = req.body;

        const result = await pool.query(`
            UPDATE registrations
            SET guest_name = COALESCE($2, guest_name),
                guest_email = COALESCE($3, guest_email),
                phone = COALESCE($4, phone),
                shift_ids = COALESCE($5, shift_ids),
                notes = COALESCE($6, notes),
                status = COALESCE($7, status)
            WHERE id = $1
            RETURNING *
        `, [id, guest_name, guest_email, phone, shift_ids, notes, status]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete registration (Vorstand)
app.delete('/registrations/:id', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM registrations WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        res.json({ success: true, message: 'Registration deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// CALENDAR (ICS)
// ============================================

app.get('/calendar/ics', async (req, res) => {
    try {
        const events = await pool.query('SELECT * FROM events WHERE status != $1 ORDER BY start_date', ['cancelled']);

        const calendar = ical({
            name: 'Feuerwehrverein Raura',
            timezone: 'Europe/Zurich'
        });

        events.rows.forEach(event => {
            calendar.createEvent({
                start: new Date(event.start_date),
                end: event.end_date ? new Date(event.end_date) : undefined,
                summary: event.title,
                description: event.description,
                location: event.location
            });
        });

        res.type('text/calendar').send(calendar.toString());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SHIFT REMINDERS (automated notifications)
// ============================================

// Send reminders for upcoming shifts
app.post('/shifts/send-reminders', authenticateAny, requireRole('vorstand', 'admin'), async (req, res) => {
    try {
        const { days_ahead = 1 } = req.body;

        // Get shifts in the next X days
        const fromDate = new Date();
        const toDate = new Date();
        toDate.setDate(toDate.getDate() + days_ahead);

        const shiftsResult = await pool.query(`
            SELECT s.*, e.title as event_title, e.location, e.slug
            FROM shifts s
            JOIN events e ON s.event_id = e.id
            WHERE s.date BETWEEN $1 AND $2
            AND e.status NOT IN ('cancelled')
            ORDER BY s.date, s.start_time
        `, [fromDate.toISOString().split('T')[0], toDate.toISOString().split('T')[0]]);

        const shifts = shiftsResult.rows;
        let sentCount = 0;
        let errors = [];

        for (const shift of shifts) {
            // Get registrations for this shift
            const regsResult = await pool.query(`
                SELECT r.*, m.vorname, m.nachname, m.email
                FROM registrations r
                LEFT JOIN members m ON r.member_id = m.id
                WHERE r.event_id = $1
                AND r.shift_ids && ARRAY[$2::uuid]
                AND r.status = 'confirmed'
            `, [shift.event_id, shift.id]);

            const registrations = regsResult.rows;

            for (const reg of registrations) {
                const email = reg.email || reg.guest_email;
                const name = reg.vorname && reg.nachname ? `${reg.vorname} ${reg.nachname}` : reg.guest_name;

                if (!email) continue;

                const shiftDate = new Date(shift.date);
                const dateStr = shiftDate.toLocaleDateString('de-CH', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                const timeStr = shift.start_time && shift.end_time
                    ? `${shift.start_time} - ${shift.end_time}`
                    : shift.start_time || 'ganztägig';

                const subject = `Erinnerung: Ihre Schicht am ${dateStr}`;
                const body = `
Guten Tag ${name},

Dies ist eine Erinnerung an Ihre Schicht:

Event: ${shift.event_title}
Schicht: ${shift.name}
Datum: ${dateStr}
Zeit: ${timeStr}
${shift.location ? `Ort: ${shift.location}` : ''}

Bitte seien Sie pünktlich vor Ort.

Bei Fragen oder wenn Sie verhindert sind, melden Sie sich bitte umgehend bei uns.

Mit freundlichen Grüssen
Feuerwehrverein Raura
                `.trim();

                try {
                    await axios.post(`${DISPATCH_API}/email/send`, {
                        to: email,
                        subject: subject,
                        body: body,
                        event_id: shift.event_id
                    });
                    sentCount++;
                } catch (error) {
                    console.error(`Failed to send reminder to ${email}:`, error.message);
                    errors.push({ email, error: error.message });
                }
            }
        }

        res.json({
            success: true,
            shifts_checked: shifts.length,
            reminders_sent: sentCount,
            errors: errors
        });

    } catch (error) {
        console.error('Error sending shift reminders:', error);
        res.status(500).json({ error: error.message });
    }
});

// Cron-compatible endpoint (can be called without auth via API key)
app.post('/shifts/cron-reminders', requireApiKey, async (req, res) => {
    try {
        // Send reminders for shifts happening tomorrow
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() + 1);
        const toDate = new Date(fromDate);

        const shiftsResult = await pool.query(`
            SELECT s.*, e.title as event_title, e.location, e.slug
            FROM shifts s
            JOIN events e ON s.event_id = e.id
            WHERE s.date = $1
            AND e.status NOT IN ('cancelled')
            ORDER BY s.start_time
        `, [fromDate.toISOString().split('T')[0]]);

        const shifts = shiftsResult.rows;
        let sentCount = 0;

        for (const shift of shifts) {
            const regsResult = await pool.query(`
                SELECT r.*, m.vorname, m.nachname, m.email
                FROM registrations r
                LEFT JOIN members m ON r.member_id = m.id
                WHERE r.event_id = $1
                AND r.shift_ids && ARRAY[$2::uuid]
                AND r.status = 'confirmed'
            `, [shift.event_id, shift.id]);

            for (const reg of regsResult.rows) {
                const email = reg.email || reg.guest_email;
                const name = reg.vorname && reg.nachname ? `${reg.vorname} ${reg.nachname}` : reg.guest_name;

                if (!email) continue;

                const shiftDate = new Date(shift.date);
                const dateStr = shiftDate.toLocaleDateString('de-CH', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                const timeStr = shift.start_time && shift.end_time
                    ? `${shift.start_time} - ${shift.end_time}`
                    : shift.start_time || 'ganztägig';

                const subject = `Erinnerung: Ihre Schicht morgen am ${dateStr}`;
                const body = `
Guten Tag ${name},

Dies ist eine Erinnerung an Ihre Schicht MORGEN:

Event: ${shift.event_title}
Schicht: ${shift.name}
Datum: ${dateStr}
Zeit: ${timeStr}
${shift.location ? `Ort: ${shift.location}` : ''}

Bitte seien Sie pünktlich vor Ort.

Bei Fragen oder wenn Sie verhindert sind, melden Sie sich bitte umgehend bei uns.

Mit freundlichen Grüssen
Feuerwehrverein Raura
                `.trim();

                try {
                    await axios.post(`${DISPATCH_API}/email/send`, {
                        to: email,
                        subject: subject,
                        body: body,
                        event_id: shift.event_id
                    }, {
                        headers: { 'x-api-key': process.env.API_KEY }
                    });
                    sentCount++;
                } catch (error) {
                    console.error(`Failed to send reminder to ${email}:`, error.message);
                }
            }
        }

        res.json({
            success: true,
            date: fromDate.toISOString().split('T')[0],
            shifts_found: shifts.length,
            reminders_sent: sentCount
        });

    } catch (error) {
        console.error('Error in cron reminders:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper endpoint to get missing API key for auth middleware
function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    next();
}

app.listen(PORT, () => {
    console.log(`API-Events running on port ${PORT}`);
});
