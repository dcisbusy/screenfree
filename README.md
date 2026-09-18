# Screen-Free Score

A small personal dashboard that scores how long you go without touching a phone or computer. It measures your longest **screen-free streak**, separately for day and night, across every device you log, and keeps a league table of your best streaks.

Live dashboard: https://dcisbusy.github.io/screenfree/

There is no server to run. Devices report to a Google Sheet through a tiny Apps Script endpoint, and the dashboard is a single static `index.html` served by GitHub Pages that reads the sheet directly.

## What it shows

- **Day and Night tiles.** The longest screen-free gap in the current (or most recent) day and night, with a timeline of every interaction and a per-device breakdown alongside the all-devices figure.
- **Longest streaks.** A league table of your 10 longest streaks. Several can come from the same day.
- **Monthly averages.** For each month: the average of your three longest day streaks, and the average of your nightly longest streak.
- **Daily activity.** For each of the last 14 days, active time for each computer and pickups for each phone.
- **Recent periods.** The last few day and night periods, with per-device scores.

## How a streak is measured

Every interaction on any device is logged as a timestamp. A streak is the time between two consecutive interactions, so it is only broken when *any* device is touched. Streaks are never cut at a clock boundary: a streak that runs from 11pm to 7:30am is one 8.5 hour streak.

### Splitting day from night

Each streak is labelled by the time of the check that **starts** it:

- A streak that starts from **21:00 until 05:00** is **night**.
- A streak that starts from **05:00 until 21:00** is **day**.

So a screen-free 4pm to 10pm is a day streak even if you go to bed at 10:30pm, sleep that begins with a 22:56 check is a night streak, a phone check at 3am starts another night streak, and a check at 5:30am starts a day streak. Streaks are never cut at the boundary: a streak that starts at 20:50 and ends at 22:40 is one day streak.

A streak that starts in the daytime and runs through the whole night is a day streak, because of when it started.

**Interruptions** on the night tile count separate bursts of activity between midnight and 05:00, meaning device use when you should be asleep.

Streaks under 15 minutes are treated as normal use and ignored by the league table and monthly averages. Monthly averages also leave out the streak or night still in progress.

### Tuning

The rules are constants near the top of the script in `index.html`:

| Constant | Default | Meaning |
| --- | --- | --- |
| `NIGHT_FROM_H` | 21 | A streak starting from this hour is night... |
| `NIGHT_UNTIL_H` | 5 | ...until this hour. Any other start is day |
| `MIN_STREAK_MS` | 15 min | Gaps shorter than this are not counted as streaks |
| `PING_SECONDS` | 10 | Seconds of activity that one computer ping represents (match the logger's poll interval) |
| `PHONE_LIKE` | `/phone\|mobile\|tablet/i` | Device names matching this show pickups instead of active time |

Hours are decimal clock hours, so `21` is 21:00 and `22.5` is 22:30.

## Architecture

```
phone  (automation app) ─┐
laptop (script)          ├─► Apps Script web app ─► Google Sheet ◄── index.html (GitHub Pages)
work laptop (script)     ─┘        (writes)         (event log)          (reads, computes scores)
```

- **Google Sheet.** A tab named `Events` with two columns: `Timestamp` and `Device`. It is shared as "anyone with the link can view".
- **Apps Script web app.** Bound to the sheet. It appends a row for each ping, using its own server-side clock so device clocks never matter.
- **Loggers.** One per device, each sending a ping when there is input.
- **Dashboard.** `index.html` fetches the sheet's public JSON export (`.../gviz/tq?tqx=out:json&sheet=Events`) and does all the scoring in the browser. Devices are discovered from the `Device` column, so a new one appears with no code change.

## Setup

### 1. The sheet

1. Create a Google Sheet and rename the first tab to `Events`.
2. Add the header row `Timestamp | Device`.
3. Share it: **Anyone with the link → Viewer**.
4. Copy the sheet ID from its URL (the string between `/d/` and `/edit`).

### 2. The Apps Script endpoint

In the sheet, open **Extensions → Apps Script**, paste this in, and set your own secret:

```js
const SHARED_SECRET = 'CHANGE_ME_TO_A_RANDOM_STRING';
const SHEET_NAME = 'Events';

function logEvent(secret, device) {
  if (secret !== SHARED_SECRET) {
    return ContentService.createTextOutput('forbidden');
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  sheet.appendRow([new Date(), String(device || 'unknown').slice(0, 40)]);
  return ContentService.createTextOutput('ok');
}

// JSON POST body: {"secret": "...", "device": "..."}
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    return logEvent(body.secret, body.device);
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  }
}

// Plain URL: .../exec?secret=...&device=...
function doGet(e) {
  try {
    return logEvent(e.parameter.secret, e.parameter.device);
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  }
}
```

Then **Deploy → New deployment → Web app**, execute as **Me**, access **Anyone**, and copy the web app URL. When you change the code later, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

### 3. Loggers

Each logger needs the web app URL, the shared secret, and a unique device name.

**Windows, using AutoHotkey v2** (no Python, no admin rights). It asks Windows how long since the last input and pings if there was any in the last interval. It records only that input happened, never which keys, and installs no hooks:

```autohotkey
#Requires AutoHotkey v2.0
#SingleInstance Force
Persistent

WebAppUrl := "PASTE_WEB_APP_URL_HERE"
Secret := "CHANGE_ME_TO_A_RANDOM_STRING"
DeviceName := "laptop"
PollSeconds := 10

SetTimer(CheckActivity, PollSeconds * 1000)

CheckActivity() {
    if (A_TimeIdle < PollSeconds * 1000 + 500)
        SendPing()
}

SendPing() {
    try {
        req := ComObject("WinHttp.WinHttpRequest.5.1")
        req.SetTimeouts(5000, 5000, 5000, 5000)
        req.Open("GET", WebAppUrl "?secret=" Secret "&device=" DeviceName, false)
        req.Send()
    }
}
```

To start it at login without admin rights, put a shortcut to the script in the folder opened by `Win+R` → `shell:startup`.

**Android, using an automation app** (MacroDroid, Tasker, or similar). Create two automations, one triggered by *screen on* and one by *screen off*, each sending an HTTP **GET** request to the web app URL with two parameters:

| Parameter | Value |
| --- | --- |
| `secret` | your shared secret |
| `device` | `phone` |

Exclude the automation app from battery optimisation, or Android will eventually stop it (see [dontkillmyapp.com](https://dontkillmyapp.com)).

**Any other device** just needs to request `<web app URL>?secret=<secret>&device=<name>` whenever there is activity.

### 4. The dashboard

1. In `index.html`, set `SHEET_ID` to your sheet's ID.
2. Push to GitHub and enable **Settings → Pages → Deploy from a branch → main, / (root)**.

## Adding a device

Give the new logger a new `DeviceName` (for example `work_laptop`). It appears on the dashboard automatically as "Work laptop". No changes to the sheet, the Apps Script or the dashboard are needed.

The combined figures only count from when the **last** device started logging, because before that you cannot know whether it was in use. Adding a device therefore restarts the combined streaks, league table and monthly averages from that point.

## Daily activity numbers

- **Computers: active time** = pings x `PING_SECONDS`. A ping means there was keyboard or mouse input in that 10-second slot, so it measures time spent actively typing or clicking. Reading or watching without touching anything is not counted.
- **Phones: pickups** = screen-on events, estimated as half the pings because each session sends one ping when the screen turns on and one when it turns off. This assumes both the screen-on and screen-off automations are set up.
- A device counts as a phone if its name matches `PHONE_LIKE`; anything else is treated as a computer.

## Limitations

- **Missing pings look like screen-free time.** If a logger stops (the phone kills the automation app, the laptop is offline while you use it), the gap appears as a streak. This is the main way scores can be wrong.
- **Phone logging is coarse.** It sees the screen turning on and off, not individual taps, so time spent reading a lit screen without touching it is not detected as activity by itself.
- **Timezone.** Day and night use the clock of the browser viewing the page, and the sheet's timezone should match yours.
- **Privacy.** The sheet holds only timestamps and device names, but anyone with its link can read them, and the dashboard URL is public. Do not share either.
- **Growth.** The dashboard downloads the whole sheet on every refresh, so it will slow down after many months of data.
