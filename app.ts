import sourceMapSupport from 'source-map-support'
sourceMapSupport.install()

import { App } from 'homey'
import { Log } from 'homey-log'

class RemehaApp extends App {
  async onInit() {
    this.homeyLog = new Log({ homey: this.homey })
    this.log('RemehaApp is running...')
  }
}

module.exports = RemehaApp
