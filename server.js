const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const session = require('express-session');
const XLSX = require('xlsx');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'lektion123';

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'exit-ticket-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 },
}));
app.use(express.static('public'));

function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  res.status(401).json({ error: 'Ej inloggad.' });
}

let wordCounts = {};
let submissions = [];
let savedSessions = [];

function makeExportHandlers(getSubs) {
  return {
    txt(req, res, filename) {
      const subs = getSubs();
      const text = subs.map(s => `${s.nr}. ${s.svar}`).join('\n');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.txt"`);
      res.send(text);
    },
    csv(req, res, filename) {
      const subs = getSubs();
      const rows = ['Nr,Tidsstämpel,Svar', ...subs.map(s =>
        `${s.nr},"${s.tidsstämpel}","${s.svar.replace(/"/g, '""')}"`
      )];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send('﻿' + rows.join('\n'));
    },
    excel(req, res, filename) {
      const subs = getSubs();
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(subs, { header: ['nr', 'tidsstämpel', 'svar'] });
      ws['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 80 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Svar');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      res.send(buf);
    },
  };
}

// ── Student routes ──────────────────────────────────────────

app.post('/submit', (req, res) => {
  const { sentence } = req.body;
  if (!sentence || !sentence.trim()) {
    return res.status(400).json({ error: 'Skriv en mening.' });
  }
  const text = sentence.trim();
  submissions.push({ nr: submissions.length + 1, tidsstämpel: new Date().toISOString(), svar: text });
  const key = text.toLowerCase().replace(/\s+/g, ' ');
  wordCounts[key] = (wordCounts[key] || 0) + 1;
  io.emit('update', { wordCounts, submissionCount: submissions.length });
  res.json({ success: true, submissionCount: submissions.length });
});

app.get('/words', (req, res) => {
  res.json({ wordCounts, submissionCount: submissions.length });
});

// ── Admin routes ────────────────────────────────────────────

app.get('/admin', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Fel användarnamn eller lösenord.' });
  }
});

app.post('/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/admin/dashboard', (req, res) => {
  if (!req.session.isAdmin) return res.redirect('/admin');
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

app.get('/admin/session', (req, res) => {
  if (!req.session.isAdmin) return res.redirect('/admin');
  res.sendFile(path.join(__dirname, 'public', 'admin-session.html'));
});

app.post('/reset', requireAdmin, (req, res) => {
  if (submissions.length > 0) {
    const snap = {
      id: savedSessions.length + 1,
      sparadDatum: new Date().toISOString(),
      antalSvar: submissions.length,
      wordCounts: { ...wordCounts },
      submissions: [...submissions],
    };
    savedSessions.push(snap);
    io.emit('session-saved', { id: snap.id, sparadDatum: snap.sparadDatum, antalSvar: snap.antalSvar });
  }
  wordCounts = {};
  submissions = [];
  io.emit('update', { wordCounts, submissionCount: 0 });
  res.json({ success: true });
});

// List saved sessions (summary only)
app.get('/admin/sessions', requireAdmin, (req, res) => {
  res.json(savedSessions.map(({ id, sparadDatum, antalSvar }) => ({ id, sparadDatum, antalSvar })));
});

// Full data for one session
app.get('/admin/sessions/:id', requireAdmin, (req, res) => {
  const snap = savedSessions.find(s => s.id === parseInt(req.params.id));
  if (!snap) return res.status(404).json({ error: 'Hittades inte.' });
  res.json(snap);
});

// Exports for current live session
const liveExports = makeExportHandlers(() => submissions);
app.get('/export/txt',   requireAdmin, (req, res) => liveExports.txt(req, res, 'svar'));
app.get('/export/csv',   requireAdmin, (req, res) => liveExports.csv(req, res, 'svar'));
app.get('/export/excel', requireAdmin, (req, res) => liveExports.excel(req, res, 'svar'));

// Exports for a saved session
app.get('/admin/sessions/:id/export/txt', requireAdmin, (req, res) => {
  const snap = savedSessions.find(s => s.id === parseInt(req.params.id));
  if (!snap) return res.status(404).json({ error: 'Hittades inte.' });
  makeExportHandlers(() => snap.submissions).txt(req, res, `lektion-${snap.id}`);
});
app.get('/admin/sessions/:id/export/csv', requireAdmin, (req, res) => {
  const snap = savedSessions.find(s => s.id === parseInt(req.params.id));
  if (!snap) return res.status(404).json({ error: 'Hittades inte.' });
  makeExportHandlers(() => snap.submissions).csv(req, res, `lektion-${snap.id}`);
});
app.get('/admin/sessions/:id/export/excel', requireAdmin, (req, res) => {
  const snap = savedSessions.find(s => s.id === parseInt(req.params.id));
  if (!snap) return res.status(404).json({ error: 'Hittades inte.' });
  makeExportHandlers(() => snap.submissions).excel(req, res, `lektion-${snap.id}`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\nServer igång!`);
  console.log(`  Elevsida     : http://localhost:${PORT}/`);
  console.log(`  Adminpanel   : http://localhost:${PORT}/admin`);
  console.log(`  Användarnamn : ${ADMIN_USER}`);
  console.log(`  Lösenord     : ${ADMIN_PASS}`);
  console.log(`\nDela din IP med elever, t.ex. http://192.168.x.x:${PORT}/\n`);
});
