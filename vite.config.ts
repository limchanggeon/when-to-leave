import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 포트를 고정한다 — 카카오/구글 콘솔에 등록하는 주소가 매번 바뀌면 안 된다.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
})
