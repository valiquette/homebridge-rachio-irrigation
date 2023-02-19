//// Public API info https://rachio.readme.io/v1.0/docs
'use strict'
let axios = require('axios')
let api_endpoint='https://api.rach.io/1/public'
let alt_api_endpoint='https://cloud-rest.rach.io'

module.exports = RachioAPI

function RachioAPI (platform,log){
  this.log=log
  this.platform=platform
}

RachioAPI.prototype={

	getPersonInfo:  async function(token){
		try{
			this.log.debug('Retrieving Person Info')
			let response = await axios({
				method: 'get',
				baseURL: api_endpoint,
				url: '/person/info/',
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`
				},
				responseType: 'json'
			}).catch(err => {
				this.log.error('Error getting person, Status %s',err.message)
				this.log.debug(JSON.stringify(err,null,2))
				if(err.response){this.log.warn( JSON.stringify(err.response.data,null,2))}
				return
			})
			if(response.status==200){
				if(this.platform.showAPIMessages){this.log.debug('get person info response',JSON.stringify(response.data,null,2))}
			return response.data
			}
		}catch(err){this.log.error('Error retrieving personId \n%s', err)}
	},

	getPersonId:  async function(token,personId){
		try{
			this.log.debug('Retrieving Person ID')
			let response = await axios({
				method: 'get',
				baseURL: api_endpoint,
				url: '/person/'+personId,
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`
				},
				responseType: 'json'
			}).catch(err => {
				this.log.error('Error getting device %s', err.message)
				this.log.debug(JSON.stringify(err,null,2))
				if(err.response){this.log.warn( JSON.stringify(err.response.data,null,2))}
				return
			})
			if(response.status==200){
				if(this.platform.showAPIMessages){this.log.debug('get person id response',JSON.stringify(response.data,null,2))}
			return response.data
			}
		}catch(err){this.log.error('Error retrieving deviceId \n%s', err)}
	},

	getDeviceState: async function(token,device){
		try{
			this.log.debug('Getting current device state',device)
			let response = await axios({
				method: 'get',
				baseURL: alt_api_endpoint,
				url: '/device/getDeviceState/'+device,
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`
				},
				responseType: 'json'
			}).catch(err => {
				this.log.error('Error getting device state %s', err.message)
				this.log.debug(JSON.stringify(err,null,2))
				if(err.response){this.log.warn( JSON.stringify(err.response.data,null,2))}
				return
			})
			if(response.status==200){
				if(this.platform.showAPIMessages){this.log.debug('get device state response',JSON.stringify(response.data,null,2))}
			return response.data
			}
		}catch(err){this.log.error('Error getting device state \n%s', err)}
	},

	getDeviceDetails: async function(token,device){
		try{
			this.log.debug('Getting current device state',device)
			let response = await axios({
				method: 'get',
				baseURL: alt_api_endpoint,
				url: '/device/getDeviceDetails/'+device,
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`
				},
				responseType: 'json'
			}).catch(err => {
				this.log.error('Error getting device details %s', err.message)
				this.log.debug(JSON.stringify(err,null,2))
				if(err.response){this.log.warn( JSON.stringify(err.response.data,null,2))}
				return
			})
			if(response.status==200){
				if(this.platform.showAPIMessages){this.log.debug('get device details response',JSON.stringify(response.data,null,2))}
			return response.data
			}
		}catch(err){this.log.error('Error getting device details \n%s', err)}
	},

	getDeviceInfo: async function(token,device){
		try{
			this.log.debug('Getting current device state',device)
			let response = await axios({
				method: 'get',
				baseURL: api_endpoint,
				url: '/device/'+device,
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`
				},
			responseType: 'json'
			}).catch(err => {
				this.log.error('Error getting device info %s', err.message)
				this.log.debug(JSON.stringify(err,null,2))
				if(err.response){this.log.warn( JSON.stringify(err.response.data,null,2))}
				return
			})
			if(response.status==200){
				if(this.platform.showAPIMessages){this.log.debug('get device info response',JSON.stringify(response.data,null,2))}
			return response.data
			}
		}catch(err){this.log.error('Error getting device info \n%s', err)}
	},

	getLocationList: async function(token){
		try{
			this.log.debug('Getting Location List')
			let response = await axios({
				method: 'get',
				baseURL: alt_api_endpoint,
				url: '/location/listLocations/true',
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`
				},
			responseType: 'json'
			}).catch(err => {
				this.log.error('Error getting location list %s', err.message)
				this.log.debug(JSON.stringify(err,null,2))
				if(err.response){this.log.warn( JSON.stringify(err.response.data,null,2))}
				return
			})
			if(response.status==200){
				if(this.platform.showAPIMessages){this.log.debug('get list locations response',JSON.stringify(response.data,null,2))}
			return response.data
			}
		}catch(err){this.log.error('Error getting location list \n%s', err)}
	},

  currentSchedule: async function(token,device){
    try{
			this.log.debug('Checking current schedule',device)
			let response = await axios({
				method: 'get',
				baseURL: api_endpoint,
				url: '/device/'+device+'/current_schedule',
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`
				},
				responseType: 'json'
			}).catch(err => {
				this.log.error('Error getting schedule %s', err.message)
				this.log.debug(JSON.stringify(err,null,2))
				if(err.response){this.log.warn( JSON.stringify(err.response.data,null,2))}
				return
			})
			this.log.debug('status',response.data.status)
			if(response.status==200){
				if(this.platform.showAPIMessages){this.log.debug('get current schedule response',JSON.stringify(response.data,null,2))}
				return response
			}
    }catch(err){this.log.error('Error getting current schedule \n%s', err)}
  },

	deviceStandby: async function(token,device,state){
		try{
			this.log.debug('Setting Standby Mode on',device.id)
			let response = await axios({
				method: 'put',
				baseURL: api_endpoint,
				url: '/device/'+state,
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`
				},
				data:{
					id: device.id,
				},
				responseType: 'json'
			}).catch(err => {
				this.log.error('Error setting standby to %s %s', state, err.message)
				this.log.warn(JSON.stringify(err.response.data,null,2))
				this.log.debug(JSON.stringify(err,null,2))
			})
			this.log.debug('device standby response status',response.status)
			return response
		}catch(err){this.log.error('Error setting standby \n%s', err)}
	},

	startZone: async function(token,zone,runtime){
		try{
			this.log.debug('Starting Zone',zone)
			let response = await axios({
			method: 'put',
			baseURL: api_endpoint,
			url: '/zone/start',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json',
				'User-Agent': `${PluginName}/${PluginVersion}`
			},
			data:{
				id: zone,
				duration: runtime
			},
			responseType: 'json'
			}).catch(err => {
				this.log.error('Error sending start zone %s', err.message)
				this.log.warn(JSON.stringify(err.response.data,null,2))
				this.log.debug(JSON.stringify(err,null,2))
			})
			this.log.debug('start response',response.status)
			return response
		}catch(err){this.log.error('Error Starting Zone \n%s', err)}
	},

	startSchedule: async function(token,schedule){
		try{
			this.log.debug('Starting Schedule',schedule)
			let response = await axios({
			method: 'put',
			baseURL: api_endpoint,
			url: '/schedulerule/start',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json',
				'User-Agent': `${PluginName}/${PluginVersion}`
			},
			data:{
				id: schedule
			},
			responseType: 'json'
			}).catch(err => {
				this.log.error('Error sending start schedule %s', err.message)
				this.log.warn(JSON.stringify(err.response.data,null,2))
				this.log.debug(JSON.stringify(err,null,2))
			})
			this.log.debug('start schedule response',response.status)
			return response
		}catch(err){this.log.error('Error Starting Schedule \n%s', err)}
	},

	stopDevice: async function(token,deviceId){
		try{
			this.log.debug('Stopping',deviceId)
			let response = await axios({
				method: 'put',
				baseURL: api_endpoint,
				url: '/device/stop_water',
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`
				},
				data:{
					id: deviceId
				},
				responseType: 'json'
			}).catch(err => {
				this.log.error('Error sending stop %s', err.message)
				this.log.warn(JSON.stringify(err.response.data,null,2))
				this.log.debug(JSON.stringify(err,null,2))
			})
			this.log.debug('stop response',response.status)
			return response
		}catch(err){this.log.error('Error Stopping Device \n%s', err)}
	},

	startMultipleZone: async function(token,zones,duration){
		try{
			let body=[]
			//this.log.debug('Starting Multiple Zones', zones)
			zones.forEach((zone,index)=>{
				if(zone.enabled){
					body.push(
						{
							name: zone.name, //not required
							id: zone.id,
							duration: duration,
							sortOrder: index
						}
					)
				}
			})
			this.log.debug('multiple run data',JSON.stringify(body,null,2))
			let response = await axios({
				method: 'put',
				baseURL: api_endpoint,
				url: '/zone/start_multiple',
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`
				},
				data:{
					zones : body
				},
				responseType: 'json'
			}).catch(err => {
				this.log.error('Error sending start %s', err.message)
				this.log.warn(JSON.stringify(err.response.data,null,2))
				this.log.debug(JSON.stringify(err,null,2))
			})
			this.log.debug('start multiple response',response.status)
			return response
		}catch(err){this.log.error('Error Starting Multiple Zones \n%s', err)}
	},

	configureWebhooks: async function(token,external_webhook_address,delete_webhooks,device_Id,webhook_key){
		try{
			this.log.info('Configuring Rachio webhooks for controller ID %s',device_Id)
			let response = await axios({
				method: 'get',
				baseURL: api_endpoint,
				url: '/notification/' + device_Id + '/webhook',
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`
				},
				responseType: 'json'
			}).catch(err => {
				this.log.error('Error retrieving webhooks %s', err.message)
				this.log.warn(JSON.stringify(err.response.data,null,2))
				this.log.debug(JSON.stringify(err,null,2))
			})
			if(response.status==200){
				if(this.platform.showAPIMessages){this.log.debug('configured webhooks response',JSON.stringify(response.data,null,2))}
				//return response
			}
			let webhooks = response.data
			if(this.platform.showAPIMessages){this.log.debug('configured webhooks response',JSON.stringify(response.data,null,2))}
			if(!webhooks || !Array.isArray(webhooks)){return}

			if(delete_webhooks){
				//delete exsisting webhooks
				webhooks.forEach(async(webhook)=>{
					if(webhook.externalId == webhook_key){return} //Skip the current webhook and let it be updated
					response = await axios({
						method: 'delete',
						baseURL: api_endpoint,
						url: '/notification/webhook/' + webhook.id,
						headers: {
							'Authorization': `Bearer ${token}`,
							'Content-Type': 'application/json',
							'User-Agent': `${PluginName}/${PluginVersion}`
						},
						responseType: 'json'
					}).catch(err => {
						this.log.error('Error deleting old webhook $s : $s', webhook.id, err.message)
						this.log.warn(JSON.stringify(err.response.data,null,2))
						this.log.debug(JSON.stringify(err,null,2))
					})
					if(response.status == 204){
					this.log.debug('Successfully deleted old webhook %s', webhook.id)
					}
				})
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
			let updateWebhook=false
			let count=0
			webhooks.forEach(async(webhook)=>{
				if(webhook.externalId==webhook_key || webhook.url==external_webhook_address){
					count++
					if(count==1){
						updateWebhook=webhook
						return
					}
					response = await axios({
						method: 'delete',
						baseURL: api_endpoint,
						url: '/notification/' + 'webhook/' + webhook.id,
						headers: {
								'Authorization': `Bearer ${token}`,
								'Content-Type': 'application/json',
								'User-Agent': `${PluginName}/${PluginVersion}`
								},
						responseType: 'json'
					}).catch(err => {
							this.log.error('Error deleting extra webhook $s : $s', webhook.id, err.message)
							this.log.warn(JSON.stringify(err.response.data,null,2))
							this.log.debug(JSON.stringify(err,null,2))
						})
					if(response.status == 204){
						this.log.debug('Successfully deleted extra webhook %s', webhook.id)
					}
				}
			})
			if(updateWebhook){
				this.log.info('Updating Rachio Webhook ID %s, for destination %s', updateWebhook.id, external_webhook_address)
				response = await axios({
					method: 'put',
					baseURL: api_endpoint,
					url: '/notification/webhook/',
					headers: {
						'Authorization': `Bearer ${token}`,
						'Content-Type': 'application/json',
						'User-Agent': `${PluginName}/${PluginVersion}`
					},
					responseType: 'json',
					data: {
						id: updateWebhook.id,
						externalId: webhook_key,
						url: external_webhook_address,
						eventTypes: [{"id":5},{"id":10},{"id":6},{"id":7},{"id":9}]
					}
					}).catch(err => {
						this.log.error('Error updating exsisting webhook $s : $s', updateWebhook.id, err.message)
						this.log.warn(JSON.stringify(err.response.data,null,2))
						this.log.debug(JSON.stringify(err,null,2))
					})
			}else{
				this.log.info('Creating Webhook for ' + external_webhook_address)
				response = await axios({
					method: 'post',
					baseURL: api_endpoint,
					url: '/notification/webhook/',
					headers: {
						'Authorization': `Bearer ${token}`,
						'Content-Type': 'application/json',
						'User-Agent': `${PluginName}/${PluginVersion}`
					},
					responseType: 'json',
					data: {
						device: { id: device_Id },
						externalId: webhook_key,
						url: external_webhook_address,
						eventTypes: [{"id":5},{"id":10},{"id":6},{"id":7},{"id":9}]
					}
				}).catch(err => {
					this.log.error('Error configuring new webhook $s : $s', updateWebhook.id,err,message)
					this.log.warn(JSON.stringify(err.response.data,null,2))
					this.log.debug(JSON.stringify(err,null,2))
				})
			}
			if(this.platform.showAPIMessages){this.log.debug('create/update webhooks response',JSON.stringify(response.data,null,2))}
			let test_webhook_url = external_webhook_address + '/test'
			if(response.status == 200){
				this.log.info('Successfully configured webhook with external ID "%s" ', webhook_key)
				this.log.info('To test Webhook setup, navigate to %s to ensure port forwarding is configured correctly. '
									+'\nNote: For local config this will not work from this server, you cannot be connected to the same router doing the fowarding. '
									+'\nThe best way to test this is from a cell phone, with WiFi off.', test_webhook_url)
			}
			return
		}catch(err){this.log.error('Error configuring webhook \n%s',err)}
	}
}