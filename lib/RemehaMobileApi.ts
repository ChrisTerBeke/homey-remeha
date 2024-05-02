import fetch from 'node-fetch'

export type DeviceData = {
    id: string
    name: string
    temperature: number
    targetTemperature: number
}

type ResponseClimateZone = {
    climateZoneId: string
    name: string
    roomTemperature: number
    setPoint: number
}

type ResponseAppliance = {
    climateZones: ResponseClimateZone[]
}

type DashboardResponse = {
    appliances: ResponseAppliance[]
}

export class RemehaMobileApi {

    private _rootURL = 'https://api.bdrthermea.net/Mobile/api'
    private _subscriptionKey = 'df605c5470d846fc91e848b1cc653ddf'
    private _accessToken: string

    constructor(accessToken: string) {
        this._accessToken = accessToken
    }

    public setAccessToken(accessToken: string): void {
        this._accessToken = accessToken
    }

    public async devices(): Promise<DeviceData[]> {
        const dashboard = await this._call('/homes/dashboard') as DashboardResponse
        if (!dashboard?.appliances) return []
        const devices: DeviceData[] = []
        dashboard.appliances.forEach(appliance => {
            if (!appliance?.climateZones) return
            appliance.climateZones.forEach(climateZone => {
                devices.push({
                    id: climateZone.climateZoneId,
                    name: climateZone.name,
                    temperature: climateZone.roomTemperature,
                    targetTemperature: climateZone.setPoint,
                })
            })
        })
        return devices
    }

    public async device(id: string): Promise<DeviceData | undefined> {
        const devices = await this.devices()
        return devices.find(device => device.id === id)
    }

    public async setTargetTemperature(climateZoneID: string, roomTemperatureSetPoint: number): Promise<void> {
        await this._call(`/climate-zones/${climateZoneID}/modes/temporary-override`, 'POST', { roomTemperatureSetPoint })
    }

    private async _call(path: string, method: string = 'GET', data: { [key: string]: string | number } | undefined = undefined): Promise<any> {
        const response = await fetch(`${this._rootURL}${path}`, {
            method: method,
            headers: {
                'Authorization': `Bearer ${this._accessToken}`,
                'Ocp-Apim-Subscription-Key': this._subscriptionKey,
                'Content-Type': 'application/json',
            },
            body: data ? JSON.stringify(data) : undefined,
        })
        if (response.status !== 200) {
            return
        }
        const responseBody = await response.text()
        if (responseBody.length > 0) {
            return JSON.parse(responseBody)
        }
        return responseBody
    }
}
