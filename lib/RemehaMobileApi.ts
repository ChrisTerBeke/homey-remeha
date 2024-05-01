import fetch from 'node-fetch'

export type DeviceData = {
    name: string
    temperature: number
    targetTemperature: number
}

export class RemehaMobileApi {

    private _rootURL = 'https://api.bdrthermea.net/Mobile/api'
    private _subscriptionKey = 'df605c5470d846fc91e848b1cc653ddf'
    private _accessToken: string

    constructor(accessToken: string) {
        this._accessToken = accessToken
    }

    public async device(): Promise < DeviceData > {
        const dashboard = await this._call('/homes/dashboard')
        const climateZone = dashboard['appliances'][0]['climateZones'][0]
        return {
            name: climateZone['name'],
            temperature: climateZone['roomTemperature'],
            targetTemperature: climateZone['setPoint'],
        }
    }

    private async _call(path: string, method: string = 'GET'): Promise<any> {
        const response = await fetch(`${this._rootURL}/${path}`, {
            method: method,
            headers: {
                'Authorization': `Bearer ${this._accessToken}`,
                'Ocp-Apim-Subscription-Key': this._subscriptionKey,
            }
        })
        if (response.status !== 200) {
            throw new Error(`Failed to call ${path}`)
        }
        return await response.json()
    }
}
