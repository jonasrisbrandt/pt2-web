interface PerfMetric {
  totalMs: number;
  calls: number;
  maxMs: number;
  windowTotalMs: number;
  windowCalls: number;
  windowMaxMs: number;
}

const ENABLED = (() => {
  if (typeof window === 'undefined') {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return params.get('perf') === '1';
})();

class UiPerfMonitor {
  private readonly enabled = ENABLED;
  private readonly metrics = new Map<string, PerfMetric>();
  private readonly tags = new Map<string, string>();
  private overlayRoot: HTMLDivElement | null = null;
  private overlay: HTMLPreElement | null = null;
  private copyButton: HTMLButtonElement | null = null;
  private flushTimer: number | null = null;
  private lastSnapshotText = 'Perf monitor enabled...';

  constructor() {
    if (!this.enabled || typeof window === 'undefined') {
      return;
    }

    this.ensureOverlay();
    this.flushTimer = window.setInterval(() => this.flush(), 1000);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  begin(name: string): () => void {
    if (!this.enabled) {
      return () => {};
    }

    const startedAt = performance.now();
    return () => {
      this.record(name, performance.now() - startedAt);
    };
  }

  measure<T>(name: string, callback: () => T): T {
    if (!this.enabled) {
      return callback();
    }

    const startedAt = performance.now();
    try {
      return callback();
    } finally {
      this.record(name, performance.now() - startedAt);
    }
  }

  record(name: string, durationMs: number): void {
    if (!this.enabled) {
      return;
    }

    const metric = this.metrics.get(name) ?? {
      totalMs: 0,
      calls: 0,
      maxMs: 0,
      windowTotalMs: 0,
      windowCalls: 0,
      windowMaxMs: 0,
    };

    metric.totalMs += durationMs;
    metric.calls += 1;
    metric.maxMs = Math.max(metric.maxMs, durationMs);
    metric.windowTotalMs += durationMs;
    metric.windowCalls += 1;
    metric.windowMaxMs = Math.max(metric.windowMaxMs, durationMs);
    this.metrics.set(name, metric);
  }

  setTag(name: string, value: string | number | boolean): void {
    if (!this.enabled) {
      return;
    }

    this.tags.set(name, String(value));
  }

  private ensureOverlay(): void {
    if (this.overlayRoot || typeof document === 'undefined') {
      return;
    }

    const overlayRoot = document.createElement('div');
    overlayRoot.setAttribute('data-role', 'perf-overlay-root');
    overlayRoot.style.position = 'fixed';
    overlayRoot.style.top = '8px';
    overlayRoot.style.right = '8px';
    overlayRoot.style.zIndex = '999999';
    overlayRoot.style.maxWidth = '460px';
    overlayRoot.style.maxHeight = '70vh';
    overlayRoot.style.display = 'flex';
    overlayRoot.style.flexDirection = 'column';
    overlayRoot.style.gap = '6px';
    overlayRoot.style.pointerEvents = 'none';

    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.justifyContent = 'flex-end';
    toolbar.style.pointerEvents = 'auto';

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.textContent = 'Copy';
    copyButton.style.padding = '4px 8px';
    copyButton.style.fontFamily = 'Consolas, "Courier New", monospace';
    copyButton.style.fontSize = '11px';
    copyButton.style.lineHeight = '1.2';
    copyButton.style.color = '#d7ecff';
    copyButton.style.background = 'rgba(20, 34, 46, 0.95)';
    copyButton.style.border = '1px solid rgba(88, 123, 152, 0.9)';
    copyButton.style.borderRadius = '6px';
    copyButton.style.cursor = 'pointer';
    copyButton.addEventListener('click', () => {
      void this.copySnapshotToClipboard();
    });
    toolbar.append(copyButton);

    const overlay = document.createElement('pre');
    overlay.setAttribute('data-role', 'perf-overlay');
    overlay.style.margin = '0';
    overlay.style.padding = '10px 12px';
    overlay.style.overflow = 'auto';
    overlay.style.pointerEvents = 'auto';
    overlay.style.whiteSpace = 'pre';
    overlay.style.fontFamily = 'Consolas, "Courier New", monospace';
    overlay.style.fontSize = '11px';
    overlay.style.lineHeight = '1.35';
    overlay.style.color = '#d7ecff';
    overlay.style.background = 'rgba(8, 14, 20, 0.9)';
    overlay.style.border = '1px solid rgba(88, 123, 152, 0.9)';
    overlay.style.borderRadius = '8px';
    overlay.textContent = this.lastSnapshotText;
    overlayRoot.append(toolbar, overlay);
    document.body.append(overlayRoot);
    this.overlayRoot = overlayRoot;
    this.overlay = overlay;
    this.copyButton = copyButton;
  }

  private flush(): void {
    if (!this.enabled) {
      return;
    }

    this.ensureOverlay();
    if (!this.overlay) {
      return;
    }

    const tagLines = Array.from(this.tags.entries()).map(([name, value]) => `${name}: ${value}`);
    const metricLines = Array.from(this.metrics.entries())
      .sort((a, b) => b[1].windowTotalMs - a[1].windowTotalMs)
      .slice(0, 16)
      .map(([name, metric]) => {
        const avgMs = metric.windowCalls > 0 ? metric.windowTotalMs / metric.windowCalls : 0;
        const callsPerSecond = metric.windowCalls;
        const line = `${name.padEnd(28)} ${callsPerSecond.toString().padStart(4)}x  ${metric.windowTotalMs.toFixed(2).padStart(7)}ms  avg ${avgMs.toFixed(3).padStart(6)}  max ${metric.windowMaxMs.toFixed(3).padStart(6)}`;
        metric.windowTotalMs = 0;
        metric.windowCalls = 0;
        metric.windowMaxMs = 0;
        return line;
      });

    this.lastSnapshotText = [
      'UI perf monitor (?perf=1)',
      ...tagLines,
      metricLines.length > 0 ? '' : 'No samples yet.',
      ...metricLines,
    ].join('\n');

    this.overlay.textContent = this.lastSnapshotText;
  }

  private async copySnapshotToClipboard(): Promise<void> {
    if (!this.enabled || !this.copyButton) {
      return;
    }

    const button = this.copyButton;
    const originalText = button.textContent ?? 'Copy';

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(this.lastSnapshotText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = this.lastSnapshotText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.append(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Failed';
    }

    window.setTimeout(() => {
      if (this.copyButton === button) {
        button.textContent = originalText;
      }
    }, 1200);
  }
}

export const uiPerfMonitor = new UiPerfMonitor();
