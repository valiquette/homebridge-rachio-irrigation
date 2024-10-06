let packageJson=require('../package.json')
let RachioAPI=require('../rachioapi')

class bridge {
	constructor(platform, log) {
		this.log = log
		this.platform = platform
		this.rachioapi = new RachioAPI(this, log)
	}

	createBridgeAccessory(device, platformAccessory) {
		if(!platformAccessory){
			this.log.debug('Create Bridge Accessory %s %s', device.id, device.address.locality)
			platformAccessory = new PlatformAccessory(device.address.locality, device.id)
		}
		else{
			this.log.debug('Update Bridge Accessory %s %s', device.id, device.address.locality)
		}

		platformAccessory.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Name, device.address.locality)
			.setCharacteristic(Characteristic.Manufacturer, 'Rachio')
			.setCharacteristic(Characteristic.SerialNumber, device.serialNumber)
			.setCharacteristic(Characteristic.Model, 'HUB101')
			.setCharacteristic(Characteristic.Identify, true)
			.setCharacteristic(Characteristic.FirmwareRevision, device.reportedState.wifiBridgeFirmwareVersion)
			//.setCharacteristic(Characteristic.HardwareRevision, device.hardware_version)
			.setCharacteristic(Characteristic.SoftwareRevision, packageJson.version)
		return platformAccessory
	}

	createBridgeService(device) {
		this.log.debug('create bridge service for %s', device.name)
		let bridgeService = new Service.Tunnel(device.address.locality, device.id)
		bridgeService
			//.setCharacteristic(Characteristic.AccessoryIdentifier, network.network_key)
			.setCharacteristic(Characteristic.TunneledAccessoryAdvertising, true)
			.setCharacteristic(Characteristic.TunneledAccessoryConnected, true)
			//.setCharacteristic(Characteristic.TunneledAccessoryStateNumber, Object.keys(network.devices).length)
		return bridgeService
	}

	configureBridgeService(bridgeService) {
		this.log.debug('configured bridge for %s', bridgeService.getCharacteristic(Characteristic.Name).value)
		bridgeService
			.getCharacteristic(Characteristic.TunneledAccessoryConnected)
	}
}
module.exports = bridge