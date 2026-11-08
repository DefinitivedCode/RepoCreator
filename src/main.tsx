import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './tokens.css';
import './styles.css';
import './workspace.css';
import './desktop-refinement.css';

const root = createRoot(document.getElementById('root')!);
// The primitives reference page exists only in development. The condition is a
// compile-time constant, so the dynamic import is removed from production builds.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('kitchen-sink')) {
  void import('./ui/KitchenSink').then(({ KitchenSink }) =>
    root.render(
      <StrictMode>
        <KitchenSink />
      </StrictMode>,
    ),
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
