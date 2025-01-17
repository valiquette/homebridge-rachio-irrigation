let http = require('http')
let https = require('https')
let fs = require('fs')
let crypto = require('crypto')
let RachioUpdate = require('./rachioupdate')

class listen {
	constructor(platform, log, config) {
		this.log = log
		this.config = config
		this.platform = platform
		this.rachio = new RachioUpdate(platform, log, config)
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
					let authPassed
					if (this.platform.useBasicAuth) {
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
						//response.write(new Date().toTimeString() + ' Webhooks are configured correctly! Authorization ' + authPassed ? 'passed' : 'failed')
						let x = `${new Date().toTimeString()} \nWebhooks are configured correctly! \nAuthorization ${authPassed ? 'passed' : 'failed'}`
						response.write(x)
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
									//check v2 authentication
									if(request.headers['x-signature']){
										let webhookAuthentication = this.checkKey(this.platform.token, request.headers['x-signature'], JSON.stringify(jsonBody))
										this.log.debug('Webhook Authentication', webhookAuthentication ? 'passed' : 'failed')
										if(!webhookAuthentication){
											this.log.warn('Webhook Authentication failed unknown sender')
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
												let irrigationAccessory = this.platform.accessories[jsonBody.resourceId]
												let irrigationSystemService = irrigationAccessory.getService(Service.IrrigationSystem)
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
												let valveAccessory = this.platform.accessories[jsonBody.resourceId]
												let valveService = valveAccessory.getService(Service.Valve)
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
												let irrigationAccessory = this.platform.accessories[jsonBody.deviceId]
												let irrigationSystemService = irrigationAccessory.getService(Service.IrrigationSystem)
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

	localMessage(listener) {
		this.eventMsg = (SystemService, service, myJson) => {
			listener(SystemService, service, myJson)
		}
	}
}
module.exports = listen
