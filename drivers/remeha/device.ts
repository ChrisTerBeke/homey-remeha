import { Device } from 'homey'
import { RemehaMobileApi } from '../../lib/RemehaMobileApi'
import { RemehaAuth } from '../../lib/RemehaAuth'

const POLL_INTERVAL_MS = 1000 * 60 * 1

class RemehaThermostatDevice extends Device {

    private _syncInterval?: NodeJS.Timer
    private _client?: RemehaMobileApi

    async onInit(): Promise<void> {
        this.addCapability('measure_temperature_outside')
        this.addCapability('measure_pressure')
        this.addCapability('alarm_water')
        this.addCapability('mode')
        this.registerCapabilityListener('target_temperature', this._setTargetTemperature.bind(this))
        this._init()
    }

    async onUninit(): Promise<void> {
        this._uninit()
    }

    async onAdded(): Promise<void> {
        this._init()
    }

    private async _init(): Promise<void> {
        const { accessToken } = this.getStore()
        this._client = new RemehaMobileApi(accessToken)
        this._syncInterval = setInterval(this._syncAttributes.bind(this), POLL_INTERVAL_MS)
        this._syncAttributes()
    }

    async _uninit(): Promise<void> {
        clearInterval(this._syncInterval as NodeJS.Timeout)
        this._syncInterval = undefined
        this._client = undefined
    }

    private async _syncAttributes(): Promise<void> {
        await this._refreshAccessToken()
        if (!this._client) return this.setUnavailable('No Remeha Home client')
        const { id } = this.getData()

        try {
            const data = await this._client.device(id)
            if (!data) return this.setUnavailable('Could not find thermostat data')
            this.setAvailable()
            this.setCapabilityValue('measure_temperature', data.temperature)
            this.setCapabilityValue('target_temperature', data.targetTemperature)
            this.setCapabilityValue('measure_temperature_outside', data.outdoorTemperature)
            this.setCapabilityValue('measure_pressure', (data.waterPressure * 1000))
            this.setCapabilityValue('alarm_water', !data.waterPressureOK)
            this.setCapabilityValue('mode', data.mode)

            // optional when hot water zone is configured
            if (data.waterTemperature) {
                this.addCapability('measure_temperature_water')
                this.setCapabilityValue('measure_temperature_water', data.waterTemperature)
            } else {
                this.removeCapability('measure_temperature_water')
            }

            // optional when hot water zone is configured
            if (data.targetWaterTemperature) {
                this.setCapabilityValue('target_temperature_water', data.targetWaterTemperature)
                this.addCapability('target_temperature_water')
            } else {
                this.removeCapability('target_temperature_water')
            }
        } catch (error) {
            this.setUnavailable('Could not find thermostat data')
        }

        try {
            const { debugEnabled } = this.getSettings()
            if (!debugEnabled) return
            const debug = await this._client.debug()
            this.setSettings({ apiData: JSON.stringify(debug) })
        } catch (error) { }
    }

    private async _setTargetTemperature(value: number): Promise<void> {
        await this._refreshAccessToken()
        if (!this._client) return this.setUnavailable('No Remeha Home client')
        const { id } = this.getData()

        try {
            await this._client.setTargetTemperature(id, value)
        } catch (error) {
            this.setUnavailable('Could set target temperature')
        }
    }

    private async _setTargetWaterTemperature(value: number): Promise<void> {
        // TODO
    }

    private async _refreshAccessToken(): Promise<void> {
        const authorizer = new RemehaAuth()
        const { accessToken, refreshToken } = this.getStore()
        try {
            if (!authorizer.isAccessTokenExpired(accessToken)) return
            const tokenData = await authorizer.refreshAccessToken(refreshToken)
            await this.setStoreValue('accessToken', tokenData.accessToken)
            await this.setStoreValue('refreshToken', tokenData.refreshToken)
            if (!this._client) return this.setUnavailable('No Remeha Home client')
            this._client.setAccessToken(tokenData.accessToken)
        } catch (error) {
            this.setUnavailable('Could not refresh access token')
        }
    }
}

module.exports = RemehaThermostatDevice
