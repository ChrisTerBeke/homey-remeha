import { Driver } from 'homey'
import { PairSession } from 'homey/lib/Driver'
import { login } from '../../lib/RemehaAuth'

class RemehaDriver extends Driver {

  async onPair(session: PairSession) {

    const driver = this

    session.setHandler('login', async function (credentials: string) {
      const [email, password] = credentials.split(':')
      login(email, password)
    })

    session.setHandler('list_devices', async function () {
      return []
    })
  }

}

module.exports = RemehaDriver
