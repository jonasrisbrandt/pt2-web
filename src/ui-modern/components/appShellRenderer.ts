export interface AppShellRenderOptions {
  viewMode: 'modern' | 'classic';
  viewToggleHtml: string;
  songTitleHtml: string;
  transportControlsHtml: string;
  moduleCardsHtml: string;
  moduleCollapsed: boolean;
  moduleCollapseIconHtml: string;
  visualizationLabel: string;
  visualizationPianoIconHtml: string;
  visualizationPrevIconHtml: string;
  visualizationNextIconHtml: string;
  visualizationCollapsed: boolean;
  visualizationCollapseIconHtml: string;
  editorPanelHtml: string;
  sampleButtonsHtml: string;
  selectedSamplePanelHtml: string;
  samplesCollapsed: boolean;
  samplesCollapseIconHtml: string;
  classicDebugHtml: string;
  classicCollapsed: boolean;
  classicCollapseIconHtml: string;
  samplePagePrevDisabled: boolean;
  samplePageNextDisabled: boolean;
  samplePagePrevIconHtml: string;
  samplePageNextIconHtml: string;
  fileMenuOpen: boolean;
  helpMenuOpen: boolean;
  aboutOpen: boolean;
  appVersion: string;
  fileActionsDisabled: boolean;
  importDisabled: boolean;
}

const renderMenuItem = (
  action: string,
  label: string,
  disabled = false,
  subtle = '',
): string => `
  <button
    type="button"
    class="menu-item${disabled ? ' is-disabled' : ''}"
    data-action="${action}"
    ${disabled ? 'disabled' : ''}
  >
    <span>${label}</span>
    ${subtle ? `<span class="menu-item__meta">${subtle}</span>` : ''}
  </button>
`;

export const renderAppShellMarkup = ({
  viewMode,
  viewToggleHtml,
  songTitleHtml,
  transportControlsHtml,
  moduleCardsHtml,
  moduleCollapsed,
  moduleCollapseIconHtml,
  visualizationLabel,
  visualizationPianoIconHtml,
  visualizationPrevIconHtml,
  visualizationNextIconHtml,
  visualizationCollapsed,
  visualizationCollapseIconHtml,
  editorPanelHtml,
  sampleButtonsHtml,
  selectedSamplePanelHtml,
  samplesCollapsed,
  samplesCollapseIconHtml,
  classicDebugHtml,
  classicCollapsed,
  classicCollapseIconHtml,
  samplePagePrevDisabled,
  samplePageNextDisabled,
  samplePagePrevIconHtml,
  samplePageNextIconHtml,
  fileMenuOpen,
  helpMenuOpen,
  aboutOpen,
  appVersion,
  fileActionsDisabled,
  importDisabled,
}: AppShellRenderOptions): string => `
  <section class="menubar-shell" data-menu-root>
    <div class="menubar">
      <div class="menubar-group">
        <button
          type="button"
          class="menu-trigger${fileMenuOpen ? ' is-open' : ''}"
          data-action="toggle-menu-file"
          data-menu-trigger="file"
          aria-expanded="${fileMenuOpen ? 'true' : 'false'}"
        >File</button>
        <button
          type="button"
          class="menu-trigger${helpMenuOpen ? ' is-open' : ''}"
          data-action="toggle-menu-help"
          data-menu-trigger="help"
          aria-expanded="${helpMenuOpen ? 'true' : 'false'}"
        >Help</button>
      </div>
      <div class="menubar-group menubar-group--views">
        <div class="view-toggle" role="tablist" aria-label="View mode">
          ${viewToggleHtml}
        </div>
      </div>
    </div>
    <div class="menu-surface${fileMenuOpen ? ' is-open' : ''}" data-menu-panel="file">
      ${renderMenuItem('new-song', 'New MOD', fileActionsDisabled)}
      ${renderMenuItem('load-module', 'Load MOD', fileActionsDisabled)}
      ${renderMenuItem('save-module', 'Save MOD')}
      ${renderMenuItem('save-module-as', 'Save MOD as...')}
      <div class="menu-separator" role="separator"></div>
      ${renderMenuItem('import-samples', 'Import samples...', importDisabled)}
    </div>
    <div class="menu-surface menu-surface--help${helpMenuOpen ? ' is-open' : ''}" data-menu-panel="help">
      ${renderMenuItem('open-about', 'About')}
    </div>
  </section>

  <main class="workspace">
    <section class="tracker-stack">
      <article class="panel module-panel${moduleCollapsed ? ' is-collapsed' : ''}">
        <div class="panel-head compact panel-head--section module-head">
          <div class="panel-heading-copy">
            <button type="button" class="section-heading-button" data-action="toggle-section-module" aria-expanded="${moduleCollapsed ? 'false' : 'true'}">
              <span class="section-heading-button__copy">
                <span class="panel-label">Module</span>
              </span>
              <span class="section-heading-button__icon" aria-hidden="true">${moduleCollapseIconHtml}</span>
            </button>
            <h2 class="panel-title panel-title--editable panel-title--section-detail" data-role="song-title">${songTitleHtml}</h2>
          </div>
          <div class="panel-head-actions">
            <div class="module-transport-controls">
              ${transportControlsHtml}
            </div>
          </div>
        </div>
        <div class="panel-body">
          <div class="module-grid">
            ${moduleCardsHtml}
          </div>
        </div>
      </article>

      <article class="panel visualization-panel${visualizationCollapsed ? ' is-collapsed' : ''}">
        <div class="panel-head compact panel-head--section">
          <div class="panel-heading-copy">
            <button type="button" class="section-heading-button" data-action="toggle-section-visualization" aria-expanded="${visualizationCollapsed ? 'false' : 'true'}">
              <span class="section-heading-button__copy">
                <span class="panel-label">Visualization</span>
              </span>
              <span class="section-heading-button__icon" aria-hidden="true">${visualizationCollapseIconHtml}</span>
            </button>
            <h2 class="panel-title panel-title--subtle panel-title--section-detail" data-role="visualization-label">${visualizationLabel}</h2>
          </div>
          <div class="panel-head-actions">
            <div class="visualization-controls">
              <button type="button" class="icon-button" data-action="visualization-piano">${visualizationPianoIconHtml}<span class="sr-only">Show piano visualization</span></button>
              <button type="button" class="icon-button" data-action="visualization-prev">${visualizationPrevIconHtml}<span class="sr-only">Previous visualization</span></button>
              <button type="button" class="icon-button" data-action="visualization-next">${visualizationNextIconHtml}<span class="sr-only">Next visualization</span></button>
            </div>
          </div>
        </div>
        <div class="panel-body">
          <div class="visualization-host" data-role="visualization-host"></div>
        </div>
      </article>

      ${editorPanelHtml}
    </section>

    <aside class="inspector-stack">
      <section class="panel inspector-panel${samplesCollapsed ? ' is-collapsed' : ''}">
        <div class="panel-head compact panel-head--section">
          <div class="panel-heading-copy">
            <button type="button" class="section-heading-button" data-action="toggle-section-samples" aria-expanded="${samplesCollapsed ? 'false' : 'true'}">
              <span class="section-heading-button__copy">
                <span class="panel-label">Samples</span>
              </span>
              <span class="section-heading-button__icon" aria-hidden="true">${samplesCollapseIconHtml}</span>
            </button>
          </div>
          <div class="panel-head-actions">
            <div class="visualization-controls">
              <button type="button" class="icon-button" data-action="sample-page-prev" ${samplePagePrevDisabled ? 'disabled' : ''}>${samplePagePrevIconHtml}<span class="sr-only">Previous sample page</span></button>
              <button type="button" class="icon-button" data-action="sample-page-next" ${samplePageNextDisabled ? 'disabled' : ''}>${samplePageNextIconHtml}<span class="sr-only">Next sample page</span></button>
            </div>
          </div>
        </div>
        <div class="panel-body">
          <div class="sample-bank" data-role="sample-bank">${sampleButtonsHtml}</div>
          <div data-role="sample-detail-content">${selectedSamplePanelHtml}</div>
        </div>
      </section>

      <section class="panel canvas-panel${classicCollapsed ? ' is-collapsed' : ''}">
        <div class="panel-head compact panel-head--section">
          <div class="panel-heading-copy">
            <button type="button" class="section-heading-button" data-action="toggle-section-classic" aria-expanded="${classicCollapsed ? 'false' : 'true'}">
              <span class="section-heading-button__copy">
                <span class="panel-label">Classic</span>
              </span>
              <span class="section-heading-button__icon" aria-hidden="true">${classicCollapseIconHtml}</span>
            </button>
          </div>
        </div>
        <div class="panel-body">
          ${classicDebugHtml}
          <div class="engine-canvas-host"></div>
        </div>
      </section>
    </aside>
  </main>

  <div class="modal-overlay${aboutOpen ? ' is-open' : ''}" data-role="about-modal">
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <div class="modal-head">
        <div>
          <p class="panel-label">Help</p>
          <h2 class="panel-title" id="about-title">About</h2>
        </div>
        <button type="button" class="toolbar-button" data-action="close-about">Close</button>
      </div>
      <div class="modal-copy">
        <p><strong>Version</strong> ${appVersion}</p>
        <p><strong>Credits</strong> PT2 web shell on top of the vendored p2-clone ProTracker core.</p>
        <p><strong>Licenses</strong></p>
        <p><a href="./LICENSE" target="_blank" rel="noreferrer">BSD-3-Clause license</a></p>
        <p><a href="./THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer">Third-party notices</a></p>
      </div>
    </div>
  </div>
`;

export interface PatternPanelRenderOptions {
  octave: number;
  octaveOneActive: boolean;
  octaveTwoActive: boolean;
  collapsed: boolean;
  collapseIconHtml: string;
  trackHeadersHtml: string;
}

export const renderPatternEditorPanel = ({
  octave,
  octaveOneActive,
  octaveTwoActive,
  collapsed,
  collapseIconHtml,
  trackHeadersHtml,
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
        ${trackHeadersHtml}
      </div>
      <div class="pattern-canvas-host" data-role="pattern-host"></div>
    </div>
  </article>
`;
