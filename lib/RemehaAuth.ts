import { webcrypto } from 'crypto'
import nodeFetch from 'node-fetch'
import fetchCookie from 'fetch-cookie'

export type TokenData = {
    accessToken: string
    tokenType: string
    expiresIn: number
    refreshToken: string
    scope: string
}

export class RemehaAuth {

    private _rootURL = 'https://remehalogin.bdrthermea.net/bdrb2cprod.onmicrosoft.com'
    private _redirectURI = 'com.b2c.remehaapp://login-callback'
    private _clientID = '6ce007c6-0628-419e-88f4-bee2e6418eec'
    private _scopes = 'openid https://bdrb2cprod.onmicrosoft.com/iotdevice/user_impersonation offline_access'
    private _product = 'B2C_1A_RPSignUpSignInNewRoomv3.1'
    private _cookieFetch = fetchCookie(nodeFetch)

    public async login(email: string, password: string): Promise<TokenData> {
        const state = await this._generateState()
        const { codeVerifier, codeChallenge } = await this._generatePKCE()
        const { requestID, csrfToken } = await this._loginFormStep(state, codeChallenge)
        await this._loginSubmitStep(requestID, csrfToken, email, password)
        const { authorizationCode} = await this._confirmStep(requestID, csrfToken)
        const tokenData = await this._tokenStep(authorizationCode, codeVerifier)
        return tokenData
    }

    public async refreshAccessToken(refreshToken: string): Promise<TokenData> {
        const tokenData = await this._refreshTokenStep(refreshToken)
        return tokenData
    }

    private async _loginFormStep(state: string, codeChallenge: string): Promise<{ requestID: string, csrfToken: string }> {
        const loginFormQuery = this._loginFormQuery(state, codeChallenge)
        const url = `${this._rootURL}/oauth2/v2.0/authorize?${loginFormQuery.toString()}`
        const loginFormResponse = await this._fetch(url)
        if (loginFormResponse.status !== 200) throw new Error('Failed to get login page')

        const requestID = loginFormResponse.headers.get('x-request-id')
        if (!requestID) throw new Error('Failed to get request ID')

        const cookies = loginFormResponse.headers.get('set-cookie')?.split(',')
        const csrfToken = cookies?.find((cookie: string) => cookie.includes('x-ms-cpim-csrf'))?.split(';')[0].replace('x-ms-cpim-csrf=', '').trim()
        if (!csrfToken) throw new Error('Failed to get CSRF token')

        return {
            requestID,
            csrfToken,
        }
    }

    private _loginFormQuery(state: string, codeChallenge: string): URLSearchParams {
        return new URLSearchParams({
            response_type: 'code',
            client_id: this._clientID,
            redirect_uri: this._redirectURI,
            scope: this._scopes,
            state: state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            p: this._product,
            brand: 'remeha',
            lang: 'en',
            nonce: 'defaultNonce',
            prompt: 'login',
            signUp: 'False',
        })
    }

    private async _loginSubmitStep(requestID: string, csrfToken: string, email: string, password: string): Promise<void> {
        const query = this._loginSubmitQuery(requestID)
        const body = this._loginSubmitBody(email, password)
        const headers = this._loginSubmitHeaders(csrfToken, body)
        const url = `${this._rootURL}/${this._product}/SelfAsserted?${query.toString()}`
        const loginSubmitResponse = await this._fetch(url, { method: 'POST', headers, body })
        if (loginSubmitResponse.status !== 200) throw new Error('Failed to submit login form')
    }

    private _loginSubmitQuery(requestID: string): URLSearchParams {
        const stateProperties = this._stateProperties(requestID)
        return new URLSearchParams({
            p: this._product,
            tx: `StateProperties=${stateProperties}`,
        })
    }

    private _loginSubmitBody(email: string, password: string): URLSearchParams {
        return new URLSearchParams({
            request_type: 'RESPONSE',
            signInName: email,
            password: password,
        })
    }

    private _loginSubmitHeaders(csrfToken: string, body: URLSearchParams): { [key: string]: string } {
        return {
            'x-csrf-token': csrfToken,
            'Content-Length': body.toString().length.toString(),
            'Content-Type': 'application/x-www-form-urlencoded',
        }
    }

    private async _confirmStep(requestID: string, csrfToken: string): Promise<{ authorizationCode: string }> {
        const query = this._confirmQuery(requestID, csrfToken)
        const headers = this._confirmHeaders(csrfToken)
        const url = `${this._rootURL}/${this._product}/api/CombinedSigninAndSignup/confirmed?${query.toString()}`
        const confirmResponse = await this._fetch(url, { method: 'GET', headers, redirect: 'manual' })
        if (confirmResponse.status !== 302) throw new Error('Failed to redirect after login')

        const redirectLocation = confirmResponse.headers.get('location')
        if (!redirectLocation) throw new Error('Failed to get redirect URL')

        const authorizationCode = new URL(redirectLocation).searchParams.get('code')
        if (!authorizationCode) throw new Error(`Failed to get authorization code from URL: ${redirectLocation}`)

        return {
            authorizationCode,
        }
    }

    private _confirmQuery(requestID: string, csrfToken: string): URLSearchParams {
        const stateProperties = this._stateProperties(requestID)
        return new URLSearchParams({
            rememberMe: 'false',
            csrf_token: csrfToken,
            tx: `StateProperties=${stateProperties}`,
            p: this._product,
        })
    }

    private _confirmHeaders(csrfToken: string): { [key: string]: string } {
        return {
            'x-csrf-token': csrfToken,
        }
    }

    private async _tokenStep(authorizationCode: string, codeVerifier: string): Promise<TokenData> {
        const query = this._tokenQuery()
        const body = this._tokenBody(authorizationCode, codeVerifier)
        const url = `${this._rootURL}/oauth2/v2.0/token?${query.toString()}`
        const tokenResponse = await this._fetch(url, { method: 'POST', body })
        if (tokenResponse.status !== 200) throw new Error('Failed to get token')
        const data = await tokenResponse.json()
        return {
            accessToken: data['access_token'],
            tokenType: data['token_type'],
            expiresIn: data['expires_in'],
            refreshToken: data['refresh_token'],
            scope: data['scope'],
        }
    }

    private _tokenQuery(): URLSearchParams {
        return new URLSearchParams({
            p: this._product,
        })
    }

    private _tokenBody(authorizationCode: string, codeVerifier: string): URLSearchParams {
        return new URLSearchParams({
            grant_type: 'authorization_code',
            code: authorizationCode,
            redirect_uri: this._redirectURI,
            code_verifier: codeVerifier,
            client_id: this._clientID,
        })
    }

    private async _refreshTokenStep(refreshToken: string): Promise<TokenData> {
        const query = this._tokenQuery()
        const body = this._refreshTokenBody(refreshToken)
        const url = `${this._rootURL}/oauth2/v2.0/token?${query.toString()}`
        const tokenResponse = await this._fetch(url, { method: 'POST', body })
        if (tokenResponse.status !== 200) throw new Error('Failed to get token')
        const data = await tokenResponse.json()
        return {
            accessToken: data['access_token'],
            tokenType: data['token_type'],
            expiresIn: data['expires_in'],
            refreshToken: data['refresh_token'],
            scope: data['scope'],
        }
    }

    private _refreshTokenBody(refreshToken: string): URLSearchParams {
        return new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: this._clientID,
        })
    }

    private _stateProperties(requestID: string): string {
        return Buffer.from(JSON.stringify({ TID: requestID })).toString('base64url').replace(/=$/, '')
    }

    private async _generatePKCE(): Promise<{ codeVerifier: string, codeChallenge: string }> {
        const codeVerifier = await this._generateCodeVerifier()
        const codeChallenge = await this._generateCodeChallenge(codeVerifier)
        return { codeVerifier, codeChallenge }
    }

    private async _generateCodeVerifier(): Promise<string> {
        const mask = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        let result = ''
        const randomUints = webcrypto.getRandomValues(new Uint8Array(43))
        for (let i = 0; i < 43; i++) {
            const randomIndex = randomUints[i] % mask.length
            result += mask[randomIndex]
        }
        return result
    }

    private async _generateCodeChallenge(codeVerifier: string): Promise<string> {
        const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
        return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    }

    private async _generateState(): Promise<string> {
        return await this._generateCodeVerifier()
    }

    private async _fetch(url: nodeFetch.RequestInfo, init?: nodeFetch.RequestInit): Promise<nodeFetch.Response> {
        try {
            const response = await this._cookieFetch(url, init)
            return Promise.resolve(response)
        }
        catch (error) {
            return Promise.reject(error)
        }
    }
}
