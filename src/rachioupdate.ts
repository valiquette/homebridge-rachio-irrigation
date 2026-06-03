/* eslint-disable @typescript-eslint/no-explicit-any */

import { Service, Characteristic, Logging, PlatformConfig } from 'homebridge';
import RachioPlatform from './rachioplatform.js';

export default class Rachio {
	public readonly Service: typeof Service;
	public readonly Characteristic: typeof Characteristic;
	constructor(
		private readonly platform: RachioPlatform,
		private readonly log: Logging = platform.log,
		private readonly config: PlatformConfig = platform.config,
	) {
		this.Service = platform.Service;
		this.Characteristic = platform.Characteristic;
	}

	async updateService(irrigationSystemService: Service | null, activeService: Service, jsonBody: any) {
		const index = this.platform.valveServices.findIndex(valve => valve.subtype === activeService.subtype);
		if (jsonBody.resourceType == 'IRRIGATION_CONTROLLER' || jsonBody.resourceType == 'VALVE') {
			//webhook v2 messages
			/***********************************************************
			Event Type options from webhook info
					"SCHEDULE_STARTED_EVENT",
					"SCHEDULE_STOPPED_EVENT",
					"SCHEDULE_COMPLETED_EVENT",
					"DEVICE_ZONE_RUN_STARTED_EVENT",
					"DEVICE_ZONE_RUN_PAUSED_EVENT",
					"DEVICE_ZONE_RUN_STOPPED_EVENT",
					"DEVICE_ZONE_RUN_COMPLETED_EVENT",
					"CLIMATE_SKIP_NOTIFICATION_EVENT",
					"FREEZE_SKIP_NOTIFICATION_EVENT",
					"RAIN_SKIP_NOTIFICATION_EVENT",
					"WIND_SKIP_NOTIFICATION_EVENT",
					"NO_SKIP_NOTIFICATION_EVENT"

					"VALVE_RUN_START_EVENT",
					"VALVE_RUN_END_EVENT"

					"PROGRAM_RAIN_SKIP_CREATED_EVENT",
					"PROGRAM_RAIN_SKIP_CANCELED_EVENT"
			************************************************************/
			try {
				//version 2
				/*****************************
								 Possible states
						Active	InUse	  HomeKit Shows
						False	  False	  Off
						True  	False	  Idle
						True	  True	  Running
						False	  True	  Stopping
						******************************/
				switch (jsonBody.eventType) {
				case 'DEVICE_ZONE_RUN_STARTED_EVENT':
					this.log.info('<%s> %s, started for duration %s minutes.', jsonBody.externalId, jsonBody.eventType, Math.round(jsonBody.payload.durationSeconds / 60));
					this.log.debug('%s started watering at %s', activeService.getCharacteristic(this.Characteristic.Name).value, new Date(jsonBody.payload.startTime).toLocaleTimeString());
					irrigationSystemService!.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE);
					activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.ACTIVE);
					activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE);
					activeService.getCharacteristic(this.Characteristic.RemainingDuration).updateValue(jsonBody.payload.durationSeconds);
					this.platform.endTime[index] = jsonBody.payload.endTime;
					break;
				case 'DEVICE_ZONE_RUN_STOPPED_EVENT':
					if (jsonBody.payload.durationSeconds < 60) {
						this.log.info('<%s> %s, stopped after %s seconds.', jsonBody.externalId, jsonBody.eventType, jsonBody.payload.durationSeconds);
					} else {
						this.log.info('<%s> %s, stopped after %s minutes.', jsonBody.externalId, jsonBody.eventType, Math.round(jsonBody.payload.durationSeconds / 60));
					}
					this.log.debug('%s stopped watering at %s after %s minutes', activeService.getCharacteristic(this.Characteristic.Name).value, new Date(jsonBody.payload.endTime).toLocaleTimeString(), Math.round(jsonBody.payload.durationSeconds / 60));
					irrigationSystemService!.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
					activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.INACTIVE);
					activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
					activeService.getCharacteristic(this.Characteristic.RemainingDuration).updateValue(jsonBody.payload.durationSeconds);
					break;
				case 'DEVICE_ZONE_RUN_PAUSED_EVENT': {
					clearTimeout(this.platform.localWebhook);
					const pauseDuration = Math.round((Date.parse(jsonBody.payload.endTime) - Date.now() - (Date.parse(this.platform.endTime[index]) - Date.now())) / 1000);
					const pauseDurationInMinutes = Math.round(jsonBody.payload.durationSeconds / 60);
					this.log.info('<%s> %s, paused for duration %s minutes.', jsonBody.externalId, jsonBody.eventType, pauseDurationInMinutes);
					//this.log.debug(jsonBody.summary)
					irrigationSystemService!.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE);
					activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.ACTIVE);
					activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
					activeService.getCharacteristic(this.Characteristic.RemainingDuration).updateValue(pauseDuration);
					this.platform.endTime[index] = jsonBody.payload.endTime;
				}
					break;
				case 'DEVICE_ZONE_RUN_COMPLETED_EVENT': {
					if (jsonBody.payload.durationSeconds < 60) {
						this.log.info('<%s> %s, completed after %s seconds.', jsonBody.externalId, jsonBody.eventType, jsonBody.payload.durationSeconds);
					} else {
						this.log.info('<%s> %s, completed after %s minutes.', jsonBody.externalId, jsonBody.eventType, Math.round(jsonBody.payload.durationSeconds / 60));
					}
					this.log.debug(activeService.getCharacteristic(this.Characteristic.Name).value + ' completed watering at ' + new Date().toLocaleTimeString() + ' after ' + Math.round(jsonBody.payload.durationSeconds / 60) + ' minutes');
					irrigationSystemService!.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
					activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.INACTIVE);
					activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
				}
					break;
				case 'SCHEDULE_STARTED_EVENT':
					this.log.info('<%s> %s schedule started for %s minutes', jsonBody.externalId, jsonBody.eventType, Math.round(jsonBody.payload.durationSeconds / 60));
					this.log.debug('%s started schedule at %s', activeService.getCharacteristic(this.Characteristic.Name).value, new Date(jsonBody.payload.startTime).toLocaleTimeString());
					if (this.Service.IrrigationSystem.UUID != activeService.UUID) {
						activeService.getCharacteristic(this.Characteristic.On).updateValue(true);
					}
					irrigationSystemService!.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE);
					break;
				case 'SCHEDULE_STOPPED_EVENT':
					this.log.info('<%s> %s schedule stopped after %s minutes', jsonBody.externalId, jsonBody.eventType, Math.round(jsonBody.payload.durationSeconds / 60));
					this.log.debug('%s stopped schedule at %s', activeService.getCharacteristic(this.Characteristic.Name).value, new Date(jsonBody.payload.endTime).toLocaleTimeString());
					if (this.Service.IrrigationSystem.UUID != activeService.UUID) {
						activeService.getCharacteristic(this.Characteristic.On).updateValue(false);
					}
					irrigationSystemService!.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
					break;
				case 'SCHEDULE_COMPLETED_EVENT':
					this.log.info('<%s> %s schedule completed after %s minutes', jsonBody.externalId, jsonBody.eventType, Math.round(jsonBody.payload.durationSeconds / 60));
					this.log.debug('%s completed schedule at %s', activeService.getCharacteristic(this.Characteristic.Name).value, new Date(jsonBody.payload.endTime).toLocaleTimeString());
					if (this.Service.IrrigationSystem.UUID != activeService.UUID) {
						activeService.getCharacteristic(this.Characteristic.On).updateValue(false);
					}
					irrigationSystemService!.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
					break;

				case 'VALVE_RUN_START_EVENT':
					jsonBody.payload.endTime = new Date(Date.parse(jsonBody.payload.startTime) + jsonBody.payload.durationSeconds * 1000); // need to add to json, missing jsonBody.payload.endTime
					this.log.info('<%s> %s, started for duration %s minutes.', jsonBody.externalId, jsonBody.eventType, Math.round(jsonBody.payload.durationSeconds / 60));
					this.log.debug('%s started watering at %s', activeService.getCharacteristic(this.Characteristic.Name).value, new Date(jsonBody.payload.startTime).toLocaleTimeString());
					//valveSystemService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE)
					activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.ACTIVE);
					activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE);
					activeService.getCharacteristic(this.Characteristic.RemainingDuration).updateValue(jsonBody.payload.durationSeconds);
					this.platform.endTime[index] = jsonBody.payload.endTime;
					break;
				case 'VALVE_RUN_END_EVENT':
					jsonBody.payload.endTime = new Date(Date.parse(jsonBody.payload.startTime) + jsonBody.payload.durationSeconds * 1000); // need to add to json, missing jsonBody.payload.endTime
					if (jsonBody.payload.durationSeconds < 60) {
						this.log.info('<%s> %s, stopped after %s seconds.', jsonBody.externalId, jsonBody.eventType, jsonBody.payload.durationSeconds);
					} else {
						this.log.info('<%s> %s, stopped after %s minutes.', jsonBody.externalId, jsonBody.eventType, Math.round(jsonBody.payload.durationSeconds / 60));
					}
					this.log.debug('%s stopped watering at %s after %s minutes', activeService.getCharacteristic(this.Characteristic.Name).value, new Date(jsonBody.payload.endTime).toLocaleTimeString(), Math.round(jsonBody.payload.durationSeconds / 60));
					//valveSystemService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE)
					activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.INACTIVE);
					activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
					break;
				}
			} catch (err) {
				this.log.error('Error updating service', err);
			}
		} else {
			//webhook v1 messages
			/**********************************************
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
			**********************************************/
			try {
				//version 1
				switch (jsonBody.type) {
				case 'ZONE_STATUS':
					this.log.debug('Zone Status Update');
					/*****************************
								 Possible states
						Active	InUse	  HomeKit Shows
						False	  False	  Off
						True  	False	  Idle
						True	  True	  Running
						False	  True	  Stopping
						******************************/
					switch (jsonBody.subType) {
					case 'ZONE_STARTED':
						this.log.info('<%s> %s, started for duration %s minutes.', jsonBody.externalId, jsonBody.title, jsonBody.durationInMinutes);
						this.log.debug(jsonBody.summary);
						irrigationSystemService!.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE);
						activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.ACTIVE);
						activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE);
						activeService.getCharacteristic(this.Characteristic.RemainingDuration).updateValue(jsonBody.duration);
						this.platform.endTime[index] = jsonBody.endTime;
						break;
					case 'ZONE_STOPPED':
						if (jsonBody.duration < 60) {
							this.log.info('<%s> %s, stopped after %s seconds.', jsonBody.externalId, jsonBody.title, jsonBody.duration);
						} else {
							this.log.info('<%s> %s, stopped after %s minutes.', jsonBody.externalId, jsonBody.title, jsonBody.durationInMinutes);
						}
						this.log.debug(jsonBody.summary);
						irrigationSystemService!.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
						activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.INACTIVE);
						activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
						activeService.getCharacteristic(this.Characteristic.RemainingDuration).updateValue(jsonBody.duration);
						this.platform.endTime[index] = jsonBody.endTime;
						break;
					case 'ZONE_PAUSED': {
						clearTimeout(this.platform.localWebhook);
						const pauseDuration = Math.round((Date.parse(jsonBody.endTime) - Date.now() - (Date.parse(this.platform.endTime[index]) - Date.now())) / 1000);
						const pauseDurationInMinutes = Math.round(pauseDuration / 60);
						this.log.info('<%s> %s, paused for duration %s minutes.', jsonBody.externalId, jsonBody.title, pauseDurationInMinutes);
						this.log.debug(jsonBody.summary);
						irrigationSystemService!.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE);
						activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.ACTIVE);
						activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
						activeService.getCharacteristic(this.Characteristic.RemainingDuration).updateValue(pauseDuration);
						this.platform.endTime[index] = jsonBody.endTime;
					}
						break;
					case 'ZONE_CYCLING':
						clearTimeout(this.platform.localWebhook);
						this.log.info('<%s> %s, cycling for duration %s minutes.', jsonBody.externalId, jsonBody.title, jsonBody.durationInMinutes);
						this.log.debug(jsonBody.summary);
						irrigationSystemService!.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE);
						activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.ACTIVE);
						activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
						activeService.getCharacteristic(this.Characteristic.RemainingDuration).updateValue(jsonBody.duration);
						this.platform.endTime[index] = jsonBody.endTime;
						break;
					case 'ZONE_COMPLETED':
						this.log.info('<%s> %s, completed after %s minutes.', jsonBody.externalId, jsonBody.title, jsonBody.durationInMinutes);
						this.log.debug(jsonBody.summary);
						irrigationSystemService!.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
						activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.INACTIVE);
						activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
						break;
					case 'ZONE_CYCLING_COMPLETED':
						this.log.info('<%s> %s, cycling completed after %s minutes.', jsonBody.externalId, jsonBody.title, jsonBody.durationInMinutes);
						this.log.debug(jsonBody.summary);
						irrigationSystemService!.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
						activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.INACTIVE);
						activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
						break;
					}
					break;
				case 'DEVICE_STATUS': { //check if active serivce is ok
					this.log.debug('Device status update');
					const index = this.platform.accessories.findIndex(accessory => accessory.UUID === jsonBody.deviceId);
					const irrigationAccessory = this.platform.accessories[index];
					const switchService = irrigationAccessory.getServiceById(this.Service.Switch, this.platform.genUUID(jsonBody.deviceName + ' Standby'))!;
					switch (jsonBody.subType) {
					case 'ONLINE':
						this.log.info('<%s> device %s connected at %s', jsonBody.externalId, jsonBody.deviceId, new Date(jsonBody.timestamp).toString());
						this.log.debug('Device %s', jsonBody.subType.toLowerCase());
						irrigationAccessory.services.forEach((service: Service) => {
							if (this.Service.AccessoryInformation.UUID != service.UUID) {
								service.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.NO_FAULT);
							}
						});
						break;
					case 'OFFLINE':
						this.log.info('<%s> device %s disconnected at %s', jsonBody.externalId, jsonBody.deviceId, jsonBody.timestamp);
						this.log.warn('%s device disconnected at %s! This will show as non-responding in Homekit until the connection is restored.', jsonBody.deviceId, new Date(jsonBody.timestamp).toString());
						this.log.debug('Device %s', jsonBody.subType.toLowerCase());
						irrigationAccessory.services.forEach((service: Service) => {
							if (this.Service.AccessoryInformation.UUID != service.UUID) {
								service.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.GENERAL_FAULT);
							}
						});
						break;
					case 'COLD_REBOOT':
						this.log.info('<%s> device,%s connected at %s from a %s', jsonBody.externalId, jsonBody.deviceName, new Date(jsonBody.timestamp).toString(), jsonBody.title);
						this.log.debug(jsonBody.summary);
						irrigationAccessory.services.forEach((service: Service) => {
							if (this.Service.AccessoryInformation.UUID != service.UUID) {
								service.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.NO_FAULT);
							}
						});
						break;
					case 'SLEEP_MODE_ON': //ProgramMode 0
						this.log.info('<%s> %s %s %s', jsonBody.externalId, jsonBody.title, jsonBody.deviceName, jsonBody.summary);
						irrigationSystemService!.getCharacteristic(this.Characteristic.ProgramMode).updateValue(this.Characteristic.ProgramMode.NO_PROGRAM_SCHEDULED);
						if (this.platform.showStandby) {
							switchService.getCharacteristic(this.Characteristic.On).updateValue(true);
						}
						break;
					case 'SLEEP_MODE_OFF': //ProgramMode 2
						this.log.info('<%s> %s %s %s', jsonBody.externalId, jsonBody.title, jsonBody.deviceName, jsonBody.summary);
						irrigationSystemService!.getCharacteristic(this.Characteristic.ProgramMode).updateValue(this.Characteristic.ProgramMode.PROGRAM_SCHEDULED_MANUAL_MODE);
						if (this.platform.showStandby) {
							switchService.getCharacteristic(this.Characteristic.On).updateValue(false);
						}
						break;
					default: //ProgramMode 1
						this.log.info('<%s> %s ??? mode', jsonBody.externalId, jsonBody.deviceId);
						irrigationSystemService!.getCharacteristic(this.Characteristic.ProgramMode).updateValue(this.Characteristic.ProgramMode.PROGRAM_SCHEDULED);
						if (this.platform.showStandby) {
							switchService.getCharacteristic(this.Characteristic.On).updateValue(false);
						}
						break;
					}
				}
					break;
				case 'SCHEDULE_STATUS':
					this.log.debug('Schedule status update');
					switch (jsonBody.subType) {
					case 'SCHEDULE_STARTED':
						this.log.info('<%s> %s %s', jsonBody.externalId, jsonBody.title, jsonBody.summary);
						if (this.Service.IrrigationSystem.UUID != activeService.UUID) {
							activeService.getCharacteristic(this.Characteristic.On).updateValue(true);
						}
						irrigationSystemService!.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE);
						break;
					case 'SCHEDULE_STOPPED':
						this.log.info('<%s> %s %s', jsonBody.externalId, jsonBody.title, jsonBody.summary);
						if (this.Service.IrrigationSystem.UUID != activeService.UUID) {
							activeService.getCharacteristic(this.Characteristic.On).updateValue(false);
						}
						irrigationSystemService!.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
						break;
					case 'SCHEDULE_COMPLETED':
						this.log.info('<%s> %s %s', jsonBody.externalId, jsonBody.title, jsonBody.summary);
						if (this.Service.IrrigationSystem.UUID != activeService.UUID) {
							activeService.getCharacteristic(this.Characteristic.On).updateValue(false);
						} else if (this.config.showRunall) {
							const index = this.platform.accessories.findIndex(accessory => accessory.UUID === jsonBody.deviceId);
							const irrigationAccessory = this.platform.accessories[index];
							const switchService = irrigationAccessory.getServiceById(this.Service.Switch, this.platform.genUUID(jsonBody.deviceName + ' Quick Run-All'))!;
							switchService.getCharacteristic(this.Characteristic.On).updateValue(false);
						}
						irrigationSystemService!.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
						break;
					}
					break;
				}
				return;
			} catch (err) {
				this.log.error('Error updating service', err);
			}
		}
	}
}