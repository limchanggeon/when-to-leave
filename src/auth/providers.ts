import { kakaoAuth } from './kakao'
import { googleAuth } from './google'
import type { AuthProvider } from './types'

export { kakaoAuth, googleAuth }
export const providers: AuthProvider[] = [kakaoAuth, googleAuth]
