import { WorldProvider, createEngine, type MotionEngine } from '@g-motion/core';
import { DOMPlugin } from '@g-motion/plugin-dom';
import { inertiaPlugin } from '@g-motion/plugin-inertia';
import { springPlugin } from '@g-motion/plugin-spring';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider as JotaiProvider } from 'jotai';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Import the generated route tree
import { routeTree } from './routeTree.gen.ts';

const globalKey = '__gMotionExamplesEngine';

const existingEngine = (globalThis as any)[globalKey] as MotionEngine | undefined;

const engine: MotionEngine =
  existingEngine && !existingEngine.disposed ? existingEngine : createEngine();
WorldProvider.setDefault(engine.world);

if (existingEngine && !existingEngine.disposed) {
  engine.reset({
    soft: true,
    configOverride: {
      workSlicing: {
        enabled: true,
        interpolationArchetypesPerFrame: 8,
        batchSamplingArchetypesPerFrame: 8,
      },
    },
  });
} else {
  engine.use(DOMPlugin);
  engine.use(springPlugin);
  engine.use(inertiaPlugin);
  (globalThis as any)[globalKey] = engine;
}

engine.reset({
  soft: true,
  configOverride: {
    workSlicing: {
      enabled: true,
      interpolationArchetypesPerFrame: 8,
      batchSamplingArchetypesPerFrame: 8,
    },
  },
});

import reportWebVitals from './reportWebVitals.ts';
import './styles.css';

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {},
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
});

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Render the app
const rootElement = document.getElementById('app');
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  const queryClient = new QueryClient();
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider>
          <RouterProvider router={router} />
        </JotaiProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    engine.dispose();
    delete (globalThis as any)[globalKey];
  });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
