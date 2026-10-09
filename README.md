# Screen-Free Score

A small personal dashboard that scores how long you go without touching a phone or computer. It measures your longest **screen-free streak**, separately for day and night, across every device you log, and keeps league tables of your best daily scores.

Live dashboard: https://dcisbusy.github.io/screenfree/

There is no server to run. Devices report to a Google Sheet through a tiny Apps Script endpoint, and the dashboard is a single static `index.html` served by GitHub Pages that reads the sheet directly.

## What it shows

- **Day and Night tiles.** The longest screen-free gap in the current (or most recent) day and night, with a timeline of every interaction and a per-device breakdown alongside the all-devices figure.
- **Daily score.** Two scores out of 100 for each calendar day: one for your computers (laptop, worklaptop, ...) and one for your phone, each from that group's own three longest waking streaks and active time, plus unlocks for the phone. A good phone day shows even when work forces a lot of computer time.
- **Best scores.** Two league tables: your top 5 computer scores and top 5 phone scores, each with its day and that device group's total screen time for the day under the score. Today is left out because it is still changing. Computer scores marked * are covered under [Work-computer asterisk](#work-computer-asterisk).
- **Monthly averages.** For each month: average computers score, average phone score, average longest/2nd-longest/3rd-longest day streak, average longest night streak, average screen-free percentage, average unlocks and average calls.

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

Streaks under 15 minutes are treated as normal use and ignored by the monthly streak averages. See [Monthly averages](#monthly-averages) for how those are worked out.

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

Each calendar day (00:00 to 23:59) gets **two scores, each out of 100**, so a good phone day is visible even on a day of heavy work-computer use:

- **Computers** (every device that isn't a phone): streak points (0-40) + screen points (0-60).
- **Phone**: streak points (0-30) + screen points (0-50) + unlock points (0-20).

Each score only looks at its own group's devices: computer streaks are the gaps between computer interactions, phone streaks the gaps between phone interactions, and so on. Every component is rounded to a whole number before adding, so the breakdown shown always sums to the score.

### 1. Streak points (computers 0–40, phone 0–30)

Take that group's three longest **waking streaks** that day — a streak counts as waking if it starts anywhere from 06:00 up to (but not including) 22:00; one starting from 22:00 up to 06:00 is a night streak and is excluded entirely (see [Splitting day from night](#splitting-day-from-night)). Each streak is clipped so it doesn't run past midnight into the next day. A streak that starts in the 06:00-07:00 grace window is credited from 07:00 instead of its real start — otherwise checking your phone at 6:30 would score better than staying quiet until the automatic 07:00 cutover, since the streak would be measured from an earlier point. This clipping only affects the score; the streak still displays at its true length everywhere else (tiles and monthly streak averages).

The three streaks are **summed uncapped**, not capped individually and then averaged:

```
top3 hours = streak1 + streak2 + streak3        // a missing streak counts as 0
share = min(top3 hours / STREAK_SUM_FULL_H, 1)  // STREAK_SUM_FULL_H = 12
streak points = round(streak weight × share)    // 40 for computers, 30 for phone
```

This matters: capping each streak at some length before averaging would mean an 8-hour streak followed by a 2-hour and a 30-minute one scores *worse* than three tidy 3-hour streaks, even though it adds up to more total screen-free time (10.5h vs 9h). Summing uncapped fixes that — both days above reach the same total against the 12-hour bar. A single uninterrupted streak of 12+ hours, with nothing else that day, reaches full marks on its own.

### 2. Screen points (computers 0–60, phone 0–50)

Based on that group's total active time that day (00:00–23:59):

```
active = union of the group's activity that day: every computer ping's PING_SECONDS window
         (computers), or every phone unlock-to-lock session (phone). Overlapping moments
         aren't double-counted (two computers in use in the same minute cost that one
         minute, not two)
active minutes = active time that day, in minutes
points = screen weight × (zero point − active minutes) / zero point    if active minutes < zero point
points = 0                                                             if active minutes ≥ zero point
```

The two groups use different scales:

- **Computers**: weight 60, zero point `COMPUTER_SCREEN_ZERO_MIN = 500` minutes. Points fall evenly (0.12 per active minute) from 60 at no use to 0 at 500 minutes (8h 20m), which leaves room for a working day at a desk.
- **Phone**: weight 50, zero point `PHONE_SCREEN_ZERO_MIN = 100` minutes. **1 point is lost for every 2 minutes** on the phone, so the score hits 0 at 100 minutes (1h 40m).

There is no grace period — any active time at all costs something. A phone call is excluded from "active" entirely, just as it is from streaks and unlocks (see [Phone calls](#phone-calls)).

The dashboard separately shows a **screen-free percentage** (active time across *all* devices merged, as a share of the full 24-hour day) in the Daily score and Monthly averages tables. That figure is informational and uses a different, gentler scale from the scores above — the numbers will not simply multiply into each other.

### 3. Unlock points (phone only, 0–20)

Unlocks = count of `unlock` events that actually **start a new phone session** — a repeat `unlock` ping received while a session is already open (some automation setups fire it more than once per pickup) does not count again.

```
points = SCORE_UNLOCK_POINTS                                                    if unlocks ≤ UNLOCK_FULL
points = SCORE_UNLOCK_POINTS × (UNLOCK_ZERO − unlocks) / (UNLOCK_ZERO − UNLOCK_FULL)   if UNLOCK_FULL < unlocks < UNLOCK_ZERO
points = 0                                                                       if unlocks ≥ UNLOCK_ZERO
```

Currently `SCORE_UNLOCK_POINTS = 20`, `UNLOCK_FULL = 20`, `UNLOCK_ZERO = 50`: full marks at 20 unlocks or fewer, zero at 50 or more. The computers score has no unlock component.

### When a day is scored

Each score is given independently. A score appears once every device **in its group** that existed during that day was logging for the whole of it (a device added later doesn't count against earlier days, and one added that day is ignored for that day — see [Adding a device](#adding-a-device)); the phone score also needs the phone to have been sending `unlock`/`lock` event types for the whole day. Otherwise that cell shows a dash with the reason instead of a score. Because the two are independent, a day can have one score and not the other. Today's row shows scores "so far" that change as the day goes on.

### Tuning

All of the constants above are named exactly as they appear near the top of the script in `index.html`: `SCORE_COMPUTER_STREAK_POINTS`, `SCORE_COMPUTER_SCREEN_POINTS`, `SCORE_PHONE_STREAK_POINTS`, `SCORE_PHONE_SCREEN_POINTS`, `SCORE_UNLOCK_POINTS`, `STREAK_SUM_FULL_H`, `COMPUTER_SCREEN_ZERO_MIN`, `PHONE_SCREEN_ZERO_MIN`, `UNLOCK_FULL`, `UNLOCK_ZERO`, `MAX_PHONE_SESSION_MS`, `MAX_CALL_MS` and `OUTGOING_CALL_GRACE_MS`, plus `WORK_DEVICE_LIKE` and `WORK_DAYS` for the asterisk below.

### Work-computer asterisk

A computer score is shown with an asterisk (`65*`) on a Monday to Thursday (`WORK_DAYS`) when no work computer — a device whose name matches `WORK_DEVICE_LIKE`, by default anything containing "work" — logged anything that counted towards the score that day. It marks scores that leave out your work computer use, such as every day before the work laptop was added, or a day it wasn't running. A work computer that is ignored on its first logging day (see [Adding a device](#adding-a-device)) counts as not logging that day, so that day gets the asterisk too. The asterisk also appears in the Best scores tables; it does not change any score or the monthly averages.

### Example scores

Five made-up days for each score, each checked against the actual formulas above rather than estimated, showing how different mixes of streaks and active time land on the same score.

**Computers**

| Score | Top 3 streaks | Active time | What that day looked like |
| ---: | --- | --- | --- |
| **100** | 5.0 · 4.0 · 3.0 hrs | 0m | No computer use at all; three strong streaks summing to the full 12 hours needed. |
| **80** | 4.0 · 3.0 · 1.0 hrs | 1h 00m | An hour on a computer, streaks adding up to 8 of the 12 hours. |
| **60** | 3.0 · 2.0 · 1.0 hrs | 2h 50m | A light day at a desk, with streaks adding up to 6 hours. |
| **40** | 2.0 · 1.0 hrs | 4h 10m | A moderate working day with only a couple of real breaks. |
| **20** | — | 5h 30m | A heavy day at the computer with no streak worth mentioning. |

**Phone**

| Score | Top 3 streaks | Active time | Unlocks | What that day looked like |
| ---: | --- | --- | --- | --- |
| **100** | 5.0 · 4.0 · 3.0 hrs | 0m | 15 | Essentially never touched the phone; three strong streaks summing to the full 12 hours. |
| **80** | 5.0 · 4.0 · 3.0 hrs | 40m | 15 | The same excellent streaks, but 40 minutes on the phone costs 20 points. |
| **60** | 3.0 · 2.0 · 1.0 hrs | 50m | 15 | Streaks adding up to 6 hours, and 50 minutes on the phone. |
| **40** | 2.0 · 1.0 · 1.0 hrs | 1h 00m | 35 | Short streaks, an hour on the phone, and 35 unlocks now starts costing points too. |
| **20** | — | 1h 20m | 35 | No streak worth mentioning, 1h20m on the phone and 35 unlocks. |

A streaks column showing — means the longest streak that day was only a few minutes.

## Monthly averages

Everything in this table is computed **per day first, then averaged across the month** -- never as a single pool of numbers drawn from the whole month at once. Concretely, it takes the same per-day figures the Daily score table shows (that day's top 3 streaks, screen-free percentage, unlocks, calls, computers and phone scores) for every day in the month, then averages each column down.

- **Avg computers / Avg phone.** The average of each daily score over the days it was actually scored (see [When a day is scored](#when-a-day-is-scored)). The two are averaged separately, so they can cover a different number of days.
- **Avg streaks (1st · 2nd · 3rd).** Three separate averages: the average of each day's *longest* streak, the average of each day's *second-longest*, and the average of each day's *third-longest*. A day missing a rank (fewer than three streaks that day) is left out of *that rank's* average rather than counted as zero, so each of the three numbers has its own count of days behind it. This display average is unrelated to how streak points are scored (see [Streak points](#1-streak-points-030)), which sums the three uncapped rather than ranking them separately.
- **Avg night streak.** The average of each finished night's longest streak. Unlike the day-streak ranks, there is only one relevant figure per night.
- **Avg screen-free, avg unlocks, avg calls.** The plain average of each day's figure, same source as the Daily score table's columns.

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
- **No part of a call counts as active time towards the 50-point screen score**, whether it happens on its own or in the middle of an otherwise ordinary unlock-to-lock session.
- **An outgoing call always counts as one unlock**, even though answering it leaves no unlock ping of its own. **Answering an incoming call never counts as an unlock.**
- **The daily score table** shows each day's call count and total time, split by incoming and outgoing. These are informational only and are not scored.

A call start with no matching end within `MAX_CALL_MS` (2 hours) is dropped rather than treated as open-ended.

## Adding a device

Give the new logger a new `DeviceName` (for example `work_laptop`). It appears on the dashboard automatically as "Work laptop". No changes to the sheet, the Apps Script or the dashboard are needed.

The combined figures only count from when the last of the **original** devices started logging, because before that you cannot know whether it was in use. Devices first seen within `ORIGINAL_DEVICE_WINDOW_MS` (24 hours) of the earliest one are the original set. A device added after that is ignored for scoring on the day it first logs (it was only logging for part of that day, so the day is scored on the other devices alone) and counts from the day after. Earlier days, streaks and monthly averages are scored on the devices that were live at the time and are never invalidated. This day-of-arrival rule applies to computers; a second phone added later isn't specially handled.

A device counts as a phone (screen time from unlock to lock, unlocks, calls) if its name matches `PHONE_LIKE`; anything else is treated as a computer (screen time from pings x `PING_SECONDS`).

## Limitations

- **Missing pings look like screen-free time.** If a logger stops (the phone kills the automation app, the laptop is offline while you use it), the gap appears as a streak. This is the main way scores can be wrong.
- **Phone logging is coarse.** It sees the phone unlocking and locking, not individual taps. Time between an unlock and the next lock counts as screen time, but an unlock with no lock within 3 hours is treated as a missed ping and ignored.
- **An orphan lock does not break a streak.** Some automation setups fire `lock` on any screen-off, including glancing at or silencing an alarm without truly waking up. A `lock` with no unlock open at the time changes nothing -- it is not treated as an interaction at all, so it cannot end a streak or count as screen time.
- **Timezone.** Day and night use the clock of the browser viewing the page, and the sheet's timezone should match yours.
- **Privacy.** The sheet holds only timestamps and device names, but anyone with its link can read them, and the dashboard URL is public. Do not share either.
- **Growth.** The dashboard downloads the whole sheet on every refresh, so it will slow down after many months of data.
