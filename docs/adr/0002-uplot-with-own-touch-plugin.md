# uPlot for Drive Log charts, with our own touch plugin

Drive Logs reach tens of thousands of rows across many Channels and are viewed mostly on a phone, so we chart them with uPlot (fast and tiny) and write our own small plugin for pinch zoom, drag pan and tap-to-select, instead of using Apache ECharts, which has touch handling built in but is far heavier. Stacked Channel panels are several uPlot instances with a synced x axis.

## Status

Accepted. It was conditional on the prototype for "Can Notes be pinned to a moment on a phone chart?" working on the owner's iPhone, and it did (2026-10-09), including at about 56k rows. The prototype is kept on the `prototype/notes-pinning` branch.
