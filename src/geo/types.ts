export interface Coords {
  lat: number
  lng: number
  /** 미터 단위 오차 반경. 실내에서는 수백 m 까지 벌어진다. */
  accuracyM: number | null
}

/**
 * 위치 실패도 값으로 다룬다.
 * 특히 denied 는 사용자가 브라우저 설정에서 직접 풀어줘야 하므로
 * "다시 시도"를 권하면 안 되고 무엇을 해야 하는지 알려줘야 한다.
 */
export type GeoFailure =
  /** 브라우저가 Geolocation 자체를 지원하지 않음. */
  | { code: 'unsupported' }
  /**
   * HTTPS 도 localhost 도 아님. 이 경우 브라우저는 권한 창을 아예 띄우지 않고
   * 조용히 막는다 — LAN IP(예: http://10.0.4.254:4173)로 열면 여기 걸린다.
   */
  | { code: 'insecure-context' }
  /** 사용자가 권한을 거부함. 재시도해도 프롬프트가 다시 뜨지 않는다. */
  | { code: 'denied' }
  /** 신호를 못 잡음. */
  | { code: 'unavailable' }
  | { code: 'timeout' }
  /** 좌표는 얻었지만 지명으로 바꾸지 못함. */
  | { code: 'no-address'; detail?: string }

export type GeoResult<T> = { ok: true; data: T } | { ok: false; failure: GeoFailure }

export interface ResolvedPlace {
  name: string
  coords: Coords
}
