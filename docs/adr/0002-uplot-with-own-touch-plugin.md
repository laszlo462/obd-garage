# uPlot for Drive Log charts, with our own touch plugin

Drive Logs reach tens of thousands of rows across many Channels and are viewed mostly on a phone, so we chart them with uPlot (fast and tiny) and write our own small plugin for pinch zoom, drag pan and tap-to-select, instead of using Apache ECharts, which has touch handling built in but is far heavier. Stacked Channel panels are several uPlot instances with a synced x axis.

## Status

Accepted on one condition: the prototype for "Can Notes be pinned to a moment on a phone chart?" is built on uPlot and has to work on the owner's iPhone. If it does not, this ADR is superseded and ECharts takes its place.
