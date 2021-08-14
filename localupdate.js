
'use strict'

let PlatformAccessory, Service, Characteristic


module.exports = LocalUpdate

function LocalUpdate (platform,log,api){
  this.log=log
  this.platform=platform
  this.api=api
  PlatformAccessory = api.PlatformAccessory
  //Service = api.hap.Service
  //Characteristic = api.hap.Characteristic
}

LocalUpdate.prototype={

  //setOnlineStatus: function(accessories,newDevice){
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
      let irrigationAccessory = accessories[myJson.deviceId];
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
  }  

} 
  