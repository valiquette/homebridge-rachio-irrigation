/* todo list
Known issues 
Time remaining for homebridge accessory runs about 2x fast but homekit is fine
Pause states not reflected corrrecly in homebridge but ok in homekit 
Schedule/zone duration when found throws warnings exceding 60 minutes
*/

'use strict'
const axios=require('axios')
const http=require('http')
const packageJson=require('./package')
const RachioAPI=require('./rachioapi')
let personInfo
let personId
let deviceState
let requestServer

class RachioPlatform {

  constructor(log, config, api){
    this.rachioapi=new RachioAPI(this,log)
    this.log=log
    this.config=config
    this.token=config.api_key
    this.external_IP_address=config.external_IP_address
    this.external_webhook_port=config.external_webhook_port
    this.internal_webhook_port=config.internal_webhook_port
    this.webhook_key='hombridge-'+config.name
    this.webhook_key_local='simulated-webhook'
    this.delete_webhooks=config.delete_webhooks
    this.use_basic_auth=config.use_basic_auth
    this.user=config.user
    this.password=config.password
    this.use_irrigation_display=config.use_irrigation_display
    this.default_runtime=config.default_runtime*60
    this.show_standby=config.show_standby
    this.show_runall=config.show_runall
    this.show_schedules=config.show_schedules
    this.locationAddress=config.location_address
    this.locationMatch=true
    this.accessories=[]
    this.realExternalIP
    this.fakeWebhook 
    this.foundLocation
    if(this.use_basic_auth && this.user && this.password){
      this.external_webhook_address="http://"+this.user+":"+this.password+"@"+this.external_IP_address+':'+this.external_webhook_port
    }
    else{
      this.external_webhook_address="http://"+this.external_IP_address+':'+this.external_webhook_port
    }

    if(this.use_basic_auth && (!this.user || !this.password)){
      this.log.warn("HTTP Basic Athentication cannot be used for webhooks without a valid user and password")
    }

    if(!this.token){
      this.log.error('API KEY is required in order to communicate with the Rachio API, please see https://rachio.readme.io/docs/authentication for instructions')
    }
    else {
      this.log('Starting Rachio Platform with homebridge API', api.version)
    }

    //check external IP address
    if(this.external_IP_address){  
    this.ipv4format= /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    this.ipv6format= /(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))/;
    this.fqdnformat= /(?=^.{4,253}$)(^((?!-)[a-zA-Z0-9-]{0,62}[a-zA-Z0-9]\.)+[a-zA-Z]{2,63}$)/;

    this.ipv4=CheckIPaddress(this.external_IP_address,this.ipv4format)
    this.ipv6=CheckIPaddress(this.external_IP_address,this.ipv6format)
    this.fqdn=CheckIPaddress(this.external_IP_address,this.fqdnformat)
    }
    else{
    this.log.warn('No external IP or domain name configured, will not configure webhooks. Reference Readme for instructions')
    }

    function CheckIPaddress(inputText,ipformat){
    try{
      if(inputText.match(ipformat))
        {return true}
      else
        {return false}
      }
      catch (err){  
        log.warn('Error validating IP address ' + err)
        return
      }
    }

    if(this.ipv4){
      axios({
        method: 'get',
        url: 'http://ip4only.me/api/',
        responseType: 'text'
      }).then(response=> {
        let addressV4=response.data.split(',')
        this.realExternalIP=addressV4[1]
        if(this.ipv4 && this.external_IP_address && this.realExternalIP != this.external_IP_address){
          this.log.warn('Configured external IPv4 address of %s does not match this servers detected external IP of %s please check webhook config settings.',this.external_IP_address,this.realExternalIP)
      }
      }).catch(err=>{this.log.error('Failed to get current external IP', err)}) 
      this.log.debug('using IPv4 webhook external address')
    }
    else if(this.ipv6){
      axios({
        method: 'get',
        url: 'http://ip6only.me/api/',
        responseType: 'text'
      }).then(response=> {
        let addressV6=response.data.split(',')
        this.realExternalIP=addressV6[1]
        if(this.ipv4 && this.external_IP_address && this.realExternalIP != this.external_IP_address){
          this.log.warn('Configured external IPv6 address of %s does not match this servers detected external IP of %s please check webhook config settings.',this.external_IP_address,this.realExternalIP)
      }
      }).catch(err=>{this.log.error('Failed to get current external IP', err)}) 
      this.log.debug('using IPv6 webhook external address')
    }
    else if(this.fqdn){this.log.debug('using FQDN for webhook external destination')} 
    else {
      this.external_webhook_address=null 
      this.log.warn('Cannot validate webhook destination address, please check webhook config settings. Will not set Webhooks')
    }

    //** 
    //** Platforms should wait until the "didFinishLaunching" event has fired before registering any new accessories.
    //**  
    if(api){
        this.api=api;
        this.api.on("didFinishLaunching", function (){
          //Get devices
          this.getRachioDevices()
        }.bind(this))     
      }
    }

  identify (){
    this.log('Identify the sprinkler!')
  }
  
  getRachioDevices(){
    // configure listerner for webhook messages
    this.configureListener()
    this.log.debug('Fetching build info...')  
    this.log.info('Getting Person info...')
    this.rachioapi.getPersonInfo(this.token).then(response=>{
      personId=response.data.id
      this.log('Found Person ID %s',personId)

      this.log.info('Getting Person ID info...')
      this.rachioapi.getPersonId(this.token,personId).then(response=>{
        personInfo=response
        this.log.info('Found Account for username %s',personInfo.data.username)
        this.log.info('Getting Location info...')
        this.rachioapi.getLocationList(this.token,).then(response=>{
          response.data.locationSummary.forEach(address=>{
            this.log.info('Found Location: id=%s address=%s geo=%s',address.location.id,address.location.address.addressLine1,address.location.geoPoint)
            this.foundLocation=response.data.locationSummary
            address.location.deviceId.forEach(device=>{
              this.log.info('Found Location: device id=%s ',device)
            })
          })

        personInfo.data.devices.filter((newDevice)=>{
          this.foundLocation.forEach((address)=>{
            address.location.deviceId.forEach((device)=>{
              if(!this.locationAddress || (this.locationAddress==address.location.address.addressLine1 && newDevice.id==device)){  
                this.log.info('Adding controller %s found at the configured location: %s',newDevice.name,address.location.address.addressLine1)
                this.locationMatch=true
              }
              else{
                this.log.info('Skipping controller %s at %s, not found at the configured location: %s',newDevice.name,this.locationAddress,address.location.address.addressLine1)
                this.locationMatch=false
              }
            })
          })
          return this.locationMatch
          }).forEach((newDevice)=>{    
            //adding devices that met filter criteria
            this.log.info('Found sevice %s status %s',newDevice.name,newDevice.status)
            let uuid=newDevice.id
            this.log.info('Getting device state info...')
            this.rachioapi.getDeviceState(this.token,newDevice.id).then(response=>{
              deviceState=response.data
              this.log('Retrieved device state %s for %s with a %s state, running',deviceState.state.state,newDevice.name,deviceState.state.desiredState,deviceState.state.firmwareVersion)
              
              if(this.external_webhook_address){  
                this.rachioapi.configureWebhooks(this.token,this.external_webhook_address,this.delete_webhooks,newDevice.id,this.webhook_key)
              }
              //remove cached accessory
              this.log.debug('Removed cached device')
              if(this.accessories[uuid]){
                this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
                delete this.accessories[uuid]
              }
              let switchService
              // Create and configure Irrigation Service
              this.log.debug('Creating and configuring new device')            
              let irrigationAccessory=this.createIrrigationAccessory(newDevice)
              this.configureIrrigationService(newDevice,irrigationAccessory.getService(Service.IrrigationSystem))
            
              // Create and configure Values services and link to Irrigation Service
              newDevice.zones=newDevice.zones.sort(function (a, b){
                return a.zoneNumber - b.zoneNumber
              })
              newDevice.zones.forEach((zone)=>{
                if(!this.use_irrigation_display && !zone.enabled){
                  this.log.info('Skipping disabled zone %s',zone.name )
                }
                else {
                  this.log.debug('adding zone %s',zone.name )
                  let valveService=this.createValveService(zone)
                  this.configureValveService(newDevice, valveService)
                  if(this.use_irrigation_display){
                    this.log.debug('Using irrigation system')
                    irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(valveService) 
                  }
                  else{
                    this.log.debug('Using separate tiles')
                    irrigationAccessory.getService(Service.IrrigationSystem)
                  }           
                  irrigationAccessory.addService(valveService);
                }
              })
              if(this.show_schedules){
                newDevice.scheduleRules.forEach((schedule)=>{
                  this.log.debug('adding schedules %s',schedule.name )
                  switchService=this.createScheduleSwitchService(schedule)
                  this.configureSwitchService(newDevice, switchService)
                  irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
                  irrigationAccessory.addService(switchService)
              })         
              }
              if(this.show_schedules){
                newDevice.flexScheduleRules.forEach((schedule)=>{
                  this.log.debug('adding schedules %s',schedule.name )
                  switchService=this.createScheduleSwitchService(schedule)
                  this.configureSwitchService(newDevice, switchService)
                  irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
                  irrigationAccessory.addService(switchService)
              })         
              }
              if(this.show_runall){
                this.log.debug('adding new run all switch')
                switchService=this.createSwitchService(newDevice,newDevice.name+' Run All')
                this.configureSwitchService(newDevice, switchService)
                irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService) 
                irrigationAccessory.addService(switchService)
                }
              if(this.show_standby){
                this.log.debug('adding new standby switch')
                switchService=this.createSwitchService(newDevice,newDevice.name+' Standby')
                this.configureSwitchService(newDevice, switchService)
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
              this.rachioapi.currentSchedule (this.token,newDevice.id).then(response=>{   
                this.setValveStatus(response)
                this.log.info('API rate limiting; call limit of %s remaining out of %s until reset at %s',response.headers['x-ratelimit-remaining'],response.headers['x-ratelimit-limit'], new Date(response.headers['x-ratelimit-reset']).toString())
              }).catch(err=>{this.log.error('Failed to get current schedule', err)})      
            }).catch(err=>{this.log.error('Failed to get device state', err)}) 
          })
        }).catch(err=>{this.log.error('Failed to get location summary', err)})
      }).catch(err=>{this.log.error('Failed to get person info for build', err)})
    }).catch(err=>{this.log.error('Failed to get info for build', err)})
  }

  //**
  //** REQUIRED - Homebridge will call the "configureAccessory" method once for every cached accessory restored
  //**
  configureAccessory(accessory){
    // Add cached devices to the accessories arrary
    this.log.info('Found cached accessory, configuring %s',accessory.displayName)
    this.accessories[accessory.UUID]=accessory
  }

  createIrrigationAccessory(device){
    this.log.debug('Create Irrigation service %s',device.id,device.name)
    // Create new Irrigation System Service
    let newPlatformAccessory=new PlatformAccessory(device.name, device.id)
    newPlatformAccessory.addService(Service.IrrigationSystem, device.name)
    let irrigationSystemService=newPlatformAccessory.getService(Service.IrrigationSystem)
    // Check if the device is connected
    if(device.status == 'ONLINE'){
      irrigationSystemService.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
    } else {
      irrigationSystemService.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT)
    }
    // Create AccessoryInformation Service
    newPlatformAccessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Name, device.name)
      .setCharacteristic(Characteristic.Manufacturer, 'Rachio')
      .setCharacteristic(Characteristic.SerialNumber, device.serialNumber)
      .setCharacteristic(Characteristic.Model, device.model)
      .setCharacteristic(Characteristic.Identify, true)
      .setCharacteristic(Characteristic.FirmwareRevision, deviceState.state.firmwareVersion)
      .setCharacteristic(Characteristic.HardwareRevision, 'Rev-2')
      .setCharacteristic(Characteristic.SoftwareRevision, packageJson.version)
    return newPlatformAccessory;
  }

  configureIrrigationService(device,irrigationSystemService){
    this.log.info('Configure Irrigation service for %s', irrigationSystemService.getCharacteristic(Characteristic.Name).value)
    // Configure IrrigationSystem Service
    irrigationSystemService 
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE)
      .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
      .setCharacteristic(Characteristic.RemainingDuration, 0)
    // Check if the device is connected
    switch (device.status){
      case "ONLINE": 
        //irrigationSystemService.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
      break
      case "OFFLINE":
        //irrigationSystemService.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT)
      break
    }
    switch (device.scheduleModeType){
      case "OFF": 
        irrigationSystemService.setCharacteristic(Characteristic.ProgramMode, Characteristic.ProgramMode.NO_PROGRAM_SCHEDULED)
      break
      case "SCHEDULED": 
        irrigationSystemService.setCharacteristic(Characteristic.ProgramMode, Characteristic.ProgramMode.PROGRAM_SCHEDULED)
      break
      case "MANUAL": 
        irrigationSystemService.setCharacteristic(Characteristic.ProgramMode, Characteristic.ProgramMode.PROGRAM_SCHEDULED_MANUAL_MODE_)
      break
      default:
        this.log.info('Failed to retrieve program mode setting a default value. Retrieved-', device.data.scheduleModeType)
        irrigationSystemService.setCharacteristic(Characteristic.ProgramMode, Characteristic.ProgramMode.PROGRAM_SCHEDULED_MANUAL_MODE_)
    break
    }   
    irrigationSystemService
      .getCharacteristic(Characteristic.Active)
      .on('get',this.getDeviceValue.bind(this, irrigationSystemService, "DeviceActive"))
    irrigationSystemService
      .getCharacteristic(Characteristic.InUse)
      .on('get', this.getDeviceValue.bind(this, irrigationSystemService, "DeviceInUse"))
    irrigationSystemService
      .getCharacteristic(Characteristic.ProgramMode)
      .on('get', this.getDeviceValue.bind(this, irrigationSystemService, "DeviceProgramMode"))
  }

  getDeviceValue(irrigationSystemService, characteristicName, callback){
    //this.log.debug('%s - Set something %s', irrigationSystemService.getCharacteristic(Characteristic.Name).value) 
    switch (characteristicName){
      case "DeviceActive":
        //this.log.debug("%s = %s %s", irrigationSystemService.getCharacteristic(Characteristic.Name).value, characteristicName,irrigationSystemService.getCharacteristic(Characteristic.Active).value);
        if(irrigationSystemService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
          callback('error')
        }
        else{
          callback(null, irrigationSystemService.getCharacteristic(Characteristic.Active).value)
        }
      break    
      case "DeviceInUse":
        //this.log.debug("%s = %s %s", irrigationSystemService.getCharacteristic(Characteristic.Name).value, characteristicName,irrigationSystemService.getCharacteristic(Characteristic.InUse).value);
          callback(null, irrigationSystemService.getCharacteristic(Characteristic.InUse).value)
      break
      case "DeviceProgramMode":
        //this.log.debug("%s = %s %s", irrigationSystemService.getCharacteristic(Characteristic.Name).value, characteristicName,irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).value);
        callback(null, irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).value)
      break
      default:
        this.log.debug("Unknown CharacteristicName called", characteristicName)
        callback()
      break
    }
  }

  createValveService(zone){
    this.log.debug("Created service for %s with id %s", zone.name, zone.id)
    // Create Valve Service
    let valve=new Service.Valve(zone.name, zone.id) 
    valve.addCharacteristic(Characteristic.CurrentTime) // Use CurrentTime to store the run time ending
    valve.addCharacteristic(Characteristic.SerialNumber) //Use Serial Number to store the zone id
    valve.addCharacteristic(Characteristic.Model)
    valve.addCharacteristic(Characteristic.ConfiguredName)
    //valve.getCharacteristic(Characteristic.SetDuration).setProps({minValue:60, maxValue:3600, minStep:1, validValues:[60,180,300,600,1200]})
    valve 
      .setCharacteristic(Characteristic.Active, Characteristic.Active.INACTIVE)
      .setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE)
      .setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.IRRIGATION)
      .setCharacteristic(Characteristic.SetDuration, this.default_runtime)
      .setCharacteristic(Characteristic.RemainingDuration, 0)
      .setCharacteristic(Characteristic.ServiceLabelIndex, zone.zoneNumber)
      .setCharacteristic(Characteristic.SerialNumber, zone.id)
      .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
      .setCharacteristic(Characteristic.Name, zone.name)
      .setCharacteristic(Characteristic.ConfiguredName, zone.name)
      .setCharacteristic(Characteristic.Model, zone.customNozzle.name)
      if(zone.enabled){
        valve.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)}
      else{
        valve.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.NOT_CONFIGURED)
      }   
    return valve
  }

  configureValveService(device, valveService){
    this.log.info("Configured zone-%s service for %s",valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(Characteristic.Name).value)
    // Configure Valve Service
    valveService
      .getCharacteristic(Characteristic.Active)
      .on('get', this.getValveValue.bind(this, valveService, "ValveActive"))
      .on('set', this.setValveValue.bind(this, device, valveService))
    valveService
      .getCharacteristic(Characteristic.InUse)
      .on('get', this.getValveValue.bind(this, valveService, "ValveInUse"))
      .on('set', this.setValveValue.bind(this, device, valveService))
    valveService
      .getCharacteristic(Characteristic.SetDuration)
      .on('get', this.getValveValue.bind(this, valveService, "ValveSetDuration"))
      .on('set', this.setValveDuration.bind(this, device, valveService))
    valveService
      .getCharacteristic(Characteristic.RemainingDuration)
      .on('get', this.getValveValue.bind(this, valveService, "ValveRemainingDuration"))
  }

  getValveValue(valveService, characteristicName, callback){
    switch (characteristicName){
      case "ValveActive":
        //this.log.debug("%s = %s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.Active).value)
        if(valveService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
          callback('error')
        }
        else{
          callback(null, valveService.getCharacteristic(Characteristic.Active).value)
        }
      break
      case "ValveInUse":
        //this.log.debug("%s = %s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.Active).value)
          callback(null, valveService.getCharacteristic(Characteristic.InUse).value)
      break
      case "ValveSetDuration":
        //this.log.debug("%s = %s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.Active).value)
          callback(null, valveService.getCharacteristic(Characteristic.SetDuration).value)
      break
      case "ValveRemainingDuration":
        // Calc remain duration
          let timeEnding=Date.parse(valveService.getCharacteristic(Characteristic.CurrentTime).value)
          let timeNow=Date.now()
          let timeRemaining=Math.max(Math.round((timeEnding - timeNow) / 1000), 0)
          if(isNaN(timeRemaining)){
            timeRemaining=0
          }
          valveService.getCharacteristic(Characteristic.RemainingDuration).updateValue(timeRemaining)
          //this.log.debug("%s = %s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,timeRemaining)
          callback(null, timeRemaining)
      break
      default:
        this.log.debug("Unknown CharacteristicName called", characteristicName);
        callback()
      break
    }
  }

  setValveValue(device, valveService, value, callback){
    //this.log.debug('%s - Set Active state to %s', valveService.getCharacteristic(Characteristic.Name).value, value) 
      let irrigationAccessory=this.accessories[device.id];
      let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem)
      
      // Set homekit state and prepare message for Rachio API
      let runTime=valveService.getCharacteristic(Characteristic.SetDuration).value
      if(value == Characteristic.Active.ACTIVE){
        // Turn on/idle the valve
        this.log.info("Starting zone-%s %s for %s mins", valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(Characteristic.Name).value, runTime/60)
        this.rachioapi.startZone (this.token,valveService.getCharacteristic(Characteristic.SerialNumber).value,runTime)
        valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
        irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.Active.ACTIVE)
        let myJsonStart={
          type: 'ZONE_STATUS',
          title: valveService.getCharacteristic(Characteristic.Name).value+' Started',
          deviceId: device.id,
          duration: valveService.getCharacteristic(Characteristic.SetDuration).value,
          zoneNumber: valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value,
          zoneId: valveService.getCharacteristic(Characteristic.SerialNumber).value,
          zoneName: valveService.getCharacteristic(Characteristic.Name).value,
          timestamp: new Date().toISOString(),
          summary: valveService.getCharacteristic(Characteristic.Name).value+' began watering at '+ new Date().toLocaleTimeString(),
          zoneRunState: 'STARTED',
          durationInMinutes: Math.round(valveService.getCharacteristic(Characteristic.SetDuration).value/60),
          externalId: this.webhook_key_local,
          timeForSummary: new Date().toLocaleTimeString(),
          eventType: 'DEVICE_ZONE_RUN_STARTED_EVENT',
          subType: 'ZONE_STARTED',
          endTime: new Date(Date.now()+valveService.getCharacteristic(Characteristic.SetDuration).value*1000).toISOString(),
          category: 'DEVICE',
          resourceType: 'DEVICE'
          }
        let myJsonStop={
          type: 'ZONE_STATUS',
          title: valveService.getCharacteristic(Characteristic.Name).value+' Stopped',
          deviceId: device.id,
          duration: valveService.getCharacteristic(Characteristic.SetDuration).value,
          zoneNumber: valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value,
          zoneId: valveService.getCharacteristic(Characteristic.SerialNumber).value,
          zoneName: valveService.getCharacteristic(Characteristic.Name).value,
          timestamp: new Date().toISOString(),
          summary: valveService.getCharacteristic(Characteristic.Name).value+' stopped watering at '+ new Date().toLocaleTimeString()+' for '+ valveService.getCharacteristic(Characteristic.SetDuration).value+ ' minutes',
          zoneRunState: 'STOPPED',
          durationInMinutes: Math.round(valveService.getCharacteristic(Characteristic.SetDuration).value/60),
          externalId: this.webhook_key_local,
          timeForSummary: new Date().toLocaleTimeString(),
          subType: 'ZONE_STOPPED',
          endTime: new Date(Date.now()+valveService.getCharacteristic(Characteristic.SetDuration).value*1000).toISOString(),
          category: 'DEVICE',
          resourceType: 'DEVICE'
        }
        this.log.debug(myJsonStart)
        this.log.debug('Simulating webhook for %s will update services',myJsonStart.zoneName)
        this.updateService(irrigationSystemService,valveService,myJsonStart)
        this.fakeWebhook=setTimeout(()=>{
          this.log.debug('Simulating webhook for %s will update services',myJsonStop.zoneName) 
          this.log.debug(myJsonStop)
          this.updateService(irrigationSystemService,valveService,myJsonStop)
          }, runTime*1000) 
      } else {
        // Turn off/stopping the valve
        this.log.info("Stopping Zone", valveService.getCharacteristic(Characteristic.Name).value);
        this.rachioapi.stopDevice (this.token,device.id)
        valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
        irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.Active.INACTIVE)
        let myJsonStop={
          type: 'ZONE_STATUS',
          title: valveService.getCharacteristic(Characteristic.Name).value+' Stopped',
          deviceId: device.id,
          duration: Math.round((valveService.getCharacteristic(Characteristic.SetDuration).value-(Date.parse(valveService.getCharacteristic(Characteristic.CurrentTime).value)-Date.now())/1000)),
          zoneNumber: valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value,
          zoneId: valveService.getCharacteristic(Characteristic.SerialNumber).value,
          zoneName: valveService.getCharacteristic(Characteristic.Name).value,
          timestamp: new Date().toISOString(),
          summary: valveService.getCharacteristic(Characteristic.Name).value+' stopped watering at '+ new Date().toLocaleTimeString()+' for '+ valveService.getCharacteristic(Characteristic.SetDuration).value+ ' minutes',
          zoneRunState: 'STOPPED',
          durationInMinutes: Math.round((valveService.getCharacteristic(Characteristic.SetDuration).value-(Date.parse(valveService.getCharacteristic(Characteristic.CurrentTime).value)-Date.now())/1000)/60),
          externalId: this.webhook_key_local,
          timeForSummary: new Date().toLocaleTimeString(),
          subType: 'ZONE_STOPPED',
          endTime: new Date(Date.now()+valveService.getCharacteristic(Characteristic.SetDuration).value*1000).toISOString(),
          category: 'DEVICE',
          resourceType: 'DEVICE'
        }
      this.log.debug(myJsonStop)
      this.log.debug('Simulating webhook for %s will update services',myJsonStop.zoneName)
      this.updateService(irrigationSystemService,valveService,myJsonStop)
      clearTimeout(this.fakeWebhook)
      }
    callback()
  }

  setValveDuration(device, valveService, value, callback){
    // Set default duration from Homekit value 
    valveService.getCharacteristic(Characteristic.SetDuration).updateValue(value) 
    this.log.info("Set %s duration for %s mins", valveService.getCharacteristic(Characteristic.Name).value,value/60)
    callback()
  }

  createScheduleSwitchService(schedule){
    // Create Valve Service
    this.log.debug("Created service for %s with id %s", schedule.name, schedule.id);
    let switchService=new Service.Switch(schedule.name, schedule.id) 
    switchService.addCharacteristic(Characteristic.ConfiguredName)
    switchService.addCharacteristic(Characteristic.SerialNumber)
    switchService 
      .setCharacteristic(Characteristic.On, false)
      .setCharacteristic(Characteristic.Name, schedule)
      .setCharacteristic(Characteristic.SerialNumber, schedule.id)
      .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
    return switchService
  }

  createSwitchService(device,switchName){
    // Create Valve Service
    this.log.debug('adding new switch')
    //let uuid=this.api.hap.uuid.generate(switchName)
    let uuid=UUIDGen.generate(switchName)
    let switchService=new Service.Switch(switchName, uuid) 
    switchService.addCharacteristic(Characteristic.ConfiguredName)
    switchService 
      .setCharacteristic(Characteristic.On, false)
      .setCharacteristic(Characteristic.Name, switchName)
      .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
    return switchService
  }

  configureSwitchService(device, switchService){
    // Configure Valve Service
    this.log.info("Configured service for %s" ,switchService.getCharacteristic(Characteristic.Name).value)
    switchService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getSwitchValue.bind(this, switchService))
      .on('set', this.setSwitchValue.bind(this, device, switchService))
  }

  setSwitchValue(device, switchService, value, callback){
    this.log.debug('toggle switch state %s',switchService.getCharacteristic(Characteristic.Name).value)
    switch(switchService.getCharacteristic(Characteristic.Name).value){
      case device.name+' Standby': 
        if(switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
          callback('error')
        }
        else{
          if(!value){
            switchService.getCharacteristic(Characteristic.On).updateValue(true)
            this.rachioapi.deviceStandby (this.token,device,'on')
          } 
          else {
            switchService.getCharacteristic(Characteristic.On).updateValue(false)
            this.rachioapi.deviceStandby (this.token,device,'off')
          }
          callback()
        } 
      break
      case device.name+' Run All': 
        if(switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
          callback('error')
        }
        else{
          if(value){
            switchService.getCharacteristic(Characteristic.On).updateValue(true)
            this.rachioapi.startMultipleZone (this.token,device.zones,this.default_runtime)
          } 
          else {
            switchService.getCharacteristic(Characteristic.On).updateValue(false)
            this.rachioapi.stopDevice (this.token,device.id)
          }
          callback()
        }
        break
        default:
        if(switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
          callback('error')
        }
        else{
          if(value){
            switchService.getCharacteristic(Characteristic.On).updateValue(true)
            this.rachioapi.startSchedule (this.token,switchService.getCharacteristic(Characteristic.SerialNumber).value)
          } 
          else {
            switchService.getCharacteristic(Characteristic.On).updateValue(false)
            this.rachioapi.stopDevice (this.token,device.id)
          }
          callback()
        }
        break
      }
    }

  getSwitchValue(switchService, callback){
    //this.log.debug("%s = %s", switchService.getCharacteristic(Characteristic.Name).value,switchService.getCharacteristic(Characteristic.On))
    if(switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
      callback('error')
    }
    else{
      callback(null, switchService.getCharacteristic(Characteristic.On).value)
    }
  }

  setOnlineStatus(newDevice){
  //set current device status  
  //create a fake webhook response 
    if(newDevice.status){
      let myJson
      switch(newDevice.status){
        case "ONLINE":
          myJson={
              externalId: "hombridge-Rachio-Dev",
              type: "DEVICE_STATUS",
              deviceId: newDevice.id,
              subType: "ONLINE",
              timestamp: new Date().toISOString()
            }
        break
        case "OFFLINE":
          myJson={
            externalId: "hombridge-Rachio-Dev",
            type: "DEVICE_STATUS",
            deviceId: newDevice.id,
            subType: "OFFLINE",
            timestamp: new Date().toISOString()
          }
        break
      }
      this.log.debug('Found online device')
      this.log.debug(myJson)
      let irrigationAccessory=this.accessories[myJson.deviceId];
      let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem);
      let service=irrigationAccessory.getServiceById(Service.IrrigationSystem)
      this.log.debug('Updating device status')
      this.updateService(irrigationSystemService,service,myJson)
    }
  } 

  setDeviceStatus(newDevice){
    //set current device state  
    //create a fake webhook response 
    if(deviceState.state.health=='GOOD'){
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
      this.log.debug(myJson)
      let irrigationAccessory=this.accessories[myJson.deviceId];
      let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem);
      this.log.debug('Updating standby switch state')
      this.updateService(irrigationSystemService,irrigationSystemService,myJson)
    }
  }

  setValveStatus(response){
    if(response.data.status=='PROCESSING'){
      //create a fake webhook response 
      this.log.debug('Found zone-%s running',response.data.zoneNumber)
      let myJson={
        type: 'ZONE_STATUS',
        title: 'Zone Started',
        deviceId: response.data.deviceId,
        duration: response.data.zoneDuration,
        zoneNumber: response.data.zoneNumber,
        zoneId: response.data.zoneId,
        zoneRunState: 'STARTED',
        durationInMinutes: Math.round(response.data.zoneDuration/60),
        externalId: this.webhook_key_local,
        eventType: 'DEVICE_ZONE_RUN_STARTED_EVENT',
        subType: 'ZONE_STARTED',
        startTime: response.data.zoneStartDate,
        endTime: new Date(response.data.zoneStartDate+(response.data.zoneDuration*1000)).toISOString(),
        category: 'DEVICE',
        resourceType: 'DEVICE'
      }
      this.log.debug(myJson)
      let irrigationAccessory=this.accessories[myJson.deviceId];
      let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem);
      let service=irrigationAccessory.getServiceById(Service.Valve,myJson.zoneId)
      this.log.debug('Webhook match found for zone-%s on start will update services',myJson.zoneNumber)
      this.updateService(irrigationSystemService,service,myJson)
    }
    if(response.data.status=='PROCESSING' && response.data.scheduleId != undefined){
      this.log.debug('Found schedule %s running',response.data.scheduleId)
      let myJson={
        type: 'SCHEDULE_STATUS',
        title: 'Schedule Manually Started',
        deviceId: response.data.deviceId,
        deviceName: response.data.name,
        duration: response.data.zoneDuration/60,
        scheduleName: 'Quick Run',
        scheduleId: response.data.scheduleId,
        externalId: this.webhook_key_local,
        eventType: 'SCHEDULE_STARTED_EVENT',
        subType: 'SCHEDULE_STARTED',
        endTime: new Date(response.data.zoneStartDate+(response.data.zoneDuration*1000)).toISOString(),
        category: 'SCHEDULE',
        resourceType: 'DEVICE'
      }
      this.log.debug(myJson)
      let irrigationAccessory=this.accessories[myJson.deviceId];
      let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem);
      let service=irrigationAccessory.getServiceById(Service.Switch,myJson.scheduleId)
      this.log.debug('Webhook match found for schedule %s on start will update services',myJson.scheduleName)
      this.updateService(irrigationSystemService,service,myJson)
    }
  }

  configureListener(){
    if(this.external_webhook_address && this.internal_webhook_port){
      this.log.debug('Will listen for Webhooks matching Webhook ID %s',this.webhook_key)
      requestServer=http.createServer((request, response)=>{
        let authPassed
        if(this.use_basic_auth){
          if(request.headers.authorization){
            let b64encoded=(Buffer.from(this.user+":"+this.password,'utf8')).toString('base64')
            this.log.debug('webhook request received authorization header=%s',request.headers.authorization)
            this.log.debug('webhook request received authorization header=%s',"Basic "+b64encoded)
            if(request.headers.authorization == "Basic "+b64encoded){
              this.log.debug("Webhook authentication passed")
              authPassed=true
            }
            else{
              this.log.warn("Webhook authentication failed")
              authPassed=false
            }
          }
          else{
            this.log.warn('Expecting webhook authentication')
            authPassed=false
            return
        }
      }
      else{
        authPassed=true
      }
  
        if(request.method === 'GET' && request.url === '/test'){
          this.log.info('Test received on Rachio listener. Webhooks are configured correctly!')
          response.writeHead(200)
          response.write( new Date().toTimeString()+' Webhooks are configured correctly!')
          return response.end()
        } 
        else if(request.method === 'POST' && request.url === '/' && authPassed){
          let body=[]
          request.on('data', (chunk)=>{
            body.push(chunk)
          }).on('end', ()=>{  
            try {
              body=Buffer.concat(body).toString().trim()
              const jsonBody=JSON.parse(body)
              this.log.debug('webhook request received from < %s > %s',jsonBody.externalId,jsonBody)
              if(jsonBody.externalId === this.webhook_key){
                let irrigationAccessory=this.accessories[jsonBody.deviceId]
                let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem)
                let service
                if(jsonBody.zoneId){
                  service=irrigationAccessory.getServiceById(Service.Valve,jsonBody.zoneId)
                  this.log.debug('Webhook match found for %s will update zone services',jsonBody.zoneName)
                }
                else if(jsonBody.scheduleId){
                  service=irrigationAccessory.getServiceById(Service.Switch,jsonBody.scheduleId)
                  this.log.debug('Webhook match found for %s will update zone services',jsonBody.scheduleName)
                }
                else if(jsonBody.deviceId){
                  service=irrigationAccessory.getServiceById(Service.IrrigationSystem)
                  this.log.debug('Webhook match found for %s will update zone services',jsonBody.deviceName)
              }
              this.updateService(irrigationSystemService,service,jsonBody)
              response.writeHead(204)
              return response.end() 
              } 
              else {
              this.log.warn('Webhook received from an unknown external id %s',jsonBody.externalId)
              response.writeHead(404)
              return response.end()
              }
              //this.log.warn('Unsupported HTTP Request %s  %s', request.method, request.url)
            }
            catch (err){  
                this.log.warn('Error parsing webhook request ' + err)
                response.writeHead(404)
                return response.end()
            }
          })
        } 
        })
        requestServer.listen(this.internal_webhook_port, function (){
          this.log.info('This server is listening on port %s.',this.internal_webhook_port)
          if(this.use_basic_auth){this.log.info('Using HTTP basic authentication for Webhooks')}
          this.log.info('Make sure your router has port fowarding turned on for port %s to this server`s IP address and this port %s, unless you are using a relay service.',this.external_webhook_port,this.internal_webhook_port)
        }.bind(this))
      } 
      else {
        this.log.warn('Webhook support is disabled. This plugin will not sync Homekit to realtime events from other sources without Webhooks support.')
      }
    return 
  } 

  updateService(irrigationSystemService,activeService,jsonBody){
    /*********************************************************** 
                Possiible responses from webhooks
    Type : DEVICE_STATUS           
      Subtype:
        OFFLINE
        ONLINE
        OFFLINE_NOTIFICATION
        COLD_REBOOT
        SLEEP_MODE_ON
        SLEEP_MODE_OFF
        BROWNOUT_VALVE
        RAIN_SENSOR_DETECTION_ON
        RAIN_SENSOR_DETECTION_OFF
        RAIN_DELAY_ON
        RAIN_DELAY_OFF           
    Type : SCHEDULE_STATUS            
      Subtype:
        SCHEDULE_STARTED
        SCHEDULE_STOPPED
        SCHEDULE_COMPLETED
        WEATHER_INTELLIGENCE_NO_SKIP
        WEATHER_INTELLIGENCE_SKIP
        WEATHER_INTELLIGENCE_CLIMATE_SKIP
        WEATHER_INTELLIGENCE_FREEZE            
    Type : ZONE_STATUS         
      Subtype:           
        ZONE_STARTED
        ZONE_STOPPED
        ZONE_COMPLETED
        ZONE_PAUSED
        ZONE_CYCLING
        ZONE_CYCLING_COMPLETED            
    Type : DEVICE_DELTA
      Subtype : DEVICE_DELTA            
    Type : ZONE_DELTA
      Subtype : ZONE_DELTA
    Type : SCHEDULE_DELTA
      Subtype : SCHEDULE_DELTA
    ************************************************************/
      switch(jsonBody.type){
        case "ZONE_STATUS":  
        this.log.debug('Zone Status Update') 
          /*****************************
               Possible states
          Active	InUse	  HomeKit Shows
          False	  False	  Off
          True  	False	  Idle
          True	  True	  Running
          False	  True	  Stopping
          ******************************/
          switch(jsonBody.subType){
              case "ZONE_STARTED":
                this.log('<%s> %s, started for duration %s mins.',jsonBody.externalId,jsonBody.title,jsonBody.durationInMinutes)
                irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE) 
                activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
                activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
                activeService.getCharacteristic(Characteristic.RemainingDuration).updateValue(jsonBody.duration) //may need check on duration < 3600
                activeService.getCharacteristic(Characteristic.CurrentTime).updateValue(jsonBody.endTime) // Store zone run end time to calulate remaianing duration
              break
              case "ZONE_STOPPED":
                this.log('<%s> %s, started for duration %s mins.',jsonBody.externalId,jsonBody.title,jsonBody.durationInMinutes)
                irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
                activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
                activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
                activeService.getCharacteristic(Characteristic.RemainingDuration).updateValue(0)
                activeService.getCharacteristic(Characteristic.CurrentTime).updateValue( new Date().toISOString())
              break
              case "ZONE_PAUSED":
                this.log('<%s> %s, started for duration %s mins.',jsonBody.externalId,jsonBody.title,jsonBody.durationInMinutes)
                irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE) 
                activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
                activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)            
              break
              case "ZONE_CYCLING":
                this.log('<%s> %s, started for duration %s mins.',jsonBody.externalId,jsonBody.title,jsonBody.durationInMinutes)
                irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE) 
                activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
                activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)            
              break
              case "ZONE_COMPLETED":
                this.log('<%s> %s, started for duration %s mins.',jsonBody.externalId,jsonBody.title,jsonBody.durationInMinutes)
                irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE) 
                activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
                activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)                          
              break
              case "ZONE_CYCLING_COMPLETED":
                this.log('<%s> %s, started for duration %s mins.',jsonBody.externalId,jsonBody.title,jsonBody.durationInMinutes)
                irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE) 
                activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
                activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
              break
          }
        break
        case "DEVICE_STATUS":
          this.log.debug('Device Status Update') 
          let irrigationAccessory=this.accessories[jsonBody.deviceId]
          let switchService=irrigationAccessory.getServiceById(Service.Switch,UUIDGen.generate(jsonBody.deviceName+' Standby'))
          switch(jsonBody.subType){
            case 'ONLINE':
              this.log('<%s> %s connected at %s',jsonBody.externalId,jsonBody.deviceId,new Date(jsonBody.timestamp).toString())
                irrigationAccessory.services.forEach((service)=>{
                  if(Service.AccessoryInformation.UUID != service.UUID){
                    service.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)
                  }
                  if(Service.Valve.UUID == service.UUID){
                    service.getCharacteristic(Characteristic.Active).getValue()
                  }
                  if(Service.Switch.UUID == service.UUID){
                    service.getCharacteristic(Characteristic.On).getValue()
                  }
              })
            break
            case 'COLD_REBOOT':
              this.log('<%s> Device,%s connected at %s from a %s',jsonBody.externalId,jsonBody.deviceName,new Date(jsonBody.timestamp).toString(),jsonBody.title)
              irrigationAccessory.services.forEach((service)=>{
                if(Service.AccessoryInformation.UUID != service.UUID){
                  service.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)
                }
                if(Service.Valve.UUID == service.UUID){
                  service.getCharacteristic(Characteristic.Active).getValue()
                }
                if(Service.Switch.UUID == service.UUID){
                  service.getCharacteristic(Characteristic.On).getValue()
                }
            })
            break
            case 'OFFLINE':
              this.log('<%s> %s disconnected at %s',jsonBody.externalId,jsonBody.deviceId,jsonBody.timestamp)
              this.log.warn('%s disconnected at %s This will show as non-responding in Homekit until the connection is restored',jsonBody.deviceId,jsonBody.timestamp)
                irrigationAccessory.services.forEach((service)=>{
                  if(Service.AccessoryInformation.UUID != service.UUID){
                    service.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)
                  }
                  if(Service.Valve.UUID == service.UUID){
                    service.getCharacteristic(Characteristic.Active).getValue()
                  }
                  if(Service.Switch.UUID == service.UUID){
                    service.getCharacteristic(Characteristic.On).getValue()
                  }
              })
            break
            case "SLEEP_MODE_ON": //ProgramMode 0 
              this.log('<%s> %s %s %s',jsonBody.externalId,jsonBody.title,jsonBody.deviceName,jsonBody.summary)
              irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.NO_PROGRAM_SCHEDULED)
              if(this.show_standby){switchService.getCharacteristic(Characteristic.On).updateValue(true)}
              break
            case "SLEEP_MODE_OFF": //ProgramMode 2
              this.log('<%s> %s %s %s',jsonBody.externalId,jsonBody.title,jsonBody.deviceName,jsonBody.summary)
              irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.PROGRAM_SCHEDULED_MANUAL_MODE_)
              if(this.show_standby){switchService.getCharacteristic(Characteristic.On).updateValue(false)}
              break
            default: //ProgramMode 1
            this.log('<%s> %s ??? mode',jsonBody.externalId,jsonBody.deviceId)
              irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.PROGRAM_SCHEDULED)
              if(this.show_standby){switchService.getCharacteristic(Characteristic.On).updateValue(false)}
            break
            }
        break
        case "SCHEDULE_STATUS":
          this.log.debug('Schedule Status Update') 
        switch(jsonBody.subType){
          case "SCHEDULE_STARTED":     
            this.log.info('<%s> %s %s',jsonBody.externalId,jsonBody.title,jsonBody.summary)
            if(Service.IrrigationSystem.UUID != activeService.UUID){
              activeService.getCharacteristic(Characteristic.On).updateValue(true)
            }
            irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE) 
          break
          case "SCHEDULE_STOPPED":
            this.log.info('<%s> %s %s',jsonBody.externalId,jsonBody.title,jsonBody.summary)
            if(Service.IrrigationSystem.UUID != activeService.UUID){
              activeService.getCharacteristic(Characteristic.On).updateValue(false)
            }
            irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE) 
          break
          case "SCHEDULE_COMPLETED":
            this.log.info('<%s> %s %s',jsonBody.externalId,jsonBody.title,jsonBody.summary)
            if(Service.IrrigationSystem.UUID != activeService.UUID){
              activeService.getCharacteristic(Characteristic.On).updateValue(false)
            }
            irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE) 
          break
        }
        break
      }
      return
    }
  }

module.exports=RachioPlatform;