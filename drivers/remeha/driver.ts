import { Driver } from 'homey'
import { PairSession } from 'homey/lib/Driver'
import { RemehaAuth, TokenData } from '../../lib/RemehaAuth'
import { DeviceData, RemehaMobileApi } from '../../lib/RemehaMobileApi'

class RemehaDriver extends Driver {

  private _tokenData: TokenData | null = null

  async onPair(session: PairSession) {

    const driver = this

    session.setHandler('login', async function (credentials: string): Promise<boolean> {
      const authorizer = new RemehaAuth()
      const [email, password] = credentials.split(':')
      try {
        driver._tokenData = await authorizer.login(email, password)
        return true
      } catch (error) {
        return false
      }
    })

    session.setHandler('list_devices', async function (): Promise<any[]> {
      if (!driver._tokenData || !driver._tokenData.accessToken) return []
      const api = new RemehaMobileApi(driver._tokenData.accessToken)
      try {
        const devices = await api.devices()
        return devices.map(driver._mapDevice.bind(driver))
      } catch (error) {
        return []
      }
    })
  }

  private _mapDevice(device: DeviceData): any {
    return {
      name: device.name,
      data: {
        id: device.id,
      },
      store: {
        accessToken: this._tokenData?.accessToken,
        refreshToken: this._tokenData?.refreshToken,
      }
    }
  }
}

module.exports = RemehaDriver
