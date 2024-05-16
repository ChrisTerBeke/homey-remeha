import fetch from 'node-fetch'

export type DeviceData = {
    id: string
    name: string
    temperature: number
    targetTemperature: number
    waterTemperature: number
    targetWaterTemperature: number
    waterPressure: number
    waterPressureOK: boolean
    outdoorTemperature: number
}

type ResponseClimateZone = {
    climateZoneId: string
    name: string
    roomTemperature: number
    setPoint: number
}

type ResponseHotWaterZone = {
    hotWaterZoneId: string
    dhwTemperature: number
    targetSetpoint: number
}

type ResponseAppliance = {
    climateZones: ResponseClimateZone[]
    hotWaterZones: ResponseHotWaterZone[]
    outdoorTemperature: number
    waterPressure: number
    waterPressureOK: boolean
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
        return dashboard.appliances.map(appliance => {
            return {
                id: appliance.climateZones[0].climateZoneId,
                name: appliance.climateZones[0].name,
                temperature: appliance.climateZones[0].roomTemperature,
                targetTemperature: appliance.climateZones[0].setPoint,
                waterTemperature: appliance.hotWaterZones[0].dhwTemperature,
                targetWaterTemperature: appliance.hotWaterZones[0].targetSetpoint,
                waterPressure: appliance.waterPressure,
                waterPressureOK: appliance.waterPressureOK,
                outdoorTemperature: appliance.outdoorTemperature,
            }
        })
    }
    
    public async debug(): Promise<any> {
        return await this._call('/homes/dashboard')
    }

    public async device(climateZoneId: string): Promise<DeviceData | undefined> {
        const devices = await this.devices()
        return devices.find(device => device.id === climateZoneId)
    }

    public async setTargetTemperature(climateZoneID: string, roomTemperatureSetPoint: number): Promise<void> {
        await this._call(`/climate-zones/${climateZoneID}/modes/temporary-override`, 'POST', { roomTemperatureSetPoint })
    }

    private async _call(path: string, method: string = 'GET', data: { [key: string]: string | number } | undefined = undefined): Promise<any> {
        try {
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
        } catch (error) {
            return Promise.reject(error)
        }
    }
}
