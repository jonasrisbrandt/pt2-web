export interface AppShellRenderOptions {
  viewMode: 'modern' | 'classic';
  toolbarPrimaryHtml: string;
  viewToggleHtml: string;
  songTitle: string;
  transportAction: 'stop' | 'toggle-play';
  transportButtonContentHtml: string;
  moduleCardsHtml: string;
  visualizationLabel: string;
  visualizationPrevIconHtml: string;
  visualizationNextIconHtml: string;
  editorPanelHtml: string;
  samplePage: number;
  samplePageCount: number;
  sampleButtonsHtml: string;
  selectedSamplePanelHtml: string;
  classicDebugHtml: string;
  samplePagePrevDisabled: boolean;
  samplePageNextDisabled: boolean;
  samplePagePrevIconHtml: string;
  samplePageNextIconHtml: string;
}

export const renderAppShellMarkup = ({
  viewMode,
  toolbarPrimaryHtml,
  viewToggleHtml,
  songTitle,
  transportAction,
  transportButtonContentHtml,
  moduleCardsHtml,
  visualizationLabel,
  visualizationPrevIconHtml,
  visualizationNextIconHtml,
  editorPanelHtml,
  samplePage,
  samplePageCount,
  sampleButtonsHtml,
  selectedSamplePanelHtml,
  classicDebugHtml,
  samplePagePrevDisabled,
  samplePageNextDisabled,
  samplePagePrevIconHtml,
  samplePageNextIconHtml,
}: AppShellRenderOptions): string => `
  <section class="toolbar">
    <div class="toolbar-group">
      ${toolbarPrimaryHtml}
    </div>
    <div class="toolbar-group toolbar-group--views">
      <div class="view-toggle" role="tablist" aria-label="View mode">
        ${viewToggleHtml}
      </div>
    </div>
  </section>

  <main class="workspace">
    <section class="tracker-stack">
      <article class="panel module-panel">
        <div class="panel-head compact module-head">
          <div>
            <p class="panel-label">Module</p>
            <h2 class="panel-title--subtle" data-role="song-title">${songTitle}</h2>
          </div>
          <div class="module-actions">
            <button type="button" class="toolbar-button toolbar-button--primary module-action-button" data-role="transport-toggle" data-action="${transportAction}">${transportButtonContentHtml}</button>
          </div>
        </div>
        <div class="module-grid">
          ${moduleCardsHtml}
        </div>
      </article>

      <article class="panel visualization-panel">
        <div class="panel-head compact">
          <div>
            <p class="panel-label">Visualization</p>
            <h2 class="panel-title--subtle" data-role="visualization-label">${visualizationLabel}</h2>
          </div>
          <div class="visualization-controls">
            <button type="button" class="icon-button" data-action="visualization-prev">${visualizationPrevIconHtml}<span class="sr-only">Previous visualization</span></button>
            <button type="button" class="icon-button" data-action="visualization-next">${visualizationNextIconHtml}<span class="sr-only">Next visualization</span></button>
          </div>
        </div>
        <div class="visualization-host" data-role="visualization-host"></div>
      </article>

      ${editorPanelHtml}
    </section>

    <aside class="inspector-stack">
      <section class="panel inspector-panel">
        <div class="panel-head compact">
          <div>
            <p class="panel-label">Samples</p>
          </div>
          <div class="visualization-controls">
            <span class="panel-title--subtle" data-role="sample-page-label">Page ${samplePage + 1} / ${samplePageCount}</span>
            <button type="button" class="icon-button" data-action="sample-page-prev" ${samplePagePrevDisabled ? 'disabled' : ''}>${samplePagePrevIconHtml}<span class="sr-only">Previous sample page</span></button>
            <button type="button" class="icon-button" data-action="sample-page-next" ${samplePageNextDisabled ? 'disabled' : ''}>${samplePageNextIconHtml}<span class="sr-only">Next sample page</span></button>
          </div>
        </div>
        <div class="sample-bank" data-role="sample-bank">${sampleButtonsHtml}</div>
        <div data-role="sample-detail-content">${selectedSamplePanelHtml}</div>
      </section>

      <section class="panel canvas-panel">
        <div class="panel-head compact">
          <div>
            <p class="panel-label">Classic</p>
            <h2>Original ProTracker UI</h2>
          </div>
        </div>
        ${classicDebugHtml}
        <div class="engine-canvas-host"></div>
      </section>
    </aside>
  </main>
`;

export interface PatternPanelRenderOptions {
  octave: number;
  octaveDownIconHtml: string;
  octaveUpIconHtml: string;
  trackHeadersHtml: string;
}

export const renderPatternEditorPanel = ({
  octave,
  octaveDownIconHtml,
  octaveUpIconHtml,
  trackHeadersHtml,
}: PatternPanelRenderOptions): string => `
  <article class="panel pattern-panel editor-panel-shell">
    <div class="panel-head compact">
      <div>
        <p class="panel-label">Pattern editor</p>
      </div>
      <div class="octave-control">
        <button type="button" class="icon-button" data-action="octave-down">${octaveDownIconHtml}<span class="sr-only">Lower octave</span></button>
        <span class="octave-value" data-role="octave-value">Octave ${octave}</span>
        <button type="button" class="icon-button" data-action="octave-up">${octaveUpIconHtml}<span class="sr-only">Raise octave</span></button>
      </div>
    </div>
    <div class="pattern-header">
      <span>Row</span>
      ${trackHeadersHtml}
    </div>
    <div class="pattern-canvas-host" data-role="pattern-host"></div>
  </article>
`;
