let RachioAPI = require('../rachioapi')

class battery {
	constructor(platform, log) {
		this.log = log
		this.platform = platform
		this.rachioapi = new RachioAPI(this, log)
	}

	createBatteryService(device) {
		let batteryStatus
		this.log.debug('create battery service for %s', device.name)
		batteryStatus = new Service.Battery(device.name, device.id)

		switch(device.state.reportedState.batteryStatus){
			case 'GOOD':
				batteryStatus
					.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
				break
			case 'LOW':
				batteryStatus
					.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
				break
		}

		return batteryStatus
	}

	configureBatteryService(batteryStatus) {
		this.log.debug('configured battery service for %s', batteryStatus.getCharacteristic(Characteristic.Name).value)
		batteryStatus
			.getCharacteristic(Characteristic.StatusLowBattery)
			.on('get', this.getStatusLowBattery.bind(this, batteryStatus))
	}

	getStatusLowBattery(batteryStatus, callback) {
		let name = batteryStatus.getCharacteristic(Characteristic.Name).value
		let currentValue = batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).value
		if (batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).value ==Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW) {
			this.log.warn('%s Valve Battery Status Low', name)
		}
		callback(null, currentValue)
	}
}
module.exports = battery