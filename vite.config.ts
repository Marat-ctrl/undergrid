import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { quickSavePlugin } from './server/quickSave';
export default defineConfig({ plugins: [react(),quickSavePlugin()] });
