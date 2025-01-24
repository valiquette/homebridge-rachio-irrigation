let packageJson = require('../package.json')
let RachioAPI = require('../rachioapi')
let listener = require('../listener')
let polling = require('../polling')

class valve {
	constructor(platform, log, config) {
		this.log = log
		this.config = config
		this.platform = platform
		this.rachioapi = new RachioAPI(platform, log)
		this.listener = new listener(platform, log, config)
		this.polling = new polling(platform, log, config)
		this.pollValves = config.pollValves ? config.pollValves : false
	}

	createValveAccessory(base, valve, platformAccessory) {
		let valveService
		if (!platformAccessory) {
			// Create new Valve System Service
			this.log.debug('Create valve accessory %s %s', valve.id, base.address.locality)
			platformAccessory = new PlatformAccessory(base.address.locality, valve.id)
			//valveService = platformAccessory.addService(Service.Valve, valve.id, valve.id) // changed warning message for "-" in name
			valveService = platformAccessory.addService(Service.Valve, valve.id.replace(/-/g, ''), valve.id)
			valveService.addCharacteristic(Characteristic.SerialNumber) //Use Serial Number to store the zone id
			valveService.addCharacteristic(Characteristic.Model)
			valveService.addCharacteristic(Characteristic.ConfiguredName)
			valveService.addCharacteristic(Characteristic.ProgramMode)
		} else {
			// Update Valve System Service
			this.log.debug('Update valve accessory %s %s', valve.id, valve.name)
		}

		// Create AccessoryInformation Service
		platformAccessory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Name, base.address.locality)
			.setCharacteristic(Characteristic.Manufacturer, 'Rachio')
			.setCharacteristic(Characteristic.SerialNumber, base.serialNumber)
			.setCharacteristic(Characteristic.Model, 'SHVK001')
			.setCharacteristic(Characteristic.Identify, true)
			.setCharacteristic(Characteristic.FirmwareRevision, valve.state.reportedState.firmwareVersion)
			.setCharacteristic(Characteristic.HardwareRevision, base.macAddress)
			.setCharacteristic(Characteristic.SoftwareRevision, packageJson.version)
			.setCharacteristic(Characteristic.ProductData, 'Valve')

		// Create Valve Service
		// Check if the valve is connected
		valveService = platformAccessory.getService(Service.Valve)
		if (valve.state.reportedState.connected == true) {
			valveService.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
		} else {
			this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.', valve.name, valve.state.reportedState.lastSeen)
			valveService.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT)
		}
		return platformAccessory
	}

	configureValveService(base, valve, valveService) {
		this.log.info('Configure Valve service for %s', valveService.getCharacteristic(Characteristic.Name).value)
		valveService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE)
			.setCharacteristic(Characteristic.StatusFault, !valve.state.reportedState.connected)
			.setCharacteristic(Characteristic.Duration, valve.state.desiredState.defaultRuntimeSeconds)
			.setCharacteristic(Characteristic.RemainingDuration, 0)
		valveService.getCharacteristic(Characteristic.Active).on('get', this.getDeviceValue.bind(this, valveService, 'DeviceActive'))
		valveService.getCharacteristic(Characteristic.InUse).on('get', this.getDeviceValue.bind(this, valveService, 'DeviceInUse'))
		valveService.getCharacteristic(Characteristic.ProgramMode).on('get', this.getDeviceValue.bind(this, valveService, 'DeviceProgramMode'))
	}

	updateValveService(base, valve, valveService) {
		if (this.pollValves) {
			this.log.warn('Polling for Hose Timers is enabled')
		}
		let defaultRuntime = this.platform.defaultRuntime
		valve.enabled = true // need rachio valve version of enabled
		this.log.debug(valve)
		try {
			switch (this.platform.runtimeSource) {
				case 0:
					defaultRuntime = this.platform.defaultRuntime
					break
				case 1:
					if (device.state.defaultRunTimeSeconds > 0) {
						defaultRuntime = device.state.desiredState.defaultRuntimeSeconds
					}
					break
				case 2:
					if (zone.flow_data.cycle_run_time_sec > 0) {
						defaultRuntime = device.state.desiredState.defaultRuntimeSeconds
					}
					break
				default:
					defaultRuntime = this.platform.defaultRuntime
					break
			}
		} catch (err) {
			this.log.debug('error setting runtime, using default runtime')
		}
		this.log.debug('Created valve service for %s with %s sec runtime (%s min)', valve.name, defaultRuntime, Math.round(defaultRuntime / 60))
		valveService
			.setCharacteristic(Characteristic.ValveType, this.platform.valveType)
			.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
			.setCharacteristic(Characteristic.ServiceLabelIndex, valve.zone)
			.setCharacteristic(Characteristic.StatusFault, !valve.state.reportedState.connected)
			.setCharacteristic(Characteristic.SerialNumber, valve.id)
			.setCharacteristic(Characteristic.Name, valve.name)
			.setCharacteristic(Characteristic.ConfiguredName, valve.name)
			.setCharacteristic(Characteristic.Model, 'SHV101')
		if (valve.state.reportedState.lastWateringAction) {
			let start = valve.state.reportedState.lastWateringAction.start
			let duration = valve.state.reportedState.lastWateringAction.durationSeconds
			let endTime = new Date(start).getTime() + duration * 1000
			let remaining = Math.max(Math.round((endTime - Date.now()) / 1000), 0)
			this.platform.endTime[valveService.getCharacteristic(Characteristic.SerialNumber).value] = endTime
			valveService
				.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
				.setCharacteristic(Characteristic.InUse, Characteristic.InUse.IN_USE)
				.setCharacteristic(Characteristic.SetDuration, duration)
				.setCharacteristic(Characteristic.RemainingDuration, remaining)
		} else {
			let start = Date.now()
			let duration = Math.ceil(defaultRuntime / 60) * 60
			let endTime = new Date(start).getTime() + duration * 1000
			let remaining = Math.max(Math.round((endTime - Date.now()) / 1000), 0)
			this.platform.endTime[valveService.getCharacteristic(Characteristic.SerialNumber).value] = endTime
			valveService
				.setCharacteristic(Characteristic.Active, Characteristic.Active.INACTIVE)
				.setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE)
				.setCharacteristic(Characteristic.SetDuration, duration)
				.setCharacteristic(Characteristic.RemainingDuration, remaining)
		}
		if (valve.enabled) {
			valveService.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
		} else {
			valveService.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.NOT_CONFIGURED)
		}
		return valveService
	}

	configureValveService(device, valveService) {
		this.log.info(
			'Configured zone-%s for %s with %s min runtime',
			valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value,
			valveService.getCharacteristic(Characteristic.Name).value,
			valveService.getCharacteristic(Characteristic.SetDuration).value / 60
		)
		valveService.getCharacteristic(Characteristic.Active).on('get', this.getValveValue.bind(this, valveService, 'ValveActive')).on('set', this.setValveValue.bind(this, device, valveService))

		valveService.getCharacteristic(Characteristic.InUse).on('get', this.getValveValue.bind(this, valveService, 'ValveInUse')).on('set', this.setValveValue.bind(this, device, valveService))

		valveService.getCharacteristic(Characteristic.SetDuration).on('get', this.getValveValue.bind(this, valveService, 'ValveSetDuration')).on('set', this.setValveSetDuration.bind(this, device, valveService))

		valveService.getCharacteristic(Characteristic.RemainingDuration).on('get', this.getValveValue.bind(this, valveService, 'ValveRemainingDuration'))
	}

	getDeviceValue(valveService, characteristicName, callback) {
		switch (characteristicName) {
			case 'DeviceActive':
				//this.log.debug('%s=%s %s', valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.Active).value)
				if (valveService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
					callback('error')
				} else {
					callback(null, valveService.getCharacteristic(Characteristic.Active).value)
				}
				break
			case 'DeviceInUse':
				//this.log.debug('%s=%s %s', valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.InUse).value)
				callback(null, valveService.getCharacteristic(Characteristic.InUse).value)
				break
			case 'DeviceProgramMode':
				//this.log.debug('%s=%s %s', valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.ProgramMode).value)
				callback(null, valveService.getCharacteristic(Characteristic.ProgramMode).value)
				break
			default:
				this.log.debug('Unknown Device Characteristic Name called', characteristicName)
				callback()
				break
		}
	}

	getValveValue(valveService, characteristicName, callback) {
		//this.log.debug('value', valveService.getCharacteristic(Characteristic.Name).value, characteristicName)
		switch (characteristicName) {
			case 'ValveActive':
				if (valveService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
					callback('error')
				} else {
					//this.polling.startLiveUpdate(valveService) ///disabled for webhooks
					if (this.pollValves) {
						this.polling.startLiveUpdate(valveService)
					}
					callback(null, valveService.getCharacteristic(Characteristic.Active).value)
				}
				break
			case 'ValveInUse':
				callback(null, valveService.getCharacteristic(Characteristic.InUse).value)
				break
			case 'ValveSetDuration':
				callback(null, valveService.getCharacteristic(Characteristic.SetDuration).value)
				break
			case 'ValveRemainingDuration':
				// Calc remain duration
				let timeEnding = Date.parse(this.platform.endTime[valveService.subtype])
				let timeNow = Date.now()
				let timeRemaining = Math.max(Math.round((timeEnding - timeNow) / 1000), 0)
				if (isNaN(timeRemaining)) {
					timeRemaining = 0
				}
				//valveService.getCharacteristic(Characteristic.RemainingDuration).updateValue(timeRemaining)
				callback(null, timeRemaining)
				break
			default:
				this.log.debug('Unknown Valve Characteristic Name called', characteristicName)
				callback()
				break
		}
	}

	async setValveValue(device, valveService, value, callback) {
		//this.log.debug('%s - Set Active state to %s', valveService.getCharacteristic(Characteristic.Name).value, value)
		if (value == valveService.getCharacteristic(Characteristic.Active).value) {
			//IOS 17 bug fix for duplicate calls
			this.log.debug('supressed duplicate call from IOS for %s, current value %s, new value %s', valveService.getCharacteristic(Characteristic.Name).value, value, valveService.getCharacteristic(Characteristic.Active).value)
			callback()
			return
		}
		// Set homekit state and prepare message for rachio API
		let runTime = valveService.getCharacteristic(Characteristic.SetDuration).value
		let endTime = new Date(Date.now() + runTime * 1000).toISOString()
		let response
		switch (value) {
			case Characteristic.Active.ACTIVE:
				// Turn on/idle the valve
				this.log.info('Starting %s valve for %s mins', valveService.getCharacteristic(Characteristic.Name).value, runTime / 60)
				response = await this.rachioapi.startWatering(this.platform.token, device.id, runTime)
				if (response.status == 200) {
					//json start stuff
					let myJsonStart = {
						eventId: '53936ce8-299a-3a02-9f8a-754a55291333',
						eventType: 'VALVE_RUN_START_EVENT',
						externalId: this.platform.webhook_key_local,
						payload: {
							durationSeconds: valveService.getCharacteristic(Characteristic.SetDuration).value,
								flowDetected: false,
							runType: 'QUICK_RUN',
							startTime: new Date().toISOString()
						},
						resourceId: device.id,
						resourceType: 'VALVE',
						timestamp: new Date().toISOString()
					}
					let myJsonStop = {
						eventId: '6defa6ff-a169-3477-aa57-3c028455387d',
						eventType: 'VALVE_RUN_END_EVENT',
						externalId: this.platform.webhook_key_local,
						payload: {
							durationSeconds: Math.round(valveService.getCharacteristic(Characteristic.SetDuration).value),
							endReason: 'COMPLETED',
							flowDetected: false,
							runType: 'QUICK_RUN',
							startTime: new Date().toISOString()
						},
						resourceId: device.id,
						resourceType: 'VALVE',
						timestamp: new Date().toISOString()
					}
					this.log.debug('Simulating websocket event for %s', myJsonStart.resourceId)
					if (this.platform.showWebhookMessages) {
						this.log.debug('webhook sent from <%s> %s', this.platform.webhook_key_local, JSON.stringify(myJsonStart, null, 2))
					}
					this.platform.listener.eventMsg(null, valveService, myJsonStart)
					this.localWebhook = setTimeout(() => {
						this.log.debug('Simulating websocket event for %s', myJsonStop.resourceId)
						this.platform.endTime[valveService.getCharacteristic(Characteristic.SerialNumber).value] = new Date(Date.now()).toISOString()
						if (this.platform.showWebhookMessages) {
							this.log.debug('webhook sent from <%s> %s', this.platform.webhook_key_local, JSON.stringify(myJsonStop, null, 2))
						}
						this.platform.listener.eventMsg(null, valveService, myJsonStop)
					}, runTime * 1000)
				}
				break
			case Characteristic.Active.INACTIVE:
				// Turn off/stopping the valve
				this.log.info('Stopping Zone', valveService.getCharacteristic(Characteristic.Name).value)
				response = await this.rachioapi.stopWatering(this.platform.token, device.id)
				if (response.status == 200) {
					//json stop stuff
					let myJsonStop = {
						eventId: '6defa6ff-a169-3477-aa57-3c028455387d',
						eventType: 'VALVE_RUN_END_EVENT',
						externalId: this.platform.webhook_key_local,
						payload: {
							durationSeconds: Math.round(valveService.getCharacteristic(Characteristic.SetDuration).value - (Date.parse(this.platform.endTime[valveService.subtype]) - Date.now()) / 1000),
							endReason: 'COMPLETED',
							flowDetected: false,
							runType: 'QUICK_RUN',
							startTime: new Date().toISOString()
						},
						resourceId: device.id,
						resourceType: 'VALVE',
						timestamp: new Date().toISOString()
					}
					this.log.debug('Simulating websocket event for %s', myJsonStop.resourceId)
					if (this.platform.showWebhookMessages) {
						this.log.debug('webhook sent from <%s> %s', this.platform.webhook_key_local, JSON.stringify(myJsonStop, null, 2))
					}
					this.platform.listener.eventMsg(null, valveService, myJsonStop)
					clearTimeout(this.localWebhook)
				} else this.log.info('Failed to stop valve')
				break
		}
		callback()
	}

	setValveSetDuration(device, valveService, value, callback) {
		// Set default duration from Homekit value
		valveService.getCharacteristic(Characteristic.SetDuration).updateValue(value)
		this.log.info('Set %s duration for %s mins', valveService.getCharacteristic(Characteristic.Name).value, value / 60)
		callback()
	}
}
module.exports = valve
