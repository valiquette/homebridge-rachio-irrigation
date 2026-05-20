import { Service, Characteristic, Logging } from 'homebridge';
import RachioPlatform from '../rachioplatform.js';
import RachioAPI from '../rachioapi.js';
import type { batteryService } from '../settings.js';

export default class battery {
	public readonly Service: typeof Service;
	public readonly Characteristic: typeof Characteristic;
	delta: number[];
	timeStamp: number[];
	constructor(
			private readonly platform: RachioPlatform,
			private readonly log: Logging = platform.log,
			private rachioapi = new RachioAPI(platform),
	) {
		this.Service = platform.Service;
		this.Characteristic = platform.Characteristic;
		this.timeStamp = [];
		this.delta = [];
	}

	createBatteryService(device: batteryService) {
		this.log.debug('create battery service for %s', device.name);
		const batteryStatus: Service = new this.Service.Battery(device.name, device.id);

		switch (device.state.reportedState.batteryStatus) {
		case 'GOOD':
			batteryStatus
				.setCharacteristic(this.Characteristic.StatusLowBattery, this.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
				.setCharacteristic(this.Characteristic.ChargingState, this.Characteristic.ChargingState.NOT_CHARGEABLE)
				.setCharacteristic(this.Characteristic.BatteryLevel, 100);
			break;
		case 'LOW':
			batteryStatus
				.setCharacteristic(this.Characteristic.StatusLowBattery, this.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
				.setCharacteristic(this.Characteristic.ChargingState, this.Characteristic.ChargingState.NOT_CHARGEABLE)
				.setCharacteristic(this.Characteristic.BatteryLevel, 40);
			break;
		case 'REPLACE':
			batteryStatus
				.setCharacteristic(this.Characteristic.StatusLowBattery, this.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
				.setCharacteristic(this.Characteristic.ChargingState, this.Characteristic.ChargingState.NOT_CHARGEABLE)
				.setCharacteristic(this.Characteristic.BatteryLevel, 10);
			this.log.warn('Replace batteries for %s soon', device.name);
			break;
		}

		return batteryStatus;
	}

	configureBatteryService(batteryStatus: Service) {
		this.log.debug('configured battery service for %s', batteryStatus.getCharacteristic(this.Characteristic.Name).value);
		batteryStatus.getCharacteristic(this.Characteristic.StatusLowBattery)
			.onGet(this.getStatusLowBattery.bind(this, batteryStatus));
	}

	async getStatusLowBattery(batteryStatus: Service) {
		const deviceId: number = Number(batteryStatus.subtype);
		let currentValue = batteryStatus.getCharacteristic(this.Characteristic.StatusLowBattery).value;
		if(!this.timeStamp[deviceId]) {
			this.timeStamp[deviceId] = +new Date();
		}
		//check for duplicate call
		this.delta[deviceId] =  new Date().valueOf()- this.timeStamp[deviceId];
		if (this.delta[deviceId] > 60 * 60 * 1000 || this.delta[deviceId] == 0) {  // check after 1 hour
			this.timeStamp[deviceId] = +new Date();
		} else {
			this.log.debug('skipped battery update, to soon. timestamp delta %s sec', this.delta[deviceId]/1000);
			return currentValue;
		}
		// add connection state to this call
		try {
			this.log.debug('updating battery for valve deviceId ', deviceId);
			const response = await this.rachioapi.getValve(this.platform.token, deviceId).catch(err => {
				//this.log.error('Failed to get valve', err)
				throw (`Failed to get valve battery status ${err}`);
			});
			if (response?.status == 200) {
				switch (response.data.valve.state.reportedState.batteryStatus) {
				case 'GOOD':
					batteryStatus
						.setCharacteristic(this.Characteristic.StatusLowBattery, this.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
						.setCharacteristic(this.Characteristic.ChargingState, this.Characteristic.ChargingState.NOT_CHARGEABLE)
						.setCharacteristic(this.Characteristic.BatteryLevel, 100);
					break;
				case 'LOW':
					batteryStatus
						.setCharacteristic(this.Characteristic.StatusLowBattery, this.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
						.setCharacteristic(this.Characteristic.ChargingState, this.Characteristic.ChargingState.NOT_CHARGEABLE)
						.setCharacteristic(this.Characteristic.BatteryLevel, 40);
					break;
				case 'REPLACE':
					batteryStatus
						.setCharacteristic(this.Characteristic.StatusLowBattery, this.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
						.setCharacteristic(this.Characteristic.ChargingState, this.Characteristic.ChargingState.NOT_CHARGEABLE)
						.setCharacteristic(this.Characteristic.BatteryLevel, 10);
					this.log.warn('Replace batteries for %s soon', response.data.valve.name);
					break;
				}
				currentValue = batteryStatus.getCharacteristic(this.Characteristic.StatusLowBattery).value;
			}
		} catch (err) {
			this.log.error('error trying to update battery status', err);
		}
		return currentValue;
	}
}
