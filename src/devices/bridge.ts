
import pkg from 'homebridge-rachio-irrigation/package.json' with { type: 'json' };
import { PlatformAccessory, Service, Characteristic, Logging } from 'homebridge';
import RachioPlatform from '../rachioplatform.js';
import type { BaseStation, Property } from '../settings.js';

export default class bridge {
	public readonly Service: typeof Service;
	public readonly Characteristic: typeof Characteristic;
	constructor(
		private readonly platform: RachioPlatform,
		private readonly log: Logging = platform.log,
	) {
		this.Service = platform.Service;
		this.Characteristic = platform.Characteristic;
	}

	createBridgeAccessory(device: BaseStation, property: Property, platformAccessory: PlatformAccessory) {
		if (!platformAccessory) {
			this.log.debug(`Create Bridge Accessory ${device.id} ${property.property.address.locality}`);
			platformAccessory = new this.platform.api.platformAccessory(String(property.property.address.locality), device.id);
		} else {
			this.log.debug(`Update Bridge Accessory ${device.id} ${property.property.address.locality}`);
		}

		platformAccessory.getService(this.Service.AccessoryInformation)!
			.setCharacteristic(this.Characteristic.Name, property.property.address.locality)
			.setCharacteristic(this.Characteristic.Manufacturer, 'Rachio')
			.setCharacteristic(this.Characteristic.SerialNumber, device.serialNumber)
			.setCharacteristic(this.Characteristic.Model, 'HUB101')
			.setCharacteristic(this.Characteristic.Identify, true)
			.setCharacteristic(this.Characteristic.FirmwareRevision, device.reportedState.wifiBridgeFirmwareVersion)
			//.setCharacteristic(this.Characteristic.HardwareRevision, device.hardware_version)
			.setCharacteristic(this.Characteristic.SoftwareRevision, pkg.version);
		return platformAccessory;
	}

	createBridgeService(device: BaseStation, property: Property) {
		this.log.debug(`create bridge service for ${property.property.address.locality}`);
		const bridgeService: Service = new this.Service.WiFiTransport(String(property.property.address.locality), device.id);
		bridgeService.setCharacteristic(this.Characteristic.CurrentTransport, device.reportedState.connected);
		return bridgeService;
	}

	configureBridgeService(bridgeService: Service) {
		this.log.debug(`configured bridge for ${bridgeService.getCharacteristic(this.Characteristic.Name).value}`);
		bridgeService.getCharacteristic(this.Characteristic.CurrentTransport);
	}
}
