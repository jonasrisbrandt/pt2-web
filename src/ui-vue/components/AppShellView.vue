<template>
  <section
    class="menubar-shell"
    data-menu-root
  >
    <div class="menubar">
      <div class="menubar-group">
        <button
          type="button"
          :class="['menu-trigger', { 'is-open': fileMenuOpen }]"
          data-action="toggle-menu-file"
          data-menu-trigger="file"
          :aria-expanded="fileMenuOpen ? 'true' : 'false'"
        >File</button>
        <button
          type="button"
          :class="['menu-trigger', { 'is-open': helpMenuOpen }]"
          data-action="toggle-menu-help"
          data-menu-trigger="help"
          :aria-expanded="helpMenuOpen ? 'true' : 'false'"
        >Help</button>
      </div>
        <div class="menubar-group menubar-group--views">
        <div
          class="view-toggle"
          role="tablist"
          aria-label="View mode"
        >
          <ViewToggleGroupView :buttons="viewToggleOptions" />
        </div>
      </div>
    </div>

    <div
      :class="['menu-surface', { 'is-open': fileMenuOpen }]"
      data-menu-panel="file"
    >
      <MenuItemButton
        action="new-song"
        label="New MOD"
        :disabled="fileActionsDisabled"
      />
      <MenuItemButton
        action="load-module"
        label="Load MOD"
        :disabled="fileActionsDisabled"
      />
      <MenuItemButton
        action="save-module"
        label="Save MOD"
      />
      <MenuItemButton
        action="save-module-as"
        label="Save MOD as..."
      />
      <div
        class="menu-separator"
        role="separator"
      />
      <MenuItemButton
        action="import-samples"
        label="Import samples..."
        :disabled="importDisabled"
      />
    </div>

    <div
      :class="['menu-surface', 'menu-surface--help', { 'is-open': helpMenuOpen }]"
      data-menu-panel="help"
    >
      <MenuItemButton
        action="open-about"
        label="About"
      />
    </div>
  </section>

  <main :class="['workspace', `workspace--${workspaceMode}`]">
    <section
      v-if="workspaceMode === 'sample-creator' && sampleCreatorOptions"
      class="sample-creator-shell"
    >
      <SampleCreatorView v-bind="sampleCreatorOptions" />
    </section>
    <template v-else>
      <section class="tracker-stack">
        <article :class="['panel', 'module-panel', { 'is-collapsed': moduleCollapsed }]">
          <div class="panel-head compact panel-head--section module-head">
            <div class="panel-heading-copy">
              <button
                type="button"
                class="section-heading-button"
                data-action="toggle-section-module"
                :aria-expanded="moduleCollapsed ? 'false' : 'true'"
              >
                <span class="section-heading-button__copy">
                  <span class="panel-label">Module</span>
                </span>
                <span
                  class="section-heading-button__icon"
                  aria-hidden="true"
                  v-html="moduleCollapseIconHtml"
                />
              </button>
              <h2
                class="panel-title panel-title--editable panel-title--section-detail"
                data-role="song-title"
              >
                <InlineNameFieldView v-bind="songTitle" />
              </h2>
            </div>
            <div class="panel-head-actions">
              <div class="module-transport-controls">
                <ModuleTransportControlsView :buttons="moduleTransportOptions" />
              </div>
            </div>
          </div>
          <div class="panel-body">
            <div class="module-grid">
              <ModuleGridView :cards="moduleGridOptions.cards" />
            </div>
          </div>
        </article>

        <article :class="['panel', 'visualization-panel', { 'is-collapsed': visualizationCollapsed }]">
          <div class="panel-head compact panel-head--section">
            <div class="panel-heading-copy">
              <button
                type="button"
                class="section-heading-button"
                data-action="toggle-section-visualization"
                :aria-expanded="visualizationCollapsed ? 'false' : 'true'"
              >
                <span class="section-heading-button__copy">
                  <span class="panel-label">Visualization</span>
                </span>
                <span
                  class="section-heading-button__icon"
                  aria-hidden="true"
                  v-html="visualizationCollapseIconHtml"
                />
              </button>
              <h2
                class="panel-title panel-title--subtle panel-title--section-detail"
                data-role="visualization-label"
              >{{ visualizationLabel }}</h2>
            </div>
            <div class="panel-head-actions">
              <div class="visualization-controls">
                <IconButtonGroupView :buttons="visualizationControlOptions" />
              </div>
            </div>
          </div>
          <div class="panel-body">
            <div
              class="visualization-host"
              data-role="visualization-host"
            />
          </div>
        </article>

        <SampleEditorPanelView
          v-if="sampleEditorPanelOptions"
          v-bind="sampleEditorPanelOptions"
        />
        <PatternEditorPanelView
          v-else-if="patternEditorPanelOptions"
          v-bind="patternEditorPanelOptions"
        />
      </section>

      <aside class="inspector-stack">
        <section :class="['panel', 'inspector-panel', { 'is-collapsed': samplesCollapsed }]">
          <div class="panel-head compact panel-head--section">
            <div class="panel-heading-copy">
              <button
                type="button"
                class="section-heading-button"
                data-action="toggle-section-samples"
                :aria-expanded="samplesCollapsed ? 'false' : 'true'"
              >
                <span class="section-heading-button__copy">
                  <span class="panel-label">Samples</span>
                </span>
                <span
                  class="section-heading-button__icon"
                  aria-hidden="true"
                  v-html="samplesCollapseIconHtml"
                />
              </button>
            </div>
            <div class="panel-head-actions">
              <div class="visualization-controls">
                <IconButtonGroupView :buttons="samplePageControlOptions" />
              </div>
            </div>
          </div>
          <div class="panel-body">
            <div
              class="sample-bank"
              data-role="sample-bank"
            >
              <SampleBankView v-bind="sampleBankOptions" />
            </div>
            <div data-role="sample-detail-content">
              <SelectedSamplePanelView v-bind="selectedSamplePanelOptions" />
            </div>
          </div>
        </section>

        <section class="panel canvas-panel">
          <div class="panel-body">
            <div
              style="display: contents"
            >
              <ClassicDebugView :enabled="classicDebugOptions.enabled" />
            </div>
            <div class="engine-canvas-host" />
          </div>
        </section>
      </aside>
    </template>
  </main>

  <div
    :class="['modal-overlay', { 'is-open': aboutOpen }]"
    data-role="about-modal"
  >
    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
    >
      <div class="modal-head">
        <div>
          <p class="panel-label">Help</p>
          <h2
            id="about-title"
            class="panel-title"
          >About</h2>
        </div>
        <button
          type="button"
          class="toolbar-button"
          data-action="close-about"
        >Close</button>
      </div>
      <div class="modal-copy">
        <p><strong>Version</strong> {{ appVersion }}</p>
        <p><strong>Credits</strong></p>
        <p>Original Amiga ProTracker lineage: Amiga Freelancers, followed by Peter "Crayon" Hanning and Anders Ramsay for the later 2.x line referenced by this project.</p>
        <p>p2-clone core: Olav "8bitbubsy" Sorensen.</p>
        <p>pt2 web port and UI shell: Jonas Risbrandt.</p>
        <p><strong>Projects used</strong></p>
        <p><a href="https://github.com/8bitbubsy/pt2-clone" target="_blank" rel="noreferrer">p2-clone</a>, <a href="https://github.com/libxmp/libxmp" target="_blank" rel="noreferrer">libxmp</a>, <a href="https://github.com/jprjr/miniflac" target="_blank" rel="noreferrer">miniflac</a>, and <a href="https://lucide.dev" target="_blank" rel="noreferrer">lucide</a>.</p>
        <p><strong>License summary</strong></p>
        <p><code>pt2-web</code>: BSD-3-Clause. <code>p2-clone</code>: BSD-3-Clause. PP20 depacker adaptation from <code>libxmp</code>: MIT. <code>miniflac</code>: BSD-0-style. <code>lucide</code>: ISC, with an MIT notice for Feather-derived portions.</p>
        <p>Preserved Freedesktop.org packaging resources in the vendored upstream tree keep their upstream BSD-2-Clause-style notice.</p>
        <p><a href="./LICENSE" target="_blank" rel="noreferrer">Project license</a></p>
        <p><a href="./licenses/libxmp-MIT.txt" target="_blank" rel="noreferrer">MIT license copy for the PP20 adaptation</a></p>
        <p><a href="./THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer">Third-party notices</a></p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AppShellRenderOptions } from '../../ui-modern/components/appShellRenderer';
import ClassicDebugView from './ClassicDebugView.vue';
import IconButtonGroupView from './IconButtonGroupView.vue';
import InlineNameFieldView from './InlineNameFieldView.vue';
import MenuItemButton from './MenuItemButton.vue';
import ModuleGridView from './ModuleGridView.vue';
import ModuleTransportControlsView from './ModuleTransportControlsView.vue';
import PatternEditorPanelView from './PatternEditorPanelView.vue';
import SampleBankView from './SampleBankView.vue';
import SampleCreatorView from './SampleCreatorView.vue';
import SampleEditorPanelView from './SampleEditorPanelView.vue';
import SelectedSamplePanelView from './SelectedSamplePanelView.vue';
import ViewToggleGroupView from './ViewToggleGroupView.vue';

withDefaults(defineProps<AppShellRenderOptions>(), {
  workspaceMode: 'tracker',
  sampleCreatorOptions: null,
});
</script>
