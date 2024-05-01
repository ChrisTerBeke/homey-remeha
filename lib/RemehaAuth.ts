import { webcrypto } from 'crypto'
import nodeFetch from 'node-fetch'
import fetchCookie from 'fetch-cookie'

const fetch = fetchCookie(nodeFetch)
const rootURL = 'https://remehalogin.bdrthermea.net/bdrb2cprod.onmicrosoft.com'
const product = 'B2C_1A_RPSignUpSignInNewRoomv3.1'
const loginFormURL = `${rootURL}/oauth2/v2.0/authorize`
const loginSubmitURL = `${rootURL}/${product}/SelfAsserted`
const confirmURL = `${rootURL}/${product}/api/CombinedSigninAndSignup/confirmed`
const tokenURL = `${rootURL}/oauth2/v2.0/token`
const clientID = '6ce007c6-0628-419e-88f4-bee2e6418eec'
const redirectURL = 'com.b2c.remehaapp://login-callback'
const subscriptionKey = 'df605c5470d846fc91e848b1cc653ddf'

export async function call(method: string, path: string, accessToken: string): Promise<object> {
    const response = await fetch(`https://api.bdrthermea.net/Mobile/api${path}`, {
        method: method,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Ocp-Apim-Subscription-Key': subscriptionKey,
        }
    })
    if (response.status !== 200) {
        throw new Error(`Failed to call ${path}`)
    }
    return await response.json()
}

export async function login(email: string, password: string): Promise<string> {

    const state = verifier()
    const codeVerifier = verifier()
    const codeChallenge = await challenge(codeVerifier)

    const loginFormQuery = new URLSearchParams({
        response_type: 'code',
        client_id: clientID,
        redirect_uri: redirectURL,
        scope: 'openid https://bdrb2cprod.onmicrosoft.com/iotdevice/user_impersonation offline_access',
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        p: product,
        brand: 'remeha',
        lang: 'en',
        nonce: 'defaultNonce',
        prompt: 'login',
        signUp: 'False',
    })
    const loginFormResponse = await fetch(`${loginFormURL}?${loginFormQuery.toString() }`)
    if (loginFormResponse.status !== 200) {
        throw new Error('Failed to get login page')
    }

    const requestID = loginFormResponse.headers.get('x-request-id')
    const stateProperties = Buffer.from(JSON.stringify({TID: requestID})).toString('base64url').replace(/=$/, '')
    const cookies = loginFormResponse.headers.get('set-cookie')?.split(',')
    const csrfToken = cookies?.find((cookie) => cookie.includes('x-ms-cpim-csrf'))?.split(';')[0].replace('x-ms-cpim-csrf=', '').trim()
    if (!cookies || !csrfToken) {
        throw new Error('Failed to get CSRF token')
    }

    const loginSubmitQuery = new URLSearchParams({
        tx: `StateProperties=${stateProperties}`,
        p: product,
    })
    const loginSubmitBody = new URLSearchParams({
        request_type: 'RESPONSE',
        signInName: email,
        password: password,
    })
    const loginSubmitHeaders = {
        'x-csrf-token': csrfToken,
        'Content-Length': loginSubmitBody.toString().length.toString(),
        'Content-Type': 'application/x-www-form-urlencoded',
    }
    const loginSubmitResponse = await fetch(`${loginSubmitURL}?${loginSubmitQuery.toString()}`, {
        method: 'POST',
        headers: loginSubmitHeaders,
        body: loginSubmitBody,
    })

    if (loginSubmitResponse.status !== 200) {
        throw new Error('Failed to submit login form')
    }
    
    const confirmQuery = new URLSearchParams({
        rememberMe: 'false',
        csrf_token: csrfToken,
        tx: `StateProperties=${stateProperties}`,
        p: product,
    })
    const confirmHeaders = {
        'x-csrf-token': csrfToken,
    }
    const confirmResponse = await fetch(`${confirmURL}?${confirmQuery.toString()}`, {
        method: 'GET',
        headers: confirmHeaders,
        redirect: 'manual',
    })
    if (confirmResponse.status !== 302) {
        throw new Error('Failed to redirect after login')
    }

    const redirectLocation = confirmResponse.headers.get('location')
    if (!redirectLocation) {
        throw new Error('Failed to get redirect URL')
    }

    const authorizationCode = new URL(redirectLocation).searchParams.get('code')
    if (!authorizationCode) {
        throw new Error(`Failed to get authorization code from URL: ${redirectLocation}`)
    }

    const tokenQuery = new URLSearchParams({
        p: product,
    })
    const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: redirectURL,
        code_verifier: codeVerifier,
        client_id: clientID,
    })
    const tokenResponse = await fetch(`${tokenURL}?${tokenQuery.toString()}`, {
        method: 'POST',
        body: tokenBody,
    })
    if (tokenResponse.status !== 200) {
        throw new Error('Failed to get token')
    }

    const tokenData = await tokenResponse.json()
    return tokenData['access_token']
}

function verifier(size: number = 43): string {
    const mask = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    const randomUints = webcrypto.getRandomValues(new Uint8Array(size))
    for (let i = 0; i < size; i++) {
        const randomIndex = randomUints[i] % mask.length
        result += mask[randomIndex]
    }
    return result
}

async function challenge(verifier: string): Promise<string> {
    const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
    return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
