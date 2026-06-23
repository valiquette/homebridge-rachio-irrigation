/* eslint-disable @typescript-eslint/no-explicit-any */

import { API, Characteristic, DynamicPlatformPlugin, HAPStatus, HapStatusError, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME, BaseStation, Controller, Valve } from './settings.js';
import axios from 'axios';
import RachioAPI from './rachioapi.js';
import RachioUpdate from './rachioupdate.js';
import listen from './listener.js';
import irrigation from './devices/irrigation.js';
import switches from './devices/switches.js';
import valve from './devices/valve.js';
import skipSwitch from './devices/skipSwitch.js';
import battery from './devices/battery.js';
import bridge from './devices/bridge.js';

let deviceState: { state: { state: string; desiredState: string; firmwareVersion: string; health: string; }; };

export default class RachioPlatform implements DynamicPlatformPlugin{
	[x: string]: any;
	public readonly Service: typeof Service;
	public readonly Characteristic: typeof Characteristic;
	public readonly HAPStatus!: typeof HAPStatus;
	public readonly HapStatusError: typeof HapStatusError;
	public readonly accessories: PlatformAccessory[] = [];
	public readonly valveServices: Service[] = [];
	constructor(
		public readonly log: Logging,
		public readonly config: PlatformConfig,
		public readonly api: API,
	) {
		this.Service = api.hap.Service;
		this.Characteristic = api.hap.Characteristic;
		this.HapStatusError = api.hap.HapStatusError;
		this.platform = this;
		this.genUUID = api.hap.uuid.generate;

		this.log.debug(`Finished initializing platform: ${config.name}`);

		this.rachioapi = new RachioAPI(this);
		this.rachio = new RachioUpdate(this);
		this.listener = new listen(this);
		this.switches = new switches(this);
		this.irrigation = new irrigation(this);
		this.valve = new valve(this);
		this.skipSwitch = new skipSwitch(this);
		this.battery = new battery(this);
		this.bridge = new bridge(this);
		this.token = config.api_key;
		this.retryWait = config.retryWait ? config.retryWait : 60; //sec
		this.retryMax = config.retryMax ? config.retryMax : 3; //attempts
		this.retryAttempt = 0;
		this.auto_correct_IP = config.auto_correct_IP ? config.auto_correct_IP : false;
		this.external_IP_address = config.external_IP_address;
		this.external_webhook_port = config.external_webhook_port;
		this.internal_IP_address = config.internal_IP_address;
		this.internal_webhook_port = config.internal_webhook_port;
		this.relay_address = config.relay_address;
		this.webhook_key = `homebridge-${config.name}`;
		this.webhook_key_local = 'local-webhook';
		this.localWebhook = null;
		this.endTime = [];
		this.delete_webhooks = config.delete_webhooks;
		this.useBasicAuth = config.use_basic_auth;
		this.user = config.user;
		this.password = config.password;
		this.useIrrigationDisplay = config.use_irrigation_display;
		this.defaultRuntime = config.default_runtime * 60;
		this.runtimeSource = config.runtime_source;
		this.showStandby = config.show_standby;
		this.showRunAll = config.show_runall;
		this.showSchedules = config.show_schedules;
		this.locationAddress = config.location_address;
		this.accessories = [];
		this.valveServices = [];
		this.zoneList = [];
		this.valveList = [];
		this.foundLocations= null;
		this.useHttps = config.https ? config.https : false;
		this.key = config.key;
		this.cert = config.cert;
		this.showAPIMessages = config.showAPIMessages ? config.showAPIMessages : false;
		this.showWebhookMessages = config.showWebhookMessages ? config.showWebhookMessages : false;
		this.showBridge = config.showBridge ? config.showBridge : false;
		this.showSkip = config.showPrograms ? config.showPrograms : false;
		this.showControllers = config.showControllers ? config.showControllers : false;
		this.showValves = config.showValves ? config.showValves : false;
		this.valveType = config.valveType ? config.valveType : 0;

		if(this.showSkip && !this.showBridge){
			this.showBridge = true;
			this.log.warn('Expose WiFi Bridge must be set to true in plugin in config when exposing programs');
		}
		if (this.useBasicAuth && (!this.user || !this.password)) {
			this.log.warn('HTTP Basic Athentication cannot be used for webhooks without a valid user and password.');
		}
		if (!this.showValves && !this.showControllers && !this.showBridge) {
			this.log.warn('Plugin is not configured to show any devices!');
		}
		if (!this.token) {
			this.log.error('API KEY is required in order to communicate with the Rachio API, please see https://rachio.readme.io/docs/authentication for instructions.');
		} else {
			this.log.info(`Starting Rachio Platform with homebridge API ${api.version}`);
		}
		//**
		//** Platforms should wait until the "didFinishLaunching" event has fired before registering any new accessories.
		//**
		if (this.api) {
			this.api.on('didFinishLaunching', async() => {
				let x: boolean | void;
				let webhook: any;
				if (this.showControllers || this.showValves) {
					//Get info to configure webhooks
					await this.getWebhookInfo();
					//Configure listerner for webhook messages
					await this.listener.configureListener();
				}
				//Get controllers
				x = await this.getRachioDevices().catch((err) => {
					this.log.error('Failure setting up Controller');
					this.log.debug(err);
				});
				if (this.showControllers) {
					this.log.info('Setting up Controller devices');
					setTimeout(async () => {
						try {
							webhook = await this.rachioapi.listControllerWebhooks(this.token, this.zoneList[0].deviceId);
							if (x) {
								this.log.success('Rachio Platform finished loading Smart Sprinkler Controller');
							} else {
								this.log.warn('No Smart Sprinkler Controllers found');
							}
						} catch (err: any) {
							this.log.debug(err);
							this.log.error(err.message);
						}
					}, 1000);
				}
				//Get valves
				x = await this.getRachioValves().catch((err) => {
					this.log.error('Failure setting up hose timers');
					this.log.debug(err);
				});
				if (this.showValves) {
					this.log.info('Setting up Smart Hose Timers');
					setTimeout(async () => {
						try {
							webhook = await this.rachioapi.listValveWebhooks(this.token, this.valveList[0].valveId);
							if (x) {
								this.log.success('Rachio Platform finished loading Smart Hose Timers');
							} else {
								this.log.warn('No Smart Hose Timers found');
							}
						} catch (err: any) {
							this.log.debug(err);
							this.log.error(err.message);
						}
					}, 1000);
				}
				//Get bridge
				x = await this.getRachioBridges().catch((err) => {
					this.log.error('Failure setting up WiFi Hub');
					this.log.debug(err);
				});
				if (this.showBridge) {
					this.log.info('Setting up Wifi hub');
					setTimeout(() => {
						if (x) {
							this.log.success('Rachio Platform finished loading WiFi Hub');
						} else {
							this.log.warn('No Wifi Hub found');
						}
					}, 1000);
				}
				setTimeout(() => {
					if (webhook) {
						const remaining = webhook.headers.get('x-ratelimit-remaining');
						const limit = webhook.headers.get('x-ratelimit-limit');
						const reset = new Date(webhook.headers.get('x-ratelimit-reset')!.replace(/\[...]/, '')).toString(); //remove [UTC] for valid date regex= /\[...]/
						if (remaining / limit < 0.50) {
							this.log.warn(`API rate limiting; call limit of ${remaining} remaining out of ${limit} until reset at ${reset}`);
						} else {
							this.log.info(`API rate limiting; call limit of ${remaining} remaining out of ${limit} until reset at ${reset}`);
						}
						webhook.data.webhooks.forEach((webhook: any) => {
							if (webhook.externalId == this.webhook_key) {
								this.log.info(
									`To test Webhook setup: Navigate to ${webhook.url}/test to ensure port forwarding is configured correctly.\n` +
									'	Note: For local config this will not work from this server, you cannot be connected to the same router doing the fowarding. The best way to test this is from a cell phone, with WiFi off.',
								);
							}
						});
					};
				}, 1000);
			});
		}
	}

	//**
	//** REQUIRED - Homebridge will call the 'configureAccessory' method once for every cached accessory restored //*
	//**

	configureAccessory(accessory: PlatformAccessory) {
		// Add cached devices to the accessories array
		this.log.info(`Found cached accessory, configuring ${accessory.displayName}`);
		this.accessories.push(accessory);
	}

	identify() {
		this.log.info('Identify the sprinkler!');
	}

	async getWebhookInfo() {
		let ipv4;
		let ipv6;
		let fqdn;
		const ipv4format = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
		// eslint-disable-next-line max-len
		const ipv6format = /(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))/;
		const fqdnformat = /(?=^.{4,253}$)(^((?!-)[a-zA-Z0-9-]{0,62}[a-zA-Z0-9]\.)+[a-zA-Z]{2,63}$)/;
		if (this.relay_address) {
			if (this.useBasicAuth && this.user && this.password) {
				const destination = (this.relay_address.split('//'));
				this.external_webhook_address = `${destination[0]}//${this.user}:${this.password}@${destination[1]}`;
			} else {
				this.external_webhook_address = this.relay_address;
			}
			this.external_webhook_addressv2 = this.relay_address;
		}
		//check external IP address
		if (this.external_IP_address) {
			ipv4 = this.checkIPaddress(this.external_IP_address, ipv4format);
			ipv6 = this.checkIPaddress(this.external_IP_address, ipv6format);
			fqdn = this.checkIPaddress(this.external_IP_address, fqdnformat);
		} else {
			this.log.warn('No external IP or domain name configured, will not configure webhooks. Reference Readme for instructions.');
		}

		if (this.relay_address) {
			this.external_IP_address = this.relay_address;
		} else {
			if (ipv4) {
				axios({
					method: 'get',
					//url: 'https://api4.ipify.org?format=json',
					url: 'https://api.ipify.org?format=json',
					responseType: 'json',
				})
					.then(response => {
						const realExternalIP = response.data.ip;
						if (ipv4 && this.external_IP_address && realExternalIP != this.external_IP_address) {
							this.log.warn(`Configured external IPv4 address of ${this.external_IP_address} does not match this server's detected external IP of ${realExternalIP} please check webhook config settings.`);
							if (this.auto_correct_IP) {
								this.log.warn(`The external IPv4 of this server's detected IP address of ${realExternalIP} will be used based on config, please update webhook config settings.`);
								this.external_IP_address = realExternalIP;
							}
						}
						this.log.debug(`using IPv4 webhook external address ${this.external_IP_address}`);
					})
					.catch((err) => {
						this.log.error('Failed to get current external IP', err.cause);
					});
				this.setWebhookURL();
			} else if (ipv6) {
				axios({
					method: 'get',
					//url: 'https://api6.ipify.org?format=json',
					url: 'https://api64.ipify.org?format=json',
					responseType: 'json',
				})
					.then(response => {
						const realExternalIP = response.data.ip;
						if (ipv6 && this.external_IP_address && realExternalIP != this.external_IP_address) {
							this.log.warn(`Configured external IPv6 address of ${this.external_IP_address} does not match this server's detected external IP of ${realExternalIP} please check webhook config settings.`);
							if (this.auto_correct_IP) {
								this.log.warn(`The external IPv6 of this server's detected IP address of ${realExternalIP} will be used based on config, please update webhook config settings.`);
								this.external_IP_address = realExternalIP;
							}
						}
						this.log.debug(`using IPv6 webhook external address ${this.external_IP_address}`);
					})
					.catch((err) => {
						this.log.error('Failed to get current external IP', err.cause);
					});
				this.external_IP_address = `[${this.external_IP_address}]`;
				this.setWebhookURL();
			} else if (fqdn) {
				this.log.debug(`using FQDN for webhook external destination ${this.external_IP_address}`);
				this.setWebhookURL();
			} else {
				this.log.warn('Cannot validate webhook destination address, will not set Webhooks. Please check webhook config settings for proper format and does not include any prefx like http://');
			}
		}
	}

	checkIPaddress(inputText: string, ipformat: RegExp) {
		try {
			if (inputText.match(ipformat)) {
				return true;
			} else {
				return false;
			}
		} catch (err) {
			this.log.warn(`Error validating IP address ${err}`);
		}
	}

	setWebhookURL() {
		const destination = this.useHttps ? 'https://' : 'http://';
		const port = this.external_webhook_port ? `:${this.external_webhook_port}` : '';

		if (this.useBasicAuth && this.user && this.password) {
			this.external_webhook_address = `${destination}${this.user}:${this.password}@${this.external_IP_address}${port}`;
			this.external_webhook_addressv2 = `${destination}${this.external_IP_address}${port}`;
		} else {
			this.external_webhook_address = `${destination}${this.external_IP_address}${port}`;
			this.external_webhook_addressv2 = `${destination}${this.external_IP_address}${port} `;

		}
		if (!this.external_webhook_address) {
			this.log.warn('Cannot validate webhook destination address, will not set Webhooks. Please check webhook config settings for proper format and does not include any prefx like http://');
		}
	}

	async getRachioDevices() {
		try {
			// getting account info
			this.log.debug('Fetching build info for Smart Sprinkler Controllers...');
			this.log.debug('Getting Person info...');
			const personId = await this.rachioapi.getPersonInfo(this.token).catch((err: unknown) => {
				this.log.error(`Failed to get info for build ${err}`);
				throw err;
			});
			this.log.info(`Found Person ID ${personId.id}`);
			this.log.debug('Getting Person ID info...');
			const personInfo = await this.rachioapi.getPersonId(this.token, personId.id).catch((err: unknown) => {
				this.log.error(`Failed to get person info for build ${err}`);
				throw err;
			});
			this.log.info(`Found Account for username ${personInfo.username}`);
			if (personInfo.devices.length > 0) {
				personInfo.devices.forEach(async (newDevice: Controller) => {
					try {
						this.log.debug('Getting Device info...');
						const device = await this.rachioapi.getDevice(this.token, newDevice.id).catch((err: unknown) => {
							this.log.error(`Failed to get location property ${err}`);
							throw err;
						});
						this.log.debug('Getting Location info...');
						const property = await this.rachioapi.getPropertyEntity(this.token, 'location_id',device.device.locationId).catch((err: unknown) => {
							this.log.error(`Failed to get location property ${err}`);
							throw err;
						});
						this.log.info(`Found Location: id ${property.property.address.id}, at address ${property.property.address.lineOne}, in locality ${property.property.address.locality}`);
						if (this.showController) {
							if (!this.locationAddress || property.property.address.lineOne == this.locationAddress) {
								this.log.info(`Adding controller ${newDevice.name} found at the configured location: ${property.property.address.lineOne}`);
							} else {
								this.log.info(`Skipping controller ${newDevice.name} at ${property.property.address.lineOne}, not found at the configured location: ${this.locationAddress}`);
								return;
							}
						}
						const index = this.accessories.findIndex(accessory => accessory.UUID === newDevice.id);
						// check if still required
						if (!this.showControllers) {
							if (index >= 0) {
								const irrigationAccessory = this.accessories[index];
								this.log.info(`Removing Smart Sprinker Controller ${irrigationAccessory.displayName}`);
								this.log.debug(`Removing Smart Sprinker Controller ${irrigationAccessory.UUID}`);
								this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [irrigationAccessory]);
								this.accessories.splice(index, 1);
							}
							return false;
						}
						//adding devices that met filter criteria
						this.log.info(`Found ${newDevice.status.toLowerCase()} Controller ${newDevice.name}`);
						this.log.debug('Getting device state info...');
						deviceState = await this.rachioapi.getDeviceState(this.token, newDevice.id).catch((err: unknown) => {
							this.log.error(`Failed to get device state ${err}`);
							throw err;
						});
						if (!deviceState) {
							return;
						}
						this.log.info(`Retrieved device state ${deviceState.state.state.toLowerCase()} for ${newDevice.name} with a ${deviceState.state.desiredState.toLowerCase()} state, running firmware ${deviceState.state.firmwareVersion}`);
						if (this.external_webhook_address) {
							this.rachioapi.configureWebhooks(this.token, this.external_webhook_address, this.delete_webhooks, newDevice.id, newDevice.name, this.webhook_key, 'irrigation_controller_id'); //v1 still used for device status
							this.rachioapi.configureWebhooksv2(this.token, this.external_webhook_addressv2, this.delete_webhooks, newDevice.id, newDevice.name, this.webhook_key, 'irrigation_controller_id');
						}

						// Create and configure Irrigation
						this.log.debug(`Found Controller ${newDevice.name}`);
						this.log.debug('Creating and configuring new device');
						const irrigationAccessory: PlatformAccessory = this.irrigation.createIrrigationAccessory(newDevice, deviceState, this.accessories[index]);
						// Register platform accessory
						if (!this.accessories[index]) {
							this.log.debug('Registering platform accessory');
							this.log.info(`Adding new accessory ${irrigationAccessory.displayName}`);
							this.accessories.push(irrigationAccessory);
							this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [irrigationAccessory]);
						} else {
							this.log.debug('Accessory exists, refreshing');
						}
						// Create and configure Value service and link to Irrigation
						newDevice.zones = newDevice.zones.sort((a: { zoneNumber: number; }, b: { zoneNumber: number; }) => {
							return a.zoneNumber - b.zoneNumber;
						});
						newDevice.zones.forEach(zone => {
							if (!this.useIrrigationDisplay && !zone.enabled) {
								this.log.info(`Skipping disabled zone ${zone.name}`);
							} else {
								this.log.debug(`adding zone ${zone.name}`);
								this.zoneList.push({
									deviceId: newDevice.id,
									zone: zone.zoneNumber,
									zoneId: zone.id,
								});
								const valveService = irrigationAccessory.getServiceById(this.Service.Valve, zone.id);
								if (!valveService) {
									//add new
									const valveService = this.irrigation.createValveService(newDevice, zone);
									irrigationAccessory.addService(valveService);
									this.api.updatePlatformAccessories([irrigationAccessory]);
									if (this.useIrrigationDisplay) {
										this.log.debug('using irrigation system');
											irrigationAccessory.getService(this.Service.IrrigationSystem)!.addLinkedService(valveService);
											this.api.updatePlatformAccessories([irrigationAccessory]);
									} else {
										this.log.debug('using separate tiles');
									}
								} else {
									this.irrigation.updateValveService(newDevice, zone, valveService);
									this.irrigation.configureValveService(newDevice, valveService);
									this.api.updatePlatformAccessories([irrigationAccessory]);
								}
							}
						});

						if (this.showSchedules) {
							newDevice.scheduleRules.forEach((schedule) => {
								this.log.debug(`adding schedules ${schedule.name}`);
								let switchService: Service = irrigationAccessory.getServiceById(this.Service.Switch, schedule.id)!;
								if (switchService) {
									//update
									switchService.setCharacteristic(this.Characteristic.On, false).setCharacteristic(this.Characteristic.Name, schedule.name).setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
									this.switches.configureSwitchService(newDevice, switchService);
									this.api.updatePlatformAccessories([irrigationAccessory]);
								} else {
									//add new
									switchService = this.switches.createScheduleSwitchService(schedule);
									this.switches.configureSwitchService(newDevice, switchService);
									irrigationAccessory.addService(switchService);
									this.api.updatePlatformAccessories([irrigationAccessory]);
								}
									irrigationAccessory.getService(this.Service.IrrigationSystem)!.addLinkedService(switchService);
							});
							newDevice.flexScheduleRules.forEach((schedule) => {
								this.log.debug(`adding flex schedules ${schedule.name}`);
								let switchService: Service = irrigationAccessory.getServiceById(this.Service.Switch, schedule.id)!;
								if (switchService) {
									//update
									switchService.setCharacteristic(this.Characteristic.On, false).setCharacteristic(this.Characteristic.Name, schedule.name).setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
									this.switches.configureSwitchService(newDevice, switchService);
									this.api.updatePlatformAccessories([irrigationAccessory]);
								} else {
									//add new
									switchService = this.switches.createScheduleSwitchService(schedule);
									this.switches.configureSwitchService(newDevice, switchService);
									irrigationAccessory.addService(switchService);
									this.api.updatePlatformAccessories([irrigationAccessory]);
								}
									irrigationAccessory.getService(this.Service.IrrigationSystem)!.addLinkedService(switchService);
							});
						} else {
							//remove
							newDevice.scheduleRules.forEach((schedule: { id: string; }) => {
								this.log.debug('removed schedule switch');
								const switchService = irrigationAccessory.getServiceById(this.Service.Switch, schedule.id);
								if (switchService) {
									irrigationAccessory.removeService(switchService);
									this.api.updatePlatformAccessories([irrigationAccessory]);
								}
							});
							newDevice.flexScheduleRules.forEach((schedule: { id: string; }) => {
								this.log.debug('removed flex schedule switch');
								const switchService = irrigationAccessory.getServiceById(this.Service.Switch, schedule.id);
								if (switchService) {
									irrigationAccessory.removeService(switchService);
									this.api.updatePlatformAccessories([irrigationAccessory]);
								}
							});
						}

						if (this.showStandby) {
							this.log.debug('adding new standby switch');
							const switchType = 'Standby';
							const switchName = `${newDevice.name} ${switchType}`;
							const uuid = this.genUUID(switchName);
							let switchService: Service = irrigationAccessory.getServiceById(this.Service.Switch, uuid)!;
							if (switchService) {
								//update
								switchService.setCharacteristic(this.Characteristic.On, false).setCharacteristic(this.Characteristic.Name, switchName).setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
								this.switches.configureSwitchService(newDevice, switchService);
								this.api.updatePlatformAccessories([irrigationAccessory]);
							} else {
								//add new
								switchService = this.switches.createSwitchService(switchName, uuid);
								this.switches.configureSwitchService(newDevice, switchService);
								irrigationAccessory.addService(switchService);
								this.api.updatePlatformAccessories([irrigationAccessory]);
							}
								irrigationAccessory.getService(this.Service.IrrigationSystem)!.addLinkedService(switchService);
								this.api.updatePlatformAccessories([irrigationAccessory]);
						} else {
							//remove
							this.log.debug('removed standby switch');
							const switchType = 'Standby';
							const switchName = `${newDevice.name} ${switchType}`;
							const uuid = this.genUUID(switchName);
							const switchService = irrigationAccessory.getServiceById(this.Service.Switch, uuid);
							if (switchService) {
								irrigationAccessory.removeService(switchService);
								this.api.updatePlatformAccessories([irrigationAccessory]);
							}
						}

						if (this.showRunAll) {
							this.log.debug('adding new run all switch');
							const switchType = 'Quick Run All';
							const switchName = `${newDevice.name} ${switchType}`;
							const uuid = this.genUUID(switchName);
							let switchService: Service = irrigationAccessory.getServiceById(this.Service.Switch, uuid)!;
							if (switchService) {
								//update
								switchService.setCharacteristic(this.Characteristic.On, false).setCharacteristic(this.Characteristic.Name, switchName).setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
								this.switches.configureSwitchService(newDevice, switchService);
								this.api.updatePlatformAccessories([irrigationAccessory]);
							} else {
								//add new
								switchService = this.switches.createSwitchService(switchName, uuid);
								this.switches.configureSwitchService(newDevice, switchService);
								irrigationAccessory.addService(switchService);
								this.api.updatePlatformAccessories([irrigationAccessory]);
							}
								irrigationAccessory.getService(this.Service.IrrigationSystem)!.addLinkedService(switchService);
								this.api.updatePlatformAccessories([irrigationAccessory]);
						} else {
							//remove
							const switchType = 'Quick Run All';
							this.log.debug('removed Quick Run All');
							const uuid = this.genUUID(`${newDevice.name} ${switchType}`);
							const switchService = irrigationAccessory.getServiceById(this.Service.Switch, uuid);
							if (switchService) {
								irrigationAccessory.removeService(switchService);
								this.api.updatePlatformAccessories([irrigationAccessory]);
							}
						}
						//find any running zone and set its state
						this.log.debug('Getting Schedule info...');
						const schedule = await this.rachioapi.currentSchedule(this.token, newDevice.id).catch((err: unknown) => {
							this.log.error('Failed to get current schedule', err);
							throw err;
						});
						this.log.debug('Check current schedule');
						//match state to Rachio state
						this.setOnlineStatus(newDevice);
						this.setValveStatus(schedule.data);
						if (this.showStandby) {
							this.setDeviceStatus(newDevice);
						}
					} catch (err) {
						this.log.warn(`Error ${err}`);
					}
				});
				return true;
			} else {
				return false;
			}
		} catch (err) {
			if (this.retryAttempt < this.retryMax) {
				this.retryAttempt++;
				this.log.warn(`Error ${err}`);
				this.log.error(`Failed to get devices. Retry attempt ${this.retryAttempt} of ${this.retryMax} in ${this.retryWait} seconds`);
				setTimeout(async () => {
					this.getRachioDevices();
				}, this.retryWait * 1000);
			} else {
				this.log.error(`Failed to get devices\n${err}`);
			}
		}
	}

	async getRachioValves() {
		try {
			// getting account info
			this.log.debug('Fetching build info for Smart Hose Timers...');
			this.log.debug('Getting Person info...');
			const personId = await this.rachioapi.getPersonInfo(this.token).catch((err: unknown) => {
				this.log.error(`Failed to get info for build ${err}`);
				throw err;
			});
			this.log.info(`Found Person ID ${personId.id}`);
			this.log.debug('Getting Person ID info...');
			const personInfo = await this.rachioapi.getPersonId(this.token, personId.id).catch((err: unknown) => {
				this.log.error(`Failed to get person info for build ${err}`);
				throw err;
			});
			this.log.info(`Found Account for username ${personInfo.username}`);
			this.log.debug('Getting Base Station info...');
			const list = await this.rachioapi.listBaseStations(this.token, personId.id).catch((err: unknown) => {
				this.log.error(`Failed to get base station list ${err}`);
				throw err;
			});
			if (list.baseStations.length > 0) {
				list.baseStations.forEach(async (baseStation: BaseStation) => {
					this.log.debug('Getting Property info...');
					const property = await this.rachioapi.getPropertyEntity(this.token, 'base_station_id', baseStation.id).catch((err: unknown) => {
						this.log.error(`Failed to get base station property ${err}`);
						throw err;
					});
					this.log.debug('Getting Valve list info...');
					const valveList = await this.rachioapi.listValves(this.token, baseStation.id).catch((err: unknown) => {
						this.log.error('Failed to get valve list', err);
						throw err;
					});
					if (valveList.valves.length > 0) {
						valveList.valves.forEach(async (valve: Valve, zoneNumber: number) => {
							try {
								valve.zone = zoneNumber + 1;
								this.valveList.push({
									valveId: valve.id,
									name: valve.name,
									zone: valve.zone,
								});
								const index = this.accessories.findIndex(accessory => accessory.UUID === valve.id);
								// check if still required
								if (!this.showValves) {
									if (index >= 0) {
										const valveAccessory = this.accessories[index];
										this.log.info(`Removing Smart Hose Timer ${valveAccessory.displayName}`);
										this.log.debug(`Removing Smart Hose Timer ${valveAccessory.UUID}`);
										this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [valveAccessory]);
										this.accessories.splice(index, 1);
									}
									return false;
								}
								// Check if accessory changed
								if (index >= 0) {
									if (this.accessories[index].getService(this.Service.AccessoryInformation)!.getCharacteristic(this.Characteristic.ProductData).value != 'Valve') {
										this.log.warn('Changing from Irrigation to Valve, check room assignments in Homekit');
										this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessories[index]]);
										this.accessories.splice(index, 1);
									}
								}
								//adding devices that met filter criteria
								this.log.info(`Found Smart Hose Timer ${valve.name} connected: ${valve.state.reportedState.connected}`);
								if (valve.state.reportedState.firmwareUpgradeAvailable) {
									this.log.warn(`Valve ${valve.name} firmware upgrade available`);
								}
								if (valve.state.reportedState.firmwareUpgradeInProgress) {
									this.log.warn(`Valve ${valve.name} firmware upgrade in progress ${valve.state.reportedState.firmwareVersion}`);
								}
								if (this.external_webhook_address) {
									this.rachioapi.configureWebhooksv2(this.token, this.external_webhook_addressv2, this.delete_webhooks, valve.id, valve.name, this.webhook_key, 'valve_id');
								}

								// Create and configure Valve
								this.log.debug('Creating and configuring new valve');
								const valveAccessory = this.valve.createValveAccessory(baseStation, property, valve, this.accessories[index]);
								// Register platform accessory
								if (!this.accessories[index]) {
									this.log.debug('Registering platform accessory');
									this.log.info(`Adding new accessory ${valveAccessory.displayName}`);
									this.accessories.push(valveAccessory);
									this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [valveAccessory]);
								} else {
									this.log.debug('Accessory exists, refreshing');
								}
								// Create and configure Battery
								if (valve.state.reportedState.batteryStatus != null) {
									this.log.info(`Adding Battery status for ${valve.name}`);
									let batteryStatus: Service = valveAccessory.getService(this.Service.Battery);
									//batteryStatus.getCharacteristic(this.Characteristic.SerialNumber).updateValue(valve.id) // should be temp
									if (batteryStatus) {
										//update
										this.battery.configureBatteryService(batteryStatus);
										switch (valve.state.reportedState.batteryStatus) {
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
											this.log.warn(`Replace batteries for ${valve.name} soon`);
											break;
										}
									} else {
										//add new
										batteryStatus = this.battery.createBatteryService(valve, valve.id);
										this.battery.configureBatteryService(batteryStatus);
										valveAccessory.addService(batteryStatus);
										this.api.updatePlatformAccessories([valveAccessory]);
									}
									batteryStatus = valveAccessory.getService(this.Service.Battery);
									valveAccessory.getService(this.Service.Valve).addLinkedService(batteryStatus);
								} else {
									//remove
									this.log.debug(`${valve.name} has no battery found, skipping add battery service`);
									const batteryStatus = valveAccessory.getService(this.Service.Battery);
									if (batteryStatus) {
										valveAccessory.removeService(batteryStatus);
										this.api.updatePlatformAccessories([valveAccessory]);
									}
								}
								//find any running zone and set its state
								/*
								future effort
								this.log.debug('Finding any running zones...');
								const programs = await this.rachioapi.listPrograms(this.token, valve.id).catch((err: unknown) => {
									this.log.error('Failed to get current programs', err);
									throw err;
								});
								this.log.debug('Check current programs');
								//this.setValveStatus(programs.data)
								*/
							}catch (err) {
								this.log.warn(`Error ${err}`);
							}
						});
					}
				});
				return true;
			} else {
				return false;
			}
		} catch (err) {
			if (this.retryAttempt < this.retryMax) {
				this.retryAttempt++;
				this.log.error(`Failed to get valves. Retry attempt ${this.retryAttempt} of ${this.retryMax} in ${this.retryWait} seconds`);
				setTimeout(async () => {
					this.getRachioValves();
				}, this.retryWait * 1000);
			} else {
				this.log.error(`Failed to get devices\n${err}`);
			}
		}
	}

	async getRachioBridges() {
		try {
			// getting account info
			this.log.debug('Fetching build info for WiFi Hub...');
			this.log.debug('Getting Person info...');
			const personId = await this.rachioapi.getPersonInfo(this.token).catch((err: unknown) => {
				this.log.error(`Failed to get info for build ${err}`);
				throw err;
			});
			this.log.info(`Found Person ID ${personId.id}`);
			this.log.debug('Getting Person ID info...');
			const personInfo = await this.rachioapi.getPersonId(this.token, personId.id).catch((err: unknown) => {
				this.log.error(`Failed to get person info for build ${err}`);
				throw err;
			});
			this.log.info(`Found Account for username ${personInfo.username}`);
			this.log.debug('Getting Base Station info...');
			const list = await this.rachioapi.listBaseStations(this.token, personId.id).catch((err: unknown) => {
				this.log.error(`Failed to get base station list ${err}`);
				throw err;
			});
			if (list.baseStations.length > 0) {
				list.baseStations.forEach(async (baseStation: BaseStation) => {
					this.log.debug('Getting Property info...');
					const property = await this.rachioapi.getPropertyEntity(this.token, 'base_station_id', baseStation.id).catch((err: unknown) => {
						this.log.error(`Failed to get base station property ${err}`);
						throw err;
					});
					if (this.showBridge) {
						if (!this.locationAddress || property.property.address.lineOne == this.locationAddress) {
							this.log.info(`Found WiFi Hub ${baseStation.serialNumber} at the configured location: ${property.property.address.lineOne}`);
						} else {
							this.log.info(`Skipping WiFi Hub ${baseStation.serialNumber} at ${property.property.address.lineOne}, not found at the configured location: ${this.locationAddress}`);
							return;
						}
					}
					if (baseStation.reportedState.firmwareUpgradeAvailable) {
						this.log.warn('Hub firmware upgrade available');
					}
					const index = this.accessories.findIndex(accessory => accessory.UUID === baseStation.id);
					// check if still required
					if (!this.showBridge) {
						if (index >= 0) {
							const bridgeAccessory = this.bridge.createBridgeAccessory(baseStation, property, this.accessories[index]);
							this.log.info(`Removing Smart Hose Bridge ${bridgeAccessory.displayName}`);
							this.log.debug(`Removing Smart Hose Bridge ${bridgeAccessory.UUID}`);
							this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessories[index]]);
							this.accessories.splice(index, 1);
						}
						return false;
					}

					// Create and configure Bridge
					this.log.debug(`Found WiFi Hub ${property.property.address.locality}`);
					this.log.debug('Creating and configuring new Wifi Hub');
					const bridgeAccessory = this.bridge.createBridgeAccessory(baseStation, property, this.accessories[index]);
					// Register platform accessory
					if (!this.accessories[index]) {
						this.log.debug('Registering platform accessory');
						this.log.info('Adding WiFi Hub');
						this.accessories.push(bridgeAccessory);
						this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [bridgeAccessory]);
					} else {
						this.log.debug('Accessory exists, refreshing');
					}
					// Create and configure Bridge service
					let bridgeService = bridgeAccessory.getService(this.Service.WiFiTransport);
					// set current device status
					if (!bridgeService) {
						bridgeService = this.bridge.createBridgeService(baseStation, property);
						bridgeAccessory.addService(bridgeService);
					}
					this.bridge.configureBridgeService(bridgeService);
					bridgeService.getCharacteristic(this.Characteristic.CurrentTransport).updateValue(baseStation.reportedState.connected);
					if (this.showSkip) {
						// Create and configure skip switch
						this.log.debug('Adding Skip Program Switches');
						this.log.debug('Creating and configuring switch to toggle manual skip');
						this.setSkip(baseStation);
						//set loop here

						const now = new Date();
						const midnight = new Date();
						midnight.setHours(24, 1, 0, 0); // Sets to 00:01:00
						setTimeout(() => {
							setInterval(() => {
								this.log.info('Checking for programs chnages');
								this.setSkip(baseStation);
							}, 24 * 60 * 60 * 1000); // every 24 hours
							this.setSkip(baseStation);
						}, midnight.getTime() - now.getTime()); //to next midnight
						//this.log.info(new Date(midnight.getTime() - now.getTime()).toISOString().slice(11, 16))
					}
				});
				return true;
			} else {
				return false;
			}
		} catch (err) {
			if (this.retryAttempt < this.retryMax) {
				this.retryAttempt++;
				this.log.error(`Failed to get valves. Retry attempt ${this.retryAttempt} of ${this.retryMax} in ${this.retryWait} seconds`);
				setTimeout(async () => {
					this.getRachioBridges();
				}, this.retryWait * 1000);
			} else {
				this.log.error(`Failed to get devices\n${err}`);
			}
		}
	}

	setOnlineStatus(newDevice: { status: string; id: string; }) {
		//set current device status
		//create a fake webhook response
		if (newDevice.status) {
			let myJson: any;
			switch (newDevice.status) {
			case 'ONLINE':
				myJson = {
					externalId: this.webhook_key_local,
					type: 'DEVICE_STATUS',
					deviceId: newDevice.id,
					subType: 'ONLINE',
					timestamp: new Date().toISOString(),
				};
				break;
			case 'OFFLINE':
				myJson = {
					externalId: this.webhook_key_local,
					type: 'DEVICE_STATUS',
					deviceId: newDevice.id,
					subType: 'OFFLINE',
					timestamp: new Date().toISOString(),
				};
				break;
			}
			this.log.debug(`Found ${newDevice.status.toLowerCase()} device`);
			if (this.showAPIMessages) {
				this.log.debug(myJson);
			}
			const index = this.accessories.findIndex(accessory => accessory.UUID === myJson.deviceId);
			const irrigationAccessory = this.accessories[index];
			const irrigationSystemService = irrigationAccessory.getService(this.Service.IrrigationSystem);
			const service = irrigationAccessory.getService(this.Service.IrrigationSystem);
			this.log.debug('Updating device status');
			this.listener.localMessage(irrigationSystemService, service, myJson );
		}
	}

	setDeviceStatus(newDevice: { id: string; name: string; }) {
		//set current device state
		//create a fake webhook response
		if (deviceState.state.health == 'GOOD') {
			let myJson: any;
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
					subType: 'SLEEP_MODE_OFF',
				};
				break;
			case 'DESIRED_STANDBY':
				myJson = {
					summary: 'No scheduled waterings will run on controller.',
					externalId: this.webhook_key_local,
					eventType: 'DEVICE_MANUAL_STANDBY_ON_EVENT',
					type: 'DEVICE_STATUS',
					title: 'Standby Mode ON',
					deviceId: newDevice.id,
					deviceName: newDevice.name,
					subType: 'SLEEP_MODE_ON',
				};
				break;
			}
			this.log.debug('Found healthy device');
			if (this.showAPIMessages) {
				this.log.debug(myJson);
			}
			const index = this.accessories.findIndex(accessory => accessory.UUID === myJson.deviceId);
			const irrigationAccessory = this.accessories[index];
			const irrigationSystemService = irrigationAccessory.getService(this.Service.IrrigationSystem);
			const switchService = irrigationAccessory.getServiceById(this.Service.Switch, this.platform.genUUID(`${myJson.deviceName} Standby`))!;
			this.log.debug('Updating standby switch state');
			this.listener.localMessage(irrigationSystemService, switchService, myJson );
		}
	}

	setValveStatus(response: { status: string; zoneNumber: number; deviceId: string; zoneDuration: number; zoneId: string; zoneStartDate: number; scheduleId: string; name: string; }) {
		//set current valve status
		//create a fake webhook response
		if (response.status == 'PROCESSING') {
			//create a fake webhook response
			this.log.debug(`Found zone-${response.zoneNumber} running`);
			const myJson = {
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
				resourceType: 'DEVICE',
			};
			if (this.showAPIMessages) {
				this.log.debug(myJson.toString());
			}
			const index = this.accessories.findIndex(accessory => accessory.UUID === myJson.deviceId);
			const irrigationAccessory = this.accessories[index];
			const irrigationSystemService = irrigationAccessory.getService(this.Service.IrrigationSystem);
			const service = irrigationAccessory.getServiceById(this.Service.Valve, myJson.zoneId);
			this.log.debug(`Zone running match found for zone-${myJson.zoneNumber} on start will update services`);
			this.listener.localMessage(irrigationSystemService, service, myJson);

		}
		if (response.status == 'PROCESSING' && this.showSchedules && response.scheduleId != undefined) {
			this.log.debug(`Found schedule ${response.scheduleId} running`);
			const myJson = {
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
				resourceType: 'DEVICE',
			};
			if (this.showAPIMessages) {
				this.log.debug(myJson.toString());
			}
			const index = this.accessories.findIndex(accessory => accessory.UUID === myJson.deviceId);
			const irrigationAccessory = this.accessories[index];
			const irrigationSystemService = irrigationAccessory.getService(this.Service.IrrigationSystem);
			const service = irrigationAccessory.getServiceById(this.Service.Switch, myJson.scheduleId);
			this.log.debug(`Schedule running match found for schedule ${myJson.scheduleName} on start will update services`);
			this.listener.localMessage( irrigationSystemService, service, myJson );
		}
	}

	async setSkip(baseStation: { id: string; }){
		try {
			//create schedule to get planned runs for the day
			//and or remove new switches for the day
			this.log.debug('Getting Valve daily view info...');
			const programs = await this.rachioapi.getValveDayViews(this.token, baseStation.id).catch((err: unknown) => {
				throw (`Failed to get base station list ${err}`);
			});
			const activePrograms: string[] = [];
			const index = this.accessories.findIndex(accessory => accessory.UUID === baseStation.id);
			const bridgeAccessory = this.accessories[index];
			programs.valveDayViews.forEach((day: { valveProgramRunSummaries: { programId: string; programName: string; }[]; }) => {
				day.valveProgramRunSummaries.forEach((run: { programId: string; programName: string; }) => {
					activePrograms.push(run.programId);
					this.log.info(`Updating program ${run.programName}`);
					let skipService = bridgeAccessory.getServiceById(this.Service.Switch, run.programId)!;
					if (!skipService) {
						skipService = this.skipSwitch.createSwitchService(`Skip ${run.programName}`, run.programId);
						this.log.info(`Adding program switch ${skipService.displayName}`);
						bridgeAccessory.addService(skipService);
					}
					this.skipSwitch.configureSwitchService(baseStation, skipService);
					this.log.debug('Updating skip program switches');
					if (!this.accessories[index]) {
						this.log.debug('Registering platform accessory');
						this.accessories.push(bridgeAccessory);
						this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [bridgeAccessory]);
					}
				});
				//logic to remove old switch
				bridgeAccessory.services.forEach((service: Service) => {
					if(service.constructor.name == 'Switch'){
						const found = activePrograms.find((element) => element == service.subtype);
						if (!found) {
							const skipService = bridgeAccessory.getServiceById(this.Service.Switch, service.subtype!);
							if (skipService) {
								this.log.info(`Removing unused program switch ${service.displayName}`);
								bridgeAccessory.removeService(skipService);
								this.api.updatePlatformAccessories([bridgeAccessory]);
							}
						}
					}
				});
			});
		} catch (err) {
			this.log.error(`Error ${err}`);
		}
	}

}