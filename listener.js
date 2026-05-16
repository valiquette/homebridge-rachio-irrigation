let http = require('http')
let https = require('https')
let fs = require('fs')
let crypto = require('crypto')
let RachioUpdate = require('./rachioupdate')

class listen {
	constructor(platform) {
		this.log = platform.log
		this.config = platform.config
		this.platform = platform
		this.rachio = new RachioUpdate(platform)
	}

	configureListener() {
		//set local listener
		this.localMessage(this.rachio.updateService.bind(this))
		//set network listener
		let server = this.platform.useHttps ? https : http
		let options = {}
		if (server == https) {
			options = {
				key: fs.readFileSync(this.platform.key),
				cert: fs.readFileSync(this.platform.cert)
			}
		}
		if ((this.platform.external_IP_address && this.platform.external_webhook_address && this.platform.internal_webhook_port) || (this.platform.relay_address && this.platform.internal_IP_address && this.platform.internal_webhook_port)) {
			this.log.debug('Will listen for Webhooks matching Webhook ID %s', this.platform.webhook_key)
			server
				.createServer(options, (request, response) => {
					let webhookAuthentication
					if (request.method === 'GET' && request.url === '/test') {
						//check v1 authentication
						if (request.headers.authorization){
							webhookAuthentication = this.checkAuth(request)
							this.log.debug('Webhook v1 Authentication', webhookAuthentication ? 'passed' : 'failed')
							if(!webhookAuthentication){
								this.log.warn('Webhook v1 Authentication failed unknown sender')
							}
						}
						//check v2 authentication SHT
						if(request.headers['x-signature']){
							webhookAuthentication = this.checkKey(this.platform.token, request.headers['x-signature'], JSON.stringify(jsonBody))
							this.log.debug('Webhook v2 Authentication', webhookAuthentication ? 'passed' : 'failed')
							if(!webhookAuthentication){
								this.log.warn('Webhook v2 Authentication failed unknown sender')
							}
						}
						//check for basic auth enabled
						if (this.platform.useBasicAuth && !request.headers.authorization && !request.headers['x-signature']){
							webhookAuthentication = false
							this.log.debug('Webhook Authentication', webhookAuthentication ? 'passed' : 'failed')
							if(!webhookAuthentication){
								this.log.warn('Webhook Authentication failed')
							}
						}
						this.log.info('Test received on Rachio listener. Webhooks are configured correctly! Authorization %s', webhookAuthentication ? 'passed' : 'failed')
						response.writeHead(200)
						let x = `${new Date().toTimeString()} \nWebhooks are configured correctly! \nAuthorization ${webhookAuthentication ? 'passed' : 'failed'}`
						response.write(x)
						if (this.platform.useBasicAuth) {
							response.write(`\nHTTP basic authentication is enabled and failing authorization in this test is expected.`)
						}
						return response.end()
					} else if (request.method === 'POST' && request.url === '/') {
						let body = []
						request
							.on('data', chunk => {
								body.push(chunk)
							})
							.on('end', () => {
								try {
									body = Buffer.concat(body).toString().trim()
									let jsonBody = JSON.parse(body)
									//check v1 authentication
									if (request.headers.authorization){
										webhookAuthentication = this.checkAuth(request)
										this.log.debug('Webhook v1 Authentication', webhookAuthentication ? 'passed' : 'failed')
										if(!webhookAuthentication){
											this.log.warn('Webhook v1 Authentication failed unknown sender')
											response.writeHead(403)
											return response.end()
										}
									}
									//check v2 authentication SHT
									if (request.headers['x-signature']){
										webhookAuthentication = this.checkKey(this.platform.token, request.headers['x-signature'], JSON.stringify(jsonBody))
										this.log.debug('Webhook v2 Authentication', webhookAuthentication ? 'passed' : 'failed')
										if(!webhookAuthentication){
											this.log.warn('Webhook v2 Authentication failed unknown sender')
											response.writeHead(403)
											return response.end()
										}
									}
									//check for basic auth enabled
									if (this.platform.useBasicAuth && !request.headers.authorization && !request.headers['x-signature']){
										webhookAuthentication = false
										this.log.debug('Webhook Authentication', webhookAuthentication ? 'passed' : 'failed')
										if(!webhookAuthentication){
											this.log.warn('Webhook Authentication failed')
											response.writeHead(403)
											return response.end()
										}
									}
									if (this.platform.showWebhookMessages) {
										this.log.debug('webhook request received from <%s> %s', jsonBody.externalId, JSON.stringify(jsonBody, null, 2))
									}
									switch (jsonBody.resourceType) {
										case 'IRRIGATION_CONTROLLER':
											if (jsonBody.externalId === this.platform.webhook_key) {
												const index = this.platform.accessories.findIndex(accessory => accessory.UUID === jsonBody.resourceId);
												const irrigationAccessory = this.platform.accessories[index]
												const irrigationSystemService = irrigationAccessory.getService(Service.IrrigationSystem)
												let service
												if (jsonBody.payload.zoneNumber) {
													let index = this.platform.zoneList
														.filter(check => {
															return check.deviceId == jsonBody.resourceId
														})
														.findIndex(zone => zone.zone == jsonBody.payload.zoneNumber)
													let zoneId = this.platform.zoneList[index].zoneId
													service = irrigationAccessory.getServiceById(Service.Valve, zoneId)
													this.log.debug('Webhook match found for %s will update zone service', service.getCharacteristic(Characteristic.Name).value)
													this.eventMsg(irrigationSystemService, service, jsonBody)
												} else if (jsonBody.payload.scheduleId) {
													service = irrigationAccessory.getServiceById(Service.Switch, jsonBody.payload.scheduleId)
													if (this.platform.showSchedules) {
														this.log.debug('Webhook match found for %s will update schedule service', service.getCharacteristic(Characteristic.Name).value)
														this.eventMsg(irrigationSystemService, service, jsonBody)
													} else {
														this.log.debug('Skipping Webhook for %s service, optional schedule switch is not configured', jsonBody.scheduleName)
													}
												}
												response.writeHead(204)
												return response.end()
											} else {
												this.log.warn('Webhook received from an unknown external id %s', jsonBody.externalId)
												response.writeHead(404)
												return response.end()
											}

										case 'VALVE':
											if (jsonBody.externalId === this.platform.webhook_key) {
												const index = this.platform.accessories.findIndex(accessory => accessory.UUID === jsonBody.resourceId);
												const valveAccessory = this.platform.accessories[index]
												const valveService = valveAccessory.getService(Service.Valve)
												this.log.debug('Webhook match found for %s will update valve service', valveService.getCharacteristic(Characteristic.Name).value)
												this.eventMsg(null, valveService, jsonBody)
												response.writeHead(204)
												return response.end()
											} else {
												this.log.warn('Webhook received from an unknown external id %s', jsonBody.externalId)
												response.writeHead(404)
												return response.end()
											}
										default: //v1 webhooks
											if (jsonBody.externalId === this.platform.webhook_key) {
												const index = this.platform.accessories.findIndex(accessory => accessory.UUID === jsonBody.resourceId);
												const irrigationAccessory = this.platform.accessories[index]
												const irrigationSystemService = irrigationAccessory.getService(Service.IrrigationSystem)
												let service
												if (jsonBody.zoneId) {
													service = irrigationAccessory.getServiceById(Service.Valve, jsonBody.zoneId)
													this.log.debug('Webhook match found for %s will update zone service', service.getCharacteristic(Characteristic.Name).value)
													this.eventMsg(irrigationSystemService, service, jsonBody)
												} else if (jsonBody.deviceId && jsonBody.subType.includes('SLEEP')) {
													service = irrigationAccessory.getService(Service.IrrigationSystem)
													if (this.platform.showStandby) {
														this.log.debug('Webhook match found for %s will update irrigation service', service.getCharacteristic(Characteristic.Name).value)
														this.eventMsg(irrigationSystemService, service, jsonBody)
													} else {
														this.log.debug('Skipping Webhook for %s service, optional standby switch is not configured', jsonBody.deviceName)
													}
												}
												response.writeHead(204)
												return response.end()
											} else {
												this.log.warn('Webhook received from an unknown external id %s', jsonBody.externalId)
												response.writeHead(404)
												return response.end()
											}
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
					this.platform.internal_webhook_port,
					function () {
						this.log.info('This server is listening on port %s.', this.platform.internal_webhook_port)
						if (this.platform.useBasicAuth) {
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

	checkKey(secret, signature, message) {
		let pass = false
		let hash = crypto
			.createHmac('sha256', secret)
			.update(message)
			.digest('hex')
		if (signature == hash) {
			pass = true
		}
		return pass
	}

	checkAuth(message){
		let pass = false
		let b64encoded = Buffer.from(this.platform.user + ':' + this.platform.password, 'utf8').toString('base64')
		if (message.headers.authorization == 'Basic ' + b64encoded) {
			pass = true
		} else {
			this.log.debug('webhook v1 request authorization header=%s', message.headers.authorization)
			this.log.debug('webhook v1 expected authorization header=%s', 'Basic ' + b64encoded)
		}
		return pass
	}

	localMessage(listener) {
		this.eventMsg = (SystemService, service, myJson) => {
			listener(SystemService, service, myJson)
		}
	}
}
module.exports = listen
