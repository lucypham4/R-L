import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Rive animations ship as .riv binaries. Vite doesn't recognise the
  // extension out of the box, so without this an import resolves to a
  // parse error instead of an asset URL.
  assetsInclude: ['**/*.riv'],
});
