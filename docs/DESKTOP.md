---
type: documentation
collab_reviewed: true
---

# Desktop integration

The existing Heartbeat desktop app is the primary experience. The website is a shareable preview with synthetic data; it cannot read a visitor's WHOOP or local desktop history.

The new components are open source here and also integrated directly into the existing desktop app:

- `RhythmPanel` sits above the original timeline. It receives the app's existing `DashboardSnapshot`, `CollectorStatus`, clock, and selected timeline point. It never imports a sample fixture.
- `SignalOrb` keeps the animated contour portrait. Its heart-rate value follows live measurements or the selected recorded moment.
- `MemoryConstellation` opens from the original toolbar. Selecting a recorded moment returns to the existing timeline and moves its playhead.
- `analyzeDay` and `answerQuestion` run locally on the supplied snapshot. They are deterministic signal analysis, not model inference.

The native panel distinguishes a live BLE reading, the last received reading, a selected recorded moment, and missing data. Its styles inherit the desktop app's existing typography, borders, and light/dark theme variables.

## Host contract

```tsx
<RhythmPanel
  snapshot={dashboard}
  collector={collectorStatus}
  selectedPoint={playheadPoint ?? hoveredPoint}
  nowTs={nowTs}
  native={true}
  onSelectTime={seekToTimestamp}
/>
```

All timestamps are Unix seconds. The parent owns native refresh, range selection, timeline navigation, and data collection. Import `rhythm-panel.css` through the component and provide the desktop CSS variables `--bg`, `--text`, `--muted`, `--border`, `--mono`, `--action-cyan`, `--lane-cyan`, and `--success`.

This repository does not publish the original private app, its local health/activity data, or the vendored WHOOP protocol implementation. It publishes the new reusable frontend and analytics source without changing the collector's licensing.
