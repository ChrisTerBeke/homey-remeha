import { Driver } from 'homey'
import { PairSession } from 'homey/lib/Driver'
import { RemehaAuth, TokenData } from '../../lib/RemehaAuth'
import { RemehaMobileApi } from '../../lib/RemehaMobileApi'

class RemehaDriver extends Driver {

  private _tokenData: TokenData | null = null

  async onPair(session: PairSession) {

    const driver = this

    session.setHandler('login', async function (credentials: string): Promise<void> {
      const authorizer = new RemehaAuth()
      const [email, password] = credentials.split(':')
      driver._tokenData = await authorizer.login(email, password)
    })

    session.setHandler('list_devices', async function () {
      if (!driver._tokenData || !driver._tokenData.accessToken) throw new Error('Not logged in')
      const api = new RemehaMobileApi(driver._tokenData.accessToken)
      const devices = await api.devices()
      return devices.map(device => {
        return {
          name: device.name,
          data: {
            id: device.id,
          },
          store: {
            accessToken: driver._tokenData?.accessToken,
            refreshToken: driver._tokenData?.refreshToken,
          }
        }
      })
    })
  }
}

module.exports = RemehaDriver
