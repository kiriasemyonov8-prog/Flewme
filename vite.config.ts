import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Относительные пути: приложение работает из любой папки на хостинге (например, GitHub Pages /flyumi/).
  base: './',
  plugins: [react()],
});
