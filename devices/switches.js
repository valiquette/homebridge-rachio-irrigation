let RachioAPI=require('../rachioapi')

function switches (platform,log){
	this.log=log
	this.platform=platform
	this.rachioapi=new RachioAPI(this,log)
}

switches.prototype={

	createScheduleSwitchService(schedule){
		// Create Valve Service
		this.log.debug("Created service for %s with id %s", schedule.name, schedule.id);
		let switchService=new Service.Switch(schedule.name, schedule.id)
		switchService.addCharacteristic(Characteristic.ConfiguredName)
		switchService.addCharacteristic(Characteristic.SerialNumber)
		switchService
			.setCharacteristic(Characteristic.On, false)
			.setCharacteristic(Characteristic.Name, schedule)
			.setCharacteristic(Characteristic.SerialNumber, schedule.id)
			.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
		return switchService
	},

	createSwitchService(device,switchName){
		// Create Valve Service
		this.log.debug('adding new switch')
		//let uuid=this.api.hap.uuid.generate(switchName)
		let uuid=UUIDGen.generate(switchName)
		let switchService=new Service.Switch(switchName, uuid)
		switchService.addCharacteristic(Characteristic.ConfiguredName)
		switchService
			.setCharacteristic(Characteristic.On, false)
			.setCharacteristic(Characteristic.Name, switchName)
			.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
		return switchService
	},

	configureSwitchService(device, switchService){
		// Configure Valve Service
		this.log.info("Configured switch for %s" ,switchService.getCharacteristic(Characteristic.Name).value)
		switchService
			.getCharacteristic(Characteristic.On)
			.on('get', this.getSwitchValue.bind(this, switchService))
			.on('set', this.setSwitchValue.bind(this, device, switchService))
	},

	setSwitchValue(device, switchService, value, callback){
		this.log.debug('toggle switch state %s',switchService.getCharacteristic(Characteristic.Name).value)
		switch(switchService.getCharacteristic(Characteristic.Name).value){
		case device.name+' Standby':
			if (switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
				callback('error')
			}
			else {
				if (!value){
				switchService.getCharacteristic(Characteristic.On).updateValue(true)
				this.rachioapi.deviceStandby (this.platform.token,device,'on')
				}
				else {
				switchService.getCharacteristic(Characteristic.On).updateValue(false)
				this.rachioapi.deviceStandby (this.platform.token,device,'off')
				}
				callback()
			}
		break
		case device.name+' Quick Run-All':
			if (switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
				callback('error')
			}
			else {
				if (value){
				switchService.getCharacteristic(Characteristic.On).updateValue(true)
				this.rachioapi.startMultipleZone (this.platform.token,device.zones,this.platform.defaultRuntime)
				}
				else {
				switchService.getCharacteristic(Characteristic.On).updateValue(false)
				this.rachioapi.stopDevice (this.platform.token,device.id)
				}
				callback()
			}
			break
		default:
			if (switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
				callback('error')
			}
			else {
				if (value){
				switchService.getCharacteristic(Characteristic.On).updateValue(true)
				this.rachioapi.startSchedule (this.platform.token,switchService.getCharacteristic(Characteristic.SerialNumber).value)
				}
				else {
				switchService.getCharacteristic(Characteristic.On).updateValue(false)
				this.rachioapi.stopDevice (this.platform.token,device.id)
				}
				callback()
			}
			break
		}
		},

	getSwitchValue(switchService, callback){
		//this.log.debug("%s = %s", switchService.getCharacteristic(Characteristic.Name).value,switchService.getCharacteristic(Characteristic.On))
		if (switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
		callback('error')
		}
		else {
		callback(null, switchService.getCharacteristic(Characteristic.On).value)
		}
	}
}

module.exports = switches