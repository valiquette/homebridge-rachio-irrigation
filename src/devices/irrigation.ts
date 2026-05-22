
import pkg from 'homebridge-rachio-irrigation/package.json' with { type: 'json' };
import { PlatformAccessory, Service, Characteristic, Logging, CharacteristicValue } from 'homebridge';
import RachioPlatform from '../rachioplatform.js';
import RachioAPI from '../rachioapi.js';
import listen from '../listener.js';
import type { Controller, Zone } from '../settings.js';

export default class irrigation {
	public readonly Service: typeof Service;
	public readonly Characteristic: typeof Characteristic;
	constructor(
			private readonly platform: RachioPlatform,
			private readonly log: Logging = platform.log,
			private rachioapi = new RachioAPI(platform),
			private listener = new listen(platform),
	) {
		this.Service = platform.Service;
		this.Characteristic = platform.Characteristic;
	}

	createIrrigationAccessory(device: Controller, deviceState: { state: { state: string; desiredState: string; firmwareVersion: string; health: string; }; }, platformAccessory: PlatformAccessory) {
		if (!platformAccessory) {
			// Create new Irrigation System Service
			this.log.debug('Create Irrigation device %s', device.id, device.name);
			platformAccessory = new this.platform.api.platformAccessory(device.name, device.id);
			platformAccessory.addService(this.Service.IrrigationSystem, device.name);
		} else {
			// Update Irrigation System Service
			this.log.debug('Update Irrigation device %s %s', device.id, device.name);
		}
		// Check if the device is connected
		const irrigationSystemService: Service = platformAccessory.getService(this.Service.IrrigationSystem)!;
		if (device.status == 'ONLINE') {
			irrigationSystemService.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
		} else {
			irrigationSystemService.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.GENERAL_FAULT);
		}
		// Create AccessoryInformation Service
		platformAccessory.getService(this.Service.AccessoryInformation)!
			.setCharacteristic(this.Characteristic.Name, device.name)
			.setCharacteristic(this.Characteristic.Manufacturer, 'Rachio')
			.setCharacteristic(this.Characteristic.SerialNumber, device.serialNumber)
			.setCharacteristic(this.Characteristic.Model, device.model)
			.setCharacteristic(this.Characteristic.Identify, true)
			.setCharacteristic(this.Characteristic.FirmwareRevision, deviceState.state.firmwareVersion)
			.setCharacteristic(this.Characteristic.HardwareRevision, 'Rev-2')
			.setCharacteristic(this.Characteristic.SoftwareRevision, pkg.version);
		this.configureIrrigationService(device, irrigationSystemService);
		return platformAccessory;
	}

	configureIrrigationService(device: Controller, irrigationSystemService: Service) {
		this.log.info('Configure Irrigation system for %s', irrigationSystemService.getCharacteristic(this.Characteristic.Name).value);
		// Configure IrrigationSystem Service
		irrigationSystemService
			.setCharacteristic(this.Characteristic.Active, this.Characteristic.Active.ACTIVE)
			.setCharacteristic(this.Characteristic.InUse, this.Characteristic.InUse.NOT_IN_USE)
			.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT)
			.setCharacteristic(this.Characteristic.RemainingDuration, 0);
		// Check if the device is connected
		switch (device.status) {
		case 'ONLINE':
			//irrigationSystemService.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT)
			break;
		case 'OFFLINE':
			//irrigationSystemService.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.GENERAL_FAULT)
			break;
		}
		switch (device.scheduleModeType) {
		case 'OFF':
			irrigationSystemService.setCharacteristic(this.Characteristic.ProgramMode, this.Characteristic.ProgramMode.NO_PROGRAM_SCHEDULED);
			break;
		case 'SCHEDULED':
			irrigationSystemService.setCharacteristic(this.Characteristic.ProgramMode, this.Characteristic.ProgramMode.PROGRAM_SCHEDULED);
			break;
		case 'MANUAL':
			irrigationSystemService.setCharacteristic(this.Characteristic.ProgramMode, this.Characteristic.ProgramMode.PROGRAM_SCHEDULED_MANUAL_MODE);
			break;
		default:
			this.log.info('Failed to retrieve program mode setting a default value. Retrieved-', device.scheduleModeType);
			irrigationSystemService.setCharacteristic(this.Characteristic.ProgramMode, this.Characteristic.ProgramMode.PROGRAM_SCHEDULED_MANUAL_MODE);
			break;
		}
		irrigationSystemService.getCharacteristic(this.Characteristic.Active).onGet(this.getDeviceValue.bind(this, irrigationSystemService, 'DeviceActive'));
		irrigationSystemService.getCharacteristic(this.Characteristic.InUse).onGet(this.getDeviceValue.bind(this, irrigationSystemService, 'DeviceInUse'));
		irrigationSystemService.getCharacteristic(this.Characteristic.ProgramMode).onGet(this.getDeviceValue.bind(this, irrigationSystemService, 'DeviceProgramMode'));
	}

	createValveService(device: Controller, zone: Zone ) {
		// Create Valve Service
		const valve: Service = new this.Service.Valve(zone.name, zone.id);
		let defaultRuntime = this.platform.defaultRuntime;
		try {
			switch (this.platform.runtimeSource) {
			case 0:
				defaultRuntime = this.platform.defaultRuntime;
				break;
			case 1:
				if (zone.fixedRuntime > 0) {
					defaultRuntime = zone.fixedRuntime;
				}
				break;
			case 2:
				if (zone.runtime > 0) {
					defaultRuntime = zone.runtime;
				}
				break;
			}
		} catch (err) {
			this.log.debug('no smart runtime found, using default runtime');
		}
		this.log.debug('Created controller valve service for %s with id %s with %s min runtime', zone.name, zone.id, Math.round(defaultRuntime / 60));
		valve.addCharacteristic(this.Characteristic.SerialNumber); //Use Serial Number to store the zone id
		valve.addCharacteristic(this.Characteristic.Model);
		valve.addCharacteristic(this.Characteristic.ConfiguredName);
		valve.getCharacteristic(this.Characteristic.SetDuration).setProps({
			minValue: 0,
			maxValue: 64800,
		});
		valve.getCharacteristic(this.Characteristic.RemainingDuration).setProps({
			minValue: 0,
			maxValue: 64800,
		});
		valve
			.setCharacteristic(this.Characteristic.Active, this.Characteristic.Active.INACTIVE)
			.setCharacteristic(this.Characteristic.InUse, this.Characteristic.InUse.NOT_IN_USE)
			.setCharacteristic(this.Characteristic.ValveType, this.Characteristic.ValveType.IRRIGATION)
			.setCharacteristic(this.Characteristic.SetDuration, Math.round(defaultRuntime / 60) * 60)
			.setCharacteristic(this.Characteristic.RemainingDuration, 0)
			.setCharacteristic(this.Characteristic.ServiceLabelIndex, zone.zoneNumber)
			.setCharacteristic(this.Characteristic.SerialNumber, zone.id)
			.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT)
			.setCharacteristic(this.Characteristic.Name, zone.name)
			.setCharacteristic(this.Characteristic.ConfiguredName, zone.name)
			.setCharacteristic(this.Characteristic.Model, zone.customNozzle.name);
		if (zone.enabled) {
			valve.setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.CONFIGURED);
		} else {
			valve.setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.NOT_CONFIGURED);
		}
		this.updateValveService(device, zone, valve);
		this.configureValveService(device, valve);
		return valve;
	}

	configureValveService(device: Controller, valveService: Service) {
		this.log.info(
			'Configured irrigation zone-%s for %s with %s min runtime',
			valveService.getCharacteristic(this.Characteristic.ServiceLabelIndex).value,
			valveService.getCharacteristic(this.Characteristic.Name).value,
			Number(valveService.getCharacteristic(this.Characteristic.SetDuration).value) / 60,
		);
		// Configure Valve Service
		valveService.getCharacteristic(this.Characteristic.Active)
			.onGet(this.getValveValue.bind(this, valveService, 'ValveActive'))
			.onSet(this.setValveValue.bind(this, device, valveService));
		valveService.getCharacteristic(this.Characteristic.InUse)
			.onGet(this.getValveValue.bind(this, valveService, 'ValveInUse'))
			.onSet(this.setValveValue.bind(this, device, valveService));
		valveService.getCharacteristic(this.Characteristic.SetDuration)
			.onGet(this.getValveValue.bind(this, valveService, 'ValveSetDuration'))
			.onSet(this.setValveSetDuration.bind(this, device, valveService));
		valveService.getCharacteristic(this.Characteristic.RemainingDuration)
			.onGet(this.getValveValue.bind(this, valveService, 'ValveRemainingDuration'));
	}

	updateValveService(device: Controller, zone: Zone, valveService: Service) {
		if (valveService) {
			let defaultRuntime: number = this.platform.defaultRuntime;
			try {
				switch (this.platform.runtimeSource) {
				case 0:
					defaultRuntime = this.platform.defaultRuntime;
					break;
				case 1:
					if (zone.fixedRuntime > 0) {
						defaultRuntime = zone.fixedRuntime;
					}
					break;
				case 2:
					if (zone.runtime > 0) {
						defaultRuntime = zone.runtime;
					}
					break;
				}
			} catch (err) {
				this.log.debug('no smart runtime found, using default runtime');
			}
			this.log.debug('Created valve service for %s with %s sec runtime (%s min)', device.name, defaultRuntime, Math.round(defaultRuntime / 60));
			valveService
				.setCharacteristic(this.Characteristic.Active, this.Characteristic.Active.INACTIVE)
				.setCharacteristic(this.Characteristic.InUse, this.Characteristic.InUse.NOT_IN_USE)
				.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT)
				.setCharacteristic(this.Characteristic.Name, zone.name)
				.setCharacteristic(this.Characteristic.ConfiguredName, zone.name)
				.setCharacteristic(this.Characteristic.Model, zone.customNozzle.name)
				.setCharacteristic(this.Characteristic.SetDuration, Math.round(defaultRuntime / 60) * 60);

			if (zone.enabled) {
				valveService.setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.CONFIGURED);
			} else {
				valveService.setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.NOT_CONFIGURED);
			}
			return valveService;
		}
	}

	getDeviceValue(irrigationSystemService: Service, characteristicName: string) {
		if (irrigationSystemService.getCharacteristic(this.Characteristic.StatusFault).value == this.Characteristic.StatusFault.GENERAL_FAULT) {
			throw new this.platform.HapStatusError(this.platform.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		}
		let currentValue = null;
		switch (characteristicName) {
		case 'DeviceActive':
			currentValue = irrigationSystemService.getCharacteristic(this.Characteristic.Active).value;
			break;
		case 'DeviceInUse':
			currentValue = irrigationSystemService.getCharacteristic(this.Characteristic.InUse).value;
			break;
		case 'DeviceProgramMode':
			currentValue = irrigationSystemService.getCharacteristic(this.Characteristic.ProgramMode).value;
			break;
		default:
			this.log.debug('Unknown Device CharacteristicName called', characteristicName);
			break;
		}
		return currentValue;
	}

	getValveValue(valveService: Service, characteristicName: CharacteristicValue) {
		if (valveService.getCharacteristic(this.Characteristic.StatusFault).value == this.Characteristic.StatusFault.GENERAL_FAULT) {
			throw new this.platform.HapStatusError(this.platform.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		}
		let currentValue = null;
		switch (characteristicName) {
		case 'ValveActive':
			currentValue = valveService.getCharacteristic(this.Characteristic.Active).value;
			break;
		case 'ValveInUse':
			currentValue = valveService.getCharacteristic(this.Characteristic.InUse).value;
			break;
		case 'ValveSetDuration':
			currentValue = valveService.getCharacteristic(this.Characteristic.SetDuration).value;
			break;
		case 'ValveRemainingDuration': {
			// Calc remain duration
			const timeEnding = Date.parse(this.platform.endTime[Number(valveService.subtype)]);
			const timeNow = Date.now();
			let timeRemaining = Math.max(Math.round((timeEnding - timeNow) / 1000), 0);
			if (isNaN(timeRemaining)) {
				timeRemaining = 0;
			}
			currentValue = timeRemaining;
			break;
		}
		default:
			this.log.debug('Unknown CharacteristicName called', characteristicName);
			break;
		}
		return currentValue;
	}

	async setValveValue(device: Controller, valveService: Service, value: CharacteristicValue) {
		//this.log.debug('%s - Set Active state to %s', valveService.getCharacteristic(this.Characteristic.Name).value, value)
		if (valveService.getCharacteristic(this.Characteristic.StatusFault).value == this.Characteristic.StatusFault.GENERAL_FAULT) {
			throw new this.platform.HapStatusError(this.platform.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		}
		if (value == valveService.getCharacteristic(this.Characteristic.Active).value) {
			//IOS 17 bug fix for duplicate calls
			this.log.debug('supressed duplicate call from IOS for %s, current value %s, new value %s', valveService.getCharacteristic(this.Characteristic.Name).value, value, valveService.getCharacteristic(this.Characteristic.Active).value);
			return;
		}
		const index: number = this.platform.accessories.findIndex(accessory => accessory.UUID === device.id);
		const irrigationAccessory: PlatformAccessory = this.platform.accessories[index];
		const irrigationSystemService = irrigationAccessory.getService(this.Service.IrrigationSystem);
		// Set homekit state and prepare message for Rachio API
		const runTime = Number(valveService.getCharacteristic(this.Characteristic.SetDuration).value);
		let response;
		switch (value) {
		case this.Characteristic.Active.ACTIVE:
			this.log.info('Starting zone-%s %s for %s mins', valveService.getCharacteristic(this.Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(this.Characteristic.Name).value, runTime / 60);
			response = await this.rachioapi.startZone(this.platform.token, valveService.getCharacteristic(this.Characteristic.SerialNumber).value, runTime);
			if (response?.status == 204) {
				const myZoneStart: any = {
					eventId: 'f2d29dab-811c-34d4-8979-b464f38380a3',
					eventType: 'DEVICE_ZONE_RUN_STARTED_EVENT',
					externalId: this.platform.webhook_key_local,
					payload: {
						durationSeconds: valveService.getCharacteristic(this.Characteristic.SetDuration).value,
						endTime: new Date(Date.now() + Number(valveService.getCharacteristic(this.Characteristic.SetDuration).value) * 1000).toISOString(),
						flowVolumeG: '0.0',
						runType: 'MANUAL',
						startTime: new Date().toISOString(),
						zoneNumber: valveService.getCharacteristic(this.Characteristic.ServiceLabelIndex).value,
					},
					resourceId: device.id,
					resourceType: 'IRRIGATION_CONTROLLER',
					timestamp: new Date().toLocaleTimeString(),
				};
				const myZoneStop: any = {
					eventId: 'c55fe382-9aad-310d-beb4-652542deea89',
					eventType: 'DEVICE_ZONE_RUN_COMPLETED_EVENT',
					externalId: this.platform.webhook_key_local,
					payload: {
						durationSeconds: Math.round(Number(valveService.getCharacteristic(this.Characteristic.SetDuration).value)),
						endTime: new Date(Date.now() + Number(valveService.getCharacteristic(this.Characteristic.SetDuration).value) * 1000).toISOString(),
						flowVolumeG: '0.0',
						runType: 'MANUAL',
						startTime: new Date().toISOString(),
						zoneNumber: valveService.getCharacteristic(this.Characteristic.ServiceLabelIndex).value,
					},
					resourceId: device.id,
					resourceType: 'IRRIGATION_CONTROLLER',
					timestamp: new Date().toISOString(),
				};
				this.log.debug('Simulating webhook for zone %s will update services', myZoneStart.payload.zoneNumber);
				if (this.platform.showWebhookMessages) {
					this.log.debug('webhook sent from <%s> %s', this.platform.webhook_key_local, JSON.stringify(myZoneStart, null, 2));
				}
				this.listener.localMsg2(irrigationSystemService, valveService, myZoneStart);
				this.platform.localWebhook = setTimeout(() => {
					this.log.debug('Simulating webhook for zone %s will update services', myZoneStop.payload.zoneNumber);
					if (this.platform.showWebhookMessages) {
						this.log.debug('webhook sent from <%s> %s', this.platform.webhook_key_local, JSON.stringify(myZoneStop, null, 2));
					}
					this.listener.localMsg2(irrigationSystemService, valveService, myZoneStop);
				}, runTime * 1000);
			} else {
				this.log.info('Failed to start valve');
			}
			break;
		case this.Characteristic.Active.INACTIVE:
			// Turn off/stopping the valve
			this.log.info('Stopping zone-%s %s', valveService.getCharacteristic(this.Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(this.Characteristic.Name).value);
			response = await this.rachioapi.stopDevice(this.platform.token, device.id);
			if (response?.status == 204) {
				const myZoneStop: any = {
					eventId: 'c55fe382-9aad-310d-beb4-652542deea89',
					eventType: 'DEVICE_ZONE_RUN_STOPPED_EVENT',
					externalId: this.platform.webhook_key_local,
					payload: {
						durationSeconds: Math.round(Number(valveService.getCharacteristic(this.Characteristic.SetDuration).value) - (Date.parse(this.platform.endTime[Number(valveService.subtype)]) - Date.now()) / 1000),
						endTime: new Date(Date.now() + Number(valveService.getCharacteristic(this.Characteristic.SetDuration).value) * 1000).toISOString(),
						flowVolumeG: '0.0',
						runType: 'MANUAL',
						startTime: new Date().toISOString(),
						zoneNumber: valveService.getCharacteristic(this.Characteristic.ServiceLabelIndex).value,
					},
					resourceId: device.id,
					resourceType: 'IRRIGATION_CONTROLLER',
					timestamp: new Date().toISOString(),
				};
				this.log.debug('Simulating webhook for zone %s will update services', myZoneStop.payload.zoneNumber);
				if (this.platform.showWebhookMessages) {
					this.log.debug('webhook sent from <%s> %s', this.platform.webhook_key_local, JSON.stringify(myZoneStop, null, 2));
				}
				this.listener.localMsg2(irrigationSystemService, valveService, myZoneStop);
				clearTimeout(this.platform.localWebhook);
			} else {
				this.log.info('Failed to stop zone');
			}
			break;
		}
		return;
	}

	setValveSetDuration(device: Controller, valveService: Service, value: CharacteristicValue) {
		// Set default duration from Homekit value
		valveService.getCharacteristic(this.Characteristic.SetDuration).updateValue(value);
		this.log.debug('Set %s duration for %s mins', device.name, Number(value) / 60);
		this.log.info('Set %s duration for %s mins', valveService.getCharacteristic(this.Characteristic.Name).value, Number(value) / 60);
		return;
	}
}