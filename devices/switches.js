let RachioAPI=require('../rachioapi')

class switches {
	constructor(platform, log) {
		this.log = log
		this.platform = platform
		this.rachioapi = new RachioAPI(this, log)
	}

	createScheduleSwitchService(schedule) {
		// Create Valve Service
		this.log.debug("Created service for %s with id %s", schedule.name, schedule.id)
		let switchService = new Service.Switch(schedule.name, schedule.id)
		switchService.addCharacteristic(Characteristic.ConfiguredName)
		switchService.addCharacteristic(Characteristic.SerialNumber)
		switchService
			.setCharacteristic(Characteristic.On, false)
			.setCharacteristic(Characteristic.Name, schedule)
			.setCharacteristic(Characteristic.SerialNumber, schedule.id)
			.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
		return switchService
	}

	createSwitchService(device, switchName) {
		// Create Valve Service
		this.log.debug('adding new switch')
		let uuid = UUIDGen.generate(switchName)
		let switchService = new Service.Switch(switchName, uuid)
		switchService.addCharacteristic(Characteristic.ConfiguredName)
		switchService
			.setCharacteristic(Characteristic.On, false)
			.setCharacteristic(Characteristic.Name, switchName)
			.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
		return switchService
	}

	configureSwitchService(device, switchService) {
		// Configure Valve Service
		this.log.info("Configured switch for %s", switchService.getCharacteristic(Characteristic.Name).value)
		switchService
			.getCharacteristic(Characteristic.On)
			.on('get', this.getSwitchValue.bind(this, switchService))
			.on('set', this.setSwitchValue.bind(this, device, switchService))
	}

	async setSwitchValue(device, switchService, value, callback) {
		this.log.debug('toggle switch state %s', switchService.getCharacteristic(Characteristic.Name).value)
		let response
		switch (switchService.getCharacteristic(Characteristic.Name).value) {
			case device.name + ' Standby':
				if (switchService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
					callback('error')
				}
				else {
					if (value == false) {
						response = await this.rachioapi.deviceStandby(this.platform.token, device, 'on')
						if (response.status == 204) {
							switchService.getCharacteristic(Characteristic.On).updateValue(value)
						}
					}
					else if (value == true) {
						response = await this.rachioapi.deviceStandby(this.platform.token, device, 'off')
						if (response.status == 204) {
							switchService.getCharacteristic(Characteristic.On).updateValue(value)
						}
					}
					callback()
				}
				break
			case device.name + ' Quick Run-All':
				if (switchService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
					callback('error')
				}
				else {
					if (value) {
						response = await this.rachioapi.startMultipleZone(this.platform.token, device.zones, this.platform.defaultRuntime)
						if (response.status == 204) {
							switchService.getCharacteristic(Characteristic.On).updateValue(value)
						}
					}
					else {
						response = await this.rachioapi.stopDevice(this.platform.token, device.id)
						if (response.status == 204) {
							switchService.getCharacteristic(Characteristic.On).updateValue(value)
						}
					}
					callback()
				}
				break
			default: //using scheule names
				if (switchService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
					callback('error')
				}
				else {
					if (value) {
						response = await this.rachioapi.startSchedule(this.platform.token, switchService.getCharacteristic(Characteristic.SerialNumber).value)
						if (response.status == 204) {
							switchService.getCharacteristic(Characteristic.On).updateValue(true)
						}
					}
					else {
						response = await this.rachioapi.stopDevice(this.platform.token, device.id)
						if (response.status == 204) {
							switchService.getCharacteristic(Characteristic.On).updateValue(false)
						}
					}
					callback()
				}
				break
		}
	}

	getSwitchValue(switchService, callback) {
		if (switchService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
			callback('error')
		}
		else {
			callback(null, switchService.getCharacteristic(Characteristic.On).value)
		}
	}
}
module.exports = switches