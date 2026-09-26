# Screen-Free Score

A small personal dashboard that scores how long you go without touching a phone or computer. It measures your longest **screen-free streak**, separately for day and night, across every device you log, and keeps league tables of your best streaks.

Live dashboard: https://dcisbusy.github.io/screenfree/

There is no server to run. Devices report to a Google Sheet through a tiny Apps Script endpoint, and the dashboard is a single static `index.html` served by GitHub Pages that reads the sheet directly.

## What it shows

- **Day and Night tiles.** The longest screen-free gap in the current (or most recent) day and night, with a timeline of every interaction and a per-device breakdown alongside the all-devices figure.
- **Daily score.** A score out of 100 for each calendar day, from your three longest waking streaks, total screen time and phone unlocks.
- **Longest streaks.** Two league tables, your top 5 night streaks and top 5 day streaks. Several can come from the same day.
- **Monthly averages.** For each month: average score, average longest/2nd-longest/3rd-longest day streak, average longest night streak, average screen time, average unlocks and average calls.

## How a streak is measured

Every interaction on any device is logged as a timestamp. A streak is the time between two consecutive interactions, so it is only broken when *any* device is touched. Streaks are never cut at a clock boundary: a streak that runs from 11pm to 7:30am is one 8.5 hour streak.

### Splitting day from night

Each streak is labelled by the time of the check that **starts** it:

- A streak that starts from **22:00 until 06:00** is **night**.
- A streak that starts from **06:00 until 22:00** is **day**.

So a screen-free 4pm to 10pm is a day streak even if you go to bed at 10:30pm, sleep that begins with a 22:56 check is a night streak, a phone check at 3am starts another night streak (breaking the previous one, but staying night rather than ending it), a 5:45am check does the same, and a check at 6:15am starts a day streak instead. Streaks are never cut at the boundary just because they cross it: a streak that starts at 18:50 and ends (via a real check) at 21:40 is one day streak, even though it ran late into the evening.

A streak that starts in the daytime is always a day streak by the rule above, however long it goes on to run for -- which is exactly what the next two cuts exist to handle.

**The evening and morning cuts.** A streak that is still running -- no interaction at all -- when 22:00 or 07:00 arrives is cut there: day flips to night at 22:00, and night flips back to day at 07:00, and this repeats forward through as many of these as the streak actually spans. So a quiet 20:18 to 10am becomes a short evening day streak (20:18-22:00), a full night streak (22:00-07:00) and a fresh morning day streak (07:00-10am), each credited to the right day, rather than one streak that swallows the whole stretch or a day streak spanning the whole night with no night credit at all. An exceptionally long streak -- days, not hours -- keeps splitting at every 22:00 and 07:00 it crosses, so it never stops accruing separate night and day credit. A streak already ended by a real check before its next cut needs no cut at all: the 21:40 case above, or the earlier 6:15am case, are both left exactly as they are.

**Interruptions** on the night tile count separate bursts of activity between midnight and 06:00, meaning device use when you should be asleep.

Streaks under 15 minutes are treated as normal use and ignored by the league tables and monthly averages. See [Monthly averages](#monthly-averages) for how those are worked out.

### Tuning

The rules are constants near the top of the script in `index.html`:

| Constant | Default | Meaning |
| --- | --- | --- |
| `NIGHT_FROM_H` | 22 | A streak starting from this hour is night... |
| `NIGHT_UNTIL_H` | 6 | ...until this hour. Any other start is day |
| `EVENING_SPLIT_H` | 22 | A day streak still running at this hour is cut here into a finished day streak and a fresh night streak |
| `MORNING_SPLIT_H` | 7 | A night streak still running at this hour is cut here into a finished night streak and a fresh day streak |
| `MIN_STREAK_MS` | 15 min | Gaps shorter than this are not counted as streaks |
| `PING_SECONDS` | 10 | Seconds of activity that one computer ping represents (match the logger's poll interval) |
| `PHONE_LIKE` | `/phone\|mobile\|tablet/i` | Device names matching this show pickups instead of active time |

Hours are decimal clock hours, so `21` is 21:00 and `22.5` is 22:30.

## Daily score

Each calendar day (00:00 to 23:59) gets a score out of 100: streak points + screen points + unlock points, each rounded to a whole number before adding, so the breakdown shown always sums to the total.

### 1. Streak points (0–50)

Take the day's three longest **waking streaks** — a streak counts as waking if it starts anywhere from 06:00 up to (but not including) 22:00; one starting from 22:00 up to 06:00 is a night streak and is excluded entirely (see [Splitting day from night](#splitting-day-from-night)). Each streak is clipped so it doesn't run past midnight into the next day. A missing streak (fewer than three that day) counts as 0 hours.

For each of the three:

```
share = min(hours / STREAK_FULL_H, 1)        // STREAK_FULL_H = 3
```

```
streak points = SCORE_STREAK_POINTS × (share₁ + share₂ + share₃) / 3      // SCORE_STREAK_POINTS = 50
```

Three streaks of 3+ hours each maxes this out at 50.

### 2. Screen time points (0–30)

Screen time = computer active time + phone active time, for the **whole calendar day** (00:00–23:59, not just waking hours — a 2am scroll still costs you here even though it's excluded from streak points):

- **Computer:** number of pings × `PING_SECONDS` (10 seconds — a ping means there was keyboard or mouse input in that slot).
- **Phone:** sum of each `unlock`-to-`lock` session length. This is why phone time counts as activity rather than being mistaken for a screen-free streak: a 40 minute video doesn't look like 40 minutes screen-free. An unlock with no `lock` within `MAX_PHONE_SESSION_MS` (3 hours) is treated as a missed ping and ignored.

```
hours = total screen time in hours
points = SCORE_SCREEN_POINTS                                                       if hours ≤ SCREEN_FULL_H
points = SCORE_SCREEN_POINTS × (SCREEN_ZERO_H − hours) / (SCREEN_ZERO_H − SCREEN_FULL_H)   if SCREEN_FULL_H < hours < SCREEN_ZERO_H
points = 0                                                                          if hours ≥ SCREEN_ZERO_H
```

Currently `SCORE_SCREEN_POINTS = 30`, `SCREEN_FULL_H = 1`, `SCREEN_ZERO_H = 5`: full marks at 1 hour or less, zero at 5 hours or more.

### 3. Unlock points (0–20)

Unlocks = count of `unlock` events that actually **start a new phone session** — a repeat `unlock` ping received while a session is already open (some automation setups fire it more than once per pickup) does not count again.

```
points = SCORE_UNLOCK_POINTS                                                    if unlocks ≤ UNLOCK_FULL
points = SCORE_UNLOCK_POINTS × (UNLOCK_ZERO − unlocks) / (UNLOCK_ZERO − UNLOCK_FULL)   if UNLOCK_FULL < unlocks < UNLOCK_ZERO
points = 0                                                                       if unlocks ≥ UNLOCK_ZERO
```

Currently `SCORE_UNLOCK_POINTS = 20`, `UNLOCK_FULL = 20`, `UNLOCK_ZERO = 50`: full marks at 20 unlocks or fewer, zero at 50 or more. If there is no phone at all, this defaults to full marks.

### When a day is scored

Every device must have been logging for the whole day, and if a phone is present it must have been sending `unlock`/`lock` event types for the whole day. Otherwise the row shows a dash with the reason instead of a score. Today's row shows a score "so far" that changes as the day goes on.

### Tuning

All of the constants above are named exactly as they appear near the top of the script in `index.html`: `SCORE_STREAK_POINTS`, `SCORE_SCREEN_POINTS`, `SCORE_UNLOCK_POINTS`, `STREAK_FULL_H`, `SCREEN_FULL_H`, `SCREEN_ZERO_H`, `UNLOCK_FULL`, `UNLOCK_ZERO`, `MAX_PHONE_SESSION_MS`, `MAX_CALL_MS` and `OUTGOING_CALL_GRACE_MS`.

### Example scores

Ten made-up days, each checked against the actual formula above rather than estimated, showing how different mixes of streaks, screen time and unlocks land on the same score:

| Score | Top 3 streaks | Screen time | Unlocks | What that day looked like |
| ---: | --- | --- | --- | --- |
| **100** | 4.0 &middot; 3.5 &middot; 3.0 hrs | 40 min | &mdash; | Laptop only, no phone all day. Three long stretches away from any screen, ~40 min of typing spread across the rest of the day. |
| **90** | 5.0 &middot; 4.0 &middot; 3.0 hrs | 45 min | 35 | Three excellent streaks and light screen time, but the phone was picked up 35 times &mdash; each check brief, so time stayed low, but the frequency alone costs unlock points. Also took 3 calls that day; calls never affect the score either way. |
| **80** | 3.0 &middot; 3.0 &middot; 3.0 hrs | 2h 20m | 35 | Three solid 3-hour streaks, but screen time crept up to 2h20m across laptop and phone combined, plus 35 unlocks. |
| **70** | 3.0 &middot; 3.0 &middot; 1.2 hrs | 40 min | 55 | Two full 3-hour streaks and a shorter one, screen time kept low (40 min) &mdash; but 55 phone pickups, each one very brief, is well past where frequency alone costs you. |
| **60** | 3.0 &middot; 2.4 hrs | 2h 20m | 35 | Only two real streaks all day (no third), screen time 2h20m, 35 unlocks. |
| **50** | 3.0 &middot; 0.6 hrs | 40 min | 55 | One solid 3-hour streak, a much shorter one after it, screen time kept low overall &mdash; but 55 pickups through the day. |
| **40** | 1.8 hrs | 40 min | 55 | Only one streak worth mentioning, under 2 hours &mdash; a fragmented day. Screen time still low despite 55 brief pickups. |
| **30** | 1.8 hrs | 2h 20m | 55 | Same one fragmented streak, but screen time is now 2h20m on top of the 55 pickups. |
| **20** | 1.8 hrs | 3h 40m | 55 | Same fragmented streak, screen time up to 3h40m, still 55 pickups. |
| **10** | &mdash; | 3h 40m | 55 | No break longer than about 5 minutes all day, 3h40m total screen time, 55 pickups &mdash; a heavy day on every count. |

An unlocks column showing &mdash; means there is no phone logging that day, so unlocks default to full marks. A streaks column showing &mdash; means the longest streak that day was only a few minutes.

## Monthly averages

Everything in this table is computed **per day first, then averaged across the month** -- never as a single pool of numbers drawn from the whole month at once. Concretely, it takes the same per-day figures the Daily score table shows (that day's top 3 streaks, screen time, unlocks, calls, score) for every day in the month, then averages each column down.

- **Avg score.** The average of `total` over days that were actually scored (see [When a day is scored](#when-a-day-is-scored)).
- **Avg streaks (1st · 2nd · 3rd).** Three separate averages: the average of each day's *longest* streak, the average of each day's *second-longest*, and the average of each day's *third-longest*. A day missing a rank (fewer than three streaks that day) is left out of *that rank's* average rather than counted as zero, so each of the three numbers has its own count of days behind it.
- **Avg night streak.** The average of each finished night's longest streak. Unlike the day-streak ranks, there is only one relevant figure per night.
- **Avg screen time, avg unlocks, avg calls.** The plain average of each day's figure, same source as the Daily score table's columns.

**Left out of every column:** today (it is still accruing, so including it would understate the month) and any day where [When a day is scored](#when-a-day-is-scored) doesn't hold -- logging hadn't started, or the phone wasn't yet sending event types for the whole day.

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
2. Add the header row `Timestamp | Device | Event`.
3. Share it: **Anyone with the link → Viewer**.
4. Copy the sheet ID from its URL (the string between `/d/` and `/edit`).

### 2. The Apps Script endpoint

In the sheet, open **Extensions → Apps Script**, paste this in, and set your own secret:

```js
const SHARED_SECRET = 'CHANGE_ME_TO_A_RANDOM_STRING';
const SHEET_NAME = 'Events';

// Columns: Timestamp | Device | Event. The optional event is one of
// unlock or lock (the phone's two automations); computers leave it blank.
function logEvent(secret, device, eventType) {
  if (secret !== SHARED_SECRET) {
    return ContentService.createTextOutput('forbidden');
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  sheet.appendRow([
    new Date(),
    String(device || 'unknown').slice(0, 40),
    String(eventType || '').slice(0, 20)
  ]);
  return ContentService.createTextOutput('ok');
}

// JSON POST body: {"secret": "...", "device": "...", "event": "..."}
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    return logEvent(body.secret, body.device, body.event);
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  }
}

// Plain URL: .../exec?secret=...&device=...&event=...
function doGet(e) {
  try {
    return logEvent(e.parameter.secret, e.parameter.device, e.parameter.event);
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

**Android, using an automation app** (MacroDroid, Tasker, or similar). Create two automations that each request a URL, one when the phone is unlocked and one when it is locked. If your app only takes a URL, put the whole address including the `?` part in the URL field and leave any parameter fields empty.

| Trigger | URL |
| --- | --- |
| Phone unlocked | `<web app URL>?secret=<secret>&device=phone&event=unlock` |
| Phone locked | `<web app URL>?secret=<secret>&device=phone&event=lock` |

The unlock and lock events are what the daily score uses for unlock counts and phone screen time (unlock to the next lock). `screen_off` is accepted as another name for `lock`, and other events such as `screen_on` are ignored.

**Phone calls (optional).** If your automation app can trigger on call state, add four more automations so calls are handled separately from ordinary phone use rather than counting against you:

| Trigger | URL |
| --- | --- |
| Incoming call starts (ringing or answered) | `<web app URL>?secret=<secret>&device=phone&event=call_in_start` |
| Incoming call ends | `<web app URL>?secret=<secret>&device=phone&event=call_in_end` |
| Outgoing call starts | `<web app URL>?secret=<secret>&device=phone&event=call_out_start` |
| Outgoing call ends | `<web app URL>?secret=<secret>&device=phone&event=call_out_end` |

See [Phone calls](#phone-calls) for what this changes.

Exclude the automation app from battery optimisation, or Android will eventually stop it (see [dontkillmyapp.com](https://dontkillmyapp.com)).

**Any other device** just needs to request `<web app URL>?secret=<secret>&device=<name>` whenever there is activity. Computers leave `event` out.

### 4. The dashboard

1. In `index.html`, set `SHEET_ID` to your sheet's ID.
2. Push to GitHub and enable **Settings → Pages → Deploy from a branch → main, / (root)**.

## Phone calls

A call (see [Loggers](#3-loggers) for the automations this needs) is cut out of the dashboard entirely rather than scored like ordinary phone use:

- **It never breaks a streak.** The quiet time either side of a call bridges into one continuous streak, as if the call had not happened. An outgoing call also excuses the minute before `call_out_start`, so finding the contact and dialling does not count either. Using the phone for anything else after the call ends breaks the streak as normal.
- **No part of a call counts towards the 30-point screen time score**, whether it happens on its own or in the middle of an otherwise ordinary unlock-to-lock session.
- **An outgoing call always counts as one unlock**, even though answering it leaves no unlock ping of its own. **Answering an incoming call never counts as an unlock.**
- **The daily score table** shows each day's call count and total time, split by incoming and outgoing. These are informational only and are not scored.

A call start with no matching end within `MAX_CALL_MS` (2 hours) is dropped rather than treated as open-ended.

## Adding a device

Give the new logger a new `DeviceName` (for example `work_laptop`). It appears on the dashboard automatically as "Work laptop". No changes to the sheet, the Apps Script or the dashboard are needed.

The combined figures only count from when the **last** device started logging, because before that you cannot know whether it was in use. Adding a device therefore restarts the combined streaks, league tables and monthly averages from that point.

A device counts as a phone (screen time from unlock to lock, unlocks, calls) if its name matches `PHONE_LIKE`; anything else is treated as a computer (screen time from pings x `PING_SECONDS`).

## Limitations

- **Missing pings look like screen-free time.** If a logger stops (the phone kills the automation app, the laptop is offline while you use it), the gap appears as a streak. This is the main way scores can be wrong.
- **Phone logging is coarse.** It sees the phone unlocking and locking, not individual taps. Time between an unlock and the next lock counts as screen time, but an unlock with no lock within 3 hours is treated as a missed ping and ignored.
- **An orphan lock does not break a streak.** Some automation setups fire `lock` on any screen-off, including glancing at or silencing an alarm without truly waking up. A `lock` with no unlock open at the time changes nothing -- it is not treated as an interaction at all, so it cannot end a streak or count as screen time.
- **Timezone.** Day and night use the clock of the browser viewing the page, and the sheet's timezone should match yours.
- **Privacy.** The sheet holds only timestamps and device names, but anyone with its link can read them, and the dashboard URL is public. Do not share either.
- **Growth.** The dashboard downloads the whole sheet on every refresh, so it will slow down after many months of data.
