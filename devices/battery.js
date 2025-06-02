let RachioAPI = require('../rachioapi')

class battery {
	constructor(platform, log) {
		this.log = log
		this.platform = platform
		this.rachioapi = new RachioAPI(platform, log)
		this.delta = []
		this.timeStamp = []
	}


	createBatteryService(device) {
		let batteryStatus
		this.log.debug('create battery service for %s', device.name)
		batteryStatus = new Service.Battery(device.name, device.id)

		switch (device.state.reportedState.batteryStatus) {
			case 'GOOD':
				batteryStatus.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
				break
			case 'LOW':
				batteryStatus.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
				break
			case 'REPLACE':
				batteryStatus.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
				this.log.warn('Replace batteries for %s soon', response.data.valve.name)
				break
		}

		return batteryStatus
	}

	configureBatteryService(batteryStatus) {
		this.log.debug('configured battery service for %s', batteryStatus.getCharacteristic(Characteristic.Name).value)
		batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).on('get', this.getStatusLowBattery.bind(this, batteryStatus))
	}

	async getStatusLowBattery(batteryStatus, callback) {
		let deviceId = batteryStatus.subtype
		if(!this.timeStamp[deviceId]) {
			this.timeStamp[deviceId] = new Date()
		}
		//check for duplicate call
		this.delta[deviceId] = new Date() - this.timeStamp[deviceId]
		if (this.delta[deviceId] > 60 * 60 * 1000 || this.delta[deviceId] == 0) {  // check after 1 hour
			this.timeStamp[deviceId] = new Date()
		} else {
			this.log.debug('skipped battery update, to soon. timestamp delta %s sec', this.delta[deviceId]/1000)
			callback(null, batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).value)
			return
		}
		// add connection state to this call
		try {
			this.log.debug('updating battery for valve deviceId ', deviceId)
			let response = await this.rachioapi.getValve(this.platform.token, deviceId).catch(err => {
				this.log.error('Failed to get valve', err)
			})
			if (response.status == 200) {
				switch (response.data.valve.state.reportedState.batteryStatus) {
					case 'GOOD':
						batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
						break
					case 'LOW':
						batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
						break
					case 'REPLACE':
						batteryStatus.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
						this.log.warn('Replace batteries for %s soon', response.data.valve.name)
						break
				}
			}
		} catch (err) {
		this.log.error('error trying to update battery status', err)
		}
		callback(null, batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).value)
	}
}
module.exports = battery
