import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 애드센스 스크립트를 VITE_ADSENSE_CLIENT 가 있을 때만 넣는다.
 *
 * 승인 전에는 광고가 하나도 안 나오는데, 스크립트는 남의 서버에서 913 kB 를
 * 받아오고 모바일 3G 기준 LCP 를 1.34초 늘린다. 아무도 못 보는 광고를 위해
 * 모든 방문자가 치르는 값이라, 값이 없으면 아예 안 넣는다.
 *
 * 게시자 ID 는 페이지에 그대로 드러나는 공개 값이라 VITE_ 로 둬도 된다 —
 * 감춰야 하는 키는 VITE_ 를 붙이면 안 된다(.env.example 참고).
 */
function adsense(client: string | undefined): Plugin {
  return {
    name: 'whenigo-adsense',
    transformIndexHtml: (html) =>
      html.replace(
        '<!--ADSENSE-->',
        client
          ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}" crossorigin="anonymous"></script>`
          : '',
      ),
  }
}

// 포트를 고정한다 — 카카오/구글 콘솔에 등록하는 주소가 매번 바뀌면 안 된다.
export default defineConfig(({ mode }) => ({
  plugins: [react(), adsense(loadEnv(mode, process.cwd(), 'VITE_').VITE_ADSENSE_CLIENT)],
  // /api 는 별도 프로세스로 뜨는 서버(server/index.ts)로 넘긴다
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
}))
