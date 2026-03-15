import './hybrid.css';
import './modern-enhancements.css';

import { TrackerApplication } from './appMain';

const root = document.querySelector<HTMLElement>('#app');
const canvas = document.createElement('canvas');
canvas.width = 320;
canvas.height = 255;
canvas.setAttribute('width', '320');
canvas.setAttribute('height', '255');
canvas.tabIndex = 0;
canvas.setAttribute('aria-label', 'Classic ProTracker canvas');
canvas.style.touchAction = 'none';
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('mousedown', () => {
  canvas.focus();
});

if (!root) {
  throw new Error('Application root is missing.');
}

root.replaceChildren();

const stagingHost = document.createElement('div');
stagingHost.className = 'engine-canvas-staging';
stagingHost.append(canvas);
root.append(stagingHost);

const application = new TrackerApplication(root, {
  canvas,
  workspaceRoot: '/workspace',
});

void application.init().catch((error: unknown) => {
  console.error(error);
  root.innerHTML = `
    <section class="fatal-screen">
      <p class="eyebrow">ProTracker 2 web clone</p>
      <h1>Startup failed</h1>
      <p>Se konsolen för detaljer. Appen kunde inte skapa sin engine eller sitt UI-skal.</p>
    </section>
  `;
});
