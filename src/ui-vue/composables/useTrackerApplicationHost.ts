import { onMounted, ref, type Ref } from 'vue';
import { TrackerApplication } from '../../appMain';

const createClassicCanvas = (): HTMLCanvasElement => {
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

  return canvas;
};

export const useTrackerApplicationHost = (host: Ref<HTMLElement | null>) => {
  const startupError = ref<string | null>(null);

  onMounted(() => {
    const root = host.value;
    if (!root) {
      startupError.value = 'Application root is missing.';
      return;
    }

    const canvas = createClassicCanvas();
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
      startupError.value = 'See the browser console for details. The app could not create its engine or UI shell.';
    });
  });

  return {
    startupError,
  };
};
