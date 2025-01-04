const RachioPlatform = require('./rachioplatform')
const packageJson = require('./package')

module.exports = homebridge => {
	PlatformAccessory = homebridge.platformAccessory
	Service = homebridge.hap.Service
	Characteristic = homebridge.hap.Characteristic
	UUIDGen = homebridge.hap.uuid
	PluginName = packageJson.name
	PluginVersion = packageJson.version
	PlatformName = 'rachio'
	homebridge.registerPlatform(PluginName, PlatformName, RachioPlatform, true)
}
