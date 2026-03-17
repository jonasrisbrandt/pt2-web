import { createSynthEngine } from './core/createSynthEngine';
import { createTrackerEngine } from './core/createEngine';
import type { SynthEngine } from './core/synthEngine';
import type { TrackerEngine } from './core/trackerEngine';
import type { EngineConfig, QuadrascopeState, TrackerSnapshot } from './core/trackerTypes';
import type { SynthSnapshot } from './core/synthTypes';

export interface TrackerRuntimeInitResult {
  trackerWarning: string | null;
  synthWarning: string | null;
  snapshot: TrackerSnapshot;
  synthSnapshot: SynthSnapshot;
  quadrascope: QuadrascopeState | null;
}

export interface TrackerRuntimeEventHandlers {
  onTrackerSnapshot: (snapshot: TrackerSnapshot, quadrascope: QuadrascopeState | null) => void;
  onTrackerStatus: (message: string) => void;
  onSynthSnapshot: (snapshot: SynthSnapshot) => void;
}

export class TrackerRuntime {
  private readonly config: EngineConfig;
  private readonly handlers: TrackerRuntimeEventHandlers;
  private engine: TrackerEngine | null = null;
  private synthEngine: SynthEngine | null = null;

  constructor(config: EngineConfig, handlers: TrackerRuntimeEventHandlers) {
    this.config = config;
    this.handlers = handlers;
  }

  async init(): Promise<TrackerRuntimeInitResult> {
    const { engine, warning: trackerWarning } = await createTrackerEngine(this.config);
    const { engine: synthEngine, warning: synthWarning } = await createSynthEngine();

    this.engine = engine;
    this.synthEngine = synthEngine;

    this.engine.subscribe((event) => {
      if (event.type === 'snapshot') {
        this.handlers.onTrackerSnapshot(event.snapshot, event.snapshot.quadrascope ?? null);
        return;
      }
      this.handlers.onTrackerStatus(event.message);
    });

    this.synthEngine.subscribe((event) => {
      if (event.type === 'snapshot') {
        this.handlers.onSynthSnapshot(event.snapshot);
      }
    });

    const snapshot = this.engine.getSnapshot();
    const synthSnapshot = this.synthEngine.getSnapshot();

    return {
      trackerWarning,
      synthWarning,
      snapshot,
      synthSnapshot,
      quadrascope: snapshot.quadrascope ?? null,
    };
  }

  getTrackerEngine(): TrackerEngine | null {
    return this.engine;
  }

  getSynthEngine(): SynthEngine | null {
    return this.synthEngine;
  }
}
