# Recorded times are naive local wall-clock times

OBDLink writes a Drive Log's `StartTime` and a Diagnostic Report's `Date:` as local wall-clock times with no time zone, and both come from the same phone. We store them as naive local times (ISO 8601 with no offset) and compare them as such, instead of interpreting them in the server's or browser's time zone and storing UTC. Every comparison the app makes (closest-in-time Reference Report, the same-day hint for Unassigned Drive Logs, Bundle day ranges) compares times from the same clock, so no time zone is needed, and a "day" is simply the recorded local date. Upload time is a real instant and is stored in UTC.

## Considered Options

- **Interpret in the server's `TZ` and store UTC**: correct only while the server's zone matches where the phone was. It also disagreed with Bundle ranges, which had been specified in the browser's zone, so the same drive could fall on different days in different places.

## Consequences

- A drive logged while travelling across time zones, or across a DST change, is off by the offset when compared with other recordings. This is accepted.
- This amends the "New-Vehicle dialog" (#10) and "What is a Bundle?" (#19) decisions, which named the server's and the browser's time zone.

Decided in the "Ingest and re-parse pipeline" ticket (#21).
