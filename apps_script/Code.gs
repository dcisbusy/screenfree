// Paste this into Extensions > Apps Script inside your Google Sheet, then
// Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
// Only handles WRITES (from the laptop/phone loggers). Reads happen directly
// against the sheet's public JSON export, so this never needs to deal with CORS.

const SHARED_SECRET = 'CHANGE_ME_TO_A_RANDOM_STRING'; // must match the loggers
const SHEET_NAME = 'Events';

// Columns: Timestamp | Device | Event. The optional event is one of
// unlock or lock (the phone's two automations); computers leave it blank.
function logEvent(secret, device, eventType) {
  if (secret !== SHARED_SECRET) {
    return ContentService.createTextOutput('forbidden');
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  // Server-side timestamp, so client clock drift never matters.
  sheet.appendRow([
    new Date(),
    String(device || 'unknown').slice(0, 40),
    String(eventType || '').slice(0, 20)
  ]);
  return ContentService.createTextOutput('ok');
}

// For loggers that can send a JSON POST body (e.g. the Windows script, or
// MacroDroid's HTTP Request action set to POST with a JSON body).
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    return logEvent(body.secret, body.device, body.event);
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  }
}

// For loggers that can only fire a plain URL (e.g. a simpler automation app's
// "open URL" / GET action): .../exec?secret=...&device=phone&event=unlock
function doGet(e) {
  try {
    return logEvent(e.parameter.secret, e.parameter.device, e.parameter.event);
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  }
}
