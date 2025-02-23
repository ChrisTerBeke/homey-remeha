import fetch from 'node-fetch'

export type DeviceCapabilities = {
    fireplaceMode: boolean
    outdoorTemperature: boolean
    hotWaterZone: boolean
    multiSchedule: boolean
}

export type DeviceData = {
    id: string
    name: string
    isOnline: boolean
    hasError: boolean
    mode: string
    temperature: number
    targetTemperature: number
    waterPressure: number
    waterPressureOK: boolean
    outdoorTemperature?: number
    waterTemperature?: number
    targetWaterTemperature?: number
    fireplaceMode?: boolean
    heatingProgramId?: number
}

type ResponseClimateZone = {
    climateZoneId: string
    name: string
    roomTemperature: number
    setPoint: number
    zoneMode: string
    capabilityFirePlaceMode: boolean
    firePlaceModeActive?: boolean
    activeHeatingClimateTimeProgramNumber?: number
    activeComfortDemand: string
}

type ResponseHotWaterZone = {
    hotWaterZoneId: string
    dhwTemperature: number
    targetSetpoint: number
}

type ResponseAppliance = {
    applianceId: string
    applianceOnline: boolean
    errorStatus: string
    climateZones: ResponseClimateZone[]
    hotWaterZones: ResponseHotWaterZone[]
    waterPressure: number
    waterPressureOK: boolean
    capabilityOutdoorTemperature: boolean
    outdoorTemperatureInformation: ResponseOutdoorTemperatureInformation
    capabilityMultiSchedule: boolean
}

type ResponseOutdoorTemperatureInformation = {
    outdoorTemperatureSource: string
    applianceOutdoorTemperature: number
    isDayTime: boolean
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
        const dashboard = await this._getDashboard()
        if (!dashboard?.appliances) return []
        return dashboard.appliances.map(this._createDeviceData)
    }

    public async device(climateZoneId: string): Promise<DeviceData | undefined> {
        const devices = await this.devices()
        return devices.find(device => device.id === climateZoneId)
    }

    public async debug(): Promise<any> {
        return await this._call('/homes/dashboard')
    }

    public async capabilities(climateZoneId: string): Promise<DeviceCapabilities | undefined> {
        const dashboard = await this._getDashboard()
        if (!dashboard?.appliances) return undefined
        const appliance = dashboard.appliances.find(appliance => appliance.climateZones[0].climateZoneId === climateZoneId)
        if (!appliance) return undefined

        return {
            fireplaceMode: appliance.climateZones[0].capabilityFirePlaceMode,
            outdoorTemperature: appliance.capabilityOutdoorTemperature,
            hotWaterZone: appliance.hotWaterZones.length > 0,
            multiSchedule: appliance.capabilityMultiSchedule,
        }
    }

    public async setTargetTemperature(climateZoneID: string, roomTemperatureSetPoint: number): Promise<void> {
        const device = await this.device(climateZoneID)
        if (!device) return

        if (device.mode == 'manual') {
            await this._call(`/climate-zones/${climateZoneID}/modes/manual`, 'POST', { roomTemperatureSetPoint })
        } else {
            await this._call(`/climate-zones/${climateZoneID}/modes/temporary-override`, 'POST', { roomTemperatureSetPoint })
        }
    }

    public async setMode(climateZoneID: string, mode: string): Promise<void> {
        const capabilities = await this.capabilities(climateZoneID)
        if (!capabilities) return
        const device = await this.device(climateZoneID)
        if (!device) return

        if (mode == 'manual') {
            const roomTemperatureSetPoint = device.targetTemperature
            await this._call(`/climate-zones/${climateZoneID}/modes/manual`, 'POST', { roomTemperatureSetPoint })
        } else if (mode == 'auto') {
            const heatingProgramId = capabilities.multiSchedule && device.heatingProgramId ? device.heatingProgramId : 1
            await this._call(`/climate-zones/${climateZoneID}/modes/schedule`, 'POST', { heatingProgramId })
        } else if (mode == 'off') {
            await this._call(`/climate-zones/${climateZoneID}/modes/anti-frost`, 'POST')
        }
    }

    public async setFireplaceMode(climateZoneID: string, fireplaceModeActive: boolean): Promise<void> {
        await this._call(`/climate-zones/${climateZoneID}/modes/fireplacemode`, 'POST', { fireplaceModeActive })
    }

    public async _getDashboard(): Promise<DashboardResponse> {
        const dashboard = await this._call('/homes/dashboard') as DashboardResponse
        return dashboard
    }

    private async _call(path: string, method: string = 'GET', data: { [key: string]: string | number | boolean } | undefined = undefined): Promise<any> {
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

    private _createDeviceData(appliance: ResponseAppliance): DeviceData {
        const deviceData: DeviceData = {
            id: appliance.climateZones[0].climateZoneId,
            name: appliance.climateZones[0].name,
            isOnline: appliance.applianceOnline,
            hasError: RemehaMobileApi._mapErrorStatusToHomeyHasError(appliance.errorStatus),
            mode: RemehaMobileApi._mapResponseModeToHomeyMode(appliance.climateZones[0].zoneMode),
            temperature: appliance.climateZones[0].roomTemperature,
            targetTemperature: appliance.climateZones[0].setPoint,
            waterPressure: appliance.waterPressure,
            waterPressureOK: appliance.waterPressureOK,
            heatingProgramId: appliance.climateZones[0].activeHeatingClimateTimeProgramNumber,
        }

        // not every installation supports outdoor temperature
        if (appliance.capabilityOutdoorTemperature) {
            deviceData.outdoorTemperature = appliance.outdoorTemperatureInformation.applianceOutdoorTemperature
        }

        // not every installation supports fireplace mode
        if (appliance.climateZones[0].capabilityFirePlaceMode) {
            deviceData.fireplaceMode = appliance.climateZones[0].firePlaceModeActive
        }

        // not every installation has a hot water zone, for example in hybrid heat pumps
        if (appliance.hotWaterZones.length > 0) {
            deviceData.waterTemperature = appliance.hotWaterZones[0].dhwTemperature
            deviceData.targetWaterTemperature = appliance.hotWaterZones[0].targetSetpoint
        }

        return deviceData
    }

    private static _mapResponseModeToHomeyMode(mode: string): string {
        switch (mode) {
            case 'Manual': return 'manual'
            case 'TemporaryOverride': return 'auto'
            case 'Scheduling': return 'auto'
            case 'FrostProtection': return 'off'
            default: return 'off'
        }
    }

    private static _mapErrorStatusToHomeyHasError(status: string): boolean {
        switch (status) {
            case 'Running': return false
            default: return true
        }
    }

    private static _mapActiveComfortDemandToHomeyMode(activeComfortDemand: string): string {
        switch (activeComfortDemand) {
            case 'RequestingHeat': return 'auto'
            case 'ProducingHeat': return 'auto'
            default: return 'off'
        }
    }
}
