/**
 * Legacy API Server für FWV Raura
 * Express-Server mit OTP-basierter Authentifizierung und GitHub-Storage
 * Wird für Kontaktformulare, Newsletter und Event-Registrierungen verwendet
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');        // Sicherheits-Header (XSS, CSRF, etc.)
const rateLimit = require('express-rate-limit');  // Rate-Limiting gegen DDoS
require('dotenv').config();  // Lädt Umgebungsvariablen aus .env

// ========== ROUTE IMPORTS ==========
const contactRoutes = require('./routes/contact');     // Kontaktformular-Endpunkte
const eventRoutes = require('./routes/events');        // Event-Registrierungen
const newsletterRoutes = require('./routes/newsletter'); // Newsletter An-/Abmeldung
const calendarRoutes = require('./routes/calendar');   // Kalender-PDF-Generierung
const memberRoutes = require('./routes/members');      // Mitglieder-Registrierung
const authRoutes = require('./routes/auth');           // OTP-Authentifizierung
const { startBackupSchedule } = require('./utils/backup'); // DB-Backup-Scheduler

// ========== EXPRESS APP INITIALISIERUNG ==========
const app = express();
const PORT = process.env.PORT || 3000;  // Standard-Port: 3000

// ========== SICHERHEITS-MIDDLEWARE ==========
// Helmet setzt verschiedene HTTP-Header zum Schutz vor bekannten Web-Schwachstellen
app.use(helmet());
// CORS erlaubt nur Anfragen von der offiziellen Website
app.use(cors({
    origin: process.env.WEBSITE_URL || 'https://www.fwv-raura.ch',
    credentials: true  // Erlaubt das Senden von Cookies
}));

// ========== RATE LIMITING ==========
// Begrenzt Anfragen pro IP um Missbrauch und DDoS zu verhindern
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Zeitfenster: 15 Minuten
    max: 100  // Max. 100 Anfragen pro IP im Zeitfenster
});
app.use(limiter);

// ========== BODY PARSER ==========
// Aktiviert das Parsen von JSON und URL-encoded Bodies
app.use(express.json());  // Für JSON-Payloads
app.use(express.urlencoded({ extended: true }));  // Für Formular-Daten

// ========== HEALTH CHECK ENDPUNKT ==========
// Wird von Docker/Kubernetes für Liveness-Checks verwendet
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== API ROUTEN REGISTRIERUNG ==========
app.use('/api/contact', contactRoutes);     // POST /api/contact - Kontaktformular
app.use('/api/events', eventRoutes);        // Event-Anmeldungen
app.use('/api/newsletter', newsletterRoutes); // Newsletter-Verwaltung
app.use('/api/calendar', calendarRoutes);   // Kalender-PDF
app.use('/api/members', memberRoutes);      // Mitgliedschaftsanträge
app.use('/api/auth', authRoutes);           // OTP-Login

// ========== GLOBALER FEHLER-HANDLER ==========
// Fängt alle nicht behandelten Fehler ab und gibt eine JSON-Antwort zurück
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        // Stacktrace nur in Entwicklungsumgebung anzeigen
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ========== 404 HANDLER ==========
// Gibt 404 für alle nicht gefundenen Routen zurück
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// ========== SERVER STARTEN ==========
app.listen(PORT, () => {
    console.log(`🚀 API Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
});
