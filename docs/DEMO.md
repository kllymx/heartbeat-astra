---
type: documentation
collab_reviewed: true
---

# A three-minute demo

Start the app with `npm run dev`, open port 5186, choose **A day in flow**, and use presentation mode from the top-right icon. The browser is clearly marked **SAMPLE DAY**.

**0:00–0:25 · The idea.** “We instrument our software. What if we could understand the human building it? Heartbeat connects body signals, work context, and AI collaboration.” Show the signal portrait and computed daily metrics.

**0:25–1:00 · One moment, connected.** Click **Replay day**, then drag the timeline slider. Point out that heart rate, the active app, agent activity, and the chapter change together. Pause at a visibly elevated interval. “This shows what happened together. It doesn't pretend to know what caused it.”

**1:00–1:35 · The map behind the moment.** Open **Memory map**. Search for an application or context, select a node, inspect its connected activity and measurements, and use **Open moment** to jump back to the timeline.

**1:35–2:05 · Ask for evidence.** In Observatory, select a suggested question or type your own. Explain that the default panel uses local, deterministic analysis. If an API key and actual model are configured, enable connected mode and demonstrate a real model answer; announce the selected model instead of calling every answer Astra.

**2:05–2:35 · Change the pattern.** Open **Pattern lab**. Compare the flow, overload and recovery sample days. These are designed datasets with calculated observations, not personalized predictions. Open a different day and let the audience see the changed timeline.

**2:35–3:00 · Make it shareable.** Export the day report and open the repository. “Astra helped us build a working, inspectable product: interactive visualization, a tested analytics engine, and an optional real-model connection. You can run the demo without an account or a wearable.”

## Before presenting

- Load the demo once before presenting so assets are ready.
- Keep the local server running. The static hosted demo works without a model server.
- If demonstrating a connected model, start `npm run model:server`, configure the model you can actually access, and test one answer beforehand.
- Avoid presenting sample days as the presenter's actual biometric data.
- Space toggles replay; Left/Right move through time; Escape exits presentation mode.
