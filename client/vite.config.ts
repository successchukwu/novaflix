import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'framer-motion',
      'recharts',
      '@tanstack/react-query',
      'zustand',
      'hls.js',
      'react-helmet-async',
      'react-chartjs-2',
      'chart.js',
    ],
  },
  server: {
    port: 3000,
    hmr: {
      host: 'localhost',
      protocol: 'ws',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3030',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3030',
        ws: true,
      },
    },
  },
})
