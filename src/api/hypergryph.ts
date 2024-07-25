import { SKLAND_AUTH_URL } from '../constant'
import type { AuthResponse } from '../types'
import { command_header } from '../utils'

/**
 * 通过 OAuth 登录凭证获取 grant_code
 * @param token 鹰角网络通行证账号的登录凭证
 */
export async function auth(token: string) {
  const response = await fetch(SKLAND_AUTH_URL, {
    method: 'POST',
    headers: command_header,
    body: JSON.stringify({
      appCode: '4ca99fa6b56cc2ba',
      token,
      type: 0,
    }),
  })
  const json = await response.json()
  const data = json as AuthResponse
  if (data.status !== 0 || !data.data) {
    data.data = { code: null, uid: data.msg }
    console.warn(JSON.stringify(json, null, 2))
  }

  return data.data
}
