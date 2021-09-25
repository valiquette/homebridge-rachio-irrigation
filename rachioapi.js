
'use strict'
const axios = require('axios')
const api_endpoint='https://api.rach.io/1/public/'
const alt_api_endpoint='https://cloud-rest.rach.io/'

module.exports = RachioAPI

function RachioAPI (platform,log){
  this.log=log
  this.platform=platform
}

RachioAPI.prototype={

  getPersonInfo:  async function(token) {
    try {  
      this.log.debug('Retrieving Person Info')
        const response = await axios({
          method: 'get',
          url: api_endpoint+'person/info/',
          headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          responseType: 'json'
        }).catch(err => {
            this.log.error('Error getting person, Status %s',err.response.status)
            this.log.warn(err.response.data.errors)
        })
        this.log.debug('get person info response',JSON.stringify(response.data,null,2))
        return  response
      }catch(err) {this.log.error('Error retrieving deviceId %s', err)}
  },
  
  getPersonId:  async function(token,personId) {
    try {  
      this.log.debug('Retrieving Person ID')
        const response = await axios({
          method: 'get',
          url: api_endpoint+'person/'+personId,
          headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          responseType: 'json'
        }).catch(err => {this.log.error('Error getting device %s', err)})
        this.log.debug('get person id response',JSON.stringify(response.data,null,2))
        return  response
      }catch(err) {this.log.error('Error retrieving deviceId %s', err)}
  },
  
  deviceStandby: async function(token,device,state) {
    try {
      this.log.debug('Setting Standby Mode on',device.id)
      const response = await axios({
        method: 'put',
        url: api_endpoint+'device/'+state,
        headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        data:{
          id: device.id,
        },
        responseType: 'json'
      }).catch(err => {this.log.error('Error setting standby to %s %s', state,err)})
      this.log.debug('device standby response status',response.status)
      return  response
    }catch(err) {this.log.error('Error setting standby %s', err)}
  },

  getDeviceState: async function(token,device) {
    try {
      this.log.debug('Getting current device state',device)
      const response = await axios({
        method: 'get',
        url: alt_api_endpoint+'device/getDeviceState/'+device,
        headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        responseType: 'json'
      }).catch(err => {this.log.error('Error getting schedule %s', err)})
      this.log.debug('get device state response',JSON.stringify(response.data,null,2))
      return  response
    }catch(err) {this.log.error('Error getting device state %s', err)}
  },
  
  getDeviceDetails: async function(token,device) {
    try {
      this.log.debug('Getting current device state',device)
      const response = await axios({
        method: 'get',
        url: alt_api_endpoint+'device/getDeviceDetails/'+device,
        headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        responseType: 'json'
      }).catch(err => {this.log.error('Error getting schedule %s', err)})
      this.log.debug('get device details response',JSON.stringify(response.data,null,2))
      return  response
    }catch(err) {this.log.error('Error getting device state %s', err)}
  },

  getLocationList: async function(token) {
    try {
      this.log.debug('Getting Location List')
      const response = await axios({
        method: 'get',
        url: alt_api_endpoint+'location/listLocations/true',
        headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        responseType: 'json'
      }).catch(err => {this.log.error('Error getting location list %s', err)})
      this.log.debug('get location list response',JSON.stringify(response.data,null,2))
      
      return  response
    }catch(err) {this.log.error('Error getting location list %s', err)}
  },

  getDeviceInfo: async function(token,device) {
    try {
      this.log.debug('Getting current device state',device)
      const response = await axios({
        method: 'get',
        url: api_endpoint+'device/'+device,
        headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        responseType: 'json'
      }).catch(err => {this.log.error('Error getting schedule %s', err)})
      this.log.debug('get device info response',JSON.stringify(response.data,null,2))
      return  response
    }catch(err) {this.log.error('Error getting device state %s', err)}
  },

  currentSchedule: async function(token,device) {
    try {
      this.log.debug('Checking current schedule',device)
      const response = await axios({
        method: 'get',
        url: api_endpoint+'device/'+device+'/current_schedule',
        headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        responseType: 'json'
      }).catch(err => {this.log.error('Error getting schedule %s', err)})
      this.log.debug('status',response.data.status)
      this.log.debug('get current schedule response',JSON.stringify(response.data,null,2))
      return  response
    }catch(err) {this.log.error('Error getting current schedule %s', err)}
  },

  startZone: async function(token,zone,runtime) {
    try {
      this.log.debug('Starting Zone',zone)
      const response = await axios({
        method: 'put',
        url: api_endpoint+'zone/start',
        headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        data:{
          id: zone,
          duration: runtime
        },
        responseType: 'json'
      }).catch(err => {this.log.error('Error sending start zone %s', err)})
      this.log.debug('start response',response.status)
      return  response
    }catch(err) {this.log.error('Error Starting Zone %s', err)}
  },

  startSchedule: async function(token,schedule) {
    try {
      this.log.debug('Starting Schedule',schedule)
      const response = await axios({
        method: 'put',
        url: api_endpoint+'schedulerule/start',
        headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        data:{
          id: schedule
        },
        responseType: 'json'
      }).catch(err => {this.log.error('Error sending start schedule %s', err)})
      this.log.debug('start schedule response',response.status)
      return  response
    }catch(err) {this.log.error('Error Starting Schedule %s', err)}
  },

  stopDevice: async function(token,deviceId) {
    try {
      this.log.debug('Stopping',deviceId)
      const response = await axios({
        method: 'put',
        url: api_endpoint+'device/stop_water',
        headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        data:{
          id: deviceId
        },
        responseType: 'json'
      }).catch(err => {this.log.error('Error sending stop %s', err)})
      this.log.debug('stop response',response.status)
      return  response
    }catch(err) {this.log.error('Error Stopping Device %s', err)}
  },

  startMultipleZone: async function(token,zones,duration) {
    try {
      let body=[]
      this.log.debug('Starting Multiple Zones', zones)
      zones.forEach((zone,index)=>{
        if(zone.enabled){
          body.push(
            {
            id: zone.id,
            duration: duration,
            sortOrder: index
            }
          )
        }
      })
      this.log.debug('multiple run data',JSON.stringify(body,null," "))
      const response = await axios({
        method: 'put',
        url: api_endpoint+'zone/start_multiple',
        headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        data:{
          zones : body
        },
        responseType: 'json'  
      }).catch(err => {this.log.error('Error sending start %s', err)})
      this.log.debug('start multiple response',response.status)
      return  response
    }catch(err) {this.log.error('Error Starting Multiple Zones %s', err)}
  },

  configureWebhooks: async function(token,external_webhook_address,delete_webhooks,device_Id,webhook_key) {
    try {
      this.log.info('Configuring Rachio webhooks for controller ID %s',device_Id)    
      let response = await axios({
        method: 'get',
        url: api_endpoint+'notification/' + device_Id + '/webhook',
        headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        responseType: 'json'
      }).catch(err => {this.log.error('Error retrieving webhooks %s', err)})
  
      const webhooks = response.data
      this.log.debug('configured webhooks response',JSON.stringify(response.data,null,2))
      if (!webhooks || !Array.isArray(webhooks)) return
    
      if (delete_webhooks) {
        //delete exsisting webhooks
        for (const oldWebhook of webhooks) {
          if (oldWebhook.externalId === webhook_key) continue //Skip the current webhook and let it be updated
          response = await axios({
            method: 'delete',
            url: api_endpoint+'notification/' + 'webhook/' + oldWebhook.id,
            headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            responseType: 'json'
          }).catch(err => {this.log.error('Error deleting old webhook $s : $s', oldWebhook.id, err)})
          if (response.status === 204) {
            this.log.debug('Successfully deleted old webhook %s', oldWebhook.id)
          }
        }
      }
      /*********************************************
      Event Type options from get events
              "id": 5 ="DEVICE_STATUS_EVENT"
              "id": 10="ZONE_STATUS_EVENT"
              "id": 6 ="RAIN_DELAY_EVENT"
              "id": 7 ="WEATHER_INTELLIGENCE_EVENT"
              "id": 9= "SCHEDULE_STATUS_EVENT"
              "id": 11="RAIN_SENSOR_DETECTION_EVENT"
              "id": 8 ="WATER_BUDGET"
              "id": 12="ZONE_DELTA"
              "id": 14="DELTA"
      **********************************************/
      const webhook = webhooks.find(webhook=> webhook.externalId === webhook_key)
      if (webhook) {
        this.log.info('Updating Rachio Webhook ID %s, for destination %s', webhook.id, external_webhook_address)
        response = await axios({
          method: 'put',
          url: api_endpoint+'notification/webhook/',
          headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          responseType: 'json',
          data: {
            id: webhook.id,
            externalId: webhook_key,
            url: external_webhook_address,
            eventTypes: [{"id":5},{"id":10},{"id":6},{"id":7},{"id":9}]
           }
          }).catch(err => {this.log.error('Error updating exsisting webhook $s : $s', webhook.id, err)})
      } else {
        this.log.info('Creating Webhook for ' + external_webhook_address)
        response = await axios({
          method: 'post',
          url: api_endpoint+'notification/webhook/',
          headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          responseType: 'json',
          data: {
            device: { id: device_Id },
            externalId: webhook_key,
            url: external_webhook_address,
            eventTypes: [{"id":5},{"id":10},{"id":6},{"id":7},{"id":9}]       
           }
          }).catch(err => {this.log.error('Error configuring new webhook $s : $s', webhook.id,err)})
      }  
      this.log.debug('create/update webhooks response',JSON.stringify(response.data,null,2))
      const test_webhook_url = external_webhook_address + '/test'
      if (response && response.status === 200) {
        this.log.info('Successfully configured webhook with external ID "%s" ', webhook_key)
        this.log.info('To test Webhook setup, navagate to %s to ensure port forwarding is configured correctly. '
                      +'This will not work from this server, you cannot be connect to the same router doing the fowarding. '
                      +'The best way to test is with a cell phone, with WiFi off.',test_webhook_url)
      }
      return 
    }catch(err) {this.log.error('Error configuring webhook ' + err)}
  }

} 
  