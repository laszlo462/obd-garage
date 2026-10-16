# OBDLink app files: dashboards (`.dashgz`), settings (`.stg`), user PIDs (`.udpid`)

Research for the planning map in issue #164. Researched 2026-10-15.

Evidence labels:

- **Confirmed**: primary source (OBDLink / OCTech docs, help centre, store release notes).
- **Third-party**: forum post or someone else's repo. Plausible, not authoritative.
- **Not found**: searched for and not found. The search is named.
- **Inference**: my reasoning from the evidence. Not a source.

## Summary

- **Dashboard export/import is official and new.** It arrived in OBDLink app **7.1.0** (iOS, 6 Feb 2026), together with
  **export of user-defined PID definitions**. **Nothing official documents the file format.** No public `.dashgz`
  sample, parser or reverse-engineering was found.
- **`.stg` is the older whole-settings export.** It dates from at least 2022. On import it asks which categories to bring in
  (for example Dashboards, User-Defined PIDs). Forum users shared dashboards this way before 7.1.0. Cross-platform imports
  (Android to iOS) were unreliable. Gauges that use enhanced PIDs fell back to SAE PIDs when the importing phone lacked the
  Ford add-on. All of this is third-party, and no official page says what a `.stg` holds.
- **The CSV logging PID set is chosen in the app** (Settings > Preferences > Logging > Select PIDs). It is separate from
  dashboards (Confirmed). Nothing says a `.stg` or `.dashgz` import can change it.
- **The format has a lineage.** The Android package is `OCTech.Mobile.Applications.OBDLink`, and the app shares release notes
  with OCTech's OBD Fusion. A decompiled copy of OCTech's older Windows app OBDwiz uses the same class names as the sample:
  `PIDLoggableItem`, `UserPIDLoggableItem`, `culture`/`version` XML attributes. The `.dashgz` format descends from OCTech's
  .NET code.
- **Best lead on `pt="3"`:** a public, app-exported `.udpid` (user-defined PID) file gives each PID a 6-character
  `<UniqueId>` (for example `jjUUSk`). The sample's `pt="3"` uid `L09IML` is also 6 characters. So **`pt="3"` is probably a
  user-defined PID referenced by its UniqueId**. This is an inference, not confirmed.
- **No public Ford enhanced PID catalogue** maps names to the opaque `pt="7"` IDs. OBDLink's OEM coverage PDF lists
  vehicles and modules only.
- **No OBDLink EULA or terms of use was found.** Neither the website nor the App Store listing has one. The privacy
  policy says nothing about file formats or reverse engineering.

## Findings

### 1. Dashboard export/import (`.dashgz`)

| Finding | Status | Source |
|---|---|---|
| OBDLink 7.1.0 (iOS, 6 Feb 2026): "Added the ability to export and import individual dashboards." and "Added support for exporting user-defined PID definitions." | Confirmed | [App Store, OBDLink](https://apps.apple.com/us/app/obdlink/id879636351) |
| The same notes appear in OCTech's OBD Fusion 7.1.0 (4 Feb 2026). The two apps share a code base. | Confirmed | [App Store, OBD Fusion](https://apps.apple.com/us/app/obd-fusion/id650684932) |
| 7.2.0 (Apr 2026): "Digital gauges can now be rectangular and are no longer restricted to being square." This probably explains `IsSquare` in `<Location>`. It also added state displays (text for numeric values) on user PIDs and digital gauges. | Confirmed (notes); link to `IsSquare` is inference | [App Store, OBDLink](https://apps.apple.com/us/app/obdlink/id879636351) |
| Android has the feature too: APKMirror's notes for Android 7.1.0/7.1.1 list the same export/import items. | Third-party mirror of Play notes | [APKMirror 7.1.0](https://www.apkmirror.com/?p=12608212), [7.1.1](https://www.apkmirror.com/?p=13189757) |
| Help centre: the dashboard menu has **Export Dashboard** ("to another device") and **Import Dashboard**, "detailed under Settings > Help > Export / Import" (in-app help, not online). | Confirmed | [Add and Edit Dashboard Gauges](https://support.obdlink.com/support/solutions/articles/43000678883-add-and-edit-dashboard-gauges) |
| Unsupported PIDs: in Display Configuration, a PID the vehicle doesn't support shows in red. The app lists every PID when disconnected. The docs don't say what an import does with an unsupported or unlicensed PID. | Confirmed / Not found | same |
| Windows: the OBDLink app is iOS/Android only. Windows users get OBDwiz. No sign that OBDwiz reads `.dashgz`. | Confirmed (platforms); Not found (OBDwiz) | [Get Started (Windows)](https://support.obdlink.com/support/solutions/articles/43000727094-get-started-with-your-obdlink-adapter-windows-), [Get Started with Settings](https://support.obdlink.com/support/solutions/articles/43000714809-get-started-with-settings) |
| No sharing feature (gallery, cloud share) beyond file export and the OS share sheet. | Not found | Help-centre index: [support.obdlink.com/support/solutions](https://support.obdlink.com/support/solutions) |

Searched and not found: the extension `dashgz` anywhere on the web (standard and extended search) or in GitHub code
search; any online copy of the in-app "Export / Import" help topic.

### 2. Settings export (`.stg`) and the logging PID set

| Finding | Status | Source |
|---|---|---|
| The help centre lists **Settings > Help > Export / Import**: "how to transfer OBDLink settings from one device to another". Contents and format are not described online. | Confirmed (exists); Not found (contents) | [Get Started with Settings](https://support.obdlink.com/support/solutions/articles/43000714809-get-started-with-settings) |
| Settings areas that could be in a `.stg`: Vehicle Editor (vehicles, fuel/power parameters), Units (English/Metric), User-Defined PIDs, Manufacturer PIDs (GM CAN, GM J1850, Subaru CAN), Preferences (Logging, Sync, General), Alerts. | Confirmed (areas exist); Inference (that `.stg` holds them) | same; [Configure Alerts](https://support.obdlink.com/support/solutions/articles/43000772159-configure-alerts-for-vehicle-pids) |
| `.stg` is the "native OBDLink file extension". The default name is like `OBDLink Android Settings <date>.stg`. Import is Settings > ⋮ > Import Settings, then "Select Settings to Import" (for example Dashboards, User-Defined PIDs), then "Select Import Options". | Third-party (2022–23) | [f150gen14 thread p.3](https://www.f150gen14.com/forum/threads/obd-fusion-pids.12838/page-3), [p.5](https://www.f150gen14.com/forum/threads/obd-fusion-pids.12838/page-5), [p.7](https://www.f150gen14.com/forum/threads/obd-fusion-pids.12838/page-7) |
| Import pitfalls: without the Ford add-on, imported gauges "default to mph, or some other SAE pid". Android-to-iOS imports often brought in PIDs but no dashboards. One iOS user had to go to Manage Dashboards > + > "Copy and Link Dashboards". Units set to Metric before import gave wrong-looking gauges. | Third-party | [p.5](https://www.f150gen14.com/forum/threads/obd-fusion-pids.12838/page-5), [p.7](https://www.f150gen14.com/forum/threads/obd-fusion-pids.12838/page-7) |
| Whether a `.stg` contains the VIN, email, adapter pairing or the logging selection. | Not found | — |
| **Logging PIDs**: Settings > Preferences > Logging > Select PIDs. CSV logging has 3 PIDs by default; binary Data Logging has 0. Each extra PID lowers the refresh rate. Triggers: GPS frame (default; no GPS = no file), PID frame, fixed sample time. Time column is seconds-from-start or a date stamp. | Confirmed | [Get Started with Logs](https://support.obdlink.com/support/solutions/articles/43000709894-get-started-with-logs) |
| CSV logs on Android are stored under `.../OCTech.Mobile.Applications.OBDLink/files/vehicles/<VIN>/CSVLogs`, so the **VIN is in the folder path**. | Confirmed | same |
| Logging selection is independent of dashboards. Nothing documents importing it from a file. | Confirmed (independent); Not found (import) | same |

### 3. PID type codes (`pt`) and IDs

| Finding | Status | Source |
|---|---|---|
| No public documentation of `pt` values or uid schemes. | Not found | Help centre, store notes, GitHub code search (`PIDLoggableItem`, `DashboardItemType`, `IsSquare`) |
| The app has these PID families: SAE (Mode 01), Calculated (for example fuel economy), User-Defined (custom header/mode/PID/equation), Enhanced (paid or bundled OEM add-ons), and since 7.0.0 a **Manufacturer** PID type (GM, Subaru). The built-in user-defined PID definitions moved into Manufacturer PIDs. | Confirmed | [Get Started with Logs](https://support.obdlink.com/support/solutions/articles/43000709894-get-started-with-logs) (SAE/Calculated groups), [App Store OBDLink](https://apps.apple.com/us/app/obdlink/id879636351), [App Store OBD Fusion](https://apps.apple.com/us/app/obd-fusion/id650684932) |
| An app-exported **`.udpid`** file (user-defined PIDs) is public. It is UTF-8 XML with a BOM: `<doc culture="" version="1.01"><pid type="4">` with `Name`, `Category`, `Units/MetricName/EnglishName`, `Bounds`, `MetricToEnglishScaleFactor/Offset`, `OBD2Header` (`ECM`), `OBD2Mode` (`22`), `PIDRequestNumber`, `Formula/Equation invariant="true"`, **`UniqueId` (6 chars, for example `jjUUSk`)**, `Priority`, `NumberOfDecimalPlaces`. Import is Settings > User-Defined PIDs > ⋮ > Import, and it **replaced** the existing user PIDs on iPhone. MIT-licensed. | Third-party (tested on iPhone by the author) | [YannKr/porsche-overrev `deploy/obdlink/`](https://github.com/YannKr/porsche-overrev/tree/main/deploy/obdlink), [README "Phone, no code"](https://github.com/YannKr/porsche-overrev#phone-no-code-obdlink-app) |
| `pt="3"` is a user-defined PID and `uid` is its `UniqueId`: the 6-character shape matches. `pt="7"` (9-char uid + `mn=PCM/TCM`) is the enhanced add-on library, with `mn` naming the module. `pt="1"` is SAE Mode 01. | Inference | — |
| The user-PID `type` attribute (`4` in that sample) uses a different numbering from the dashboard `pt`. | Not found | — |
| CSV header conventions are not documented. The help says each row is a frame plus a time column, with units in PID names, for example "Transmission Fluid Temperature (°F)". ecuxplot parses OBDLink CSVs as `name (unit)` with a `StartTime` comment line. | Confirmed (help) / Third-party (ecuxplot) | [Get Started with Logs](https://support.obdlink.com/support/solutions/articles/43000709894-get-started-with-logs), [ecuxplot loggers.yaml](https://github.com/nyetlabs/ecuxplot/blob/master/src/org/nyet/ecuxplot/loggers.yaml) |

### 4. Public examples and the OBDwiz / OCTech lineage

- **`.dashgz`**: no public sample, parser or write-up. Not found in GitHub code search (`dashgz`, `PIDLoggableItem`,
  `IsSquare DashboardItemType`, `DigitalGauge RadialGauge LoggableItem`) or on the web.
- **`.stg`**: samples were attached to the f150gen14 thread, renamed `.pdf` (forum restriction). Third-party.
  Not inspected: they are personal settings files, and per the thread they hold a full settings export.
- **`.udpid`**: one public set (porsche-overrev, above).
- **Lineage (Third-party, strong):** [x893/OBDwiz](https://github.com/x893/OBDwiz) is a decompiled copy of OCTech's OBDwiz
  WinForms app from 2015, with OCTech DLLs and no licence. Its `MainForm.cs` registers `PIDLoggableItem`,
  `UserPIDLoggableItem`, `FuelLoggableItem`, `PIDPluginLoggableItem`, each with an XML reader. It writes XML with
  `culture` and `version` attributes, the same pattern as `<Dashboard culture="" version="1">`. So `.dashgz` is a
  descendant of OCTech's .NET serialisation. Other `LoggableItem` kinds (`ItemType="UserPIDLoggableItem"`,
  `FuelLoggableItem`) probably exist in dashboards too (Inference). **Do not copy code from that repo**: it is
  unlicensed decompiled proprietary code. It is useful only as a pointer.
- **Package name:** `OCTech.Mobile.Applications.OBDLink` (Confirmed, in the Logs help article's file path).

### 5. Licensing / terms

- **No OBDLink EULA or terms of use found** on obdlink.com, in the help centre, or on the App Store listing (no custom
  licence link). Searches: "OBDLink end user license agreement", `site:obdlink.com` "terms and conditions" / "license
  agreement" / "terms of service". Not found.
- [OBDLink App Privacy Policy](https://www.obdlink.com/obdlink-app-privacy-policy/) (Confirmed): optional anonymous stats
  include an anonymised VIN. Location data "is not sent off of the device". Debug logs are sent only on request and include
  the user's email. Nothing about file formats, exports or reverse engineering.
- OBD Solutions says it doesn't lock out third-party apps ([About](https://www.obdlink.com/about-us/), via search
  snippet). That is a statement about the adapter, not about file formats.
- Inference: reading the owner's own exports and generating files for them to import, for personal use, faces no
  restriction that we found. The in-app first-run licence (if any) was not reviewed. **The owner should check it on the
  phone.** Don't redistribute OBDLink's enhanced-PID uids as a published catalogue until that is checked.

### 6. Ford enhanced PID catalogue (names to `pt="7"` IDs)

- **Not found.** [OEM coverage PDF](https://www.obdlink.com/download/pdf-mx-oem/) (Confirmed) lists makes, models and
  years (Ford "F-Series Super Duty 1999-2010, 2017-2020" in that edition), plus module/live-parameter support flags. It has
  no parameter names or IDs. The [OBDLink App page](https://www.obdlink.com/obd-apps/obdlink-app/) and the help centre have
  no PID lists either.
- A 2022 forum user asked whether the app can export the Ford pack's PID list. The answer was that only user-defined PIDs
  can be exported (Third-party, [p.3](https://www.f150gen14.com/forum/threads/obd-fusion-pids.12838/page-3)).
- So the only source of name-to-uid mappings is the owner's own exports (dashboards, and maybe `.stg`). In-app search in
  the PID picker shows names but not uids.

## Implications for #164

- **(a) Learn a name → PID catalogue from dashboards.** Feasible and the cheapest option. Every `.dashgz` gauge carries
  (`pt`, `uid`, `mn`) plus Title1/Title2 (name, unit). A catalogue only grows with the gauges the owner has placed. A
  "catalogue dashboard" (one gauge per PID of interest) is a quick way to harvest many. Store it outside the core, as
  **vehicle-profile data** (enhanced uids are add-on and vehicle specific). Keep it local and unpublished until the
  terms are checked.
- **(b) Generate "watch while driving" dashboards per rule pack.** Format-wise, plausible. Risks: an undocumented
  schema; import behaviour for unknown uids (forum evidence: silent fallback to SAE/mph); and the large Style block.
  **Template beats from scratch**: take a gauge the app exported, swap only `<PID>`, titles, min/max and `<Location>`,
  and keep the Style block byte-for-byte. Generating Style from scratch risks rejection or odd rendering, and nothing
  documents its defaults.
- **(c) Hand over the logging PID set via settings export.** Weakest. `.stg` contents are undocumented, it is
  all-or-nothing per category, it may carry personal data, and nothing shows the logging selection is in it or importable.
  Treat this as an experiment, not a plan. A **checklist** ("in Logging > Select PIDs, tick these names") needs no file
  format.
- **(d) Warn when a drive log lacks needed channels.** Needs no OBDLink file at all: CSV headers are names with units.
  It works with the app (the baseline) and fits rule packs naturally. Highest value for the least risk. A catalogue from
  (a) can turn a missing channel into a picker path or a ready dashboard.
- **User-defined PIDs:** if a rule pack needs a PID the Ford add-on lacks, a generated `.udpid` is a documented-by-example
  route. But import **replaces** existing user PIDs, so warn the owner.

## Open questions for the owner (phone experiments)

1. **Round-trip test.** Export a dashboard, unzip, re-gzip unchanged (keep the BOM), import. Does it load? Repeat
   with one gauge's `uid` edited, and again with one gauge's Style block removed.
2. **Unknown uid.** Import a dashboard with a fake `pt="7"` uid and one with a `pt="7"` uid on a phone or vehicle without
   the Ford add-on. Is it an error, a red PID, or a silent SAE fallback?
3. **`pt="3"`.** Export User-Defined PIDs (`.udpid`) and check whether "Boost" has `<UniqueId>L09IML</UniqueId>`. That
   settles `pt="3"` = user PID.
4. **Other `pt` values.** Add a gauge for a Calculated PID (for example instant fuel economy), a GPS PID, and a push-button
   gauge, then export. Which `pt` / `ItemType` values appear?
5. **Is the uid stable?** Export the same enhanced gauge from two app versions or two phones. Same `uid`? If yes, a
   catalogue is portable. If no, it is per-install.
6. **`.stg` contents.** Export settings with everything ticked, then grep (locally, never committed) for the VIN,
   email, adapter MAC, and the logging PID list. Can import be limited to logging prefs?
7. **iOS vs Android.** Does a `.dashgz` exported on one platform import on the other? `.stg` reportedly didn't.
8. **Licence.** Read any in-app licence / about screen for terms on exported files or reverse engineering.
9. **Units.** Does a dashboard gauge store units, or follow the app's English/Metric setting? This matters if Title2 is
   only a label.
