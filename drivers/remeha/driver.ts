import { Driver } from 'homey'
import { PairSession } from 'homey/lib/Driver'
import { RemehaAuth, TokenData } from '../../lib/RemehaAuth'
import { DeviceData, RemehaMobileApi } from '../../lib/RemehaMobileApi'

class RemehaDriver extends Driver {

  private _tokenData: TokenData | null = null

  async onPair(session: PairSession) {
    session.setHandler('login', this._login.bind(this))
    session.setHandler('list_devices', this._listDevices.bind(this))
  }

  private async _login(credentials: string): Promise<any> {
    const authorizer = new RemehaAuth()
    const [email, password] = credentials.split(':')
    this._tokenData = await authorizer.login(email, password)
  }

  private async _listDevices(): Promise<any[]> {
    if (!this._tokenData || !this._tokenData.accessToken) return []
    const api = new RemehaMobileApi(this._tokenData.accessToken)
    const devices = await api.devices()
    return devices.map(this._mapDevice.bind(this))
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
