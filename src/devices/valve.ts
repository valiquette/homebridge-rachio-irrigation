
import { PlatformAccessory, Service, Characteristic, Logging, PlatformConfig, CharacteristicValue } from 'homebridge';
import RachioPlatform from '../rachioplatform.js';
import pkg from 'homebridge-rachio-irrigation/package.json' with { type: 'json' };
import RachioAPI from '../rachioapi.js';
import listen from '../listener.js';
import poll from '../polling.js';
import type { BaseStation, Property, Valve } from '../settings.js';

export default class valve {
	public readonly Service: typeof Service;
	public readonly Characteristic: typeof Characteristic;
	valves: Service[];
	constructor(
		private readonly platform: RachioPlatform,
		private readonly log: Logging = platform.log,
		private readonly config: PlatformConfig = platform.config,
		private rachioapi = new RachioAPI(platform),
		private listener = new listen(platform),
		private polling = new poll(platform),
	) {
		this.Service = platform.Service;
		this.Characteristic = platform.Characteristic;
		this.valves = [];
	}

	createValveAccessory(base: BaseStation, property: Property, valve: Valve, platformAccessory: PlatformAccessory) {
		if (!platformAccessory) {
			// Create new Valve System Service
			this.log.debug(`Create valve accessory ${valve.id} ${property.property.address.locality +' '+ valve.name}`);
			platformAccessory = new this.platform.api.platformAccessory(property.property.address.locality +' '+ valve.name, valve.id);
			const valveService: Service = platformAccessory.addService(this.Service.Valve, valve.id.replace(/-/g, ''), valve.id);
			valveService.addCharacteristic(this.Characteristic.SerialNumber); //Use Serial Number to store the zone id
			valveService.addCharacteristic(this.Characteristic.Model);
			valveService.addCharacteristic(this.Characteristic.ConfiguredName);
			valveService.addCharacteristic(this.Characteristic.ProgramMode);
		} else {
			// Update Valve System Service
			this.log.debug(`Update valve accessory ${valve.id} ${valve.name}`);
		}
		// Check if the valve is connected
		const valveService: Service = platformAccessory.getService(this.Service.Valve)!;
		if (valve.state.reportedState.connected == true) {
			valveService.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
		} else {
			this.log.warn(`${valve.name} disconnected at ${valve.state.reportedState.lastSeen}! This will show as non-responding in Homekit until the connection is restored.`);
			valveService.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.GENERAL_FAULT);
		}
		// Create AccessoryInformation Service
		platformAccessory.getService(this.Service.AccessoryInformation)!
			.setCharacteristic(this.Characteristic.Name, property.property.address.locality +' '+ valve.name)
			.setCharacteristic(this.Characteristic.Manufacturer, 'Rachio')
			.setCharacteristic(this.Characteristic.SerialNumber, base.serialNumber)
			.setCharacteristic(this.Characteristic.Model, 'SHVK001')
			.setCharacteristic(this.Characteristic.Identify, true)
			.setCharacteristic(this.Characteristic.FirmwareRevision, valve.state.reportedState.firmwareVersion)
			.setCharacteristic(this.Characteristic.HardwareRevision, base.macAddress)
			.setCharacteristic(this.Characteristic.SoftwareRevision, pkg.version)
			.setCharacteristic(this.Characteristic.ProductData, 'Valve');

		// Create Valve Service

		this.updateValveService(base, valve, valveService);
		this.configureValveService(valve, valveService);
		return platformAccessory;
	}

	updateValveService(base: BaseStation, valve: Valve, valveService: Service) {
		const pollValves = this.config.pollValves ? this.config.pollValves : false;
		if (pollValves) {
			this.log.warn('Polling for Hose Timers is enabled, try using webhooks');
		}
		let defaultRuntime = this.platform.defaultRuntime;
		valve.enabled = true; // need rachio valve version of enabled
		this.log.debug(`valve state ${valve}`);
		try {
			switch (this.platform.runtimeSource) {
			case 0:
				defaultRuntime = this.platform.defaultRuntime;
				break;
			case 1:
				if (valve.state.reportedState.defaultRuntimeSeconds > 0) {
					defaultRuntime = valve.state.desiredState.defaultRuntimeSeconds;
				}
				break;
			case 2:
				//if (valve.flow_data.cycle_run_time_sec > 0) { //can't find json value
				defaultRuntime = valve.state.desiredState.defaultRuntimeSeconds;
				//}
				break;
			default:
				defaultRuntime = this.platform.defaultRuntime;
				break;
			}
		} catch (err) {
			this.log.debug('Error setting runtime, using default runtime');
		}
		this.log.debug(`Created valve service for ${valve.name} with ${defaultRuntime} sec runtime (${Math.round(defaultRuntime / 60)} min)`);
		valveService
			.setCharacteristic(this.Characteristic.ValveType, this.platform.valveType)
			.setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.CONFIGURED)
			.setCharacteristic(this.Characteristic.ServiceLabelIndex, valve.zone)
			.setCharacteristic(this.Characteristic.StatusFault, !valve.state.reportedState.connected)
			.setCharacteristic(this.Characteristic.SerialNumber, valve.id)
			.setCharacteristic(this.Characteristic.Name, valve.name)
			.setCharacteristic(this.Characteristic.ConfiguredName, valve.name)
			.setCharacteristic(this.Characteristic.Model, 'SHV101');
		if (valve.state.reportedState.lastWateringAction) {
			const start = valve.state.reportedState.lastWateringAction.start;
			const duration = valve.state.reportedState.lastWateringAction.durationSeconds;
			const endTime = new Date(start).getTime() + duration * 1000;
			const remaining = Math.max(Math.round((endTime - Date.now()) / 1000), 0);
			this.platform.endTime[Number(valveService.getCharacteristic(this.Characteristic.SerialNumber).value)] = endTime;
			valveService
				.setCharacteristic(this.Characteristic.Active, this.Characteristic.Active.ACTIVE)
				.setCharacteristic(this.Characteristic.InUse, this.Characteristic.InUse.IN_USE)
				.setCharacteristic(this.Characteristic.SetDuration, duration)
				.setCharacteristic(this.Characteristic.RemainingDuration, remaining);
		} else {
			const start = Date.now();
			const duration = Math.ceil(defaultRuntime / 60) * 60;
			const endTime = new Date(start).getTime() + duration * 1000;
			const remaining = Math.max(Math.round((endTime - Date.now()) / 1000), 0);
			this.platform.endTime[Number(valveService.getCharacteristic(this.Characteristic.SerialNumber).value)] = endTime;
			valveService
				.setCharacteristic(this.Characteristic.Active, this.Characteristic.Active.INACTIVE)
				.setCharacteristic(this.Characteristic.InUse, this.Characteristic.InUse.NOT_IN_USE)
				.setCharacteristic(this.Characteristic.SetDuration, duration)
				.setCharacteristic(this.Characteristic.RemainingDuration, remaining);
		}
		if (valve.enabled) {
			valveService.setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.CONFIGURED);
		} else {
			valveService.setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.NOT_CONFIGURED);
		}
		return valveService;
	}

	configureValveService(valve: Valve, valveService: Service) {
		const zone_Number = valveService.getCharacteristic(this.Characteristic.ServiceLabelIndex).value;
		const zone_Name = valveService.getCharacteristic(this.Characteristic.Name).value;
		const zone_Runtime = Number(valveService.getCharacteristic(this.Characteristic.SetDuration).value) / 60;
		this.log.info(`Configured zone-${zone_Number} for ${zone_Name} with ${zone_Runtime} min runtime`);
		this.platform.valveServices.push(valveService);
		valveService.getCharacteristic(this.Characteristic.Active)
			.onGet(this.getValveValue.bind(this, valveService, 'ValveActive'))
			.onSet(this.setValveValue.bind(this, valve, valveService));
		valveService.getCharacteristic(this.Characteristic.InUse)
			.onGet(this.getValveValue.bind(this, valveService, 'ValveInUse'))
			.onSet(this.setValveValue.bind(this, valve, valveService));
		valveService.getCharacteristic(this.Characteristic.SetDuration)
			.onGet(this.getValveValue.bind(this, valveService, 'ValveSetDuration'))
			.onSet(this.setValveSetDuration.bind(this, valve, valveService));
		valveService.getCharacteristic(this.Characteristic.RemainingDuration)
			.onGet(this.getValveValue.bind(this, valveService, 'ValveRemainingDuration'));
	}

	getValveValue(valveService: Service, characteristicName: string) {
		//this.log.debug(`value ${valveService.getCharacteristic(this.Characteristic.Name).value} ${characteristicName}`)
		if (valveService.getCharacteristic(this.Characteristic.StatusFault).value == this.Characteristic.StatusFault.GENERAL_FAULT) {
			throw new this.platform.HapStatusError(this.platform.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		}
		let currentValue = null;
		const pollValves = this.config.pollValves ? this.config.pollValves : false;
		switch (characteristicName) {
		case 'ValveActive':
			if (pollValves) {
				this.polling.startLiveUpdate(valveService);
			}
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
			const index = this.platform.valveServices.findIndex(valve => valve.subtype === valveService.subtype);
			const timeEnding = Date.parse(this.platform.endTime[index]);
			const timeNow = Date.now();
			let timeRemaining = Math.max(Math.round((timeEnding - timeNow) / 1000), 0);
			if (isNaN(timeRemaining)) {
				timeRemaining = 0;
			}
			//valveService.getCharacteristic(this.Characteristic.RemainingDuration).updateValue(timeRemaining)
			currentValue = timeRemaining;
			break;
		 }
		default:
			this.log.debug('Unknown Valve Characteristic Name called', characteristicName);
			break;
		}
		return currentValue;
	}

	async setValveValue(valve: Valve, valveService: Service, value: CharacteristicValue) {
		this.log.debug(`${valveService.getCharacteristic(this.Characteristic.Name).value} - Set Active state to ${value}`);
		if (value == valveService.getCharacteristic(this.Characteristic.Active).value) {
			//IOS 17 bug fix for duplicate calls
			this.log.debug(`supressed duplicate call from IOS for ${valveService.getCharacteristic(this.Characteristic.Name).value}, current value ${value}, new value ${valveService.getCharacteristic(this.Characteristic.Active).value}`);
			return;
		}
		// Set homekit state and prepare message for rachio API
		const runTime = Number(valveService.getCharacteristic(this.Characteristic.SetDuration).value);
		let response;
		switch (value) {
		case this.Characteristic.Active.ACTIVE:
			// Turn on/idle the valve
			this.log.info(`Starting ${valveService.getCharacteristic(this.Characteristic.Name).value} valve for ${runTime / 60} mins`);
			response = await this.rachioapi.startWatering(this.platform.token, valve.id, runTime);
			if (response?.status == 200) {
				//json start stuff
				const myJsonStart = {
					eventId: '53936ce8-299a-3a02-9f8a-754a55291333',
					eventType: 'VALVE_RUN_START_EVENT',
					externalId: this.platform.webhook_key_local,
					payload: {
						durationSeconds: valveService.getCharacteristic(this.Characteristic.SetDuration).value,
						flowDetected: false,
						runType: 'QUICK_RUN',
						startTime:  new Date().toISOString().split('.')[0] + 'Z',
					},
					resourceId: valve.id,
					resourceType: 'VALVE',
					timestamp: new Date().toISOString().split('.')[0] + 'Z',
				};
				const myJsonStop = {
					eventId: '6defa6ff-a169-3477-aa57-3c028455387d',
					eventType: 'VALVE_RUN_END_EVENT',
					externalId: this.platform.webhook_key_local,
					payload: {
						durationSeconds: Math.round(Number(valveService.getCharacteristic(this.Characteristic.SetDuration).value)),
						endReason: 'COMPLETED',
						flowDetected: false,
						runType: 'QUICK_RUN',
						startTime: new Date().toISOString().split('.')[0] + 'Z',
					},
					resourceId: valve.id,
					resourceType: 'VALVE',
					timestamp: new Date().toISOString().split('.')[0] + 'Z',
				};
				this.log.debug(`Simulating websocket event for ${myJsonStart.resourceId}`);
				this.listener.localMessage(null, valveService, myJsonStart );
				this.platform.localWebhook = setTimeout(() => {
					this.log.debug(`Simulating websocket event for ${myJsonStop.resourceId}`);
					this.platform.endTime[Number(valveService.getCharacteristic(this.Characteristic.SerialNumber).value)] = new Date(Date.now()).toISOString();
					this.listener.localMessage(null, valveService, myJsonStop );
				}, runTime * 1000);
			}
			break;
		case this.Characteristic.Active.INACTIVE:
			// Turn off/stopping the valve
			this.log.info(`Stopping Zone ${valveService.getCharacteristic(this.Characteristic.Name).value}`);
			response = await this.rachioapi.stopWatering(this.platform.token, valve.id);
			if (response?.status == 200) {
				//json stop stuff
				const myJsonStop = {
					eventId: '6defa6ff-a169-3477-aa57-3c028455387d',
					eventType: 'VALVE_RUN_END_EVENT',
					externalId: this.platform.webhook_key_local,
					payload: {
						durationSeconds: Math.round(Number(valveService.getCharacteristic(this.Characteristic.SetDuration).value) - (Date.parse(this.platform.endTime[Number(valveService.subtype)]) - Date.now()) / 1000),
						endReason: 'COMPLETED',
						flowDetected: false,
						runType: 'QUICK_RUN',
						startTime:  new Date().toISOString().split('.')[0] + 'Z',
					},
					resourceId: valve.id,
					resourceType: 'VALVE',
					timestamp: new Date().toISOString().split('.')[0] + 'Z',
				};
				this.log.debug(`Simulating websocket event for ${myJsonStop.resourceId}`);
				this.listener.localMessage(null, valveService, myJsonStop );
				clearTimeout(this.platform.localWebhook);
			} else {
				this.log.info('Failed to stop valve');
			}
			break;
		}
		return;
	}

	setValveSetDuration(valve: Valve, valveService: Service, value: CharacteristicValue) {
		// Set default duration from Homekit value
		valveService.getCharacteristic(this.Characteristic.SetDuration).updateValue(value);
		this.log.debug(`Set ${valve.name} duration for ${Number(value) / 60} mins`);
		this.log.info(`Set ${valveService.getCharacteristic(this.Characteristic.Name).value} duration for ${Number(value) / 60} mins`);
		return;
	}
}
