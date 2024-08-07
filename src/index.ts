import { getPrivacyName } from './utils'
import { SKLAND_BOARD_IDS, SKLAND_BOARD_NAME_MAPPING } from './constant'
import { attendance, auth, checkIn, getBinding, signIn } from './api'
import { bark, serverChan } from './notifications'

interface Options {
  /** server 酱推送功能的启用，false 或者 server 酱的token */
  withServerChan?: false | string
  /** bark 推送功能的启用，false 或者 bark 的 URL */
  withBark?: false | string
}

const status = {
  /** 签到失败状态记录，false 表示没有失败，true 表示含有失败 */
  checkInError: false
}

export async function doAttendanceForAccount(token: string, options: Options, accountCount: number, index: number) {
  const createCombinePushMessage = () => {
    const messages: string[] = []
    const logger = (message: string, error?: boolean) => {
      messages.push(message)
      console[error ? 'error' : 'log'](message)
      if (error && !status.checkInError)
        status.checkInError = true
    }
    const push
      = async () => {
        if (options.withServerChan) {
          await serverChan(
            options.withServerChan,
            `【森空岛每日签到】`,
            messages.join('\n\n'),
          )
        }
        if (options.withBark) {
          await bark(
            options.withBark,
            `【森空岛每日签到】`,
            messages.join('\n\n'),
          )
        }
        // quit with error on last account
        if (status.checkInError && index >= accountCount)
          process.exit(1)
      }
    const add = (message: string) => {
      messages.push(message)
    }
    return [logger, push, add] as const
  }

  const [combineMessage, excutePushMessage, addMessage] = createCombinePushMessage()

  const logginFailed = async (message: string) => {
    combineMessage(`登录第${index}个账号失败，已跳过签到: ${message}`, true)
    await excutePushMessage()
  }

  // 获取登录信息失败时，推送失败提示，然后跳过登录失败的账号并继续下一个账号
  const { code, uid } = await auth(token, index)
  if (code === null) {
    await logginFailed(uid)
    return
  }

  const { cred, token: signToken } = await signIn(code)
  if (cred === null && signToken !== null) {
    await logginFailed(signToken)
    return
  }

  const { list } = await getBinding(cred, signToken)
  if (list.length > 0 && list[0].appCode === null && list[0].appName !== null) {
    await logginFailed(list[0].appName)
    return
  }


  addMessage(`# 森空岛每日签到 \n\n> ${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Shanghai' }).format(new Date())}`)
  addMessage('## 森空岛各版面每日检票')
  await Promise.all(SKLAND_BOARD_IDS.map(async (id) => {
    const data = await checkIn(cred, signToken, id)
    const name = SKLAND_BOARD_NAME_MAPPING[id]
    if (data.message === 'OK' && data.code === 0) {
      combineMessage(`版面【${name}】登岛检票成功`)
    }
    else {
      // 登岛检票 最后不会以错误结束进程
      combineMessage(`版面【${name}】登岛检票失败, 错误信息: ${data.message}`)
    }
  }))

  addMessage('## 明日方舟签到')
  let successAttendance = 0
  const characterList = list.map(i => i.bindingList).flat()
  await Promise.all(characterList.map(async (character) => {
    const data = await attendance(cred, signToken, {
      uid: character.uid,
      gameId: character.channelMasterId,
    })
    console.log(`将签到第${successAttendance + 1}个角色`)
    if (data.code === 0 && data.message === 'OK') {
      const msg = `${(Number(character.channelMasterId) - 1) ? 'B 服' : '官服'}角色 ${getPrivacyName(character.nickName)} 签到成功${`, 获得了${data.data.awards.map(a => `「${a.resource.name}」${a.count}个`).join(',')}`}`
      combineMessage(msg)
      combineMessage(`成功签到${successAttendance++}个角色`)
    }
    else {
      const msg = `${(Number(character.channelMasterId) - 1) ? 'B 服' : '官服'}角色 ${getPrivacyName(character.nickName)} 签到失败${`, 错误消息: ${data.message}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}`
      combineMessage(msg, true)
    }
  }))

  await excutePushMessage()
}
