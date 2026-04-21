let RachioAPI = require('../rachioapi')

class switches {
	constructor(platform, log) {
		this.log = log
		this.platform = platform
		this.rachioapi = new RachioAPI(platform, log)
	}

	createScheduleSwitchService(schedule) {
		// Create Valve Service
		this.log.debug('Created service for %s with id %s', schedule.name, schedule.id)
		let switchService = new Service.Switch(schedule.name, schedule.id)
		switchService.addCharacteristic(Characteristic.ConfiguredName)
		switchService.addCharacteristic(Characteristic.SerialNumber)
		switchService
			.setCharacteristic(Characteristic.On, false)
			.setCharacteristic(Characteristic.Name, schedule.name)
			.setCharacteristic(Characteristic.ConfiguredName, schedule.name)
			.setCharacteristic(Characteristic.SerialNumber, schedule.id)
			.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
		return switchService
	}

	createSwitchService(switchName, uuid) {
		// Create Valve Service
		this.log.debug('adding new switch')
		let switchService = new Service.Switch(switchName, uuid)
		switchService.addCharacteristic(Characteristic.ConfiguredName)
		switchService
			.setCharacteristic(Characteristic.On, false)
			.setCharacteristic(Characteristic.Name, switchName)
			.setCharacteristic(Characteristic.ConfiguredName, switchName)
			.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
		return switchService
	}

	configureSwitchService(device, switchService) {
		// Configure Valve Service
		this.log.info('Configured switch for %s', switchService.getCharacteristic(Characteristic.Name).value)
		switchService.getCharacteristic(Characteristic.On)
			.onGet(this.getSwitchValue.bind(this, switchService))
			.onSet(this.setSwitchValue.bind(this, device, switchService))
	}

	async setSwitchValue(device, switchService, value) {
		if (switchService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
			throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE)
		}
		this.log.debug('toggle switch state %s', switchService.getCharacteristic(Characteristic.Name).value)
		let response
		switch (switchService.getCharacteristic(Characteristic.Name).value) {
			case device.name + ' Standby':
				if (value == false) {
					response = await this.rachioapi.deviceStandby(this.platform.token, device, 'on')
					if (response.status == 204) {
						switchService.getCharacteristic(Characteristic.On).updateValue(value)
					}
				} else if (value == true) {
					response = await this.rachioapi.deviceStandby(this.platform.token, device, 'off')
					if (response.status == 204) {
						switchService.getCharacteristic(Characteristic.On).updateValue(value)
					}
				}
				return
				break
			case device.name + ' Quick Run All':
				if (value) {
					let completeRun = 0
					let x
					device.zones.forEach(zone =>{
						completeRun = completeRun + this.platform.defaultRuntime
					})
					clearTimeout(x)
					x = setTimeout(() => {
						switchService.getCharacteristic(Characteristic.On).updateValue(false)
						this.log.info('Quick Run All finished, completed after %s minutes', completeRun/60)
					}, completeRun*1000);

					response = await this.rachioapi.startMultipleZone(this.platform.token, device.zones, this.platform.defaultRuntime)
					if (response.status == 204) {
						switchService.getCharacteristic(Characteristic.On).updateValue(value)
					}
				} else {
					response = await this.rachioapi.stopDevice(this.platform.token, device.id)
					if (response.status == 204) {
						switchService.getCharacteristic(Characteristic.On).updateValue(value)
					}
				}
				return
				break
			default: //using scheule names
				if (value) {
					response = await this.rachioapi.startSchedule(this.platform.token, switchService.getCharacteristic(Characteristic.SerialNumber).value)
					if (response.status == 204) {
						switchService.getCharacteristic(Characteristic.On).updateValue(true)
					}
				} else {
					response = await this.rachioapi.stopDevice(this.platform.token, device.id)
					if (response.status == 204) {
						switchService.getCharacteristic(Characteristic.On).updateValue(false)
					}
				}
				return
				break
		}
	}

	getSwitchValue(switchService) {
		let currentValue
		if (switchService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
			throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE)
		} else {
			currentValue = switchService.getCharacteristic(Characteristic.On).value
		}
		return currentValue
	}
}
module.exports = switches
