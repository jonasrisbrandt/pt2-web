import type { SampleSlot } from '../../core/trackerTypes';
import type { SelectedSamplePanelRenderOptions } from './markupRenderer';
import type { InlineNameFieldRenderOptions } from './viewModels';
import type { RenderJob, SynthSnapshot } from '../../core/synthTypes';

export interface SampleBankRenderItem {
  sample: SampleSlot;
  selectedSample: number;
  previewValues: ArrayLike<number>;
}

export interface SampleBankRenderOptions {
  items: SampleBankRenderItem[];
}

export interface ToolbarButtonRenderOptions {
  action: string;
  iconHtml: string;
  label: string;
  active: boolean;
}

export interface ToolIconButtonRenderOptions {
  action: string;
  iconHtml: string;
  label: string;
  active: boolean;
  disabled: boolean;
  role?: string;
  valueText?: string;
}

export interface IconButtonRenderOptions {
  action: string;
  iconHtml: string;
  label: string;
  disabled?: boolean;
  small?: boolean;
  active?: boolean;
}

export interface ModuleStepperCardRenderOptions {
  kind: 'stepper';
  label: string;
  value: string;
  role: string;
  downAction: string;
  upAction: string;
  enabled: boolean;
  downIconHtml: string;
  upIconHtml: string;
}

export interface ModuleValueCardRenderOptions {
  kind: 'value';
  label: string;
  value: string;
  role: string;
}

export type ModuleCardRenderOptions =
  | ModuleStepperCardRenderOptions
  | ModuleValueCardRenderOptions;

export interface ModuleGridRenderOptions {
  cards: ModuleCardRenderOptions[];
}

export interface TrackHeaderRenderOptions {
  channel: number;
  muted: boolean;
  muteIconHtml: string;
}

export interface ClassicDebugRenderOptions {
  enabled: boolean;
}

export interface SampleCreatorRenderOptions {
  snapshot: SynthSnapshot | null;
  targetSample: SampleSlot | null;
  keyboardOctave: number;
  renderJob: RenderJob;
}

export interface AppShellRenderOptions {
  viewMode: 'modern' | 'classic';
  workspaceMode?: 'tracker' | 'sample-creator';
  viewToggleOptions: ToolbarButtonRenderOptions[];
  songTitle: InlineNameFieldRenderOptions;
  moduleTransportOptions: ToolIconButtonRenderOptions[];
  moduleGridOptions: ModuleGridRenderOptions;
  moduleCollapsed: boolean;
  moduleCollapseIconHtml: string;
  visualizationLabel: string;
  visualizationControlOptions: IconButtonRenderOptions[];
  visualizationCollapsed: boolean;
  visualizationCollapseIconHtml: string;
  patternEditorPanelOptions?: PatternPanelRenderOptions | null;
  sampleEditorPanelOptions?: import('./markupRenderer').SampleEditorPanelRenderOptions | null;
  sampleBankOptions: SampleBankRenderOptions;
  selectedSamplePanelOptions: SelectedSamplePanelRenderOptions;
  samplesCollapsed: boolean;
  samplesCollapseIconHtml: string;
  classicDebugOptions: ClassicDebugRenderOptions;
  samplePageControlOptions: IconButtonRenderOptions[];
  fileMenuOpen: boolean;
  helpMenuOpen: boolean;
  aboutOpen: boolean;
  appVersion: string;
  fileActionsDisabled: boolean;
  importDisabled: boolean;
  sampleCreatorOptions?: SampleCreatorRenderOptions | null;
}

export interface PatternPanelRenderOptions {
  octave: number;
  octaveOneActive: boolean;
  octaveTwoActive: boolean;
  collapsed: boolean;
  collapseIconHtml: string;
  trackHeaders: TrackHeaderRenderOptions[];
}

export const renderPatternEditorPanel = ({
  octave,
  octaveOneActive,
  octaveTwoActive,
  collapsed,
  collapseIconHtml,
  trackHeaders,
}: PatternPanelRenderOptions): string => `
  <article class="panel pattern-panel editor-panel-shell${collapsed ? ' is-collapsed' : ''}">
    <div class="panel-head compact panel-head--section">
      <div class="panel-heading-copy">
        <button type="button" class="section-heading-button" data-action="toggle-section-editor" aria-expanded="${collapsed ? 'false' : 'true'}">
          <span class="section-heading-button__copy">
            <span class="panel-label">Pattern editor</span>
          </span>
          <span class="section-heading-button__icon" aria-hidden="true">${collapseIconHtml}</span>
        </button>
      </div>
      <div class="panel-head-actions">
        <div class="octave-control">
          <span class="octave-label">Octave</span>
          <button type="button" class="icon-button icon-button--octave${octaveOneActive ? ' is-active' : ''}" data-action="octave-set-1" aria-pressed="${octaveOneActive ? 'true' : 'false'}">1</button>
          <button type="button" class="icon-button icon-button--octave${octaveTwoActive ? ' is-active' : ''}" data-action="octave-set-2" aria-pressed="${octaveTwoActive ? 'true' : 'false'}">2</button>
          <span class="sr-only" data-role="octave-value">Octave ${octave}</span>
        </div>
      </div>
    </div>
    <div class="panel-body">
      <div class="pattern-header">
        <span>Row</span>
        ${trackHeaders.map(({ channel, muted, muteIconHtml }) => `
          <span class="track-label track-label--${channel + 1}${muted ? ' is-muted' : ''}">
            <button
              type="button"
              class="track-mute-button${muted ? ' is-muted' : ''}"
              data-role="track-mute-${channel}"
              data-action="toggle-track-mute"
              data-channel="${channel}"
              aria-pressed="${muted ? 'true' : 'false'}"
              aria-label="${muted ? 'Unmute track' : 'Mute track'} ${channel + 1}"
            >${muteIconHtml}</button>
            <span>Track ${channel + 1}</span>
          </span>
        `).join('')}
      </div>
      <div class="pattern-canvas-host" data-role="pattern-host"></div>
    </div>
  </article>
`;
