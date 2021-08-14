/* todo list

known issues 
Time remaining for homebridge accessory runs about 2x fast but homekit is fine
Pause states not reflected corrrecly in homebridge but ok in homekit 

*/

'use strict'
const axios = require('axios')
const http = require('http')
const packageJson = require('./package')
const RachioAPI = require('./rachioapi')
let PlatformAccessory, Service, Characteristic, UUIDGen
let PluginName,PlatformName
let personInfo
let personId
let deviceState
let requestServer

module.exports = (homebridge) => {
  PlatformAccessory = homebridge.platformAccessory
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  UUIDGen = homebridge.hap.uuid
  PlatformName = 'rachio'
  PluginName = packageJson.name

  homebridge.registerPlatform(PluginName, PlatformName, RachioPlatform, true)
}

class RachioPlatform {
  constructor(log, config, api) {
    this.rachioapi = new RachioAPI(this,log)
    this.log = log;
    this.config = config;
    this.token = config["api_key"]
    this.external_IP_address = config["external_IP_address"]
    this.external_webhook_port = config["external_webhook_port"]
    this.internal_webhook_port = config["internal_webhook_port"]
    this.external_webhook_address = "http://"+this.external_IP_address+':'+this.external_webhook_port
    this.webhook_key='hombridge-'+config["name"]
    this.delete_webhooks = config["delete_webhooks"]
    this.use_irrigation_display=config["use_irrigation_display"]
    this.default_runtime=config["default_runtime"]*60
    this.accessories = []
    this.realExternalIP

    if (!this.token) {
      this.log.error('API KEY is required in order to communicate with the Rachio API, please see https://rachio.readme.io/docs/authentication for instructions')
    }
    else {
      this.log('Starting Rachio Platform with homebridge API', api.version)
    }
    axios({
      method: 'get',
      url: 'http://myexternalip.com/raw',
      responseType: 'json'
    }).then(response=> {
      this.log.debug('retrieved %s configured %s',response.data,this.external_IP_address) 
      this.realExternalIP=response.data
      if (this.external_IP_address && this.realExternalIP != this.external_IP_address){
        this.log.error('Configured external IP of %s does not match this servers detected external IP of %s',this.external_IP_address,this.realExternalIP)
     }
     if(!this.external_IP_address){
       this.external_IP_address=this.realExternalIP
       this.log.warn('Attempting to use self discovered IP address %s',this.realExternalIP)
     }
    }).catch(err => {this.log.error('Failed to get current external IP', err)}) 
    
    //** 
    //** Platforms should wait until the "didFinishLaunching" event has fired before registering any new accessories.
    //**  
    if (api) {
        this.api = api;
        this.api.on("didFinishLaunching", function () {
          //Get devices
          this.getRachioDevices()
        }.bind(this))     
      }
    }

  identify (){
    this.log("Identify the sprinkler!")
  }
  
  getRachioDevices() {
    this.log.debug("Fetching device info...");
    this.log.info('Getting Person info...')
    this.rachioapi.getPersonInfo(this.token).then(response => {
      personId = response.data.id
      this.log('Found Person ID %s',personId)

      this.log.info('Getting Person ID info...')
      this.rachioapi.getPersonId(this.token,personId).then(response => {
        personInfo=response
        this.log.info('Found Account for username %s',personInfo.data.username)
        this.configureListener()
        personInfo.data.devices.forEach((newDevice)=>{    
          this.log.info('Found Device %s Status %s',newDevice.name,newDevice.status)
          let uuid = newDevice.id

          this.log.info('Getting Device State info...')
          this.rachioapi.getDeviceState(this.token,newDevice.id).then(response => {
            this.log.info('Found Account for username %s',personInfo.data.username)
            deviceState= response.data
            this.log('Retrieved Device state %s with a %s running',deviceState.state.state,deviceState.state.desiredState,deviceState.state.firmwareVersion)
              
            this.rachioapi.configureWebhooks(this.token,this.external_webhook_address,this.delete_webhooks,newDevice.id,this.webhook_key)

            // Check if device is already loaded from cache
            if (this.accessories[uuid]) {
              this.log.debug('Found %s in accessories cache',this.accessories[uuid].displayName)
              this.log.debug('Configuring cached device')
              // Configure Irrigation Service
              this.configureIrrigationService(newDevice,this.accessories[uuid].getService(Service.IrrigationSystem))
              // Find the valve Services
              this.accessories[uuid].services.forEach(function (service) {
                if (Service.Valve.UUID === service.UUID) {
                  // Configure Valve Service
                  this.configureValveService(newDevice, service)
                }
                if (Service.Switch.UUID === service.UUID) {
                  //Configuring Switch Service
                  this.configureSwitchService(newDevice, service)
                }
              }.bind(this))            
            }
            
            // Create and configure Irrigation Service
            else {
              this.log.debug('Creating and configuring new device')
              let irrigationAccessory = this.createIrrigationAccessory(newDevice)
              this.configureIrrigationService(newDevice,irrigationAccessory.getService(Service.IrrigationSystem))
              // Create and configure Values services and link to Irrigation Service
              newDevice.zones = newDevice.zones.sort(function (a, b) {
                return a.zoneNumber - b.zoneNumber
              })
              newDevice.zones.forEach((zone)=>{
                if (!this.use_irrigation_display && !zone.enabled){
                  this.log.info('Skipping disabled zone %s',zone.name )
                }
                else {
                  this.log.debug('adding zone %s',zone.name )
                  let valveService = this.createValveService(zone)
                  this.configureValveService(newDevice, valveService)
                  if (this.use_irrigation_display){
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
              this.log.debug('adding new run all switch')
              let switchService
              switchService = this.createSwitchService('Run All')
              this.configureSwitchService(newDevice, switchService)
              irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService) 
              irrigationAccessory.addService(switchService);
              this.log.debug('adding new standby switch')
              switchService = this.createSwitchService('Standby')
              this.configureSwitchService(newDevice, switchService)
              irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService) 
              irrigationAccessory.addService(switchService);
              // Register platform accessory
              this.log.debug('Registering platform accessory')
              this.api.registerPlatformAccessories(PluginName, PlatformName, [irrigationAccessory])
              this.accessories[uuid] = irrigationAccessory
            }
            /*
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
                    break;
                  case "OFFLINE":
                    myJson={
                      externalId: "hombridge-Rachio-Dev",
                      type: "DEVICE_STATUS",
                      deviceId: newDevice.id,
                      subType: "OFFLINE",
                      timestamp: new Date().toISOString()
                    }
                    break;
                }
                this.log.debug('Found online device')
                this.log.debug(myJson)
                let irrigationAccessory = this.accessories[myJson.deviceId];
                let irrigationSystemService = irrigationAccessory.getService(Service.IrrigationSystem);
                irrigationAccessory.services.forEach((service)=>{
                  if (service.getCharacteristic(Characteristic.ProductData).value == newDevice.id){
                    //do somthing with the response
                    this.log.debug('Updating device status')
                    this.updateSevices(irrigationSystemService,service,myJson)
                  } 
                  return
                })
            }
            */
              //set current device state  
              //create a fake webhook response 
              if(deviceState.state.health=='GOOD'){
                let myJson
                switch(deviceState.state.desiredState){
                  case "DESIRED_ACTIVE":
                    myJson={
                      summary: 'Scheduled waterings will now run on controller.' ,
                      externalId: this.webhook_key,
                      eventType: 'DEVICE_MANUAL_STANDBY_ON_EVENT',
                      type: 'DEVICE_STATUS',
                      title: 'Standby Mode Off',
                      deviceId: newDevice.id,
                      deviceName: newDevice.name,
                      subType: 'SLEEP_MODE_OFF',
                    }
                    break;
                  case "DESIRED_STANDBY":
                    myJson={
                      summary: 'No scheduled waterings will run on controller.' ,
                      externalId: this.webhook_key,
                      eventType: 'DEVICE_MANUAL_STANDBY_ON_EVENT',
                      type: 'DEVICE_STATUS',
                      title: 'Standby Mode ON',
                      deviceId: newDevice.id,
                      deviceName: newDevice.name,
                      subType: 'SLEEP_MODE_ON',
                    }
                    break;
                }
                this.log.debug('Found healthy device')
                this.log.debug(myJson)
                let irrigationAccessory = this.accessories[myJson.deviceId];
                let irrigationSystemService = irrigationAccessory.getService(Service.IrrigationSystem);
                irrigationAccessory.services.forEach((service)=>{
                  if (service.getCharacteristic(Characteristic.Name).value == 'Standby'){
                    //do somthing with the response
                    this.log.debug('Updating standby switch state')
                    this.updateSevices(irrigationSystemService,service,myJson)
                  } 
                  return
                })
              }
      
              //find any running zone and set its state
            this.rachioapi.currentSchedule (this.token,newDevice.id).then(response => {   
              //create a fake webhook response 
              if(response.data.status=='PROCESSING'){
                this.log.debug('Found zone-%s running',response.data.zoneNumber)
                let myJson={
                  type: 'ZONE_STATUS',
                  title: 'Zone Started',
                  deviceId: response.data.deviceId,
                  duration: response.data.duration,
                  zoneNumber: response.data.zoneNumber,
                  zoneId: response.data.zoneId,
                  zoneRunState: 'STARTED',
                  durationInMinutes: response.data.zoneDuration/60,
                  externalId: this.webhook_key,
                  eventType: 'DEVICE_ZONE_RUN_STARTED_EVENT',
                  subType: 'ZONE_STARTED',
                  startTime: response.data.zoneStartDate,
                  endTime: new Date(response.data.zoneStartDate+(response.data.zoneDuration*1000)).toISOString(),
                  category: 'DEVICE',
                  resourceType: 'DEVICE'
                }
                this.log.debug(myJson)
                let irrigationAccessory = this.accessories[myJson.deviceId];
                let irrigationSystemService = irrigationAccessory.getService(Service.IrrigationSystem);
                irrigationAccessory.services.forEach((service)=>{
                  if (service.getCharacteristic(Characteristic.SerialNumber).value == myJson.zoneId){
                    let valveService=service
                    //do somthing with the response
                    this.log.debug('Webhook match found for zone-%s on start will update services',myJson.zoneNumber)
                    this.updateSevices(irrigationSystemService,valveService,myJson)
                  } 
                  return
                })
              }
            }).catch(err => {this.log.error('Failed to get current schedule', err)})      
          }).catch(err => {this.log.error('Failed to get device state', err)}) 
        })
        this.log.info('API rate limiting; call limit %s remaining out of %s until reset at %s',personInfo.headers['x-ratelimit-remaining'],personInfo.headers['x-ratelimit-limit'], new Date(personInfo.headers['x-ratelimit-reset']).toString())
      }).catch(err => {this.log.error('Failed to get person info for build', err)})
    }).catch(err => {this.log.error('Failed to get info for build', err)})
  }

  //**
  //** REQUIRED - Homebridge will call the "configureAccessory" method once for every cached accessory restored
  //**
  configureAccessory(accessory) {
    // Add cached devices to the accessories arrary
    this.log.info('Found cached accessory, configuring ',accessory.displayName)
    this.accessories[accessory.UUID] = accessory
  }

  createIrrigationAccessory(device) {
    this.log.debug('Create Irrigation service',device.id,device.name)
    // Create new Irrigation System Service
    let newPlatformAccessory = new PlatformAccessory(device.name, device.id)
    newPlatformAccessory.addService(Service.IrrigationSystem, device.name)
    let irrigationSystemService = newPlatformAccessory.getService(Service.IrrigationSystem)
    // Check if the device is connected
    if (device.status == 'ONLINE') {
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

  configureIrrigationService(device,irrigationSystemService) {
    this.log.info('Configure Irrigation service for %s', irrigationSystemService.getCharacteristic(Characteristic.Name).value)
    // Configure IrrigationSystem Service
    irrigationSystemService 
      //.setCharacteristic(Characteristic.ProductData, device.id)
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE)
      //.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
      .setCharacteristic(Characteristic.RemainingDuration, 0)
    // Check if the device is connected
    switch (device.status) {
      case "ONLINE": 
        //irrigationSystemService.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
        break
      case "OFFLINE":
        //irrigationSystemService.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT)
        break
    }
    switch (device.scheduleModeType) {
      case "OFF": 
        irrigationSystemService.setCharacteristic(Characteristic.ProgramMode, Characteristic.ProgramMode.NO_PROGRAM_SCHEDULED)
        break;
      case "SCHEDULED": 
        irrigationSystemService.setCharacteristic(Characteristic.ProgramMode, Characteristic.ProgramMode.PROGRAM_SCHEDULED)
        break;
      case "MANUAL": 
        irrigationSystemService.setCharacteristic(Characteristic.ProgramMode, Characteristic.ProgramMode.PROGRAM_SCHEDULED_MANUAL_MODE_)
        break;
      default:
        this.log.info('Failed to retrieve program mode setting a default value. Retrieved-', device.data.scheduleModeType)
        irrigationSystemService.setCharacteristic(Characteristic.ProgramMode, Characteristic.ProgramMode.PROGRAM_SCHEDULED_MANUAL_MODE_)
      break;
    }   
    irrigationSystemService
      .getCharacteristic(Characteristic.Active)
      .on('get',this.getDeviceValue.bind(this, irrigationSystemService, "DeviceActive"))
      .on('set',this.setDeviceValue.bind(this, device, irrigationSystemService ))
    irrigationSystemService
      .getCharacteristic(Characteristic.InUse)
      .on('get', this.getDeviceValue.bind(this, irrigationSystemService, "DeviceInUse"))
      .on('set', this.setDeviceValue.bind(this, device, irrigationSystemService ))
    irrigationSystemService
      .getCharacteristic(Characteristic.ProgramMode)
      .on('get', this.getDeviceValue.bind(this, irrigationSystemService, "DeviceProgramMode"))
      .on('set', this.setDeviceValue.bind(this, device, irrigationSystemService ))
  }

  getDeviceValue(irrigationSystemService, characteristicName, callback) {
    //this.log.debug('%s - Set something %s', irrigationSystemService.getCharacteristic(Characteristic.Name).value) 
    switch (characteristicName) {
      case "DeviceActive":
        //this.log.debug("%s = %s %s", irrigationSystemService.getCharacteristic(Characteristic.Name).value, characteristicName,irrigationSystemService.getCharacteristic(Characteristic.Active).value);
        if (irrigationSystemService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
          callback('error')
        }
        else{
          callback(null, irrigationSystemService.getCharacteristic(Characteristic.Active).value)
        }
        break;    
      case "DeviceInUse":
        //this.log.debug("%s = %s %s", irrigationSystemService.getCharacteristic(Characteristic.Name).value, characteristicName,irrigationSystemService.getCharacteristic(Characteristic.InUse).value);
          callback(null, irrigationSystemService.getCharacteristic(Characteristic.InUse).value)
        break;
      case "DeviceProgramMode":
        //this.log.debug("%s = %s %s", irrigationSystemService.getCharacteristic(Characteristic.Name).value, characteristicName,irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).value);
        callback(null, irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).value)
        break;
      default:
        this.log.debug("Unknown CharacteristicName called", characteristicName)
        callback()
        break;
    }
  }

  setDeviceValue(device,irrigationSystemService, value, callback) {
    //this.log.debug('%s - Get something %s', irrigationSystemService.getCharacteristic(Characteristic.Name).value, value) 
      callback()
  }

  createValveService(zone) {
    this.log.debug("Created service for %s with id %s", zone.name, zone.id);
    // Create Valve Service
    let valve = new Service.Valve(zone.name, zone.id) 
    valve.addCharacteristic(Characteristic.CurrentTime) // Use CurrentTime to store the run time ending
    valve.addCharacteristic(Characteristic.SerialNumber) //Use Serial Number to store the zone id
    valve.addCharacteristic(Characteristic.Model)
    valve.addCharacteristic(Characteristic.ConfiguredName)
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
      if (zone.enabled){
        valve.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)}
      else{
        valve.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.NOT_CONFIGURED)
      }   
    return valve
  }

  configureValveService(device, valveService) {
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
      .on('set', this.getValveValue.bind(this, valveService, "ValveSetDuration"))
    valveService
      .getCharacteristic(Characteristic.RemainingDuration)
      .on('get', this.getValveValue.bind(this, valveService, "ValveRemainingDuration"))
  }

  getValveValue(valveService, characteristicName, callback) {
    switch (characteristicName) {
      case "ValveActive":
        this.log.debug("%s = %s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.Active).value)
        if (valveService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
          callback('error')
        }
        else{
          callback(null, valveService.getCharacteristic(Characteristic.Active).value)
        }
        break;
      case "ValveInUse":
        //this.log.debug("%s = %s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.Active).value)
          callback(null, valveService.getCharacteristic(Characteristic.InUse).value)
        break;
      case "ValveSetDuration":
        //.log.debug("%s = %s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.Active).value)
          callback(null, valveService.getCharacteristic(Characteristic.SetDuration).value)
        break;
      case "ValveRemainingDuration":
        // Calc remain duration
          let timeEnding = Date.parse(valveService.getCharacteristic(Characteristic.CurrentTime).value)
          let timeNow = Date.now()
          let timeRemaining = Math.max(Math.round((timeEnding - timeNow) / 1000), 0)
          if (isNaN(timeRemaining)) {
            timeRemaining = 0
          }
          valveService.getCharacteristic(Characteristic.RemainingDuration).updateValue(timeRemaining)
          //this.log.debug("%s = %s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,timeRemaining)
          callback(null, timeRemaining)
        break;
      default:
        this.log.debug("Unknown CharacteristicName called", characteristicName);
        callback()
        break;
    }
  }

  setValveValue(device, valveService, value, callback) {
    this.log.debug("_setValueActive", valveService.getCharacteristic(Characteristic.Name).value, value);
    this.log.debug('%s - Set Active state to %s', valveService.getCharacteristic(Characteristic.Name).value, value) 
    //if (valveService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
    //  callback('error')
    //}
    //else{
      let irrigationAccessory = this.accessories[device.id];
      let irrigationSystemService = irrigationAccessory.getService(Service.IrrigationSystem)
      
      // Set homekit state and prepare message for Rachio API
      let run_time = valveService.getCharacteristic(Characteristic.SetDuration).value / 60; 

      if (value == Characteristic.Active.ACTIVE) {
        // Turn on.idle the valve
        this.log.info("Starting zone-%s %s for %s mins", valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(Characteristic.Name).value, run_time)
        this.rachioapi.startZone (this.token,valveService.getCharacteristic(Characteristic.SerialNumber).value,this.default_runtime)
        valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
        irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.Active.ACTIVE)
      } else {
        // Turn off/stopping the valve
        this.log.info("Stopping Zone", valveService.getCharacteristic(Characteristic.Name).value);
        this.rachioapi.stopDevice (this.token,device.id)
        valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
        irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.Active.INACTIVE)
      }
      callback()
    //}
  }

  createSwitchService(switchName) {
    // Create Valve Service
    this.log.debug('adding new switch')
    let uuid = this.api.hap.uuid.generate(switchName)
    let switchService = new Service.Switch(switchName, uuid) 
    switchService.addCharacteristic(Characteristic.ConfiguredName)
    switchService 
      .setCharacteristic(Characteristic.On, false)
      .setCharacteristic(Characteristic.Name, switchName)
      .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
    return switchService
  }

  configureSwitchService(device, switchService) {
    // Configure Valve Service
    this.log.debug('configuring new switch')
    switchService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getSwitchValue.bind(this, switchService))
      .on('set', this.setSwitchValue.bind(this, device, switchService))
  }

  setSwitchValue(device, switchService, value, callback) {
    this.log.debug('toggle switch state %s',switchService.getCharacteristic(Characteristic.Name).value)
    switch(switchService.getCharacteristic(Characteristic.Name).value){
      case "Standby": 
        if(switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
          callback('error')
        }
        else{
          if (!value){
            switchService.getCharacteristic(Characteristic.On).updateValue(true)
            this.rachioapi.deviceStandby (this.token,device,'on')
          } 
          else {
            switchService.getCharacteristic(Characteristic.On).updateValue(false)
            this.rachioapi.deviceStandby (this.token,device,'off')
          }
          callback()
        } 
      break;
      case "Run All": 
        if(switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
          callback('error')
        }
        else{
          if (value){
            switchService.getCharacteristic(Characteristic.On).updateValue(true)
            this.rachioapi.startMultipleZone (this.token,device.zones,this.default_runtime)
          } 
          else {
            switchService.getCharacteristic(Characteristic.On).updateValue(false)
            this.rachioapi.stopDevice (this.token,device.id)
          }
          callback()
        }
          break;
      }
    }

    getSwitchValue(switchService, callback) {
    //this.log.debug("%s = %s", switchService.getCharacteristic(Characteristic.Name).value,switchService.getCharacteristic(Characteristic.On))
    if (switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
      callback('error')
    }
    else{
      callback(null, switchService.getCharacteristic(Characteristic.On).value)
    }
    }

configureListener(){
  if (this.external_webhook_address && this.internal_webhook_port) {
    this.log.debug('Will listen for Webhooks matching Webhook ID %s',this.webhook_key)
    requestServer = http.createServer((request, response) => {
      if (request.method === 'GET' && request.url === '/test') {
        this.log.info('Test received on Rachio listener. Webhooks are configured correctly!')
        response.writeHead(200)
        response.write( new Date().toTimeString()+' Webhooks are configured correctly!')
        return response.end()
      } 
      else if (request.method === 'POST' && request.url === '/') {
        let body = []
        request.on('data', (chunk) => {
          body.push(chunk)
        }).on('end', () => {  
          try {
            const jsonBody = JSON.parse(body)
            body = Buffer.concat(body).toString().trim()
            this.log.debug('webhook request received from < %s > %s',jsonBody.externalId,jsonBody)

            if (jsonBody.externalId === this.webhook_key) {
            let irrigationAccessory = this.accessories[jsonBody.deviceId];
            let irrigationSystemService = irrigationAccessory.getService(Service.IrrigationSystem);
            irrigationAccessory.services.forEach((service)=>{
              //this.log.debug(service.getCharacteristic(Characteristic.Name).value)
              //this.log.debug(service.getCharacteristic(Characteristic.SerialNumber).value,jsonBody.zoneId)
              //this.log.debug(service.getCharacteristic(Characteristic.ProductData).value,jsonBody.device.id)
             
             //problem area
             /*
              if (jsonBody.integrationState== 'WATERING' && service.getCharacteristic(Characteristic.SerialNumber).value == jsonBody.zoneId){
                let foundService=service
                //do somthing with the response
                this.log.debug('Webhook match found for %s will update zone services',jsonBody.zoneName)
                this.updateSevices(irrigationSystemService,foundService,jsonBody)
              }     
              else if (jsonBody.integrationState!= 'WATERING' && service.getCharacteristic(Characteristic.ProductData).value == jsonBody.deviceId){
                let foundService=service
                //do somthing with the response
                this.log.debug('Webhook match found for %s will update device services',jsonBody.deviceId)
                this.updateSevices(irrigationSystemService,foundService,jsonBody)
              } 
             */
              if (jsonBody.integrationState && service.getCharacteristic(Characteristic.SerialNumber).value == jsonBody.zoneId){
              //if (service.getCharacteristic(Characteristic.SerialNumber).value == jsonBody.zoneId){
                let foundService=service
                //do somthing with the response
                this.log.debug('Webhook match found for %s will update zone services',jsonBody.zoneName)
                this.updateSevices(irrigationSystemService,foundService,jsonBody)
              }
              else if (jsonBody.integrationState == null && service.getCharacteristic(Characteristic.ProductData).value == jsonBody.deviceId){        
              //else if (service.getCharacteristic(Characteristic.ProductData).value == jsonBody.deviceId){
                let foundService=service
                //do somthing with the response
                this.log.debug('Webhook match found for %s will update device services',jsonBody.deviceName)
                this.updateSevices(irrigationSystemService,foundService,jsonBody)
              } 
              /*         
              else if(service.getCharacteristic(Characteristic.Name).value =='Run All' && (jsonBody.eventType=='SCHEDULE_COMPLETED_EVENT'|| jsonBody.eventType=='SCHEDULE_STARTED_EVENT')){
                let foundService=service
                //do somthing with the response
                this.log.debug('Webhook match found for %s will update run all service',jsonBody.deviceName)
                this.updateSevices(irrigationSystemService,foundService,jsonBody)
              }
              else if(service.getCharacteristic(Characteristic.Name).value =='Standby'&& (jsonBody.eventType=='DEVICE_MANUAL_STANDBY_ON_EVENT' || jsonBody.eventType=='DEVICE_MANUAL_STANDBY_OFF_EVENT')){
                let foundService=service
                //do somthing with the response
                this.log.debug('Webhook match found for %s will update standby service',jsonBody.deviceName)
                this.updateSevices(irrigationSystemService,foundService,jsonBody)
              }
              */
              response.writeHead(204)
              return response.end()
            })
            //////problem area

            } 
            else {
            this.log.warn('Webhook received from an unknown external id %s',jsonBody.externalId)
            response.writeHead(404)
            return response.end()
            }
            //this.log.warn('Unsupported HTTP Request %s  %s', request.method, request.url)
          }
          catch (err) {  
              this.log.warn('Error parsing webhook request ' + err)
              response.writeHead(404)
              return response.end()
          }
          })
       } 
      })
      requestServer.listen(this.internal_webhook_port, function () {
        this.log.info('This server is listening on port %s.',this.internal_webhook_port)
        this.log.info('Make sure your router has port fowarding for %s to this server`s IP address and this port set.',this.external_webhook_address)
      }.bind(this))
    } 
    else {
      this.log.warn('Webhook support is disabled. This plugin will not sync Homekit to realtime events from other sources without Webhooks support.')
    }
  return 
  } 

  updateSevices(irrigationSystemService,activeService,jsonBody){
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
                this.log('%s, started for duration %s mins.',jsonBody.title, Math.round(jsonBody.duration/60))
                irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE) 
                activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
                activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
                activeService.getCharacteristic(Characteristic.RemainingDuration).updateValue(jsonBody.duration)
                activeService.getCharacteristic(Characteristic.CurrentTime).updateValue(jsonBody.endTime) // Store zone run end time to calulate remaianing duration
                break;
              case "ZONE_STOPPED":
                this.log('%s, ran for duration %s mins.',jsonBody.title, Math.round(jsonBody.duration/60))
                irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE) 
                activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
                activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
                activeService.getCharacteristic(Characteristic.RemainingDuration).updateValue(0)
                activeService.getCharacteristic(Characteristic.CurrentTime).updateValue( new Date().toISOString())
                break;
              case "ZONE_PAUSED":
                this.log('%s, pausing for a duration of %s mins.',jsonBody.title, Math.round(jsonBody.duration/60))
                irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE) 
                activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
                activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)            
                break;
              case "ZONE_CYCLING":
                this.log('%s, cycling for a duration of %s mins.',jsonBody.title, Math.round(jsonBody.duration/60))
                irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE) 
                activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
                activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)            
                break;
              case "ZONE_COMPLETED":
                this.log('%s, completed after %s mins.',jsonBody.title, Math.round(jsonBody.duration/60))
                irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE) 
                activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
                activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE);                          
                break;
              case "ZONE_CYCLING_COMPLETED":
                this.log('%s, cycling completed after %s mins.',jsonBody.title, Math.round(jsonBody.duration/60))
                irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE) 
                activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
                activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE);
                break;
          }
          break;
        case "DEVICE_STATUS":
          this.log.debug('Device Status Update') 
          let irrigationAccessory = this.accessories[jsonBody.deviceId]
          switch(jsonBody.subType){
            case 'ONLINE':
              this.log('%s connected at %s %s',jsonBody.deviceId,jsonBody.timestamp,jsonBody.network)
                irrigationAccessory.services.forEach((service)=>{
                this.log.warn(service.getCharacteristic(Characteristic.Name).value)
                service.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)
                service.getCharacteristic(Characteristic.Active).getValue()
              })
              irrigationSystemService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)
            break;
              case 'OFFLINE':
              this.log('%s disconnected at %s',jsonBody.deviceId,jsonBody.timestamp)
              this.log.error('%s disconnected at %s This will show as non-responding in Homekit untill the connection is restored',jsonBody.deviceId,jsonBody.timestamp)
                irrigationAccessory.services.forEach((service)=>{
                this.log.warn(service.getCharacteristic(Characteristic.Name).value,service.getCharacteristic(Characteristic.ProductData).value,service.getCharacteristic(Characteristic.SerialNumber).value)
                service.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)
                service.getCharacteristic(Characteristic.Active).getValue()
              })
              irrigationSystemService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)
            break;
              case "SLEEP_MODE_ON"://ProgramMode 0 
              this.log('%s %s %s',jsonBody.title,jsonBody.deviceName,jsonBody.summary)
              activeService.getCharacteristic(Characteristic.On).updateValue(true)
              irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.NO_PROGRAM_SCHEDULED)
            break;
              case "SLEEP_MODE_OFF"://ProgramMode 2
              this.log('%s %s %s',jsonBody.title,jsonBody.deviceName,jsonBody.summary)
              activeService.getCharacteristic(Characteristic.On).updateValue(false)
              irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.PROGRAM_SCHEDULED_MANUAL_MODE_)
             break;
            default: //ProgramMode 1
            this.log('%s ??? mode',jsonBody.deviceId)
              irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.PROGRAM_SCHEDULED)
             break;
            }
         break;
        case "SCHEDULE_STATUS":
          this.log.debug('Schedule Status Update') 
        switch(jsonBody.subType){
          case "SCHEDULE_STARTED":     
            this.log.info('%s %s',jsonBody.title,jsonBody.summary)
            irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE) 
            break;
          case "SCHEDULE_STOPPED":
            this.log.info('%s %s',jsonBody.title,jsonBody.summary)
            irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE) 
            break;
          case "SCHEDULE_COMPLETED":
            this.log.info('%s %s',jsonBody.title,jsonBody.summary)
            activeService.getCharacteristic(Characteristic.On).updateValue(false) 
            irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE) 
            break;
        }
          break;
      }
      return;
    }
  }
