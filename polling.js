let RachioAPI = require('./rachioapi')

class polling {
	constructor(platform, log, config) {
		this.log = log
		this.config = config
		this.platform = platform
		this.rachioapi = new RachioAPI(platform, log)

		this.lastInterval = []
		this.timeStamp = []
		this.liveTimeout = config.liveRefreshTimeout ? config.liveRefreshTimeout : 2 //min
		this.liveRefresh = config.liveRefreshRate ? config.liveRefreshRate : 20 //sec
	}

	async startLiveUpdate(valveService) {
		//check for duplicate call
		let delta = []
		let interval = []
		let valveId = valveService.subtype
		delta[valveId] = new Date() - this.timeStamp[valveId]
		if (delta[valveId] > 500 || delta[valveId] == 0) {
			//calls within 1/2 sec will be skipped as duplicate
			this.timeStamp[valveId] = new Date()
		} else {
			this.log.debug('Skipped new live update due to duplicate call, timestamp delta %s ms', delta[valveId])
			this.timeStamp[valveId] = new Date()
			return
		}
		clearInterval(this.lastInterval[valveId])
		let startTime = new Date().getTime() //live refresh start time
		if (!this.liveUpdate) {
			this.log.debug('Live update started')
		}
		this.liveUpdate = true
		this.getUpdate(valveService, interval) //fist call
		interval[valveId] = setInterval(async () => {
			if (new Date().getTime() - startTime > this.liveTimeout * 60 * 1000 + 500) {
				clearInterval(interval[valveId])
				this.liveUpdate = false
				this.log.debug('Live update stopped')
				return
			}
			this.getUpdate(valveService, interval) //remaing calls.
			clearInterval(interval[valveId])
		}, this.liveRefresh * 1000)
		this.lastInterval[valveId] = interval[valveId]
	}

	async getUpdate(valveService, interval) {
		let pause = delay => new Promise(resolve => setTimeout(resolve, delay))
		let valveId = valveService.subtype

		try {
			this.log.debug('updating valve Id', valveId)
			let response = await this.rachioapi.getValve(this.platform.token, valveId).catch(err => {
				this.log.error('Failed to get valve', err)
			})

			if (response.status == 429) {
				this.log.warn('exceeded API rate limiting for the day, backing off')
				clearInterval(interval[valveId])
				await pause(15 * 60 * 1000)
				return
			}

			if (response.status == 200) {
				let update = response.data
				let timeRemaining = 0
				let duration = update.valve.state.desiredState.defaultRuntimeSeconds

				if (update.valve.state.reportedState.lastWateringAction) {
					let start = update.valve.state.reportedState.lastWateringAction.start
					duration = update.valve.state.reportedState.lastWateringAction.durationSeconds
					let endTime = new Date(start).getTime() + duration * 1000
					timeRemaining = Math.max(Math.round((endTime - Date.now()) / 1000), 0)

					valveService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
					valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
					valveService.getCharacteristic(Characteristic.SetDuration).updateValue(duration)
					valveService.getCharacteristic(Characteristic.RemainingDuration).updateValue(timeRemaining)
					this.platform.endTime[valveId] = endTime
				} else {
					valveService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
					valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
					//valveService.getCharacteristic(Characteristic.SetDuration).updateValue(duration)
					//valveService.getCharacteristic(Characteristic.RemainingDuration).updateValue(0)
					this.platform.endTime[valveId] = 0
				}
				return
			}
		} catch (err) {
			this.log.error('error trying to update valve status', err)
		}
	}
}
module.exports = polling
