/*
Known issues
Time remaining for homebridge accessory, homekit and Rachio run a little out of sync.
Zone Cyclying message may be out of sequence
*/

'use strict'
let axios = require('axios')
let http = require('http')
let https = require('https')
let fs = require('fs')
let RachioAPI = require('./rachioapi')
let RachioUpdate = require('./rachioupdate')
let irrigation = require('./devices/irrigation')
let switches = require('./devices/switches')
let valve = require('./devices/valve')
let battery = require('./devices/battery')
let bridge = require('./devices/bridge')
let deviceState

class RachioPlatform {
	constructor(log, config, api) {
		this.rachioapi = new RachioAPI(this, log)
		this.rachio = new RachioUpdate(this, log, config)
		this.irrigation = new irrigation(this, log)
		this.switches = new switches(this, log)
		this.valve = new valve(this, log)
		this.battery = new battery(this, log)
		this.bridge = new bridge(this, log)
		this.log = log
		this.api = api
		this.config = config
		this.token = config.api_key
		this.retryWait = config.retryWait ? config.retryWait : 60 //sec
		this.retryMax = config.retryMax ? config.retryMax : 3 //attempts
		this.retryAttempt = 0
		this.auto_correct_IP = config.auto_correct_IP ? config.auto_correct_IP : false
		this.external_IP_address = config.external_IP_address
		this.external_webhook_port = config.external_webhook_port
		this.internal_IP_address = config.internal_IP_address
		this.internal_webhook_port = config.internal_webhook_port
		this.relay_address = config.relay_address
		this.webhook_key = 'homebridge-' + config.name
		this.webhook_key_local = 'simulated-webhook'
		this.fakeWebhook
		this.endTime = []
		this.delete_webhooks = config.delete_webhooks
		this.useBasicAuth = config.use_basic_auth
		this.user = config.user
		this.password = config.password
		this.useIrrigationDisplay = config.use_irrigation_display
		this.defaultRuntime = config.default_runtime * 60
		this.runtimeSource = config.runtime_source
		this.showStandby = config.show_standby
		this.showRunAll = config.show_runall
		this.showSchedules = config.show_schedules
		this.locationAddress = config.location_address
		this.locationMatch = true
		this.accessories = []
		this.foundLocations
		this.useHttps = config.https ? config.https : false
		this.key = config.key
		this.cert = config.cert
		this.showAPIMessages = config.showAPIMessages ? config.showAPIMessages : false
		this.showWebhookMessages = config.showWebhookMessages ? config.showWebhookMessages : false

		this.showBridge = config.showBridge ? config.showBridge : false
		this.showControllers = config.showControllers ? config.showControllers : false
		this.showValves = config.showValves ? config.showValves : false
		this.valveType = config.valveType ? config.valveType : 0
		this.lastInterval = []
		this.timeStamp = []
		this.liveTimeout = config.liveRefreshTimeout ? config.liveRefreshTimeout : 2 //min
		this.liveRefresh = config.liveRefreshRate ? config.liveRefreshRate : 20 //sec

		if (this.useBasicAuth && (!this.user || !this.password)) {
			this.log.warn(`HTTP Basic Athentication cannot be used for webhooks without a valid user and password.`)
		}

		if (!this.token) {
			this.log.error(`API KEY is required in order to communicate with the Rachio API, please see https://rachio.readme.io/docs/authentication for instructions.`)
		} else {
			this.log(`Starting Rachio Platform with homebridge API ${api.version}`)
		}
		//**
		//** Platforms should wait until the "didFinishLaunching" event has fired before registering any new accessories.
		//**
		if (this.api) {
			this.api.on(
				'didFinishLaunching',
				async function () {
					//Removed any unwanted devices
					await this.checkDisplay()
					if (this.showValves) {
						//Get valves
						this.log.info('Setting up Wifi hub devices')
						await this.getRachioValves()
					}
					if (this.showControllers) {
						//Get info to configure webhooks
						await this.getWebhookInfo()
						//Configure listerner for webhook messages
						await this.configureListener()
						//Get controllers
						this.log.info('Setting up Controller devices')
						await this.getRachioDevices()
					}
				}.bind(this)
			)
		}
	}

	identify() {
		this.log('Identify the sprinkler!')
	}
	checkDisplay() {
		let accessories = Object.entries(this.accessories) //build array from accessories object
		accessories.forEach(accessory => {
			accessory = accessory[1]
			if (!this.showValves && accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.Model).value.includes('SHV')) {
				this.log.info('Removing Smart Hose Timer %s', accessory.displayName)
				this.log.debug('Removing Smart Hose Timer %s', accessory.UUID)
				this.api.unregisterPlatformAccessories(PluginName, PlatformName, [accessory])
				delete this.accessories[accessory.uuid]
			}
			if (!this.showBridge && accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.Model).value.includes('HUB')) {
				this.log.info('Removing Smart Hose Bridge %s', accessory.displayName)
				this.log.debug('Removing Smart Hose Bridge %s', accessory.UUID)
				this.api.unregisterPlatformAccessories(PluginName, PlatformName, [accessory])
				delete this.accessories[accessory.uuid]
			}
			if (!this.showControllers && accessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.Model).value.includes('GENERATION')) {
				this.log.info('Removing Smart Sprinker Controller %s', accessory.displayName)
				this.log.debug('Removing Smart Sprinker Controller %s', accessory.UUID)
				this.api.unregisterPlatformAccessories(PluginName, PlatformName, [accessory])
				delete this.accessories[accessory.uuid]
			}
		})
		if (!this.showValves && !this.showControllers && !this.showBridge) {
			this.log.warn('Plugin is not configured to show any devices!')
		}
	}

	setWebhookURL() {
		let destination = this.useHttps ? 'https://' : 'http://'
		let port = this.external_webhook_port ? ':' + this.external_webhook_port : ''

		if (this.useBasicAuth && this.user && this.password) {
			this.external_webhook_address = destination + this.user + ':' + this.password + '@' + this.external_IP_address + port
		} else {
			this.external_webhook_address = destination + this.external_IP_address + port
		}
		if (!this.external_webhook_address) {
			this.log.warn(`Cannot validate webhook destination address, will not set Webhooks. Please check webhook config settings for proper format and does not include any prefx like http://`)
		}
	}

	async getWebhookInfo() {
		let ipv4
		let ipv6
		let fqdn
		let ipv4format = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
		let ipv6format =
			/(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))/
		let fqdnformat = /(?=^.{4,253}$)(^((?!-)[a-zA-Z0-9-]{0,62}[a-zA-Z0-9]\.)+[a-zA-Z]{2,63}$)/
		if (this.relay_address) {
			this.useBasicAuth = false
			this.external_webhook_address = this.relay_address
		}
		//check external IP address
		if (this.external_IP_address) {
			ipv4 = this.checkIPaddress(this.external_IP_address, ipv4format)
			ipv6 = this.checkIPaddress(this.external_IP_address, ipv6format)
			fqdn = this.checkIPaddress(this.external_IP_address, fqdnformat)
		} else {
			this.log.warn(`No external IP or domain name configured, will not configure webhooks. Reference Readme for instructions.`)
		}

		if (this.relay_address) {
			this.external_IP_address = this.relay_address
		} else {
			if (ipv4) {
				axios({
					method: 'get',
					url: 'https://api4.ipify.org?format=json',
					responseType: 'json'
				})
					.then(response => {
						let realExternalIP = response.data.ip
						if (ipv4 && this.external_IP_address && realExternalIP != this.external_IP_address) {
							this.log.warn(`Configured external IPv4 address of ${this.external_IP_address} does not match this server's detected external IP of ${realExternalIP} please check webhook config settings.`)
							if (this.auto_correct_IP) {
								this.log.warn(`The external IPv4 of this server's detected IP address of ${realExternalIP} will be used based on config, please update webhook config settings.`)
								this.external_IP_address = realExternalIP
							}
						}
						this.log.debug(`using IPv4 webhook external address ${this.external_IP_address}`)
					})
					.catch(err => {
						this.log.error('Failed to get current external IP', err.cause)
					})
				this.setWebhookURL()
			} else if (ipv6) {
				axios({
					method: 'get',
					url: 'https://api6.ipify.org?format=json',
					responseType: 'json'
				})
					.then(response => {
						let realExternalIP = response.data.ip
						if (ipv6 && this.external_IP_address && realExternalIP != this.external_IP_address) {
							this.log.warn(`Configured external IPv6 address of ${this.external_IP_address} does not match this server's detected external IP of ${realExternalIP} please check webhook config settings.`)
							if (this.auto_correct_IP) {
								this.log.warn(`The external IPv6 of this server's detected IP address of ${realExternalIP} will be used based on config, please update webhook config settings.`)
								this.external_IP_address = realExternalIP
							}
						}
						this.log.debug(`using IPv6 webhook external address ${this.external_IP_address}`)
					})
					.catch(err => {
						this.log.error('Failed to get current external IP', err.cause)
					})
				this.setWebhookURL()
			} else if (fqdn) {
				this.log.debug(`using FQDN for webhook external destination ${this.external_IP_address}`)
				this.setWebhookURL()
			} else {
				this.log.warn(`Cannot validate webhook destination address, will not set Webhooks. Please check webhook config settings for proper format and does not include any prefx like http://`)
			}
		}
	}

	checkIPaddress(inputText, ipformat) {
		try {
			if (inputText.match(ipformat)) {
				return true
			} else {
				return false
			}
		} catch (err) {
			log.warn(`Error validating IP address ${err}`)
		}
	}

	async getRachioDevices() {
		try {
			// getting account info
			this.log.debug('Fetching build info for Smart Sprinkler Controllers...')
			this.log.info('Getting Person info...')
			let personId = await this.rachioapi.getPersonInfo(this.token).catch(err => {
				this.log.error('Failed to get info for build', err)
			})
			this.log('Found Person ID %s', personId.id)

			this.log.info('Getting Person ID info...')
			let personInfo = await this.rachioapi.getPersonId(this.token, personId.id).catch(err => {
				this.log.error('Failed to get person info for build', err)
			})
			this.log.info('Found Account for username %s', personInfo.username)
			this.log.info('Getting Location info...')

			let location = await this.rachioapi.getLocationList(this.token).catch(err => {
				this.log.error('Failed to get location summary', err)
			})
			if (location.locationSummary.length == 0) {
				this.log.warn('No device locations found')
			}
			location.locationSummary.forEach(address => {
				this.log.info('Found Location: id=%s address=%s geo=%s', address.location.id, address.location.address.addressLine1, address.location.geoPoint)
				this.foundLocations = location.locationSummary
				address.location.deviceId.forEach(device => {
					this.log.info('Found Location: device id=%s ', device)
				})
			})
			if (personInfo.devices.length > 0) {
				personInfo.devices
					.filter(newDevice => {
						this.foundLocations.forEach(location => {
							location.location.deviceId.forEach(device => {
								if (!this.locationAddress || this.locationAddress == location.location.address.addressLine1) {
									if (newDevice.id == device) {
										this.log.info('Adding controller %s found at the configured location: %s', newDevice.name, location.location.address.addressLine1)
										this.locationMatch = true
									}
								} else {
									if (newDevice.id == device) {
										this.log.info('Skipping controller %s at %s, not found at the configured location: %s', newDevice.name, location.location.address.addressLine1, this.locationAddress)
										this.locationMatch = false
									}
								}
							})
						})
						return this.locationMatch
					})
					.forEach(async newDevice => {
						//adding devices that met filter criteria
						this.log.info('Found Controller %s status %s', newDevice.name, newDevice.status)
						let uuid = newDevice.id
						this.log.info('Getting device state info...')
						deviceState = await this.rachioapi.getDeviceState(this.token, newDevice.id).catch(err => {
							this.log.error('Failed to get device state', err)
						})
						if (!deviceState) {
							return
						}
						this.log('Retrieved device state %s for %s with a %s state, running', deviceState.state.state, newDevice.name, deviceState.state.desiredState, deviceState.state.firmwareVersion)
						if (this.external_webhook_address) {
							this.rachioapi.configureWebhooks(this.token, this.external_webhook_address, this.delete_webhooks, newDevice.id, this.webhook_key)
						}

						// Create and configure Irrigation Service
						this.log.debug('Creating and configuring new device')
						let irrigationAccessory = this.irrigation.createIrrigationAccessory(newDevice, deviceState, this.accessories[uuid])
						this.irrigation.configureIrrigationService(newDevice, irrigationAccessory.getService(Service.IrrigationSystem))

						// Create and configure Values services and link to Irrigation Service
						newDevice.zones = newDevice.zones.sort(function (a, b) {
							return a.zoneNumber - b.zoneNumber
						})
						newDevice.zones.forEach(zone => {
							if (!this.useIrrigationDisplay && !zone.enabled) {
								this.log.info('Skipping disabled zone %s', zone.name)
							} else {
								this.log.debug('adding zone %s', zone.name)
								let valveService = irrigationAccessory.getServiceById(Service.Valve, zone.id)
								if (valveService) {
									valveService
										.setCharacteristic(Characteristic.Active, Characteristic.Active.INACTIVE)
										.setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE)
										.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
										.setCharacteristic(Characteristic.Name, zone.name)
										.setCharacteristic(Characteristic.ConfiguredName, zone.name)
										.setCharacteristic(Characteristic.Model, zone.customNozzle.name)
									if (zone.enabled) {
										valveService.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
									} else {
										valveService.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.NOT_CONFIGURED)
									}
									this.irrigation.configureValveService(newDevice, valveService)
									this.api.updatePlatformAccessories([irrigationAccessory])
								} else {
									//add new
									valveService = this.irrigation.createValveService(zone)
									this.irrigation.configureValveService(newDevice, valveService)
									irrigationAccessory.addService(valveService)
									this.api.updatePlatformAccessories([irrigationAccessory])
									if (this.useIrrigationDisplay) {
										this.log.debug('Using irrigation system')
										irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(valveService)
										this.api.updatePlatformAccessories([irrigationAccessory])
									} else {
										this.log.debug('Using separate tiles')
									}
								}
							}
						})

						if (this.showSchedules) {
							newDevice.scheduleRules.forEach(schedule => {
								this.log.debug('adding schedules %s', schedule.name)
								let switchService = irrigationAccessory.getServiceById(Service.Switch, schedule.id)
								if (switchService) {
									//update
									switchService.setCharacteristic(Characteristic.On, false).setCharacteristic(Characteristic.Name, schedule.name).setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
									this.switches.configureSwitchService(newDevice, switchService)
									this.api.updatePlatformAccessories([irrigationAccessory])
								} else {
									//add new
									switchService = this.switches.createScheduleSwitchService(schedule)
									this.switches.configureSwitchService(newDevice, switchService)
									irrigationAccessory.addService(switchService)
									this.api.updatePlatformAccessories([irrigationAccessory])
								}
								irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
							})
							newDevice.flexScheduleRules.forEach(schedule => {
								this.log.debug('adding flex schedules %s', schedule.name)
								let switchService = irrigationAccessory.getServiceById(Service.Switch, schedule.id)
								if (switchService) {
									//update
									switchService.setCharacteristic(Characteristic.On, false).setCharacteristic(Characteristic.Name, schedule.name).setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
									this.switches.configureSwitchService(newDevice, switchService)
									this.api.updatePlatformAccessories([irrigationAccessory])
								} else {
									//add new
									switchService = this.switches.createScheduleSwitchService(schedule)
									this.switches.configureSwitchService(newDevice, switchService)
									irrigationAccessory.addService(switchService)
									this.api.updatePlatformAccessories([irrigationAccessory])
								}
								irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
							})
						} else {
							//remove
							newDevice.scheduleRules.forEach(schedule => {
								this.log.debug('removed schedule switch')
								let switchService = irrigationAccessory.getServiceById(Service.Switch, schedule.id)
								if (switchService) {
									irrigationAccessory.removeService(switchService)
									this.api.updatePlatformAccessories([irrigationAccessory])
								}
							})
							newDevice.flexScheduleRules.forEach(schedule => {
								this.log.debug('removed flex schedule switch')
								let switchService = irrigationAccessory.getServiceById(Service.Switch, schedule.id)
								if (switchService) {
									irrigationAccessory.removeService(switchService)
									this.api.updatePlatformAccessories([irrigationAccessory])
								}
							})
						}

						if (this.showStandby) {
							this.log.debug('adding new standby switch')
							let switchType = 'Standby'
							let switchName = newDevice.name + ' ' + switchType
							let uuid = UUIDGen.generate(switchName)
							let switchService = irrigationAccessory.getServiceById(Service.Switch, uuid)
							if (switchService) {
								//update
								switchService.setCharacteristic(Characteristic.On, false).setCharacteristic(Characteristic.Name, switchName).setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
								this.switches.configureSwitchService(newDevice, switchService)
								this.api.updatePlatformAccessories([irrigationAccessory])
							} else {
								//add new
								switchService = this.switches.createSwitchService(switchName, uuid)
								this.switches.configureSwitchService(newDevice, switchService)
								irrigationAccessory.addService(switchService)
								this.api.updatePlatformAccessories([irrigationAccessory])
							}
							irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
							this.api.updatePlatformAccessories([irrigationAccessory])
						} else {
							//remove
							this.log.debug('removed standby switch')
							let switchType = 'Standby'
							let switchName = newDevice.name + ' ' + switchType
							let uuid = UUIDGen.generate(switchName)
							let switchService = irrigationAccessory.getServiceById(Service.Switch, uuid)
							if (switchService) {
								irrigationAccessory.removeService(switchService)
								this.api.updatePlatformAccessories([irrigationAccessory])
							}
						}

						if (this.showRunAll) {
							this.log.debug('adding new run all switch')
							let switchType = 'Quick Run All'
							let switchName = newDevice.name + ' ' + switchType
							let uuid = UUIDGen.generate(switchName)
							let switchService = irrigationAccessory.getServiceById(Service.Switch, uuid)
							if (switchService) {
								//update
								switchService.setCharacteristic(Characteristic.On, false).setCharacteristic(Characteristic.Name, switchName).setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
								this.switches.configureSwitchService(newDevice, switchService)
								this.api.updatePlatformAccessories([irrigationAccessory])
							} else {
								//add new
								switchService = this.switches.createSwitchService(switchName, uuid)
								this.switches.configureSwitchService(newDevice, switchService)
								irrigationAccessory.addService(switchService)
								this.api.updatePlatformAccessories([irrigationAccessory])
							}
							irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
							this.api.updatePlatformAccessories([irrigationAccessory])
						} else {
							//remove
							let switchType = 'Quick Run All'
							this.log.debug('removed Quick Run All')
							let uuid = UUIDGen.generate(newDevice.name + ' ' + switchType)
							let switchService = irrigationAccessory.getServiceById(Service.Switch, uuid)
							if (switchService) {
								irrigationAccessory.removeService(switchService)
								this.api.updatePlatformAccessories([irrigationAccessory])
							}
						}

						// Register platform accessory
						if (!this.accessories[uuid]) {
							this.log.debug('Registering platform accessory')
							this.log.info('Adding new accessory %s', irrigationAccessory.displayName)
							this.accessories[uuid] = irrigationAccessory
							this.api.registerPlatformAccessories(PluginName, PlatformName, [irrigationAccessory])
						}

						//match state to Rachio state
						this.setOnlineStatus(newDevice)
						this.setDeviceStatus(newDevice)

						//find any running zone and set its state
						let schedule = await this.rachioapi.currentSchedule(this.token, newDevice.id).catch(err => {
							this.log.error('Failed to get current schedule', err)
						})
						this.log.debug('Check current schedule')
						this.setValveStatus(schedule.data)
						//remove [UTC] for valid date regex= /\[...]/
						this.log.info(
							'API rate limiting; call limit of %s remaining out of %s until reset at %s',
							schedule.headers['x-ratelimit-remaining'],
							schedule.headers['x-ratelimit-limit'],
							new Date(schedule.headers['x-ratelimit-reset'].replace(/\[...]/, '')).toString()
						)
					})
				setTimeout(() => {
					this.log.info('Rachio Platform finished loading Smart Sprinkler Controller')
				}, 1000)
			} else {
				this.log.warn('No Smart Sprinkler Controllers found')
			}
		} catch (err) {
			if (this.retryAttempt < this.retryMax) {
				this.retryAttempt++
				this.log.error('Failed to get devices. Retry attempt %s of %s in %s seconds...', this.retryAttempt, this.retryMax, this.retryWait)
				setTimeout(async () => {
					this.getRachioDevices()
				}, this.retryWait * 1000)
			} else {
				this.log.error('Failed to get devices...\n%s', err)
			}
		}
	}

	async getRachioValves() {
		try {
			// getting account info
			this.log.debug('Fetching build info for Smart Hose Timers...')
			this.log.info('Getting Person info...')
			let personId = await this.rachioapi.getPersonInfo(this.token).catch(err => {
				this.log.error('Failed to get info for build', err)
			})
			this.log('Found Person ID %s', personId.id)

			this.log.info('Getting Person ID info...')
			let personInfo = await this.rachioapi.getPersonId(this.token, personId.id).catch(err => {
				this.log.error('Failed to get person info for build', err)
			})
			this.log.info('Found Account for username %s', personInfo.username)
			this.log.info('Getting Location info...')

			let list = await this.rachioapi.listBaseStations(this.token, personId.id).catch(err => {
				this.log.error('Failed to get base station list', err)
			})
			if (list.baseStations.length > 0) {
				list.baseStations
					.filter(baseStation => {
						if (!this.locationAddress || baseStation.address.lineOne == this.locationAddress) {
							this.log('Found WiFi Hub %s at the configured location: %s', baseStation.serialNumber, baseStation.address.lineOne)
							return true
						} else {
							this.log('Skipping WiFi Hub %s st %s, not found at the configured location: %s', baseStation.serialNumber, baseStation.address.lineOne, this.locationAddress)
							return false
						}
					})
					.forEach(async baseStation => {
						let uuid = baseStation.id
						if (baseStation.reportedState.firmwareUpgradeAvailable) {
							this.log.warn('Hub firmware upgrade available')
						}
						if (this.showBridge) {
							this.log.debug('Adding Hub Device')
							this.log.debug('Found WiFi Hub %s', baseStation.address.locality)

							// Create and configure Bridge Service
							this.log.debug('Creating and configuring new Wifi Hub')
							let bridgeAccessory = this.bridge.createBridgeAccessory(baseStation, this.accessories[uuid])
							let bridgeService = bridgeAccessory.getService(Service.WiFiTransport)
							bridgeService = this.bridge.createBridgeService(baseStation)
							this.bridge.configureBridgeService(bridgeService)
							// set current device status
							bridgeService.getCharacteristic(Characteristic.StatusFault).updateValue(baseStation.reportedState.connected)
							let service = bridgeAccessory.getService(Service.WiFiTransport)
							if (!service) {
								bridgeAccessory.addService(bridgeService)
							}
							this.log.info('Adding WiFi Hub')
							if (!this.accessories[uuid]) {
								this.log.debug('Registering platform accessory')
								this.accessories[uuid] = bridgeAccessory
								this.api.registerPlatformAccessories(PluginName, PlatformName, [bridgeAccessory])
							}
						} else {
							this.log.info('Skipping WiFi Hub %s based on config', baseStation.address.locality)
						}

						let valveList = await this.rachioapi.listValves(this.token, baseStation.id).catch(err => {
							this.log.error('Failed to get valve list', err)
						})
						if (valveList.valves.length > 0) {
							valveList.valves.forEach(async (valve, index) => {
								//this.log.debug(JSON.stringify(valve, null, 2))//temp
								let uuid = valve.id
								this.timeStamp[uuid] = new Date()
								valve.zone = index + 1
								this.log.debug('Creating and configuring new valve')
								if (this.accessories[uuid]) {
									// Check if accessory changed
									if (this.accessories[uuid].getService(Service.AccessoryInformation).getCharacteristic(Characteristic.ProductData).value != 'Valve') {
										this.log.warn('Changing from Irrigation to Valve, check room assignments in Homekit')
										this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
										delete this.accessories[uuid]
									}
								}

								//adding devices that met filter criteria
								this.log.info('Found Smart Hose Timer %s connected: %s', valve.name, valve.state.reportedState.connected)
								if (valve.state.reportedState.firmwareUpgradeAvailable) {
									this.log.warn('Valve %s firmware upgrade available', valve.name)
								}
								if (valve.state.reportedState.firmwareUpgradeInProgress) {
									this.log.warn('Valve %s firmware upgrade in progress %s', valve.name, valve.state.reportedState.firmwareVersion)
								}
								// Create and configure Irrigation Service
								this.log.debug('Creating and configuring new valve')
								let valveAccessory = this.valve.createValveAccessory(baseStation, valve, this.accessories[uuid])
								let valveService = valveAccessory.getService(Service.Valve)
								this.valve.updateValveService(baseStation, valve, valveService)
								this.valve.configureValveService(valve, valveAccessory.getService(Service.Valve))

								// Create and configure Battery Service
								if (valve.state.reportedState.batteryStatus != null) {
									this.log.info('Adding Battery status for %s', valve.name)
									let batteryStatus = valveAccessory.getService(Service.Battery)
									//batteryStatus.getCharacteristic(Characteristic.SerialNumber).updateValue(valve.id) // should be temp
									if (batteryStatus) {
										//update
										this.battery.configureBatteryService(batteryStatus)
										switch (valve.state.reportedState.batteryStatus) {
											case 'GOOD':
												batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
												break
											case 'LOW':
												batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
												break
										}
									} else {
										//add new
										batteryStatus = this.battery.createBatteryService(valve, uuid)
										this.battery.configureBatteryService(batteryStatus)
										valveAccessory.addService(batteryStatus)
										this.api.updatePlatformAccessories([valveAccessory])
									}
									batteryStatus = valveAccessory.getService(Service.Battery)
									valveAccessory.getService(Service.Valve).addLinkedService(batteryStatus)
								} else {
									//remove
									this.log.debug('%s has no battery found, skipping add battery service', valve.name)
									let batteryStatus = valveAccessory.getService(Service.Battery)
									if (batteryStatus) {
										valveAccessory.removeService(batteryStatus)
										this.api.updatePlatformAccessories([valveAccessory])
									}
								}

								// Register platform accessory
								if (!this.accessories[uuid]) {
									this.log.debug('Registering platform accessory')
									this.log.info('Adding new accessory %s', valveAccessory.displayName)
									this.accessories[uuid] = valveAccessory
									this.api.registerPlatformAccessories(PluginName, PlatformName, [valveAccessory])
								}

								//find any running zone and set its state
								let programs = await this.rachioapi.listPrograms(this.token, valve.id).catch(err => {
									this.log.error('Failed to get current programs', err)
								})
								this.log.debug('Check current programs')
								//this.setValveStatus(programs.data) //future
								//remove [UTC] for valid date regex= /\[...]/
								this.log.info(
									'API rate limiting; call limit of %s remaining out of %s until reset at %s',
									programs.headers['x-ratelimit-remaining'],
									programs.headers['x-ratelimit-limit'],
									new Date(programs.headers['x-ratelimit-reset'].replace(/\[...]/, '')).toString()
								)
							})
						}
					})
				setTimeout(() => {
					this.log.info('Rachio Platform finished loading Smart Hose Timers')
				}, 1000)
			} else {
				this.log.warn('No Smart Hose Timers found')
			}
		} catch (err) {
			if (this.retryAttempt < this.retryMax) {
				this.retryAttempt++
				this.log.error('Failed to get valves. Retry attempt %s of %s in %s seconds...', this.retryAttempt, this.retryMax, this.retryWait)
				setTimeout(async () => {
					this.getRachioValves()
				}, this.retryWait * 1000)
			} else {
				this.log.error('Failed to get devices...\n%s', err)
			}
		}
	}

	//**
	//** REQUIRED - Homebridge will call the 'configureAccessory' method once for every cached accessory restored
	//**
	configureAccessory(accessory) {
		// Add cached devices to the accessories array
		this.log.info('Found cached accessory, configuring %s', accessory.displayName)
		this.accessories[accessory.UUID] = accessory
	}

	setOnlineStatus(newDevice) {
		//set current device status
		//create a fake webhook response
		if (newDevice.status) {
			let myJson
			switch (newDevice.status) {
				case 'ONLINE':
					myJson = {
						externalId: this.webhook_key_local,
						type: 'DEVICE_STATUS',
						deviceId: newDevice.id,
						subType: 'ONLINE',
						timestamp: new Date().toISOString()
					}
					break
				case 'OFFLINE':
					myJson = {
						externalId: this.webhook_key_local,
						type: 'DEVICE_STATUS',
						deviceId: newDevice.id,
						subType: 'OFFLINE',
						timestamp: new Date().toISOString()
					}
					break
			}
			this.log.debug('Found %s device', newDevice.status.toLowerCase())
			if (this.showAPIMessages) {
				this.log.debug(myJson)
			}
			let irrigationAccessory = this.accessories[myJson.deviceId]
			let irrigationSystemService = irrigationAccessory.getService(Service.IrrigationSystem)
			let service = irrigationAccessory.getServiceById(Service.IrrigationSystem)
			this.log.debug('Updating device status')
			this.eventMsg(irrigationSystemService, service, myJson)
		}
	}

	setDeviceStatus(newDevice) {
		//set current device state
		//create a fake webhook response
		if (deviceState.state.health == 'GOOD') {
			let myJson
			switch (deviceState.state.desiredState) {
				case 'DESIRED_ACTIVE':
					myJson = {
						summary: 'Scheduled waterings will now run on controller.',
						externalId: this.webhook_key_local,
						eventType: 'DEVICE_MANUAL_STANDBY_ON_EVENT',
						type: 'DEVICE_STATUS',
						title: 'Standby Mode Off',
						deviceId: newDevice.id,
						deviceName: newDevice.name,
						subType: 'SLEEP_MODE_OFF'
					}
					break
				case 'DESIRED_STANDBY':
					myJson = {
						summary: 'No scheduled waterings will run on controller.',
						externalId: this.webhook_key_local,
						eventType: 'DEVICE_MANUAL_STANDBY_ON_EVENT',
						type: 'DEVICE_STATUS',
						title: 'Standby Mode ON',
						deviceId: newDevice.id,
						deviceName: newDevice.name,
						subType: 'SLEEP_MODE_ON'
					}
					break
			}
			this.log.debug('Found healthy device')
			if (this.showAPIMessages) {
				this.log.debug(myJson)
			}
			let irrigationAccessory = this.accessories[myJson.deviceId]
			let irrigationSystemService = irrigationAccessory.getService(Service.IrrigationSystem)
			this.log.debug('Updating standby switch state')
			this.eventMsg(irrigationSystemService, irrigationSystemService, myJson)
		}
	}

	setValveStatus(response) {
		if (response.status == 'PROCESSING') {
			//create a fake webhook response
			this.log.debug('Found zone-%s running', response.zoneNumber)
			let myJson = {
				type: 'ZONE_STATUS',
				title: 'Zone Started',
				deviceId: response.deviceId,
				duration: response.zoneDuration,
				zoneNumber: response.zoneNumber,
				zoneId: response.zoneId,
				zoneRunState: 'STARTED',
				durationInMinutes: Math.round(response.zoneDuration / 60),
				externalId: this.webhook_key_local,
				eventType: 'DEVICE_ZONE_RUN_STARTED_EVENT',
				subType: 'ZONE_STARTED',
				startTime: response.zoneStartDate,
				endTime: new Date(response.zoneStartDate + response.zoneDuration * 1000).toISOString(),
				category: 'DEVICE',
				resourceType: 'DEVICE'
			}
			if (this.showAPIMessages) {
				this.log.debug(myJson)
			}
			let irrigationAccessory = this.accessories[myJson.deviceId]
			let irrigationSystemService = irrigationAccessory.getService(Service.IrrigationSystem)
			let service = irrigationAccessory.getServiceById(Service.Valve, myJson.zoneId)
			this.log.debug('Zone running match found for zone-%s on start will update services', myJson.zoneNumber)
			this.eventMsg(irrigationSystemService, service, myJson)
		}
		if (response.status == 'PROCESSING' && this.showSchedules && response.scheduleId != undefined) {
			this.log.debug('Found schedule %s running', response.scheduleId)
			let myJson = {
				type: 'SCHEDULE_STATUS',
				title: 'Schedule Manually Started',
				deviceId: response.deviceId,
				deviceName: response.name,
				duration: response.zoneDuration / 60,
				scheduleName: 'Quick Run',
				scheduleId: response.scheduleId,
				externalId: this.webhook_key_local,
				eventType: 'SCHEDULE_STARTED_EVENT',
				subType: 'SCHEDULE_STARTED',
				endTime: new Date(response.zoneStartDate + response.zoneDuration * 1000).toISOString(),
				category: 'SCHEDULE',
				resourceType: 'DEVICE'
			}
			if (this.showAPIMessages) {
				this.log.debug(myJson)
			}
			let irrigationAccessory = this.accessories[myJson.deviceId]
			let irrigationSystemService = irrigationAccessory.getService(Service.IrrigationSystem)
			let service = irrigationAccessory.getServiceById(Service.Switch, myJson.scheduleId)
			this.log.debug('Schedule running match found for schedule %s on start will update services', myJson.scheduleName)
			this.eventMsg(irrigationSystemService, service, myJson)
		}
	}

	configureListener() {
		//set local listener
		this.localMessage(this.rachio.updateService.bind(this))
		this.irrigation.localMessage(this.rachio.updateService.bind(this))
		//set network listener
		let server = this.useHttps ? https : http
		let options = {}
		if (server == https) {
			options = {
				key: fs.readFileSync(this.key),
				cert: fs.readFileSync(this.cert)
			}
		}
		if ((this.external_IP_address && this.external_webhook_address && this.internal_webhook_port) || (this.relay_address && this.internal_IP_address && this.internal_webhook_port)) {
			this.log.debug('Will listen for Webhooks matching Webhook ID %s', this.webhook_key)
			server
				.createServer(options, (request, response) => {
					let authPassed
					if (this.useBasicAuth) {
						if (request.headers.authorization) {
							let b64encoded = Buffer.from(this.user + ':' + this.password, 'utf8').toString('base64')
							this.log.debug('webhook request authorization header=%s', request.headers.authorization)
							this.log.debug('webhook expected authorization header=%s', 'Basic ' + b64encoded)
							if (request.headers.authorization == 'Basic ' + b64encoded) {
								this.log.debug('Webhook authentication passed')
								authPassed = true
							} else {
								this.log.warn('Webhook authentication failed')
								this.log.debug('Webhook authentication failed', request.headers.authorization)
								authPassed = false
							}
						} else {
							this.log.warn('Expecting webhook authentication')
							this.log.debug('Expecting webhook authentication', request)
							authPassed = false
						}
					} else {
						authPassed = true
					}
					if (request.method === 'GET' && request.url === '/test') {
						this.log.info('Test received on Rachio listener. Webhooks are configured correctly! Authorization %s', authPassed ? 'passed' : 'failed')
						response.writeHead(200)
						response.write(new Date().toTimeString() + ' Webhooks are configured correctly! Authorization ' + authPassed ? 'passed' : 'failed')
						return response.end()
					} else if (request.method === 'POST' && request.url === '/' && authPassed) {
						let body = []
						request
							.on('data', chunk => {
								body.push(chunk)
							})
							.on('end', () => {
								try {
									body = Buffer.concat(body).toString().trim()
									let jsonBody = JSON.parse(body)
									if (this.showWebhookMessages) {
										this.log.debug('webhook request received from <%s> %s', jsonBody.externalId, jsonBody)
									}
									if (jsonBody.externalId === this.webhook_key) {
										let irrigationAccessory = this.accessories[jsonBody.deviceId]
										let irrigationSystemService = irrigationAccessory.getService(Service.IrrigationSystem)
										let service
										if (jsonBody.zoneId) {
											service = irrigationAccessory.getServiceById(Service.Valve, jsonBody.zoneId)
											this.log.debug('Webhook match found for %s will update zone service', service.getCharacteristic(Characteristic.Name).value)
											this.eventMsg(irrigationSystemService, service, jsonBody)
										} else if (jsonBody.scheduleId) {
											service = irrigationAccessory.getServiceById(Service.Switch, jsonBody.scheduleId)
											if (this.showSchedules) {
												this.log.debug('Webhook match found for %s will update schedule service', service.getCharacteristic(Characteristic.Name).value)
												this.eventMsg(irrigationSystemService, service, jsonBody)
											} else {
												this.log.debug('Skipping Webhook for %s service, optional schedule switch is not configured', jsonBody.scheduleName)
											}
										} else if (jsonBody.deviceId && jsonBody.subType.includes('SLEEP')) {
											service = irrigationAccessory.getService(Service.IrrigationSystem)
											if (this.showStandby) {
												this.log.debug('Webhook match found for %s will update irrigation service', service.getCharacteristic(Characteristic.Name).value)
												this.eventMsg(irrigationSystemService, service, jsonBody)
											} else {
												this.log.debug('Skipping Webhook for %s service, optional standby switch is not configured', jsonBody.deviceName)
											}
										} else if (jsonBody.scheduleName == 'Quick Run') {
											if (this.showRunAll && jsonBody.eventType == 'SCHEDULE_COMPLETED_EVENT') {
												this.log.info(jsonBody.description)
												service = irrigationAccessory.getService(Service.IrrigationSystem)
												this.eventMsg(irrigationSystemService, service, jsonBody)
											}
										}
										response.writeHead(204)
										return response.end()
									} else {
										this.log.warn('Webhook received from an unknown external id %s', jsonBody.externalId)
										response.writeHead(404)
										return response.end()
									}
								} catch (err) {
									this.log.error('Error parsing webhook request ' + err)
									response.writeHead(404)
									return response.end()
								}
							})
					}
				})
				.listen(
					this.internal_webhook_port,
					function () {
						this.log.info('This server is listening on port %s.', this.internal_webhook_port)
						if (this.useBasicAuth) {
							this.log.info('Using HTTP basic authentication for Webhooks')
						}
						this.log.info('Make sure your router has port fowarding turned on for port %s to this server`s IP address and this port %s, unless you are using a relay service.', this.external_webhook_port, this.internal_webhook_port)
					}.bind(this)
				)
		} else {
			this.log.warn('Webhook support is disabled. This plugin will not sync Homekit to realtime events from other sources without Webhooks support.')
		}
		return
	}

	async startLiveUpdate(valveService) {
		//check for duplicate call
		let delta = []
		let interval = []
		let serial = valveService.getCharacteristic(Characteristic.SerialNumber).value
		delta[serial] = new Date() - this.timeStamp[serial]
		if (delta[serial] > 500 || delta[serial] == 0) {
			//calls within 1/2 sec will be skipped as duplicate
			this.timeStamp[serial] = new Date()
		} else {
			this.log.debug('Skipped new live update due to duplicate call, timestamp delta %s ms', delta[serial])
			return
		}
		clearInterval(this.lastInterval[serial])
		let startTime = new Date().getTime() //live refresh start time
		if (!this.liveUpdate) {
			this.log.debug('Live update started')
		}
		this.liveUpdate = true
		this.getUpdate(valveService, interval) //fist call
		interval[serial] = setInterval(async () => {
			if (new Date().getTime() - startTime > this.liveTimeout * 60 * 1000 + 500) {
				clearInterval(interval[serial])
				this.liveUpdate = false
				this.log.debug('Live update stopped')
				return
			}
			this.getUpdate(valveService, interval) //remaing calls.
			clearInterval(interval[serial])
		}, this.liveRefresh * 1000)
		this.lastInterval[serial] = interval[serial]
	}

	async getUpdate(valveService, interval) {
		let pause = delay => new Promise(resolve => setTimeout(resolve, delay))
		let serial = valveService.getCharacteristic(Characteristic.SerialNumber).value
		try {
			this.log.debug('updating serial#', serial)
			let response = await this.rachioapi.getValve(this.token, serial).catch(err => {
				this.log.error('Failed to get valve', err)
			})

			if (response.status == 429) {
				this.log.warn('exceeded API rate limiting for the day, backing off')
				clearInterval(interval[serial])
				await pause(15 * 60 * 1000)
				return
			}

			if (response.status == 200) {
				let update = response.data
				let valveAccessory = this.accessories[valveService.subtype]
				let batteryStatus = valveAccessory.getServiceById(Service.Battery, valveService.subtype)
				let timeRemaining = 0
				let duration = update.valve.state.desiredState.defaultRuntimeSeconds
				if (update.valve.state.reportedState.lastWateringAction) {
					let start = update.valve.state.reportedState.lastWateringAction.start
					duration = update.valve.state.reportedState.lastWateringAction.durationSeconds

					let endTime = new Date(start).getTime() + duration * 1000
					timeRemaining = Math.max(Math.round((endTime - Date.now()) / 1000), 0)
					valveService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
					valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
					valveService.getCharacteristic(Characteristic.SetDuration).updateValue(duration)
					valveService.getCharacteristic(Characteristic.RemainingDuration).updateValue(timeRemaining)
					this.endTime[serial] = endTime
				} else {
					valveService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
					valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
					//valveService.getCharacteristic(Characteristic.SetDuration).updateValue(duration)
					//valveService.getCharacteristic(Characteristic.RemainingDuration).updateValue(0)
					this.endTime[serial] = 0
				}

				switch (update.valve.state.reportedState.batteryStatus) {
					case 'GOOD':
						batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
						break
					case 'LOW':
						batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
						break
				}
			}
			return
		} catch (err) {
			this.log.error('error trying to update valve status', err)
		}
	}

	localMessage(listener) {
		this.eventMsg = (irrigationSystemService, service, myJson) => {
			listener(irrigationSystemService, service, myJson)
		}
	}
}
module.exports = RachioPlatform
