const ALARM_NAME = 'nanobrowser-bridge-watchdog';
const PING_INTERVAL_MS = 20_000;

export class KeepAliveManager {
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private onPingCallback: (() => void) | null = null;
  private onCheckCallback: (() => void) | null = null;

  constructor(onPing: () => void, onCheck: () => void) {
    this.onPingCallback = onPing;
    this.onCheckCallback = onCheck;
    this.setupAlarm();
  }

  private setupAlarm() {
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.get(ALARM_NAME, alarm => {
        if (!alarm) {
          chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
        }
      });
      chrome.alarms.onAlarm.addListener(alarm => {
        if (alarm.name === ALARM_NAME) {
          this.onCheckCallback?.();
        }
      });
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      this.onPingCallback?.();
    }, PING_INTERVAL_MS);
  }

  stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
