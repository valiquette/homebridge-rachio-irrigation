let packageJson=require('../package.json')
let RachioAPI=require('../rachioapi')

function irrigation (platform,log){
	this.log=log
	this.platform=platform
	this.rachioapi=new RachioAPI(this,log)
}

irrigation.prototype={

	createIrrigationAccessory(device,deviceState){
    this.log.debug('Create Irrigation service %s',device.id,device.name)
    // Create new Irrigation System Service
    let newPlatformAccessory=new PlatformAccessory(device.name, device.id)
    newPlatformAccessory.addService(Service.IrrigationSystem, device.name)
    let irrigationSystemService=newPlatformAccessory.getService(Service.IrrigationSystem)
    // Check if the device is connected
    if (device.status == 'ONLINE'){
      irrigationSystemService.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
    } else {
      irrigationSystemService.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT)
    }
    // Create AccessoryInformation Service
    newPlatformAccessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Name, device.name)
      .setCharacteristic(Characteristic.Manufacturer, 'Rachio')
      .setCharacteristic(Characteristic.SerialNumber, device.serialNumber)
      .setCharacteristic(Characteristic.Model, device.model)
      .setCharacteristic(Characteristic.Identify, true)
      .setCharacteristic(Characteristic.FirmwareRevision, deviceState.state.firmwareVersion)
      .setCharacteristic(Characteristic.HardwareRevision, 'Rev-2')
      .setCharacteristic(Characteristic.SoftwareRevision, packageJson.version)
    return newPlatformAccessory
  },

	configureIrrigationService(device,irrigationSystemService){
    this.log.info('Configure Irrigation system for %s', irrigationSystemService.getCharacteristic(Characteristic.Name).value)
    // Configure IrrigationSystem Service
    irrigationSystemService
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE)
      .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
      .setCharacteristic(Characteristic.RemainingDuration, 0)
    // Check if the device is connected
    switch (device.status){
      case "ONLINE":
        //irrigationSystemService.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
      break
      case "OFFLINE":
        //irrigationSystemService.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT)
      break
    }
    switch (device.scheduleModeType){
      case "OFF":
        irrigationSystemService.setCharacteristic(Characteristic.ProgramMode, Characteristic.ProgramMode.NO_PROGRAM_SCHEDULED)
      break
      case "SCHEDULED":
        irrigationSystemService.setCharacteristic(Characteristic.ProgramMode, Characteristic.ProgramMode.PROGRAM_SCHEDULED)
      break
      case "MANUAL":
        irrigationSystemService.setCharacteristic(Characteristic.ProgramMode, Characteristic.ProgramMode.PROGRAM_SCHEDULED_MANUAL_MODE_)
      break
      default:
        this.log.info('Failed to retrieve program mode setting a default value. Retrieved-', device.data.scheduleModeType)
        irrigationSystemService.setCharacteristic(Characteristic.ProgramMode, Characteristic.ProgramMode.PROGRAM_SCHEDULED_MANUAL_MODE_)
    break
    }
    irrigationSystemService
      .getCharacteristic(Characteristic.Active)
      .on('get',this.getDeviceValue.bind(this, irrigationSystemService, "DeviceActive"))
    irrigationSystemService
      .getCharacteristic(Characteristic.InUse)
      .on('get', this.getDeviceValue.bind(this, irrigationSystemService, "DeviceInUse"))
    irrigationSystemService
      .getCharacteristic(Characteristic.ProgramMode)
      .on('get', this.getDeviceValue.bind(this, irrigationSystemService, "DeviceProgramMode"))
  },

  getDeviceValue(irrigationSystemService, characteristicName, callback){
    //this.log.debug('%s - Set something %s', irrigationSystemService.getCharacteristic(Characteristic.Name).value)
    switch (characteristicName){
      case "DeviceActive":
        //this.log.debug("%s = %s %s", irrigationSystemService.getCharacteristic(Characteristic.Name).value, characteristicName,irrigationSystemService.getCharacteristic(Characteristic.Active).value);
        if (irrigationSystemService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
          callback('error')
        }
        else {
          callback(null, irrigationSystemService.getCharacteristic(Characteristic.Active).value)
        }
      break
      case "DeviceInUse":
        //this.log.debug("%s = %s %s", irrigationSystemService.getCharacteristic(Characteristic.Name).value, characteristicName,irrigationSystemService.getCharacteristic(Characteristic.InUse).value);
          callback(null, irrigationSystemService.getCharacteristic(Characteristic.InUse).value)
      break
      case "DeviceProgramMode":
        //this.log.debug("%s = %s %s", irrigationSystemService.getCharacteristic(Characteristic.Name).value, characteristicName,irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).value);
        callback(null, irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).value)
      break
      default:
        this.log.debug("Unknown CharacteristicName called", characteristicName)
        callback()
      break
    }
  },

  createValveService(zone){
    // Create Valve Service
    let valve=new Service.Valve(zone.name, zone.id)
		let defaultRuntime=this.platform.defaultRuntime
		try {
			switch (this.platform.runtimeSource) {
				case 0:
					defaultRuntime=this.platform.defaultRuntime
				break
				case 1:
					if (zone.fixedRuntime>0){
						defaultRuntime=zone.fixedRuntime
					}
				break
				case 2:
					if (zone.runtime>0){
						defaultRuntime=zone.runtime
					}
				break
			}
		}catch (err){
			this.log.debug('no smart runtime found, using default runtime')
			}
		this.log.debug("Created valve service for %s with id %s with %s min runtime", zone.name, zone.id, Math.round(defaultRuntime/60))
    valve.addCharacteristic(Characteristic.SerialNumber) //Use Serial Number to store the zone id
    valve.addCharacteristic(Characteristic.Model)
    valve.addCharacteristic(Characteristic.ConfiguredName)
		valve
		.getCharacteristic(Characteristic.SetDuration)
		.setProps({
			minValue:0,
			maxValue:64800
		})
		valve
		.getCharacteristic(Characteristic.RemainingDuration)
		.setProps({
			minValue:0,
			maxValue:64800
		})
    valve
      .setCharacteristic(Characteristic.Active, Characteristic.Active.INACTIVE)
      .setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE)
      .setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.IRRIGATION)
      .setCharacteristic(Characteristic.SetDuration, Math.round(defaultRuntime/60)*60)
      .setCharacteristic(Characteristic.RemainingDuration, 0)
      .setCharacteristic(Characteristic.ServiceLabelIndex, zone.zoneNumber)
      .setCharacteristic(Characteristic.SerialNumber, zone.id)
      .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
      .setCharacteristic(Characteristic.Name, zone.name)
      .setCharacteristic(Characteristic.ConfiguredName, zone.name)
      .setCharacteristic(Characteristic.Model, zone.customNozzle.name)
      if (zone.enabled){
        valve.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)}
      else {
        valve.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.NOT_CONFIGURED)
      }
    return valve
  },

  configureValveService(device, valveService){
    this.log.info("Configured zone-%s for %s with %s min runtime",valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(Characteristic.Name).value, valveService.getCharacteristic(Characteristic.SetDuration).value/60)
    // Configure Valve Service
    valveService
      .getCharacteristic(Characteristic.Active)
      .on('get', this.getValveValue.bind(this, valveService, "ValveActive"))
      .on('set', this.setValveValue.bind(this, device, valveService))
    valveService
      .getCharacteristic(Characteristic.InUse)
      .on('get', this.getValveValue.bind(this, valveService, "ValveInUse"))
      .on('set', this.setValveValue.bind(this, device, valveService))
    valveService
      .getCharacteristic(Characteristic.SetDuration)
      .on('get', this.getValveValue.bind(this, valveService, "ValveSetDuration"))
      .on('set', this.setValveDuration.bind(this, device, valveService))
    valveService
      .getCharacteristic(Characteristic.RemainingDuration)
      .on('get', this.getValveValue.bind(this, valveService, "ValveRemainingDuration"))
  },

	getValveValue(valveService, characteristicName, callback){
    switch (characteristicName){
      case "ValveActive":
        //this.log.debug("%s = %s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.Active).value)
        if (valveService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
          callback('error')
        }
        else {
          callback(null, valveService.getCharacteristic(Characteristic.Active).value)
        }
      break
      case "ValveInUse":
        //this.log.debug("%s = %s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.Active).value)
          callback(null, valveService.getCharacteristic(Characteristic.InUse).value)
      break
      case "ValveSetDuration":
        //this.log.debug("%s = %s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.Active).value)
          callback(null, valveService.getCharacteristic(Characteristic.SetDuration).value)
      break
      case "ValveRemainingDuration":
        // Calc remain duration
					let timeEnding=Date.parse(this.platform.endTime[valveService.subtype])
          let timeNow=Date.now()
          let timeRemaining=Math.max(Math.round((timeEnding - timeNow) / 1000), 0)
          if (isNaN(timeRemaining)){
            timeRemaining=0
          }
          valveService.getCharacteristic(Characteristic.RemainingDuration).updateValue(timeRemaining)
          //this.log.debug("%s = %s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,timeRemaining)
          callback(null, timeRemaining)
      break
      default:
        this.log.debug("Unknown CharacteristicName called", characteristicName);
        callback()
      break
    }
  },

  setValveValue(device, valveService, value, callback){
    //this.log.debug('%s - Set Active state to %s', valveService.getCharacteristic(Characteristic.Name).value, value)
      let irrigationAccessory=this.platform.accessories[device.id];
      let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem)

      // Set homekit state and prepare message for Rachio API
      let runTime=valveService.getCharacteristic(Characteristic.SetDuration).value
      if (value == Characteristic.Active.ACTIVE){
        // Turn on/idle the valve
        this.log.info("Starting zone-%s %s for %s mins", valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(Characteristic.Name).value, runTime/60)
        this.rachioapi.startZone (this.platform.token,valveService.getCharacteristic(Characteristic.SerialNumber).value,runTime)
        irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.Active.ACTIVE)
        valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
        let myJsonStart={
          type: 'ZONE_STATUS',
          title: valveService.getCharacteristic(Characteristic.Name).value+' Started',
          deviceId: device.id,
          duration: valveService.getCharacteristic(Characteristic.SetDuration).value,
          zoneNumber: valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value,
          zoneId: valveService.getCharacteristic(Characteristic.SerialNumber).value,
          zoneName: valveService.getCharacteristic(Characteristic.Name).value,
          timestamp: new Date().toISOString(),
          summary: valveService.getCharacteristic(Characteristic.Name).value+' began watering at '+ new Date().toLocaleTimeString(),
          zoneRunState: 'STARTED',
          durationInMinutes: Math.round(valveService.getCharacteristic(Characteristic.SetDuration).value/60),
          externalId: this.platform.webhook_key_local,
          timeForSummary: new Date().toLocaleTimeString(),
          eventType: 'DEVICE_ZONE_RUN_STARTED_EVENT',
          subType: 'ZONE_STARTED',
          endTime: new Date(Date.now()+valveService.getCharacteristic(Characteristic.SetDuration).value*1000).toISOString(),
          category: 'DEVICE',
          resourceType: 'DEVICE'
          }
        let myJsonStop={
          type: 'ZONE_STATUS',
          title: valveService.getCharacteristic(Characteristic.Name).value+' Stopped',
          deviceId: device.id,
          duration: valveService.getCharacteristic(Characteristic.SetDuration).value,
          zoneNumber: valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value,
          zoneId: valveService.getCharacteristic(Characteristic.SerialNumber).value,
          zoneName: valveService.getCharacteristic(Characteristic.Name).value,
          timestamp: new Date().toISOString(),
          summary: valveService.getCharacteristic(Characteristic.Name).value+' stopped watering at '+ new Date().toLocaleTimeString()+' for '+ valveService.getCharacteristic(Characteristic.SetDuration).value+ ' minutes',
          zoneRunState: 'STOPPED',
          durationInMinutes: Math.round(valveService.getCharacteristic(Characteristic.SetDuration).value/60),
          externalId: this.platform.webhook_key_local,
          timeForSummary: new Date().toLocaleTimeString(),
          subType: 'ZONE_STOPPED',
          endTime: new Date(Date.now()+valveService.getCharacteristic(Characteristic.SetDuration).value*1000).toISOString(),
          category: 'DEVICE',
          resourceType: 'DEVICE'
        }
        this.log.debug(myJsonStart)
        this.log.debug('Simulating webhook for %s will update services',myJsonStart.zoneName)
        this.platform.updateService(irrigationSystemService,valveService,myJsonStart)
        this.platform.fakeWebhook=setTimeout(()=>{
          this.log.debug('Simulating webhook for %s will update services',myJsonStop.zoneName)
          this.log.debug(myJsonStop)
          this.platform.updateService(irrigationSystemService,valveService,myJsonStop)
          }, runTime*1000)
      } else {
        // Turn off/stopping the valve
        this.log.info("Stopping Zone", valveService.getCharacteristic(Characteristic.Name).value);
        this.rachioapi.stopDevice (this.platform.token,device.id)
        irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.Active.INACTIVE)
        valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
        let myJsonStop={
          type: 'ZONE_STATUS',
          title: valveService.getCharacteristic(Characteristic.Name).value+' Stopped',
          deviceId: device.id,
					duration: Math.round((valveService.getCharacteristic(Characteristic.SetDuration).value-(Date.parse(this.platform.endTime[valveService.subtype])-Date.now())/1000)),
          zoneNumber: valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value,
          zoneId: valveService.getCharacteristic(Characteristic.SerialNumber).value,
          zoneName: valveService.getCharacteristic(Characteristic.Name).value,
          timestamp: new Date().toISOString(),
          summary: valveService.getCharacteristic(Characteristic.Name).value+' stopped watering at '+ new Date().toLocaleTimeString()+' for '+ valveService.getCharacteristic(Characteristic.SetDuration).value+ ' minutes',
          zoneRunState: 'STOPPED',
					duration: Math.round((valveService.getCharacteristic(Characteristic.SetDuration).value-(Date.parse(this.platform.endTime[valveService.subtype])-Date.now())/1000)/60),
					externalId: this.platform.webhook_key_local,
          timeForSummary: new Date().toLocaleTimeString(),
          subType: 'ZONE_STOPPED',
          endTime: new Date(Date.now()+valveService.getCharacteristic(Characteristic.SetDuration).value*1000).toISOString(),
          category: 'DEVICE',
          resourceType: 'DEVICE'
        }
      this.log.debug(myJsonStop)
      this.log.debug('Simulating webhook for %s will update services',myJsonStop.zoneName)
      this.platform.updateService(irrigationSystemService,valveService,myJsonStop)
      clearTimeout(this.platform.fakeWebhook)
      }
    callback()
  },

  setValveDuration(device, valveService, value, callback){
    // Set default duration from Homekit value
    valveService.getCharacteristic(Characteristic.SetDuration).updateValue(value)
    this.log.info("Set %s duration for %s mins", valveService.getCharacteristic(Characteristic.Name).value,value/60)
    callback()
  }

}

module.exports = irrigation