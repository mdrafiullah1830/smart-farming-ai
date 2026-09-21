# Mac Resource Audit

## Findings

The Mac has 8 GB of unified memory. The audit measured 43 percent system-wide memory availability, no swap-ins, no swap-outs, and no throttled memory pages. A high “Memory Used” number alone does not show a fault because macOS uses compression and caches to reuse otherwise idle memory. Memory Pressure and swap activity are the useful indicators.

The main active load during the audit came from WindowServer and ChatGPT/Codex processes. WindowServer used about 39–41 percent CPU, while the main Codex renderer used about 23–28 percent and roughly 687–702 MB resident memory. Other Codex and ChatGPT processes together used several hundred additional megabytes. This explains the heat observed while an active Codex task is rendering output and running commands.

MongoDB and MySQL were configured as login services even though the current Smart Farming production architecture uses Cloudflare D1. Both services were stopped safely on 14 September 2026. Their databases and application files were not deleted. They can be restarted later with `brew services start mongodb-community` and `brew services start mysql`.

## Recommended Operating Profile

Keep one Codex task and only necessary browser tabs open. Restart ChatGPT/Codex after a long working session to release renderer memory. Avoid local model training, emulators, Docker, MongoDB and MySQL while using Codex on this 8 GB Mac. Use cloud training for the crop-disease model. In System Settings, review General > Login Items & Extensions and disable background access only for apps that are not needed.

Do not clear caches repeatedly merely to reduce the “used” memory number. Apple states that macOS uses available memory and cached files to improve performance; green Memory Pressure indicates efficient operation. Check Activity Monitor CPU and Memory Pressure when heat persists.

## Sources

1. Apple Support, [View memory usage in Activity Monitor on Mac](https://support.apple.com/en-gb/guide/activity-monitor/actmntr1004/mac).
2. Apple Support, [Check if your Mac needs more RAM in Activity Monitor](https://support.apple.com/en-asia/guide/activity-monitor/actmntr34865/mac).
3. Apple Support, [View CPU activity in Activity Monitor on Mac](https://support.apple.com/guide/activity-monitor/view-cpu-activity-actmntr43452/mac).
4. Apple Support, [Change Login Items and Extensions settings on Mac](https://support.apple.com/en-mide/guide/mac-help/mtusr003/mac).
