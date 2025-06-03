/*
Known issues
Time remaining for homebridge accessory, homekit and Rachio run a little out of sync.
Zone Cyclying message may be out of sequence
*/

'use strict'
let axios = require('axios')
let RachioAPI = require('./rachioapi')
let RachioUpdate = require('./rachioupdate')
let listener = require('./listener')
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
		this.listener = new listener(this, log, config)
		this.irrigation = new irrigation(this, log, config)
		this.switches = new switches(this, log)
		this.valve = new valve(this, log, config)
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
		this.webhook_key_local = 'local-webhook'
		this.localWebhook
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
		this.accessories = []
		this.zoneList = []
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
					if (this.showControllers || this.showValves) {
						//Get info to configure webhooks
						await this.getWebhookInfo()
						//Configure listerner for webhook messages
						await this.listener.configureListener()
					}
					if (this.showControllers) {
						//Get controllers
						this.log.info('Setting up Controller devices')
						let x = await this.getRachioDevices().catch(err => {
							this.log.error ('Failure launching plugin, controller')
						})
						setTimeout(() => {
							if (x) {
								this.log.success('Rachio Platform finished loading Smart Sprinkler Controller')
							} else {
								this.log.warn('No Smart Sprinkler Controllers found')
							}
						}, 1000)
					}
					if (this.showValves) {
						//Get valves
						this.log.info('Setting up Wifi hub devices')
						let x = await this.getRachioValves().catch(err => {
							this.log.error ('Failure launching plugin, hose timers')
						})
						setTimeout(() => {
							if (x) {
								this.log.success('Rachio Platform finished loading Smart Hose Timers')
							} else {
								this.log.warn('No Smart Hose Timers found')
							}
						}, 1000)
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
			this.external_webhook_addressv2 = this.relay_address
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
				this.external_IP_address = '[' + this.external_IP_address + ']'
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

	setWebhookURL() {
		let destination = this.useHttps ? 'https://' : 'http://'
		let port = this.external_webhook_port ? ':' + this.external_webhook_port : ''

		if (this.useBasicAuth && this.user && this.password) {
			this.external_webhook_address = destination + this.user + ':' + this.password + '@' + this.external_IP_address + port
			this.external_webhook_addressv2 = destination + this.external_IP_address + port
		} else {
			this.external_webhook_address = destination + this.external_IP_address + port
			this.external_webhook_addressv2 = destination + this.external_IP_address + port

		}
		if (!this.external_webhook_address) {
			this.log.warn(`Cannot validate webhook destination address, will not set Webhooks. Please check webhook config settings for proper format and does not include any prefx like http://`)
		}
	}

	async getRachioDevices() {
		let completed = true
		try {
			// getting account info
			this.log.debug('Fetching build info for Smart Sprinkler Controllers...')
			this.log.info('Getting Person info...')
			let personId = await this.rachioapi.getPersonInfo(this.token).catch(err => {
				this.log.error('Failed to get info for build', err)
				throw err
			})
			this.log('Found Person ID %s', personId.id)

			this.log.info('Getting Person ID info...')
			let personInfo = await this.rachioapi.getPersonId(this.token, personId.id).catch(err => {
				this.log.error('Failed to get person info for build', err)
				throw err
			})
			this.log.info('Found Account for username %s', personInfo.username)
			this.log.info('Getting Location info...')
			if (personInfo.devices.length > 0) {
				let location
				personInfo.devices
					.filter(async newDevice => {
						let device = await this.rachioapi.getDevice(this.token, newDevice.id).catch(err => {
							this.log.error('Failed to get location property', err)
							throw err
						})
						location = await this.rachioapi.getPropertyEntity(this.token, 'location_id',device.device.locationId).catch(err => {
							this.log.error('Failed to get location property', err)
							throw err
						})
						this.log.info('Found Location: id = %s address = %s locality = %s', location.property.address.id, location.property.address.lineOne, location.property.address.locality)
						if (!this.locationAddress || location.property.address.lineOne == this.locationAddress) {
							this.log.info('Adding controller %s found at the configured location: %s', newDevice.name, location.property.address.lineOne)
							return true
						} else {
							this.log.info('Skipping controller %s at %s, not found at the configured location: %s', newDevice.name, location.property.address.lineOne, this.locationAddress)
							return false
						}
					})
					.forEach(async newDevice => {
						try{
							//adding devices that met filter criteria
							this.log.info('Found Controller %s status %s', newDevice.name, newDevice.status)
							let uuid = newDevice.id
							this.log.info('Getting device state info...')
							deviceState = await this.rachioapi.getDeviceState(this.token, newDevice.id).catch(err => {
								this.log.error('Failed to get device state', err)
								//throw new Error ('Test')
								throw err
							})
							if (!deviceState) {
								return
							}
							this.log('Retrieved device state %s for %s with a %s state, running', deviceState.state.state, newDevice.name, deviceState.state.desiredState, deviceState.state.firmwareVersion)
							if (this.external_webhook_address) {
								this.rachioapi.configureWebhooks(this.token, this.external_webhook_address, this.delete_webhooks, newDevice.id, newDevice.name, this.webhook_key, 'irrigation_controller_id')
								this.rachioapi.configureWebhooksv2(this.token, this.external_webhook_addressv2, this.delete_webhooks, newDevice.id, newDevice.name, this.webhook_key, 'irrigation_controller_id')
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
									this.zoneList.push({
										deviceId: newDevice.id,
										zone: zone.zoneNumber,
										zoneId: zone.id
									})
									let valveService = irrigationAccessory.getServiceById(Service.Valve, zone.id)
									if (valveService) {
										this.irrigation.updateValveService(newDevice, zone, valveService)
										this.irrigation.configureValveService(newDevice, valveService)
										this.api.updatePlatformAccessories([irrigationAccessory])
									} else {
										//add new
										valveService = this.irrigation.createValveService(zone)
										this.irrigation.updateValveService(newDevice, valveService)
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

							//find any running zone and set its state
							let schedule = await this.rachioapi.currentSchedule(this.token, newDevice.id).catch(err => {
								this.log.error('Failed to get current schedule', err)
								throw err
							})
							this.log.debug('Check current schedule')
							//match state to Rachio state
							this.setOnlineStatus(newDevice)
							this.setDeviceStatus(newDevice)
							this.setValveStatus(schedule.data)

							//remove [UTC] for valid date regex= /\[...]/
							this.log.info(
								'API rate limiting; call limit of %s remaining out of %s until reset at %s',
								schedule.headers['x-ratelimit-remaining'],
								schedule.headers['x-ratelimit-limit'],
								new Date(schedule.headers['x-ratelimit-reset'].replace(/\[...]/, '')).toString()
							)
						} catch (err) {
							this.log.warn(err)
							completed = false
						}
					})
				return completed ///not working
			} else {
				return false
			}
		} catch (err) {
			if (this.retryAttempt < this.retryMax) {
				this.retryAttempt++
				this.log.warn(err)
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
				throw err
			})
			this.log('Found Person ID %s', personId.id)

			this.log.info('Getting Person ID info...')
			let personInfo = await this.rachioapi.getPersonId(this.token, personId.id).catch(err => {
				this.log.error('Failed to get person info for build', err)
				throw err
			})
			this.log.info('Found Account for username %s', personInfo.username)
			this.log.info('Getting Location info...')

			let list = await this.rachioapi.listBaseStations(this.token, personId.id).catch(err => {
				this.log.error('Failed to get base station list', err)
				throw err
			})
			if (list.baseStations.length > 0) {
				let location
				list.baseStations
					.filter(async baseStation => {
						location = await this.rachioapi.getPropertyEntity(this.token, 'base_station_id', baseStation.id).catch(err => {
							this.log.error('Failed to get base station property', err)
							throw err
						})
						if (!this.locationAddress || location.property.address.lineOne == this.locationAddress) {
							this.log('Found WiFi Hub %s at the configured location: %s', baseStation.serialNumber, location.property.address.lineOne)
							return true
						} else {
							this.log('Skipping WiFi Hub %s st %s, not found at the configured location: %s', baseStation.serialNumber, location.property.address.lineOne, this.locationAddress)
							return false
						}
					})
					.forEach(async baseStation => {
						//pulling bridge location
						location = await this.rachioapi.getPropertyEntity(this.token, 'base_station_id', baseStation.id).catch(err => {
							this.log.error('Failed to get base station property', err)
							throw err
						})
						let uuid = baseStation.id
						if (baseStation.reportedState.firmwareUpgradeAvailable) {
							this.log.warn('Hub firmware upgrade available')
						}
						if (this.showBridge) {
							this.log.debug('Adding Hub Device')
							this.log.debug('Found WiFi Hub %s', location.property.address.locality)

							// Create and configure Bridge Service
							this.log.debug('Creating and configuring new Wifi Hub')
							let bridgeAccessory = this.bridge.createBridgeAccessory(baseStation, location, this.accessories[uuid])
							let bridgeService = bridgeAccessory.getService(Service.WiFiTransport)
							bridgeService = this.bridge.createBridgeService(baseStation, location)
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
							this.log.info('Skipping WiFi Hub %s based on config for', this.locationAddress)
						}

						let valveList = await this.rachioapi.listValves(this.token, baseStation.id).catch(err => {
							this.log.error('Failed to get valve list', err)
							throw err
						})
						if (valveList.valves.length > 0) {
							valveList.valves.forEach(async (valve, index) => {
								//this.log.debug(JSON.stringify(valve, null, 2))//temp
								let uuid = valve.id
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
								if (this.external_webhook_address) {
									this.rachioapi.configureWebhooksv2(this.token, this.external_webhook_addressv2, this.delete_webhooks, valve.id, valve.name, this.webhook_key, 'valve_id')
								}

								// Create and configure Irrigation Service
								this.log.debug('Creating and configuring new valve')
								let valveAccessory = this.valve.createValveAccessory(baseStation, location.property, valve, this.accessories[uuid])
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
											case 'REPLACE':
												batteryStatus.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
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
									throw err
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
				return true
			} else {
				return false
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
			this.listener.eventMsg(irrigationSystemService, service, myJson)
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
			this.listener.eventMsg(irrigationSystemService, irrigationSystemService, myJson)
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
			this.listener.eventMsg(irrigationSystemService, service, myJson)
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
			this.listener.eventMsg(irrigationSystemService, service, myJson)
		}
	}
}
module.exports = RachioPlatform
