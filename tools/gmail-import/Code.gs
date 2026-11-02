/**
 * msp.run Gmail → submissions sheet importer (Google Apps Script).
 *
 * Copies club emails into the same response sheet the "Submit your event"
 * form writes to, so they go through the same approval rules:
 *   - "yes" in Approved publishes a row
 *   - after one "yes", later rows from that sender publish automatically
 *   - "no" hides a row
 *
 * Emails with a calendar invite (.ics), which RunSignUp, Eventbrite, Meetup
 * and most calendar tools attach, become complete rows. Other emails become a
 * row with the subject, a snippet and a link to the email. Fill in the date
 * there, since rows without a date never publish.
 *
 * Setup: see README.md in this folder.
 */

const CONFIG = {
  SHEET_ID: 'PASTE_RESPONSE_SHEET_ID_HERE', // from the sheet URL: /spreadsheets/d/<ID>/edit
  SHEET_TAB: '', // blank = first tab (the form responses)
  LABEL: 'msp-events', // Gmail label to import (apply with a filter)
  DONE_LABEL: 'msp-imported', // added after import so nothing imports twice
  TZ: 'America/Chicago',
};

function importEventEmails() {
  const todo = GmailApp.getUserLabelByName(CONFIG.LABEL);
  if (!todo) throw new Error(`Create the Gmail label "${CONFIG.LABEL}" first.`);
  const done = GmailApp.getUserLabelByName(CONFIG.DONE_LABEL) || GmailApp.createLabel(CONFIG.DONE_LABEL);

  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = CONFIG.SHEET_TAB ? ss.getSheetByName(CONFIG.SHEET_TAB) : ss.getSheets()[0];
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const col = mapColumns(header);

  const props = PropertiesService.getScriptProperties();
  const seen = new Set(JSON.parse(props.getProperty('seenUids') || '[]'));

  const threads = GmailApp.search(`label:${CONFIG.LABEL} -label:${CONFIG.DONE_LABEL}`, 0, 50);
  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      const sender = parseSender(msg.getFrom());
      const received = msg.getDate();
      const icsFiles = msg.getAttachments().filter(
        (a) => /calendar|ics/i.test(a.getContentType()) || /\.ics$/i.test(a.getName()),
      );

      let rows = [];
      for (const f of icsFiles) {
        for (const ev of parseIcs(f.getDataAsString(), fmtDate, fmtTime)) {
          if (ev.uid && seen.has(ev.uid)) continue;
          if (ev.uid) seen.add(ev.uid);
          rows.push({ ...ev, host: sender.name });
        }
      }
      if (!icsFiles.length) {
        rows.push({
          name: msg.getSubject(),
          host: sender.name,
          description: `${msg.getPlainBody().replace(/\s+/g, ' ').slice(0, 400)}… (Email: ${thread.getPermalink()})`,
        });
      }
      for (const r of rows) {
        sheet.appendRow(toRow(header.length, col, {
          timestamp: fmtDate(received) + ' ' + Utilities.formatDate(received, CONFIG.TZ, 'H:mm:ss'),
          email: sender.email,
          type: guessType(`${r.name} ${r.description || ''}`),
          ...r,
        }));
      }
    }
    thread.addLabel(done);
  }
  props.setProperty('seenUids', JSON.stringify([...seen].slice(-2000)));
}

/** Run once to import every hour. */
function installHourlyTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('importEventEmails').timeBased().everyHours(1).create();
}

const fmtDate = (d) => Utilities.formatDate(d, CONFIG.TZ, 'M/d/yyyy');
const fmtTime = (d) => Utilities.formatDate(d, CONFIG.TZ, 'h:mm a');

// ---- Pure helpers below (no Apps Script services), tested in test.mjs ----

// Same keywords the site's build uses to read the sheet.
const COLUMN_PATTERNS = {
  timestamp: /^timestamp$/i,
  email: /email/i,
  approved: /^approved$/i,
  name: /event name|^name$/i,
  date: /^date|event date/i,
  start_time: /time/i,
  type: /type/i,
  distances: /distance/i,
  venue: /venue|location|meeting/i,
  city: /city/i,
  host: /host|organi[sz]er|club/i,
  url: /link|url|website|registration/i,
  price: /price|cost/i,
  description: /description|details|notes/i,
};

function mapColumns(header) {
  const col = {};
  const taken = new Set();
  for (const [key, re] of Object.entries(COLUMN_PATTERNS)) {
    const i = header.findIndex((h, j) => re.test(String(h).trim()) && !taken.has(j));
    if (i >= 0) { col[key] = i; taken.add(i); }
  }
  return col;
}

function toRow(width, col, values) {
  const row = new Array(width).fill('');
  for (const [key, i] of Object.entries(col)) {
    if (key !== 'approved' && values[key] != null) row[i] = values[key];
  }
  return row;
}

function parseSender(from) {
  const m = String(from).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  return m ? { name: m[1].trim() || m[2], email: m[2].toLowerCase() } : { name: from, email: String(from).toLowerCase() };
}

function guessType(text) {
  const t = text.toLowerCase();
  if (/trail/.test(t)) return 'Trail run';
  if (/\b(5k|10k|half|marathon|race|trot|relay|ultra)\b/.test(t)) return 'Race';
  if (/social|brew|coffee|pub|bar\b|party/.test(t)) return 'Social run';
  return 'Group run';
}

/** Parse VEVENTs from .ics text. fmtDate/fmtTime format a Date in Twin Cities time. */
function parseIcs(text, fmtDateFn, fmtTimeFn) {
  const lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const unesc = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
  const events = [];
  let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT') { if (ev) events.push(ev); ev = null; continue; }
    if (!ev) continue;
    const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
    if (!m) continue;
    const [, key, params, value] = m;
    if (key === 'SUMMARY') ev.name = unesc(value);
    else if (key === 'LOCATION') ev.venue = unesc(value);
    else if (key === 'URL') ev.url = value;
    else if (key === 'UID') ev.uid = value;
    else if (key === 'DESCRIPTION') ev.description = unesc(value).slice(0, 500);
    else if (key === 'DTSTART') Object.assign(ev, parseDtStart(value, params, fmtDateFn, fmtTimeFn));
  }
  for (const e of events) {
    if (!e.url && e.description) {
      const u = e.description.match(/https?:\/\/\S+/);
      if (u) e.url = u[0];
    }
  }
  return events;
}

function parseDtStart(value, params, fmtDateFn, fmtTimeFn) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return {};
  const [, y, mo, d, h, mi, , z] = m;
  if (!h) return { date: `${Number(mo)}/${Number(d)}/${y}` }; // all-day
  if (z) {
    const dt = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
    return { date: fmtDateFn(dt), start_time: fmtTimeFn(dt) };
  }
  // Floating or TZID time: assume it's already local (nearly always Central here).
  const hr = Number(h);
  return {
    date: `${Number(mo)}/${Number(d)}/${y}`,
    start_time: `${hr % 12 || 12}:${mi} ${hr < 12 ? 'AM' : 'PM'}`,
  };
}

if (typeof module !== 'undefined') module.exports = { parseIcs, mapColumns, toRow, parseSender, guessType };
