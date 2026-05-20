/* eslint-disable @typescript-eslint/no-explicit-any */
import { PlatformAccessory, Service, Characteristic, Logging, PlatformConfig } from 'homebridge';
import RachioPlatform from '../rachioplatform.js';
import pkg from 'homebridge-rachio-irrigation/package.json' with { type: 'json' };
import RachioAPI from '../rachioapi.js';
import listen from '../listener.js';
import poll from '../polling.js';

export default class valve {
	public readonly Service: typeof Service;
	public readonly Characteristic: typeof Characteristic;
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
	}

	createValveAccessory(base: any, property: any, valve: any, platformAccessory: PlatformAccessory) {
		if (!platformAccessory) {
			// Create new Valve System Service
			this.log.debug('Create valve accessory %s %s', valve.id, property.address.locality +' '+ valve.name);
			platformAccessory = new this.platform.api.platformAccessory(property.address.locality +' '+ valve.name, valve.id);
			const valveService: any = platformAccessory.addService(this.Service.Valve, valve.id.replace(/-/g, ''), valve.id);
			valveService.addCharacteristic(this.Characteristic.SerialNumber); //Use Serial Number to store the zone id
			valveService.addCharacteristic(this.Characteristic.Model);
			valveService.addCharacteristic(this.Characteristic.ConfiguredName);
			valveService.addCharacteristic(this.Characteristic.ProgramMode);
		} else {
			// Update Valve System Service
			this.log.debug('Update valve accessory %s %s', valve.id, valve.name);
		}
		// Check if the valve is connected
		const valveService: any = platformAccessory.getService(this.Service.Valve);
		if (valve.state.reportedState.connected == true) {
			valveService.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
		} else {
			this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.', valve.name, valve.state.reportedState.lastSeen);
			valveService.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.GENERAL_FAULT);
		}
		// Create AccessoryInformation Service
		platformAccessory.getService(this.Service.AccessoryInformation)!
			.setCharacteristic(this.Characteristic.Name, property.address.locality +' '+ valve.name)
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
		this.configureValveService(valve, platformAccessory.getService(this.Service.Valve));
		return platformAccessory;
	}

	updateValveService(base: any, valve: any, valveService: any) { /// check base changed to device
		const pollValves = this.config.pollValves ? this.config.pollValves : false;
		if (pollValves) {
			this.log.warn('Polling for Hose Timers is enabled');
		}
		let defaultRuntime = this.platform.defaultRuntime;
		valve.enabled = true; // need rachio valve version of enabled
		this.log.debug(valve);
		try {
			switch (this.platform.runtimeSource) {
			case 0:
				defaultRuntime = this.platform.defaultRuntime;
				break;
			case 1:
				if (base.state.defaultRunTimeSeconds > 0) {
					defaultRuntime = base.state.desiredState.defaultRuntimeSeconds;
				}
				break;
			case 2:
				if (valve.flow_data.cycle_run_time_sec > 0) {
					defaultRuntime = base.state.desiredState.defaultRuntimeSeconds;
				}
				break;
			default:
				defaultRuntime = this.platform.defaultRuntime;
				break;
			}
		} catch (err) {
			this.log.debug('error setting runtime, using default runtime');
		}
		this.log.debug('Created valve service for %s with %s sec runtime (%s min)', valve.name, defaultRuntime, Math.round(defaultRuntime / 60));
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
			this.platform.endTime[valveService.getCharacteristic(this.Characteristic.SerialNumber).value] = endTime;
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
			this.platform.endTime[valveService.getCharacteristic(this.Characteristic.SerialNumber).value] = endTime;
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

	configureValveService(device: any, valveService: any) {
		this.log.info(
			'Configured zone-%s for %s with %s min runtime',
			valveService.getCharacteristic(this.Characteristic.ServiceLabelIndex).value,
			valveService.getCharacteristic(this.Characteristic.Name).value,
			valveService.getCharacteristic(this.Characteristic.SetDuration).value / 60,
		);
		valveService.getCharacteristic(this.Characteristic.Active)
			.onGet(this.getValveValue.bind(this, valveService, 'ValveActive'))
			.onSet(this.setValveValue.bind(this, device, valveService));
		valveService.getCharacteristic(this.Characteristic.InUse)
			.onGet(this.getValveValue.bind(this, valveService, 'ValveInUse'))
			.onSet(this.setValveValue.bind(this, device, valveService));
		valveService.getCharacteristic(this.Characteristic.SetDuration)
			.onGet(this.getValveValue.bind(this, valveService, 'ValveSetDuration'))
			.onSet(this.setValveSetDuration.bind(this, valveService));
		valveService.getCharacteristic(this.Characteristic.RemainingDuration)
			.onGet(this.getValveValue.bind(this, valveService, 'ValveRemainingDuration'));
	}

	getValveValue(valveService: any, characteristicName: any) {
		//this.log.debug('value', valveService.getCharacteristic(this.Characteristic.Name).value, characteristicName)
		if (valveService.getCharacteristic(this.Characteristic.StatusFault).value == this.Characteristic.StatusFault.GENERAL_FAULT) {
			throw new this.platform.HapStatusError(this.platform.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		}
		let currentValue;
		const pollValves = this.config.pollValves ? this.config.pollValves : false;
		switch (characteristicName) {
		case 'ValveActive':
			//this.polling.startLiveUpdate(valveService) ///disabled for webhooks
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
			const timeEnding = Date.parse(this.platform.endTime[valveService.subtype]);
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

	async setValveValue(device: any, valveService: any, value: any) {
		//this.log.debug('%s - Set Active state to %s', valveService.getCharacteristic(this.Characteristic.Name).value, value)
		if (value == valveService.getCharacteristic(this.Characteristic.Active).value) {
			//IOS 17 bug fix for duplicate calls
			this.log.debug('supressed duplicate call from IOS for %s, current value %s, new value %s', valveService.getCharacteristic(this.Characteristic.Name).value, value, valveService.getCharacteristic(this.Characteristic.Active).value);
			return;
		}
		// Set homekit state and prepare message for rachio API
		const runTime = valveService.getCharacteristic(this.Characteristic.SetDuration).value;
		let response;
		switch (value) {
		case this.Characteristic.Active.ACTIVE:
			// Turn on/idle the valve
			this.log.info('Starting %s valve for %s mins', valveService.getCharacteristic(this.Characteristic.Name).value, runTime / 60);
			response = await this.rachioapi.startWatering(this.platform.token, device.id, runTime);
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
						startTime: new Date().toISOString(),
					},
					resourceId: device.id,
					resourceType: 'VALVE',
					timestamp: new Date().toISOString(),
				};
				const myJsonStop = {
					eventId: '6defa6ff-a169-3477-aa57-3c028455387d',
					eventType: 'VALVE_RUN_END_EVENT',
					externalId: this.platform.webhook_key_local,
					payload: {
						durationSeconds: Math.round(valveService.getCharacteristic(this.Characteristic.SetDuration).value),
						endReason: 'COMPLETED',
						flowDetected: false,
						runType: 'QUICK_RUN',
						startTime: new Date().toISOString(),
					},
					resourceId: device.id,
					resourceType: 'VALVE',
					timestamp: new Date().toISOString(),
				};
				this.log.debug('Simulating websocket event for %s', myJsonStart.resourceId);
				if (this.platform.showWebhookMessages) {
					this.log.debug('webhook sent from <%s> %s', this.platform.webhook_key_local, JSON.stringify(myJsonStart, null, 2));
				}
				this.listener.localMsg(null, valveService, myJsonStart);
				this.platform.localWebhook = setTimeout(() => {
					this.log.debug('Simulating websocket event for %s', myJsonStop.resourceId);
					this.platform.endTime[valveService.getCharacteristic(this.Characteristic.SerialNumber).value] = new Date(Date.now()).toISOString();
					if (this.platform.showWebhookMessages) {
						this.log.debug('webhook sent from <%s> %s', this.platform.webhook_key_local, JSON.stringify(myJsonStop, null, 2));
					}
					this.listener.localMsg(null, valveService, myJsonStop);
				}, runTime * 1000);
			}
			break;
		case this.Characteristic.Active.INACTIVE:
			// Turn off/stopping the valve
			this.log.info('Stopping Zone', valveService.getCharacteristic(this.Characteristic.Name).value);
			response = await this.rachioapi.stopWatering(this.platform.token, device.id);
			if (response?.status == 200) {
				//json stop stuff
				const myJsonStop = {
					eventId: '6defa6ff-a169-3477-aa57-3c028455387d',
					eventType: 'VALVE_RUN_END_EVENT',
					externalId: this.platform.webhook_key_local,
					payload: {
						durationSeconds: Math.round(valveService.getCharacteristic(this.Characteristic.SetDuration).value - (Date.parse(this.platform.endTime[valveService.subtype]) - Date.now()) / 1000),
						endReason: 'COMPLETED',
						flowDetected: false,
						runType: 'QUICK_RUN',
						startTime: new Date().toISOString(),
					},
					resourceId: device.id,
					resourceType: 'VALVE',
					timestamp: new Date().toISOString(),
				};
				this.log.debug('Simulating websocket event for %s', myJsonStop.resourceId);
				if (this.platform.showWebhookMessages) {
					this.log.debug('webhook sent from <%s> %s', this.platform.webhook_key_local, JSON.stringify(myJsonStop, null, 2));
				}
				this.listener.localMsg(null, valveService, myJsonStop);
				clearTimeout(this.platform.localWebhook);
			} else {
				this.log.info('Failed to stop valve');
			}
			break;
		}
		return;
	}

	setValveSetDuration(device: any, valveService: any, value: any) {
		// Set default duration from Homekit value
		valveService.getCharacteristic(this.Characteristic.SetDuration).updateValue(value);
		this.log.info('Set %s duration for %s mins', valveService.getCharacteristic(this.Characteristic.Name).value, value / 60);
		return;
	}
}
