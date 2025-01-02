let packageJson = require('../package.json')
let RachioAPI = require('../rachioapi')

class valve {
	constructor(platform, log) {
		this.log = log
		this.platform = platform
		this.rachioapi = new RachioAPI(this, log)
	}

	createValveAccessory(base, valve, platformAccessory) {
		let valveService
		if(!platformAccessory){
			// Create new Valve System Service
			this.log.debug('Create valve accessory %s %s', valve.id, base.address.locality)
			platformAccessory = new PlatformAccessory(base.address.locality, valve.id)
			//valveService = platformAccessory.addService(Service.Valve, valve.id, valve.id) // changed warning message for "-" in name
			valveService = platformAccessory.addService(Service.Valve, valve.id.replace(/-/g,''), valve.id)
			valveService.addCharacteristic(Characteristic.SerialNumber) //Use Serial Number to store the zone id
			valveService.addCharacteristic(Characteristic.Model)
			valveService.addCharacteristic(Characteristic.ConfiguredName)
			valveService.addCharacteristic(Characteristic.ProgramMode)
		}
		else{
			// Update Valve System Service
			this.log.debug('Update valve accessory %s %s', valve.id, valve.name)
		}

		// Create AccessoryInformation Service
		platformAccessory.getService(Service.AccessoryInformation)
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
		valveService=platformAccessory.getService(Service.Valve)
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
		valveService
			.getCharacteristic(Characteristic.Active)
			.on('get', this.getDeviceValue.bind(this, valveService, 'DeviceActive'))
		valveService
			.getCharacteristic(Characteristic.InUse)
			.on('get', this.getDeviceValue.bind(this, valveService, 'DeviceInUse'))
		valveService
			.getCharacteristic(Characteristic.ProgramMode)
			.on('get', this.getDeviceValue.bind(this, valveService, 'DeviceProgramMode'))
	}

	updateValveService(base, valve, valveService) {
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
		if(valve.state.reportedState.lastWateringAction){
			//this.log.debug(valve.state.reportedState.lastWateringAction)
			let start = valve.state.reportedState.lastWateringAction.start
			let duration = valve.state.reportedState.lastWateringAction.durationSeconds
			let endTime = new Date(start).getTime()+(duration*1000)
			let remaining = Math.max(Math.round((endTime - Date.now())/1000), 0)
			this.platform.endTime[valveService.getCharacteristic(Characteristic.SerialNumber).value]=endTime
			valveService
				.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
				.setCharacteristic(Characteristic.InUse, Characteristic.InUse.IN_USE)
				.setCharacteristic(Characteristic.SetDuration, duration)
				.setCharacteristic(Characteristic.RemainingDuration, remaining)
		}
		else{
			valveService
				.setCharacteristic(Characteristic.Active, Characteristic.Active.INACTIVE)
				.setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE)
				.setCharacteristic(Characteristic.SetDuration, Math.ceil(defaultRuntime / 60) * 60)
				.setCharacteristic(Characteristic.RemainingDuration, 0)
		}
		if (valve.enabled) {
			valveService.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
		}
		else {
			valveService.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.NOT_CONFIGURED)
		}
		return valveService
	}

	configureValveService(device, valveService) {
		this.log.info('Configured zone-%s for %s with %s min runtime', valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(Characteristic.Name).value, valveService.getCharacteristic(Characteristic.SetDuration).value / 60)
		valveService
			.getCharacteristic(Characteristic.Active)
			.on('get', this.getValveValue.bind(this, valveService, 'ValveActive'))
			.on('set', this.setValveValue.bind(this, device, valveService))

		valveService
			.getCharacteristic(Characteristic.InUse)
			.on('get', this.getValveValue.bind(this, valveService, 'ValveInUse'))
			.on('set', this.setValveValue.bind(this, device, valveService))

		valveService
			.getCharacteristic(Characteristic.SetDuration)
			.on('get', this.getValveValue.bind(this, valveService, 'ValveSetDuration'))
			.on('set', this.setValveSetDuration.bind(this, device, valveService))

		valveService
			.getCharacteristic(Characteristic.RemainingDuration)
			.on('get', this.getValveValue.bind(this, valveService, 'ValveRemainingDuration'))
	}

	getDeviceValue(valveService, characteristicName, callback) {
		//this.log.debug('%s - Set something %s', valveService.getCharacteristic(Characteristic.Name).value)
		switch (characteristicName) {
			case 'DeviceActive':
				//this.log.debug('%s=%s %s', valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.Active).value)
				if (valveService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
					callback('error')
				}
				else {
					this.platform.startLiveUpdate(valveService)
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

	async getValveValue(valveService, characteristicName, callback) {
		//this.log.debug('value', valveService.getCharacteristic(Characteristic.Name).value, characteristicName)
		switch (characteristicName) {
			case 'ValveActive':
				//this.log.debug('%s=%s %s', valveService.getCharacteristic(Characteristic.Name).value, characteristicName, valveService.getCharacteristic(Characteristic.Active).value)
				if (valveService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
					callback('error')
				}
				else {
					this.platform.startLiveUpdate(valveService)
					callback(null, valveService.getCharacteristic(Characteristic.Active).value)
				}
				break
			case 'ValveInUse':
				//this.log.debug('%s=%s %s', valveService.getCharacteristic(Characteristic.Name).value, characteristicName, valveService.getCharacteristic(Characteristic.InUse).value)
				callback(null, valveService.getCharacteristic(Characteristic.InUse).value)
				break
			case 'ValveSetDuration':
				//this.log.debug('%s=%s %s', valveService.getCharacteristic(Characteristic.Name).value, characteristicName, valveService.getCharacteristic(Characteristic.SetDuration).value)
				callback(null, valveService.getCharacteristic(Characteristic.SetDuration).value)
				break
			case 'ValveRemainingDuration':
				//this.log.debug('%s=%s %s', valveService.getCharacteristic(Characteristic.Name).value, characteristicName, timeRemaining)
				callback(null, valveService.getCharacteristic(Characteristic.RemainingDuration).value)
				break
			default:
				this.log.debug('Unknown Valve Characteristic Name called', characteristicName)
				callback()
				break
		}
	}

	async setValveValue(device, valveService, value, callback) {
		//this.log.debug('%s - Set Active state to %s', valveService.getCharacteristic(Characteristic.Name).value, value)
		if(value==valveService.getCharacteristic(Characteristic.Active).value){ //IOS 17 bug fix for duplicate calls
			this.log.debug('supressed duplicate call from IOS for %s, current value %s, new value %s', valveService.getCharacteristic(Characteristic.Name).value, value, valveService.getCharacteristic(Characteristic.Active).value)
			callback()
			return
		}
		// Set homekit state and prepare message for rachio API
		let runTime = valveService.getCharacteristic(Characteristic.SetDuration).value
		let endTime = new Date(Date.now() + runTime * 1000).toISOString()
		if (value == Characteristic.Active.ACTIVE) {
			// Turn on/idle the valve
			this.log.info('Starting zone-%s %s for %s mins', valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(Characteristic.Name).value, runTime / 60)
			valveService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
			valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
			let status = await this.rachioapi.startWatering(this.platform.token, device.id, runTime)
			this.log.debug(status.statusText)
			if(status.status == 200){
				valveService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
				valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
				valveService.getCharacteristic(Characteristic.RemainingDuration).updateValue(runTime)
				this.platform.endTime[valveService.getCharacteristic(Characteristic.SerialNumber).value]=endTime
			}
			else{
				valveService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
				valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
				valveService.getCharacteristic(Characteristic.RemainingDuration).updateValue(0)
				this.platform.endTime[valveService.getCharacteristic(Characteristic.SerialNumber).value]= new Date(Date.now()).toISOString()
			}
			//json start stuff
			let myJsonStart = {
				source: "local",
				action: "start"
			 }
			let myJsonStop = {
				source: "local",
				action: "stop"
			 }
			//this.log.debug('Simulating websocket event for %s', myJsonStart.device_id)
			if(this.platform.showIncomingMessages){
				this.log.debug('simulated message',myJsonStart)
			}
			//this.eventMsg(JSON.stringify(myJsonStart))
			this.fakeWebsocket = setTimeout(() => {
				//this.log.debug('Simulating websocket event for %s', myJsonStop.device_id)
				valveService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
				valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
				//valveService.getCharacteristic(Characteristic.RemainingDuration).updateValue(0)
				this.platform.endTime[valveService.getCharacteristic(Characteristic.SerialNumber).value]= new Date(Date.now()).toISOString()
				if(this.platform.showIncomingMessages){
					this.log.debug('simulated message',myJsonStop)
				}
				//this.eventMsg(JSON.stringify(myJsonStop))
			}, runTime * 1000)
		}
		else {
			// Turn off/stopping the valve
			this.log.info('Stopping Zone', valveService.getCharacteristic(Characteristic.Name).value)
			valveService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
			valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
			let status = await this.rachioapi.stopWatering(this.platform.token, device.id)
			this.log.debug(status.statusText)
			if(status.status == 200){
				valveService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
				valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
				//valveService.getCharacteristic(Characteristic.RemainingDuration).updateValue(0)
				this.platform.endTime[valveService.getCharacteristic(Characteristic.SerialNumber).value]= new Date(Date.now()).toISOString()
			}
			else{
				valveService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
				valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
				valveService.getCharacteristic(Characteristic.RemainingDuration).updateValue(runTime)
				this.platform.endTime[valveService.getCharacteristic(Characteristic.SerialNumber).value]=endTime
			}

			//json stop stuff
			let myJsonStop = {
				source: "local",
				action: "stop"
			 }
			//this.log.debug('Simulating websocket event for %s', myJsonStop.device_id)
			if(this.platform.showIncomingMessages){
				this.log.debug('simulated message',myJsonStop)
			}
			//this.eventMsg(JSON.stringify(myJsonStop))
			clearTimeout(this.fakeWebsocket)
		}
		callback()
	}

	setValveSetDuration(device, valveService, value, callback) {
		// Set default duration from Homekit value
		valveService.getCharacteristic(Characteristic.SetDuration).updateValue(value)
		this.log.info('Set %s duration for %s mins', valveService.getCharacteristic(Characteristic.Name).value, value / 60)
		callback()
	}

	localMessage(listener){
		this.eventMsg = (msg) =>{
			listener(msg)
		}
	}
}
module.exports = valve