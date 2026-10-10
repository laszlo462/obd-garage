# OBD Garage

A self-hosted app for keeping and reviewing a vehicle's OBDLink exports, and for spotting the moments in
them that matter.

## Language

### Vehicles

**Vehicle**:
One physical vehicle the owner tracks, known by its VIN and labelled by its year, make and model. It only
ever comes from a Diagnostic Report carrying a VIN not seen before.
_Avoid_: Truck, car, nickname

**Current Vehicle**:
The Vehicle the app is showing on this device, picked with the Vehicle switcher. New Drive Logs default
to it.
_Avoid_: Active vehicle, selected vehicle

**Vehicle Profile**:
The knowledge about one kind of vehicle that makes its data read correctly: PID aliases, decode fixes,
hidden channels and default chart presets.
_Avoid_: Vehicle config, vehicle type

**Rule Pack**:
A named set of rules for a specific fault or vehicle, switched on per Vehicle (e.g. "6.7 P0401").
_Avoid_: Plugin, ruleset

### Uploads

**Diagnostic Report**:
An OBDLink HTML report: a snapshot of a Vehicle's monitors, trouble codes, freeze frames and Mode 06
results at one moment. It carries the VIN.
_Avoid_: Scan, report file

**Drive Log**:
An OBDLink CSV recording of PID values over time during one drive. It carries no VIN, so the owner
assigns its Vehicle when it is added, or leaves it Unassigned.
_Avoid_: Log file, CSV, session, recording

**Unassigned**:
A Drive Log that belongs to no Vehicle: not one of the owner's Vehicles, or not known yet. It can be
viewed, but no Vehicle Profile, Rule Pack or Reference Report applies to it until it is assigned.
_Avoid_: Orphan, unknown vehicle, VIN-less vehicle

**Original**:
The uploaded file exactly as received. It is the source of truth; everything shown is derived from it and
can be rebuilt from it.
_Avoid_: Raw file, source file

**Channel**:
One logged PID column in a Drive Log, after the Vehicle Profile's aliases and decode fixes are applied.
_Avoid_: Column, series, signal

**Reference Report**:
The one Diagnostic Report a Drive Log is compared against: by default its Vehicle's Report closest in
time to the drive. The owner can change it or clear it. An Unassigned Drive Log has none.
_Avoid_: Baseline, nearest report

### Findings

**Event**:
A moment or span in a Drive Log found by a rule. Events are regenerated whenever rules change and are
never edited by hand.
_Avoid_: Annotation, detection, alert

**Bundle**:
A download of the Originals, Events and Notes for one Vehicle over a date range, plus each Drive Log's
Reference Report, for analysis outside the app.
_Avoid_: Export, archive, package

**Note**:
Something the owner wrote about a whole Drive Log or Diagnostic Report, or pinned to one moment (a single
row) in a Drive Log. Notes are permanent and never touched when rules re-run.
_Avoid_: Annotation, comment, event
