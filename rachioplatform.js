/*
Known issues
Time remaining for homebridge accessory, homekit and Rachio run a little out of sync.
Zone Cyclying message may be out of sequence
*/

'use strict'
let axios=require('axios')
let http=require('http')
let https=require('https')
let fs=require('fs')
let RachioAPI=require('./rachioapi')
let RachioUpdate=require('./rachioupdate')
let irrigation=require('./devices/irrigation')
let switches=require('./devices/switches')
let deviceState

class RachioPlatform {
	constructor(log, config, api){
		this.rachioapi=new RachioAPI(this, log)
		this.rachio=new RachioUpdate(this, log, config)
		this.irrigation=new irrigation(this, log)
		this.switches=new switches(this, log)
		this.log=log
		this.config=config
		this.token=config.api_key
		this.retryWait=config.retryWait ? config.retryWait : 60 //sec
		this.retryMax=config.retryMax ? config.retryMax : 3 //attempts
		this.retryAttempt=0
		this.auto_correct_IP=config.auto_correct_IP ? config.auto_correct_IP : false
		this.external_IP_address=config.external_IP_address
		this.external_webhook_port=config.external_webhook_port
		this.internal_IP_address=config.internal_IP_address
		this.internal_webhook_port=config.internal_webhook_port
		this.relay_address=config.relay_address
		this.webhook_key='homebridge-'+config.name
		this.webhook_key_local='simulated-webhook'
		this.fakeWebhook
		this.endTime=[]
		this.delete_webhooks=config.delete_webhooks
		this.useBasicAuth=config.use_basic_auth
		this.user=config.user
		this.password=config.password
		this.useIrrigationDisplay=config.use_irrigation_display
		this.defaultRuntime=config.default_runtime*60
		this.runtimeSource=config.runtime_source
		this.showStandby=config.show_standby
		this.showRunall=config.show_runall
		this.showSchedules=config.show_schedules
		this.locationAddress=config.location_address
		this.locationMatch=true
		this.accessories=[]
		this.realExternalIP
		this.foundLocations
		this.useHttps=config.https ? config.https : false
		this.key=config.key
		this.cert=config.cert
		this.showAPIMessages=config.showAPIMessages ? config.showAPIMessages : false
		this.showWebhookMessages=config.showWebhookMessages ? config.showWebhookMessages : false

		if (this.useBasicAuth && (!this.user || !this.password)){
			this.log.warn(`HTTP Basic Athentication cannot be used for webhooks without a valid user and password.`)
		}

		if (!this.token){
			this.log.error(`API KEY is required in order to communicate with the Rachio API, please see https://rachio.readme.io/docs/authentication for instructions.`)
		}
		else {
			this.log(`Starting Rachio Platform with homebridge API ${api.version}`)
		}
		//**
		//** Platforms should wait until the "didFinishLaunching" event has fired before registering any new accessories.
		//**
		if (api){
			this.api=api
			this.api.on("didFinishLaunching", async function (){
				//Get info to configure webhooks
				await this.getWebhookInfo()
				//Configure listerner for webhook messages
				this.configureListener()
				//Get devices
				this.getRachioDevices()
			}.bind(this))
		}
	}

	identify(){
		this.log('Identify the sprinkler!')
	}

	setWebhookURL(){
		let destination=this.useHttps ? 'https://' : 'http://'
		let port=this.external_webhook_port ? ':'+this.external_webhook_port : ''

		if (this.useBasicAuth && this.user && this.password){
			this.external_webhook_address=destination+this.user+":"+this.password+"@"+this.external_IP_address+port
		}
		else {
			this.external_webhook_address=destination+this.external_IP_address+port
		}
		if(!this.ipv4 && !this.ipv6 && !this.fqdn){
			this.external_webhook_address=null
			this.log.warn(`Cannot validate webhook destination address, will not set Webhooks. Please check webhook config settings for proper format and does not include any prefx like http://`)
		}
	}

	async getWebhookInfo(){
		if(this.relay_address){
			this.useBasicAuth=false
			this.external_webhook_address=this.relay_address
		}
		//check external IP address
		if (this.external_IP_address){
			this.ipv4format= /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
			this.ipv6format= /(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))/;
			this.fqdnformat= /(?=^.{4,253}$)(^((?!-)[a-zA-Z0-9-]{0,62}[a-zA-Z0-9]\.)+[a-zA-Z]{2,63}$)/;

			this.ipv4=checkIPaddress(this.external_IP_address,this.ipv4format)
			this.ipv6=checkIPaddress(this.external_IP_address,this.ipv6format)
			this.fqdn=checkIPaddress(this.external_IP_address,this.fqdnformat)
		}
		else {
			this.log.warn(`No external IP or domain name configured, will not configure webhooks. Reference Readme for instructions.`)
		}

		function checkIPaddress(inputText,ipformat){
			try {
				if (inputText.match(ipformat))
					{return true}
				else
					{return false}
			}
			catch(err){
				log.warn(`Error validating IP address ${err}`)
				return
			}
		}
		if (this.relay_address){
			this.log.warn(`Using Webhook Relay @ ${this.relay_address}`)
			this.external_IP_address=this.relay_address
		}
		else{
			if (this.ipv4){
				axios({
					method: 'get',
					url: 'https://ip4only.me/api/',
					responseType: 'text'
				}).then(response=> {
					let addressV4=response.data.split(',')
					this.realExternalIP=addressV4[1]
					if (this.ipv4 && this.external_IP_address && this.realExternalIP != this.external_IP_address){
						this.log.warn(`Configured external IPv4 address of ${this.external_IP_address} does not match this server's detected external IP of ${this.realExternalIP} please check webhook config settings.`)
						if (this.auto_correct_IP){
							this.log.warn(`The external IPv4 of this server's detected IP address of ${this.realExternalIP} will be used based on config, please update webhook config settings.`)
							this.external_IP_address=this.realExternalIP
							this.setWebhookURL()
						}
					}
				this.log.debug(`using IPv4 webhook external address ${this.external_IP_address}`)
				}).catch(err=>{this.log.error('Failed to get current external IP', err.cause)})
			}
			else if (this.ipv6){
				axios({
					method: 'get',
					url: 'https://ip6only.me/api/',
					responseType: 'text'
				}).then(response=> {
					let addressV6=response.data.split(',')
					this.realExternalIP=addressV6[1]
					if (this.ipv6 && this.external_IP_address && this.realExternalIP != this.external_IP_address){
						this.log.warn(`Configured external IPv6 address of ${this.external_IP_address} does not match this server's detected external IP of ${this.realExternalIP} please check webhook config settings.`)
						if (this.auto_correct_IP){
							this.log.warn(`The external IPv6 of this server's detected IP address of ${this.realExternalIP} will be used based on config, please update webhook config settings.`)
							this.external_IP_address=this.realExternalIP
							this.setWebhookURL()
						}
					}
				this.log.debug(`using IPv6 webhook external address ${this.external_IP_address}`)
				}).catch(err=>{this.log.error('Failed to get current external IP', err.cause)})
			}
			else if (this.fqdn){
				this.log.debug(`using FQDN for webhook external destination ${this.external_IP_address}`)
				this.setWebhookURL()
			}
			else {
				this.external_webhook_address=null
				this.log.warn(`Cannot validate webhook destination address, will not set Webhooks. Please check webhook config settings for proper format and does not include any prefx like http://`)
			}
		}
	}

	async getRachioDevices(){
		try{
		// getting account info
			this.log.debug('Fetching build info...')
			this.log.info('Getting Person info...')
			let personId=await this.rachioapi.getPersonInfo(this.token).catch(err=>{this.log.error('Failed to get info for build', err)})
			this.log('Found Person ID %s',personId.id)

			this.log.info('Getting Person ID info...')
			let personInfo=await this.rachioapi.getPersonId(this.token,personId.id).catch(err=>{this.log.error('Failed to get person info for build', err)})
			this.log.info('Found Account for username %s',personInfo.username)
			this.log.info('Getting Location info...')

			let location=await this.rachioapi.getLocationList(this.token).catch(err=>{this.log.error('Failed to get location summary', err)})
			location.locationSummary.forEach(address=>{
				this.log.info('Found Location: id=%s address=%s geo=%s',address.location.id,address.location.address.addressLine1,address.location.geoPoint)
				this.foundLocations=location.locationSummary
				address.location.deviceId.forEach(device=>{
					this.log.info('Found Location: device id=%s ',device)
				})
			})

			personInfo.devices.filter((newDevice)=>{
				this.foundLocations.forEach((location)=>{
					location.location.deviceId.forEach((device)=>{
						if (!this.locationAddress || this.locationAddress==location.location.address.addressLine1){
							if (newDevice.id==device){
							this.log.info('Adding controller %s found at the configured location: %s',newDevice.name,location.location.address.addressLine1)
							this.locationMatch=true
							}
						}
						else {
							if (newDevice.id==device){
							this.log.info('Skipping controller %s at %s, not found at the configured location: %s',newDevice.name,location.location.address.addressLine1,this.locationAddress,)
							this.locationMatch=false
							}
						}
					})
				})
				return this.locationMatch
			}).forEach(async(newDevice)=>{
				//adding devices that met filter criteria
				this.log.info('Found device %s status %s',newDevice.name,newDevice.status)
				let uuid=newDevice.id
				this.log.info('Getting device state info...')
				deviceState=await this.rachioapi.getDeviceState(this.token,newDevice.id).catch(err=>{this.log.error('Failed to get device state', err)})
				if(!deviceState){return}
				//deviceState=state.data
				this.log('Retrieved device state %s for %s with a %s state, running',deviceState.state.state,newDevice.name,deviceState.state.desiredState,deviceState.state.firmwareVersion)
				if (this.external_webhook_address){
					this.rachioapi.configureWebhooks(this.token,this.external_webhook_address,this.delete_webhooks,newDevice.id,this.webhook_key)
				}
				//remove cached accessory
				if (this.accessories[uuid]){
					this.log.debug('Removed cached device')
					this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
					delete this.accessories[uuid]
				}
				let switchService
				// Create and configure Irrigation Service
				this.log.debug('Creating and configuring new device')
				let irrigationAccessory=this.irrigation.createIrrigationAccessory(newDevice,deviceState)
				this.irrigation.configureIrrigationService(newDevice,irrigationAccessory.getService(Service.IrrigationSystem))

				// Create and configure Values services and link to Irrigation Service
				newDevice.zones=newDevice.zones.sort(function (a, b){
					return a.zoneNumber - b.zoneNumber
				})
				newDevice.zones.forEach((zone)=>{
					if (!this.useIrrigationDisplay && !zone.enabled){
						this.log.info('Skipping disabled zone %s',zone.name )
					}
					else {
						this.log.debug('adding zone %s',zone.name )
						let valveService=this.irrigation.createValveService(zone)
						this.irrigation.configureValveService(newDevice, valveService)
						if (this.useIrrigationDisplay){
							this.log.debug('Using irrigation system')
							irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(valveService)
							irrigationAccessory.addService(valveService)
						}
						else {
							this.log.debug('Using separate tiles')
							irrigationAccessory.getService(Service.IrrigationSystem)
							irrigationAccessory.addService(valveService)
						}
					}
				})

				if (this.showSchedules){
					newDevice.scheduleRules.forEach((schedule)=>{
						this.log.debug('adding schedules %s',schedule.name )
						switchService=this.switches.createScheduleSwitchService(schedule)
						this.switches.configureSwitchService(newDevice, switchService)
						irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
						irrigationAccessory.addService(switchService)
					})
					newDevice.flexScheduleRules.forEach((schedule)=>{
						this.log.debug('adding schedules %s',schedule.name )
						switchService=this.switches.createScheduleSwitchService(schedule)
						this.switches.configureSwitchService(newDevice, switchService)
						irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
						irrigationAccessory.addService(switchService)
					})
				}

				if (this.showStandby){
					this.log.debug('adding new standby switch')
					switchService=this.switches.createSwitchService(newDevice,newDevice.name+' Standby')
					this.switches.configureSwitchService(newDevice, switchService)
					irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
					irrigationAccessory.addService(switchService)
				}

				if (this.showRunall){
					this.log.debug('adding new run all switch')
					switchService=this.switches.createSwitchService(newDevice,newDevice.name+' Quick Run-All')
					this.switches.configureSwitchService(newDevice, switchService)
					irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
					irrigationAccessory.addService(switchService)
				}

				// Register platform accessory
				this.log.debug('Registering platform accessory')
				this.api.registerPlatformAccessories(PluginName, PlatformName, [irrigationAccessory])
				this.accessories[uuid]=irrigationAccessory

				//match state to Rachio state
				this.setOnlineStatus(newDevice)
				this.setDeviceStatus(newDevice)

				//find any running zone and set its state
				let schedule=await this.rachioapi.currentSchedule (this.token,newDevice.id).catch(err=>{this.log.error('Failed to get current schedule', err)})
				this.setValveStatus(schedule.data)
				this.log.info('API rate limiting; call limit of %s remaining out of %s until reset at %s',schedule.headers['x-ratelimit-remaining'],schedule.headers['x-ratelimit-limit'], new Date(schedule.headers['x-ratelimit-reset']).toString())
			})
			setTimeout(()=>{this.log.info('Rachio Platform finished loading')}, 1000)
		}catch(err){
			if(this.retryAttempt<this.retryMax){
				this.retryAttempt++
				this.log.error('Failed to get devices. Retry attempt %s of %s in %s seconds...',this.retryAttempt, this.retryMax, this.retryWait)
				setTimeout(async()=>{
					this.getRachioDevices()
				},this.retryWait*1000)
			}
			else{
				this.log.error('Failed to get devices...\n%s', err)
			}
		}
	}

	//**
	//** REQUIRED - Homebridge will call the "configureAccessory" method once for every cached accessory restored
	//**
	configureAccessory(accessory){
		// Add cached devices to the accessories array
		this.log.info('Found cached accessory, configuring %s',accessory.displayName)
		this.accessories[accessory.UUID]=accessory
	}

	setOnlineStatus(newDevice){
	//set current device status
	//create a fake webhook response
		if (newDevice.status){
			let myJson
			switch(newDevice.status){
				case "ONLINE":
					myJson={
						externalId: this.webhook_key_local,
						type: "DEVICE_STATUS",
						deviceId: newDevice.id,
						subType: "ONLINE",
						timestamp: new Date().toISOString()
					}
					break
				case "OFFLINE":
					myJson={
					externalId: this.webhook_key_local,
					type: "DEVICE_STATUS",
					deviceId: newDevice.id,
					subType: "OFFLINE",
					timestamp: new Date().toISOString()
					}
					break
			}
			this.log.debug('Found online device')
			if(this.showAPIMessages){this.log.debug(myJson)}
			let irrigationAccessory=this.accessories[myJson.deviceId]
			let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem)
			let service=irrigationAccessory.getServiceById(Service.IrrigationSystem)
			this.log.debug('Updating device status')
			this.eventMsg(irrigationSystemService,service,myJson)
		}
	}

	setDeviceStatus(newDevice){
		//set current device state
		//create a fake webhook response
		if (deviceState.state.health=='GOOD'){
			let myJson
			switch(deviceState.state.desiredState){
				case "DESIRED_ACTIVE":
					myJson={
					summary: 'Scheduled waterings will now run on controller.' ,
					externalId: this.webhook_key_local,
					eventType: 'DEVICE_MANUAL_STANDBY_ON_EVENT',
					type: 'DEVICE_STATUS',
					title: 'Standby Mode Off',
					deviceId: newDevice.id,
					deviceName: newDevice.name,
					subType: 'SLEEP_MODE_OFF',
					}
					break
				case "DESIRED_STANDBY":
					myJson={
					summary: 'No scheduled waterings will run on controller.' ,
					externalId: this.webhook_key_local,
					eventType: 'DEVICE_MANUAL_STANDBY_ON_EVENT',
					type: 'DEVICE_STATUS',
					title: 'Standby Mode ON',
					deviceId: newDevice.id,
					deviceName: newDevice.name,
					subType: 'SLEEP_MODE_ON',
					}
					break
			}
			this.log.debug('Found healthy device')
			if(this.showAPIMessages){this.log.debug(myJson)}
			let irrigationAccessory=this.accessories[myJson.deviceId]
			let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem)
			this.log.debug('Updating standby switch state')
			this.eventMsg(irrigationSystemService,irrigationSystemService,myJson)
		}
	}

	setValveStatus(response){
		if (response.status=='PROCESSING'){
			//create a fake webhook response
			this.log.debug('Found zone-%s running',response.zoneNumber)
			let myJson={
				type: 'ZONE_STATUS',
				title: 'Zone Started',
				deviceId: response.deviceId,
				duration: response.zoneDuration,
				zoneNumber: response.zoneNumber,
				zoneId: response.zoneId,
				zoneRunState: 'STARTED',
				durationInMinutes: Math.round(response.zoneDuration/60),
				externalId: this.webhook_key_local,
				eventType: 'DEVICE_ZONE_RUN_STARTED_EVENT',
				subType: 'ZONE_STARTED',
				startTime: response.zoneStartDate,
				endTime: new Date(response.zoneStartDate+(response.zoneDuration*1000)).toISOString(),
				category: 'DEVICE',
				resourceType: 'DEVICE'
			}
			if(this.showAPIMessages){this.log.debug(myJson)}
			let irrigationAccessory=this.accessories[myJson.deviceId]
			let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem)
			let service=irrigationAccessory.getServiceById(Service.Valve,myJson.zoneId)
			this.log.debug('Zone running match found for zone-%s on start will update services',myJson.zoneNumber)
			this.eventMsg(irrigationSystemService,service,myJson)
		}
		if (response.status=='PROCESSING' && this.showSchedules && response.scheduleId != undefined){
			this.log.debug('Found schedule %s running',response.scheduleId)
			let myJson={
				type: 'SCHEDULE_STATUS',
				title: 'Schedule Manually Started',
				deviceId: response.deviceId,
				deviceName: response.name,
				duration: response.zoneDuration/60,
				scheduleName: 'Quick Run',
				scheduleId: response.scheduleId,
				externalId: this.webhook_key_local,
				eventType: 'SCHEDULE_STARTED_EVENT',
				subType: 'SCHEDULE_STARTED',
				endTime: new Date(response.zoneStartDate+(response.zoneDuration*1000)).toISOString(),
				category: 'SCHEDULE',
				resourceType: 'DEVICE'
			}
			if(this.showAPIMessages){this.log.debug(myJson)}
			let irrigationAccessory=this.accessories[myJson.deviceId]
			let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem)
			let service=irrigationAccessory.getServiceById(Service.Switch,myJson.scheduleId)
			this.log.debug('Schedule running match found for schedule %s on start will update services',myJson.scheduleName)
			this.eventMsg(irrigationSystemService,service,myJson)
		}
	}

	configureListener(){
		//set local listener
		this.localMessage(this.rachio.updateService.bind(this))
		this.irrigation.localMessage(this.rachio.updateService.bind(this))
		//set network listener
		let server=(this.useHttps) ? https : http
		let options={}
		if (server==https){
			options={
				key: fs.readFileSync(this.key),
				cert: fs.readFileSync(this.cert)
			}
		}
		if ((this.external_IP_address && this.external_webhook_address && this.internal_webhook_port) || (this.relay_address && this.internal_IP_address && this.internal_webhook_port)){
		this.log.debug('Will listen for Webhooks matching Webhook ID %s',this.webhook_key)
		server.createServer(options,(request, response)=>{
			let authPassed
			if (this.useBasicAuth){
				if (request.headers.authorization){
					let b64encoded=(Buffer.from(this.user+":"+this.password,'utf8')).toString('base64')
					this.log.debug('webhook request authorization header=%s',request.headers.authorization)
					this.log.debug('webhook expected authorization header=%s',"Basic "+b64encoded)
					if (request.headers.authorization == "Basic "+b64encoded){
						this.log.debug("Webhook authentication passed")
						authPassed=true
					}
					else {
						this.log.warn('Webhook authentication failed')
						this.log.debug("Webhook authentication failed",request.headers.authorization)
						authPassed=false
					}
				}
				else {
					this.log.warn('Expecting webhook authentication')
					this.log.debug('Expecting webhook authentication',request)
					authPassed=false
				}
			}
			else {
				authPassed=true
			}
			if (request.method === 'GET' && request.url === '/test'){
				this.log.info('Test received on Rachio listener. Webhooks are configured correctly! Authorization %s',authPassed ? 'passed' : 'failed')
				response.writeHead(200)
				response.write( new Date().toTimeString()+' Webhooks are configured correctly! Authorization '+authPassed ? 'passed' : 'failed')
				return response.end()
			}
			else if (request.method === 'POST' && request.url === '/' && authPassed){
				let body=[]
				request.on('data', (chunk)=>{
					body.push(chunk)
				}).on('end', ()=>{
					try {
						body=Buffer.concat(body).toString().trim()
						let jsonBody=JSON.parse(body)
						if (this.showWebhookMessages) {this.log.debug('webhook request received from <%s> %s',jsonBody.externalId,jsonBody)}
						if (jsonBody.externalId === this.webhook_key){
							let irrigationAccessory=this.accessories[jsonBody.deviceId]
							let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem)
							let service
							if (jsonBody.zoneId){
								service=irrigationAccessory.getServiceById(Service.Valve,jsonBody.zoneId)
								this.log.debug('Webhook match found for %s will update zone service',service.getCharacteristic(Characteristic.Name).value)
								this.eventMsg(irrigationSystemService,service,jsonBody)
							}
							else if (jsonBody.scheduleId){
								service=irrigationAccessory.getServiceById(Service.Switch,jsonBody.scheduleId)
								if (this.showSchedules){
									this.log.debug('Webhook match found for %s will update schedule service',service.getCharacteristic(Characteristic.Name).value)
									this.eventMsg(irrigationSystemService,service,jsonBody)
								}
								else {
									this.log.debug('Skipping Webhook for %s service, optional schedule switch is not configured',jsonBody.scheduleName)
								}
							}
							else if (jsonBody.deviceId && jsonBody.category!='SCHEDULE'){
								service=irrigationAccessory.getServiceById(Service.IrrigationSystem)
								if (this.showStandby){
									this.log.debug('Webhook match found for %s will update irrigation service',service.getCharacteristic(Characteristic.Name).value)
									this.eventMsg(irrigationSystemService,service,jsonBody)
								}
								else {
									this.log.debug('Skipping Webhook for %s service, optional standby switch is not configured',jsonBody.deviceName)
								}
							}
						response.writeHead(204)
						return response.end()
						}
						else {
						this.log.warn('Webhook received from an unknown external id %s',jsonBody.externalId)
						response.writeHead(404)
						return response.end()
						}
					}
					catch(err){
						this.log.error('Error parsing webhook request ' + err)
						response.writeHead(404)
						return response.end()
					}
				})
			}
		}).listen(this.internal_webhook_port, function (){
			this.log.info('This server is listening on port %s.',this.internal_webhook_port)
			if (this.useBasicAuth){this.log.info('Using HTTP basic authentication for Webhooks')}
			this.log.info('Make sure your router has port fowarding turned on for port %s to this server`s IP address and this port %s, unless you are using a relay service.',this.external_webhook_port,this.internal_webhook_port)
		}.bind(this))
	}
	else {
		this.log.warn('Webhook support is disabled. This plugin will not sync Homekit to realtime events from other sources without Webhooks support.')
	}
	return
	}

	localMessage(listener){
		this.eventMsg=(irrigationSystemService,service,myJson)=>{
			listener(irrigationSystemService,service,myJson)
		}
	}
  }
module.exports=RachioPlatform