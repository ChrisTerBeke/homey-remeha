import fetch from 'node-fetch'

export type DeviceData = {
    id: string
    name: string
    mode: string
    temperature: number
    targetTemperature: number
    waterPressure: number
    waterPressureOK: boolean
    outdoorTemperature: number
    waterTemperature?: number
    targetWaterTemperature?: number
}

type ResponseClimateZone = {
    climateZoneId: string
    name: string
    roomTemperature: number
    setPoint: number
    zoneMode: string
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
        return dashboard.appliances.map(this._createDeviceData)
    }

    private _createDeviceData(appliance: ResponseAppliance): DeviceData {
        const deviceData: DeviceData = {
            id: appliance.climateZones[0].climateZoneId,
            name: appliance.climateZones[0].name,
            mode: appliance.climateZones[0].zoneMode,
            temperature: appliance.climateZones[0].roomTemperature,
            targetTemperature: appliance.climateZones[0].setPoint,
            waterPressure: appliance.waterPressure,
            waterPressureOK: appliance.waterPressureOK,
            outdoorTemperature: appliance.outdoorTemperature,
        }

        // not every installation has a hot water zone, for example in Hybrid heat pumps
        if (appliance.hotWaterZones.length > 0) {
            deviceData.waterTemperature = appliance.hotWaterZones[0].dhwTemperature
            deviceData.targetWaterTemperature = appliance.hotWaterZones[0].targetSetpoint
        }

        return deviceData
    }

    public async debug(): Promise<any> {
        return await this._call('/homes/dashboard')
    }

    public async device(climateZoneId: string): Promise<DeviceData | undefined> {
        const devices = await this.devices()
        return devices.find(device => device.id === climateZoneId)
    }

    public async setTargetTemperature(climateZoneID: string, roomTemperatureSetPoint: number): Promise<void> {
        const device = await this.device(climateZoneID)
        if (!device) return
        switch (device.mode) {
            case "Scheduling":
            case "TemporaryOverride":
                await this._call(`/climate-zones/${climateZoneID}/modes/temporary-override`, 'POST', { roomTemperatureSetPoint })
            case "Manual":
                await this._call(`/climate-zones/${climateZoneID}/modes/manual`, 'POST', { roomTemperatureSetPoint })
            default:
                await this._call(`/climate-zones/${climateZoneID}/modes/manual`, 'POST', { roomTemperatureSetPoint })
        }
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
