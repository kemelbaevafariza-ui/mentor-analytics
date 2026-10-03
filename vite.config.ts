import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Сборка в один HTML-файл: его можно открыть двойным щелчком, без сервера.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 4000 },
});
