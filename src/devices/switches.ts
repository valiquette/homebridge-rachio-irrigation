
import { Service, Characteristic, Logging, PrimitiveTypes } from 'homebridge';
import RachioPlatform from '../rachioplatform.js';
import RachioAPI from '../rachioapi.js';
import type { Controller, Schedule } from '../settings.js';

export default class switches {
	public readonly Service: typeof Service;
	public readonly Characteristic: typeof Characteristic;
	constructor(
			private readonly platform: RachioPlatform,
			private readonly log: Logging = platform.log,
			private rachioapi = new RachioAPI(platform),
	) {
		this.Service = platform.Service;
		this.Characteristic = platform.Characteristic;
	}

	createScheduleSwitchService(schedule: Schedule) {
		// Create Valve Service
		this.log.debug(`Created service for ${schedule.name} with id ${schedule.id}`);
		const switchService: Service = new this.Service.Switch(schedule.name, schedule.id);
		switchService.addCharacteristic(this.Characteristic.ConfiguredName);
		switchService.addCharacteristic(this.Characteristic.SerialNumber);
		switchService
			.setCharacteristic(this.Characteristic.On, false)
			.setCharacteristic(this.Characteristic.Name, schedule.name)
			.setCharacteristic(this.Characteristic.ConfiguredName, schedule.name)
			.setCharacteristic(this.Characteristic.SerialNumber, schedule.id)
			.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
		return switchService;
	}

	createSwitchService(switchName: string, uuid: string) {
		// Create Valve Service
		this.log.debug('adding new switch');
		const switchService: Service = new this.Service.Switch(switchName, uuid);
		switchService.addCharacteristic(this.Characteristic.ConfiguredName);
		switchService
			.setCharacteristic(this.Characteristic.On, false)
			.setCharacteristic(this.Characteristic.Name, switchName)
			.setCharacteristic(this.Characteristic.ConfiguredName, switchName)
			.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
		return switchService;
	}

	configureSwitchService(device: Controller, switchService: Service) {
		// Configure Valve Service
		this.log.info(`Configured switch for ${switchService.getCharacteristic(this.Characteristic.Name).value}`);
		switchService.getCharacteristic(this.Characteristic.On)
			.onGet(this.getSwitchValue.bind(this, switchService))
			.onSet(this.setSwitchValue.bind(this, device, switchService));
	}

	async setSwitchValue(device: Controller, switchService: Service, value: string | number | boolean | PrimitiveTypes[] | { [key: string]: PrimitiveTypes; }) {
		if (switchService.getCharacteristic(this.Characteristic.StatusFault).value == this.Characteristic.StatusFault.GENERAL_FAULT) {
			throw new this.platform.HapStatusError(this.platform.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		}
		this.log.debug(`toggle switch state ${switchService.getCharacteristic(this.Characteristic.Name).value}`);
		let response;
		switch (switchService.getCharacteristic(this.Characteristic.Name).value) {
		case device.name + ' Standby':
			if (value == false) {
				response = await this.rachioapi.deviceStandby(this.platform.token, device, 'on');
				if (response?.status == 204) {
					switchService.getCharacteristic(this.Characteristic.On).updateValue(value);
				}
			} else if (value == true) {
				response = await this.rachioapi.deviceStandby(this.platform.token, device, 'off');
				if (response?.status == 204) {
					switchService.getCharacteristic(this.Characteristic.On).updateValue(value);
				}
			}
			break;
		case device.name + ' Quick Run All':
			if (value) {
				let completeRun = 0;
				let completeRunZone = 0;
				let x;  // eslint-disable-line prefer-const
				device.zones.forEach((zone) =>{
					completeRun = completeRun + this.platform.defaultRuntime;
					completeRunZone = completeRunZone + zone.runtime;
				});
				clearTimeout(x);
				x = setTimeout(() => { // eslint-disable-line no-useless-assignment
					switchService.getCharacteristic(this.Characteristic.On).updateValue(false);
					this.log.info(`Quick Run All finished, completed after ${completeRun/60} minutes`);
				}, completeRun*1000);

				response = await this.rachioapi.startMultipleZone(this.platform.token, device.zones, this.platform.defaultRuntime);
				if (response?.status == 204) {
					switchService.getCharacteristic(this.Characteristic.On).updateValue(value);
				}
			} else {
				response = await this.rachioapi.stopDevice(this.platform.token, device.id);
				if (response?.status == 204) {
					switchService.getCharacteristic(this.Characteristic.On).updateValue(value);
				}
			}
			break;
		default: //using scheule names
			if (value) {
				response = await this.rachioapi.startSchedule(this.platform.token, switchService.getCharacteristic(this.Characteristic.SerialNumber).value);
				if (response?.status == 204) {
					switchService.getCharacteristic(this.Characteristic.On).updateValue(true);
				}
			} else {
				response = await this.rachioapi.stopDevice(this.platform.token, device.id);
				if (response?.status == 204) {
					switchService.getCharacteristic(this.Characteristic.On).updateValue(false);
				}
			}
			break;
		}
	}

	getSwitchValue(switchService: Service) {
		let currentValue;
		if (switchService.getCharacteristic(this.Characteristic.StatusFault).value == this.Characteristic.StatusFault.GENERAL_FAULT) {
			throw new this.platform.HapStatusError(this.platform.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		} else {
			currentValue = switchService.getCharacteristic(this.Characteristic.On).value;
		}
		return currentValue;
	}
}
