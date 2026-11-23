import type { DownyApi } from '../shared/api'

declare global {
  interface Window {
    downy: DownyApi
  }
}

export {}
