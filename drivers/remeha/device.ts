import { Device, FlowCard } from 'homey'
import { RemehaMobileApi } from '../../lib/RemehaMobileApi'
import { RemehaAuth } from '../../lib/RemehaAuth'

const POLL_INTERVAL_MS = 1000 * 60  // every minute
const INIT_TIMEOUT_MS = 2000  // seconds

class RemehaThermostatDevice extends Device {

    private _client?: RemehaMobileApi

    async onInit(): Promise<void> {
        const { accessToken } = this.getStore()
        this._client = new RemehaMobileApi(accessToken)
        this.homey.setTimeout(this._syncCapabilities.bind(this), INIT_TIMEOUT_MS)
        this.homey.setTimeout(this._syncAttributes.bind(this), INIT_TIMEOUT_MS)
        this.homey.setInterval(this._syncAttributes.bind(this), POLL_INTERVAL_MS)
    }

    private async _syncCapabilities(): Promise<void> {
        await this._refreshAccessToken()
        if (!this._client) return this.setUnavailable('No Remeha Home client')
        const { id } = this.getData()

        try {
            const capabilities = await this._client.capabilities(id)
            if (!capabilities) return this.setUnavailable('Could not find capabilities')

            // required capabilities
            await this._addOrRemoveCapability('measure_temperature', true)
            await this._addOrRemoveCapability('measure_pressure', true)
            await this._addOrRemoveCapability('alarm_water', true)
            await this._addOrRemoveCapability('alarm_offline', true)
            await this._addOrRemoveCapability('alarm_error', true)
            await this._addOrRemoveCapability('mode', true, this._setMode.bind(this), this._actionMode.bind(this))
            await this._addOrRemoveCapability('target_temperature', true, this._setTargetTemperature.bind(this))

            // optional capabilities
            await this._addOrRemoveCapability('measure_temperature_water', capabilities.hotWaterZone)
            await this._addOrRemoveCapability('target_temperature_water', capabilities.hotWaterZone)
            await this._addOrRemoveCapability('measure_temperature_outside', capabilities.outdoorTemperature)
            await this._addOrRemoveCapability('fireplace_mode', capabilities.fireplaceMode, this._setFireplaceMode.bind(this), this._actionFireplaceMode.bind(this))
        } catch (error) {
            this.setUnavailable('Could not find capabilities')
        }
    }

    private async _syncAttributes(): Promise<void> {
        await this._refreshAccessToken()
        if (!this._client) return this.setUnavailable('No Remeha Home client')
        const { id } = this.getData()

        try {
            const data = await this._client.device(id)
            if (!data) return this.setUnavailable('Could not find thermostat data')
            this.setAvailable()

            // required capabilities
            this._setCapabilityValue('measure_temperature', 'number', data.temperature)
            this._setCapabilityValue('target_temperature', 'number', data.targetTemperature)
            this._setCapabilityValue('measure_pressure', 'number', (data.waterPressure * 1000))
            this._setCapabilityValue('alarm_water', 'boolean', !data.waterPressureOK)
            this._setCapabilityValue('mode', 'string', data.mode)
            this._setCapabilityValue('alarm_offline', 'boolean', !data.isOnline)
            this._setCapabilityValue('alarm_error', 'boolean', data.hasError)

            // optional capabilities
            this._setCapabilityValue('measure_temperature_outside', 'number', data.outdoorTemperature)
            this._setCapabilityValue('measure_temperature_water', 'number', data.waterTemperature)
            this._setCapabilityValue('target_temperature_water', 'number', data.targetWaterTemperature)
            this._setCapabilityValue('fireplace_mode', 'boolean', data.fireplaceMode)
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

    private async _addOrRemoveCapability(capability: string, enabled: boolean, listener?: Device.CapabilityCallback, flowActionListener?: FlowCard.RunCallback): Promise<void> {
        if (enabled) {
            if (!this.hasCapability(capability)) await this.addCapability(capability)
            if (listener) this.registerCapabilityListener(capability, listener)
            if (flowActionListener) await this._addFlowActionCard(capability, flowActionListener)
        } else {
            if (this.hasCapability(capability)) await this.removeCapability(capability)
        }
    }

    private async _setCapabilityValue(capability: string, type: string, value: any): Promise<void> {
        if (this.hasCapability(capability) && typeof value === type) {
            await this.setCapabilityValue(capability, value)
        }
    }

    private async _addFlowActionCard(action: string, listener: FlowCard.RunCallback): Promise<void> {
        const actionCard = this.homey.flow.getActionCard(action)
        actionCard.registerRunListener(listener)
    }

    private async _setTargetTemperature(value: number): Promise<void> {
        await this._refreshAccessToken()
        if (!this._client) return this.setUnavailable('No Remeha Home client')
        const { id } = this.getData()

        try {
            await this._client.setTargetTemperature(id, value)
        } catch (error) {
            this.setUnavailable('Could not set target temperature')
        }
    }

    private async _setMode(value: string): Promise<void> {
        await this._refreshAccessToken()
        if (!this._client) return this.setUnavailable('No Remeha Home client')
        const { id } = this.getData()

        try {
            await this._client.setMode(id, value)
        } catch (error) {
            this.setUnavailable('Could not set operating mode')
        }
    }

    private async _actionMode(args: any, state: any): Promise<void> {
        this._setMode(args.mode)
    }

    private async _setFireplaceMode(value: boolean): Promise<void> {
        await this._refreshAccessToken()
        if (!this._client) return this.setUnavailable('No Remeha Home client')
        const { id } = this.getData()

        try {
            await this._client.setFireplaceMode(id, value)
        } catch (error) {
            this.setUnavailable('Could not set fireplace mode')
        }
    }

    private async _actionFireplaceMode(args: any, state: any): Promise<void> {
        this._setFireplaceMode(args.enabled)
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
