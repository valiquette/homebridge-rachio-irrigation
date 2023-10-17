let RachioAPI=require('../rachioapi')

class battery {
	constructor(platform, log) {
		this.log = log
		this.platform = platform
		this.rachioapi = new RachioAPI(this, log)
	}

	createBatteryService(device) {
		let batteryStatus
		this.log.debug("create battery service for %s", device.name)
		batteryStatus = new Service.Battery(device.name, device.id)
		let percent
		if(device.state.reportedState.batteryStatus=="GOOD"){
			percent=100
		}
		else{
			percent=10
		}
		batteryStatus
			.setCharacteristic(Characteristic.ChargingState, Characteristic.ChargingState.NOT_CHARGEABLE)
			.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
			.setCharacteristic(Characteristic.BatteryLevel, percent)
		return batteryStatus
	}

	configureBatteryService(batteryStatus) {
		this.log.debug("configured battery service for %s", batteryStatus.getCharacteristic(Characteristic.Name).value)
		batteryStatus
			.getCharacteristic(Characteristic.StatusLowBattery)
			.on('get', this.getStatusLowBattery.bind(this, batteryStatus))
	}

	getStatusLowBattery(batteryStatus, callback) {
		let name = batteryStatus.getCharacteristic(Characteristic.Name).value
		let batteryValue = batteryStatus.getCharacteristic(Characteristic.BatteryLevel).value
		let currentValue = batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).value
		if (batteryValue <= this.platform.lowBattery) {
			this.log.warn('%s Battery Status Low %s% Remaining', name, batteryValue)
			batteryStatus.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
			currentValue = Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
		}
		callback(null, currentValue)
	}
}
module.exports = battery