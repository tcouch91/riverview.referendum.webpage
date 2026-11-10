/**
 * Riverview Referendum — "Arrange a Petition Visit" form backend.
 *
 * Every submission from the website is saved as a row in a Google Sheet FIRST,
 * then an email notification is sent. If the email fails, the row is still
 * saved and the failure is noted in the "Email Notification" column, so no
 * request is ever silently lost.
 *
 * Setup instructions: see SETUP.md in this folder.
 *
 * Settings live in Project Settings → Script Properties, not in this file:
 *   NOTIFY_EMAILS   (required) comma-separated recipients,
 *                   e.g. contactus@riverviewreferendum.org
 *   SPREADSHEET_ID  (optional) the ID from the sheet's URL
 *                   (docs.google.com/spreadsheets/d/<ID>/edit). Needed only if
 *                   this script was NOT created from the sheet via
 *                   Extensions → Apps Script.
 */

const SHEET_NAME = 'Submissions';

// Must match the `name` attributes of the inputs in index.html.
const FIELDS = [
  'Full Name',
  'Street Address',
  'Phone Number',
  'Email Address',
  'Preferred Visit Time',
  'Special Instructions & Notes',
  'Registered Voter Confirmation',
];
const REQUIRED_FIELDS = ['Full Name', 'Street Address', 'Phone Number', 'Email Address'];
const HONEYPOT_FIELD = 'website'; // hidden field; real people never fill it in
const MAX_FIELD_LENGTH = 2000;

const HEADERS = ['Received'].concat(FIELDS, ['Email Notification', 'Volunteer Follow-up Notes']);
const NOTIFY_STATUS_COL = FIELDS.length + 2; // 1-based column of "Email Notification"

/**
 * Run this ONCE from the Apps Script editor: choose "setup" in the function
 * dropdown (it's listed first, so it's the default), then click Run.
 * It asks for permissions, creates the header row, and sends a test email.
 */
function setup() {
  const sheet = getSheet_();
  const ss = getSpreadsheet_();
  console.log('Using spreadsheet "' + ss.getName() + '", tab "' + sheet.getName() + '": ' + ss.getUrl());
  const recipients = getRecipients_();
  MailApp.sendEmail({
    to: recipients,
    subject: 'Test: Riverview petition form is connected',
    body: 'This is a test from the Riverview petition form backend.\n\n' +
      'If you received this, email notifications are working.\n' +
      'Submissions are saved here: ' + ss.getUrl(),
    name: 'Riverview Referendum Website',
  });
  console.log('Setup complete. Test email sent to: ' + recipients);
  console.log('Remaining email quota today: ' + MailApp.getRemainingDailyQuota());
}

/** Handles form submissions from the website. */
function doPost(e) {
  if (!e) {
    console.warn('doPost only runs when the website submits the form. To test, choose "setup" in the ' +
      'function dropdown and click Run.');
  }
  const params = (e && e.parameter) || {};

  // Bots fill in the hidden honeypot field. Pretend success, store nothing.
  if (params[HONEYPOT_FIELD]) {
    return json_({ success: true });
  }

  const values = {};
  FIELDS.forEach(function (f) { values[f] = clean_(params[f]); });

  const missing = REQUIRED_FIELDS.filter(function (f) { return !values[f]; });
  if (missing.length) {
    return json_({ success: false, error: 'Missing required field(s): ' + missing.join(', ') });
  }

  // 1. Save to the sheet. This is the record of truth.
  let row;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const sheet = getSheet_();
    sheet.appendRow([new Date()].concat(
      FIELDS.map(function (f) { return safeCell_(values[f]); }),
      ['Sending…', '']
    ));
    row = sheet.getLastRow();
  } catch (err) {
    console.error('Could not save submission to sheet: ' + err);
    return json_({ success: false, error: 'Could not save submission' });
  } finally {
    lock.releaseLock();
  }

  // 2. Email the team. A failure here does NOT lose the submission.
  let status;
  try {
    sendNotification_(values);
    status = 'Sent ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd h:mm a');
  } catch (err) {
    console.error('Notification email failed: ' + err);
    status = 'FAILED: ' + err.message;
  }
  try {
    getSheet_().getRange(row, NOTIFY_STATUS_COL).setValue(status);
  } catch (err) {
    console.error('Could not record notification status: ' + err);
  }

  return json_({ success: true });
}

/**
 * Visiting the Web app URL in a browser shows this. Handy for checking the
 * deployment: "ready" is true only when the sheet and recipients are set up.
 */
function doGet(e) {
  if (!e) {
    console.warn('doGet only runs when the web app URL is opened. To test, choose "setup" and click Run.');
  }
  const status = { ok: true, service: 'Riverview petition form', time: new Date().toISOString() };
  try {
    getSheet_();
    status.sheet = 'found';
  } catch (err) {
    status.sheet = 'ERROR: ' + err.message;
  }
  try {
    getRecipients_();
    status.recipients = 'set';
  } catch (err) {
    status.recipients = 'ERROR: ' + err.message;
  }
  status.ready = status.sheet === 'found' && status.recipients === 'set';
  return json_(status);
}

// ---------------------------------------------------------------------------

function sendNotification_(values) {
  const sheetUrl = getSpreadsheet_().getUrl();
  const rowsHtml = FIELDS.map(function (f) {
    return '<tr><td style="padding:6px 12px;border:1px solid #ddd;background:#f8fafc;font-weight:bold;">' +
      escapeHtml_(f) + '</td><td style="padding:6px 12px;border:1px solid #ddd;">' +
      escapeHtml_(values[f] || '—').replace(/\n/g, '<br>') + '</td></tr>';
  }).join('');
  const rowsText = FIELDS.map(function (f) { return f + ': ' + (values[f] || '—'); }).join('\n');

  const message = {
    to: getRecipients_(),
    subject: 'New Petition Visit Request – ' + values['Full Name'],
    name: 'Riverview Referendum Website',
    htmlBody:
      '<p>A new petition visit request was submitted on riverviewreferendum.org:</p>' +
      '<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">' + rowsHtml + '</table>' +
      '<p style="font-size:12px;color:#555;">All requests are saved in the ' +
      '<a href="' + sheetUrl + '">petition requests sheet</a>. Reply to this email to respond to the requester.</p>',
    body: 'A new petition visit request was submitted on riverviewreferendum.org:\n\n' + rowsText +
      '\n\nAll requests are saved in: ' + sheetUrl,
  };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values['Email Address'])) {
    message.replyTo = values['Email Address'];
  }
  MailApp.sendEmail(message);
}

function getRecipients_() {
  const recipients = (PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAILS') || '').trim();
  if (!recipients) {
    throw new Error('Script property NOTIFY_EMAILS is not set (Project Settings → Script Properties).');
  }
  return recipients;
}

/**
 * The spreadsheet that stores submissions: the one named by the SPREADSHEET_ID
 * script property if set, otherwise the sheet this script was created from.
 */
function getSpreadsheet_() {
  const id = (PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '').trim();
  if (id) {
    return SpreadsheetApp.openById(id);
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('No spreadsheet found. This script is not attached to a sheet, so set the ' +
      'SPREADSHEET_ID script property to the ID in the sheet\'s URL (Project Settings → Script Properties).');
  }
  return ss;
}

function getSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function clean_(value) {
  return String(value == null ? '' : value).trim().slice(0, MAX_FIELD_LENGTH);
}

/**
 * Stops Sheets from treating input as a formula. Without this, a phone number
 * like "+1 803…" shows as #ERROR!, and "=..." input could run as a formula.
 */
function safeCell_(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function escapeHtml_(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
