let RachioAPI = require('../rachioapi')

class skipSwitch {
	constructor(platform, log) {
		this.log = log
		this.platform = platform
		this.rachioapi = new RachioAPI(platform, log)
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

	configureSwitchService(device, switchService, baseStation) {
		// Configure Valve Service
		//this.log.info('Configured switch for %s', switchService.getCharacteristic(Characteristic.Name).value)
		switchService.getCharacteristic(Characteristic.On)
			.onGet(this.getSwitchValue.bind(this, device, switchService, baseStation))
			.onSet(this.setSwitchValue.bind(this, device, switchService, baseStation))
	}

	async setSwitchValue(device, switchService, baseStation, value) {
		if (switchService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
			throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE)
		}
		this.log.debug('toggle skip switch state %s', switchService.getCharacteristic(Characteristic.Name).value)
		let programs = await this.rachioapi.getValveDayViews(this.platform.token, baseStation.id).catch(err => {
			this.log.error('Failed to get daily view', err)
			throw err
		})
		let response
		programs.valveDayViews.forEach(day => {
			day.valveProgramRunSummaries.forEach(run => {
				run.valveRunSummaries.forEach(summary => {
					if(device.programId == run.programId){
						if(summary.skip?.manualOverrideTrigger == undefined){
							this.log.info('create skip')
							if(run.plannedRunId) {
								response = this.rachioapi.createSkip(this.platform.token, run.plannedRunId)
							}
							if (response?.status == 200) {
								switchService.getCharacteristic(Characteristic.On).updateValue(true)
							} else {
								switchService.getCharacteristic(Characteristic.On).updateValue(false)
							}
						} else {
							this.log.info('delete skip')
							if(run.plannedRunId){
								response = this.rachioapi.deleteSkip(this.platform.token, run.plannedRunId)
							}
							if (response?.status == 200) {
								switchService.getCharacteristic(Characteristic.On).updateValue(false)
							} else {
								switchService.getCharacteristic(Characteristic.On).updateValue(true)
							}
						}
					}
				})
			})
		})
		return
	}

	async getSwitchValue(device, switchService, baseStation) {
		let currentValue = switchService.getCharacteristic(Characteristic.On).value
		if (switchService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
			throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE)
		} else {
			let programs = await this.rachioapi.getValveDayViews(this.platform.token, baseStation.id).catch(err => {
			this.log.error('Failed to get daily view', err)
			throw err
		})
		programs.valveDayViews.forEach(day => {
			day.valveProgramRunSummaries.forEach(run => {
				run.valveRunSummaries.forEach(summary => {
					if(device.programId == run.programId){
						if (summary.skip?.manualOverrideTrigger == undefined){
							currentValue = false
						} else {
							currentValue = true
						}
					}
				})
			})
		})
		}
		return currentValue
	}
}
module.exports = skipSwitch
