import { Device, Driver } from "homey";
import { PairSession } from "homey/lib/Driver";
import { RemehaAuth, TokenData } from "../../lib/RemehaAuth";
import { DeviceData, RemehaMobileApi } from "../../lib/RemehaMobileApi";

class RemehaDriver extends Driver {
  private _tokenData: TokenData | null = null;

  async onPair(session: PairSession) {
    this.homey.settings.set("debug_token", "");
    session.setHandler("login", this._login.bind(this));
    session.setHandler("list_devices", this._listDevices.bind(this));
  }

  async onRepair(session: PairSession, device: Device) {
    this.homey.settings.set("debug_token", "");
    session.setHandler("repair", this._updateTokenData.bind(this, device));
  }

  private async _login(credentials: string): Promise<void> {
    this.homey.settings.set("debug_token", "");
    const authorizer = new RemehaAuth();
    const [email, password] = credentials.split("|");
    if (!email || !password) throw new Error("Invalid credentials");
    this._tokenData = await authorizer.login(email, password);
    this.homey.settings.set("debug_token", JSON.stringify(this._tokenData));
  }

  private async _updateTokenData(
    device: Device,
    credentials: string,
  ): Promise<void> {
    await this._login(credentials);
    await device.setStoreValue("accessToken", this._tokenData?.accessToken);
    await device.setStoreValue("refreshToken", this._tokenData?.refreshToken);
  }

  private async _listDevices(): Promise<any[]> {
    if (!this._tokenData || !this._tokenData.accessToken) return [];
    const api = new RemehaMobileApi(this._tokenData.accessToken);
    const debug = await api.debug();
    this.homey.settings.set("debug_devices", JSON.stringify(debug));
    const devices = await api.devices();
    return devices.map(this._mapDevice.bind(this));
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
      },
    };
  }
}

module.exports = RemehaDriver;
