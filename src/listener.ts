/* eslint-disable @typescript-eslint/no-explicit-any */

import http from 'http';
import https from 'https';
import { readFileSync } from 'fs';
import { createHmac } from 'crypto';
import { Service, Characteristic, Logging, PlatformAccessory } from 'homebridge';
import RachioPlatform from './rachioplatform.js';
import RachioUpdate from './rachioupdate.js';
import { BinaryLike, KeyObject } from 'node:crypto';

export default class listen {
	public readonly Service: typeof Service;
	public readonly Characteristic: typeof Characteristic;
	eventMsg!: (systemService: Service | null, service: Service, myJson: any) => void;
	constructor(
		private readonly platform: RachioPlatform,
		private readonly log: Logging = platform.log,
		private rachio = new RachioUpdate(platform),
	) {
		this.Service = platform.Service;
		this.Characteristic = platform.Characteristic;
	}
	configureListener() {
		this.webMessage(this.rachio.updateService.bind(this));
		//this.localMessage(this.rachio.updateService.bind(this));
		const server: any = this.platform.useHttps ? https : http;
		let options = {};
		if (server == https) {
			options = {
				key: readFileSync(this.platform.key),
				cert: readFileSync(this.platform.cert),
			};
		}

		if ((this.platform.external_IP_address && this.platform.external_webhook_address && this.platform.internal_webhook_port) || (this.platform.relay_address && this.platform.internal_IP_address && this.platform.internal_webhook_port)) {
			this.log.debug('Will listen for Webhooks matching Webhook ID %s', this.platform.webhook_key);
			server
				.createServer(options, (request: any, response: any) => {
					let webhookAuthentication;
					if (request.method === 'GET' && request.url === '/test') {
						const jsonBody = request.body;
						//check v1 authentication
						if (request.headers.authorization) {
							webhookAuthentication = this.checkAuth(request);
							this.log.debug('Webhook v1 Authentication', webhookAuthentication ? 'passed' : 'failed');
							if (!webhookAuthentication) {
								this.log.warn('Webhook v1 Authentication failed unknown sender');
							}
						}
						//check v2 authentication SHT
						if (request.headers['x-signature']) {
							webhookAuthentication = this.checkKey(this.platform.token, request.headers['x-signature'], JSON.stringify(jsonBody));
							this.log.debug('Webhook v2 Authentication', webhookAuthentication ? 'passed' : 'failed');
							if (!webhookAuthentication) {
								this.log.warn('Webhook v2 Authentication failed unknown sender');
							}
						}
						//check for basic auth enabled
						if (this.platform.useBasicAuth && !request.headers.authorization && !request.headers['x-signature']) {
							webhookAuthentication = false;
							this.log.debug('Webhook Authentication', webhookAuthentication ? 'passed' : 'failed');
							if (!webhookAuthentication) {
								this.log.warn('Webhook Authentication failed');
							}
						}
						this.log.info('Test received on Rachio listener. Webhooks are configured correctly! Authorization %s', webhookAuthentication ? 'passed' : 'failed');
						response.writeHead(200);
						const x = `${new Date().toTimeString()} \nWebhooks are configured correctly! \nAuthorization ${webhookAuthentication ? 'passed' : 'failed'}`;
						response.write(x);
						if (this.platform.useBasicAuth) {
							response.write('\nHTTP basic authentication is enabled and failing authorization in this test is expected.');
						}
						return response.end();
					} else if (request.method === 'POST' && request.url === '/') {
						let body: any = [];
						request
							.on('data', (chunk: any) => {
								body.push(chunk);
							})
							.on('end', () => {
								try {
									body = Buffer.concat(body).toString().trim();
									const jsonBody = JSON.parse(body);
									//check v1 authentication
									if (request.headers.authorization) {
										webhookAuthentication = this.checkAuth(request);
										this.log.debug('Webhook v1 Authentication', webhookAuthentication ? 'passed' : 'failed');
										if (!webhookAuthentication) {
											this.log.warn('Webhook v1 Authentication failed unknown sender');
											response.writeHead(403);
											return response.end();
										}
									}
									//check v2 authentication SHT
									if (request.headers['x-signature']) {
										webhookAuthentication = this.checkKey(this.platform.token, request.headers['x-signature'], JSON.stringify(jsonBody));
										this.log.debug('Webhook v2 Authentication', webhookAuthentication ? 'passed' : 'failed');
										if (!webhookAuthentication) {
											this.log.warn('Webhook v2 Authentication failed unknown sender');
											response.writeHead(403);
											return response.end();
										}
									}
									//check for basic auth enabled
									if (this.platform.useBasicAuth && !request.headers.authorization && !request.headers['x-signature']) {
										webhookAuthentication = false;
										this.log.debug('Webhook Authentication', webhookAuthentication ? 'passed' : 'failed');
										if (!webhookAuthentication) {
											this.log.warn('Webhook Authentication failed');
											response.writeHead(403);
											return response.end();
										}
									}
									if (this.platform.showWebhookMessages) {
										this.log.debug('webhook request received from <%s> %s', jsonBody.externalId, JSON.stringify(jsonBody, null, 2));
									}
									switch (jsonBody.resourceType) {
									case 'IRRIGATION_CONTROLLER':
										if (jsonBody.externalId === this.platform.webhook_key) {
											const index: number = this.platform.accessories.findIndex(accessory => accessory.UUID === jsonBody.resourceId);
											const irrigationAccessory: PlatformAccessory = this.platform.accessories[index];
											const irrigationSystemService: Service = irrigationAccessory.getService(this.Service.IrrigationSystem)!;
											if (jsonBody.payload.zoneNumber) {
												const valveIndex = this.platform.zoneList
													.filter((check: any) => {
														return check.deviceId == jsonBody.resourceId;
													})
													.findIndex((zone: any) => zone.zone == jsonBody.payload.zoneNumber);
												const zoneId = this.platform.zoneList[valveIndex].zoneId;
												const zone = irrigationAccessory.getServiceById(this.Service.Valve, zoneId)!;
												this.log.debug('Webhook match found for %s will update zone service', zone.getCharacteristic(this.Characteristic.Name).value);
												this.eventMsg(irrigationSystemService, zone, jsonBody);
											} else if (jsonBody.payload.scheduleId) {
												const schedule = irrigationAccessory.getServiceById(this.Service.Switch, jsonBody.payload.scheduleId)!;
												if (this.platform.showSchedules) {
													this.log.debug('Webhook match found for %s will update schedule service', schedule.getCharacteristic(this.Characteristic.Name).value);
													this.eventMsg(irrigationSystemService, schedule, jsonBody);
												} else {
													this.log.debug('Skipping Webhook for %s service, optional schedule switch is not configured', jsonBody.scheduleName);
												}
											}
											response.writeHead(204);
											return response.end();
										} else {
											this.log.warn('Webhook received from an unknown external id %s', jsonBody.externalId);
											response.writeHead(404);
											return response.end();
										}

									case 'VALVE':
										if (jsonBody.externalId === this.platform.webhook_key) {
											const index: number = this.platform.accessories.findIndex(accessory => accessory.UUID === jsonBody.resourceId);
											const valveAccessory: PlatformAccessory = this.platform.accessories[index];
											const valveService: any = valveAccessory.getService(this.Service.Valve);
											this.log.debug('Webhook match found for %s will update valve service', valveService.getCharacteristic(this.Characteristic.Name).value);
											this.eventMsg(null, valveService, jsonBody);
											response.writeHead(204);
											return response.end();
										} else {
											this.log.warn('Webhook received from an unknown external id %s', jsonBody.externalId);
											response.writeHead(404);
											return response.end();
										}
									default: //v1 webhooks
										if (jsonBody.externalId === this.platform.webhook_key) {
											const index = this.platform.accessories.findIndex(accessory => accessory.UUID === jsonBody.resourceId);
											const irrigationAccessory: PlatformAccessory = this.platform.accessories[index];
											const irrigationSystemService: Service = irrigationAccessory.getService(this.Service.IrrigationSystem)!;
											if (jsonBody.zoneId) {
												const zone = irrigationAccessory.getServiceById(this.Service.Valve, jsonBody.zoneId)!;
												this.log.debug('Webhook match found for %s will update zone service', zone.getCharacteristic(this.Characteristic.Name).value);
												this.eventMsg(irrigationSystemService, zone, jsonBody);
											} else if (jsonBody.deviceId && jsonBody.subType.includes('SLEEP')) {
												if (this.platform.showStandby) {
													const switchService = irrigationAccessory.getServiceById(this.Service.Switch, this.platform.genUUID(jsonBody.deviceName + ' Standby'))!;
													this.log.debug('Webhook match found for %s will update irrigation service', irrigationSystemService.getCharacteristic(this.Characteristic.Name).value);
													this.eventMsg(irrigationSystemService, switchService, jsonBody);
												} else {
													this.log.debug('Skipping Webhook for %s service, optional standby switch is not configured', jsonBody.deviceName);
												}
											}
											response.writeHead(204);
											return response.end();
										} else {
											this.log.warn('Webhook received from an unknown external id %s', jsonBody.externalId);
											response.writeHead(404);
											return response.end();
										}
									}
								} catch (err) {
									this.log.error('Error parsing webhook request ' + err);
									response.writeHead(404);
									return response.end();
								}
							});
					}
				})
				.listen(
					this.platform.internal_webhook_port,
					() => {
						this.log.info('This server is listening on port %s.', this.platform.internal_webhook_port);
						if (this.platform.useBasicAuth) {
							this.log.info('Using HTTP basic authentication for Webhooks');
						}
						this.log.info('Make sure your router has port fowarding turned on for port %s to this server`s IP address and this port %s, unless you are using a relay service.', this.platform.external_webhook_port, this.platform.internal_webhook_port);
					},
				);
		} else {
			this.log.warn('Webhook support is disabled. This plugin will not sync Homekit to realtime events from other sources without Webhooks support.');
		}
		return;
	}

	checkKey(secret: BinaryLike | KeyObject, signature: string, message: BinaryLike) {
		let pass = false;
		const hash = createHmac('sha256', secret)
			.update(message)
			.digest('hex');
		if (signature == hash) {
			pass = true;
		}
		return pass;
	}

	checkAuth(message: { headers: { authorization: string; }; }) {
		let pass = false;
		const b64encoded = Buffer.from(this.platform.user + ':' + this.platform.password, 'utf8').toString('base64');
		if (message.headers.authorization == 'Basic ' + b64encoded) {
			pass = true;
		} else {
			this.log.debug('webhook v1 request authorization header=%s', message.headers.authorization);
			this.log.debug('webhook v1 expected authorization header=%s', 'Basic ' + b64encoded);
		}
		return pass;
	}

	webMessage(listener: any) {
		this.eventMsg = (systemService, service, myJson) => {
			listener(systemService, service, myJson);
		};
	}

	localMessage(systemService:Service | null, service: Service, myJson: any) {
		if (this.platform.showWebhookMessages) {
			this.log.debug('webhook recieved from <%s> %s', this.platform.webhook_key_local, JSON.stringify(myJson, null, 2));
		}
		this.rachio.updateService(systemService, service, myJson);
	}
}
