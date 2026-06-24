//// Public API info https://rachio.readme.io/v1.0/docs
//// Public API info https://rachio.readme.io/v2.0/docs
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-useless-catch */

import axios from 'axios';
import { Logging } from 'homebridge';
import RachioPlatform from './rachioplatform.js';
import { PLUGIN_NAME, PLUGIN_VERSION } from './settings.js';
const api_endpoint = 'https://api.rach.io/1/public';
const alt_api_endpoint = 'https://cloud-rest.rach.io';

export default class RachioAPI {
	constructor(
		private readonly platform: RachioPlatform,
		private readonly log: Logging = platform.log,
	) { }

	async getPersonInfo(token: string) {
		try {
			this.log.debug('Retrieving Person Info');
			const response = await axios({
				method: 'get',
				baseURL: api_endpoint,
				url: '/person/info/',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error getting person, Status ${err.message}`);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2));
				}
				throw err.code;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug(`get person info response ${JSON.stringify(response.data, null, 2)}`);
				}
				return response.data;
			}
		} catch (err) {
			//this.log.error(`Error retrieving personId \n${err}`)
			throw err;
		}
	}

	async getPersonId(token: string, personId: string) {
		try {
			this.log.debug('Retrieving Person ID');
			const response = await axios({
				method: 'get',
				baseURL: api_endpoint,
				url: `/person/${personId}`,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error getting device ${err.message}`);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2));
				}
				throw err.code;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug(`get person id response ${JSON.stringify(response.data, null, 2)}`);
				}
				return response.data;
			}
		} catch (err) {
			//this.log.error(`Error retrieving deviceId \n${err}`)
			throw err;
		}
	}

	async getPropertyEntity(token: string, resource: string, id: string) {
		try {
			this.log.debug('Getting Property info');
			const response = await axios({
				method: 'get',
				baseURL: alt_api_endpoint,
				url: 'property/findPropertyByEntity',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				params: {
					[`resource_id.${resource}`]: `${id}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error getting property info ${err.message}`);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2));
				}
				return err.response;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug(`get property info response ${JSON.stringify(response.data, null, 2)}`);
				}
				return response.data;
			}
		} catch (err) {
			this.log.error(`Error getting property info \n${err}`);
		}
	}

	async getDevice(token: string, device: string) {
		try {
			this.log.debug(`Getting current device ${device}`);
			const response = await axios({
				method: 'get',
				baseURL: alt_api_endpoint,
				url: `/device/getDevice/${device}`,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error getting device ${err.message}`);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2));
				}
				throw err.code;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug(`get device response ${JSON.stringify(response.data, null, 2)}`);
				}
				return response.data;
			}
		} catch (err) {
			//this.log.error(`Error getting device \n${err}`)
			throw err;
		}
	}

	async getDeviceState(token: string, device: string) {
		try {
			this.log.debug('Getting current device state', device);
			const response = await axios({
				method: 'get',
				baseURL: alt_api_endpoint,
				url: `/device/getDeviceState/${device}`,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error getting device state ${err.message}`);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2));
				}
				throw err.code;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get device state response', JSON.stringify(response.data, null, 2));
				}
				return response.data;
			}
		} catch (err) {
			//this.log.error(`Error getting device state \n${err}`)
			throw err;
		}
	}

	async getDeviceDetails(token: string, device: string) {
		try {
			this.log.debug('Getting current device state', device);
			const response = await axios({
				method: 'get',
				baseURL: alt_api_endpoint,
				url: `/device/getDeviceDetails/${device}`,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error getting device details ${err.message}`);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2));
				}
				throw err.code;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get device details response', JSON.stringify(response.data, null, 2));
				}
				return response.data;
			}
		} catch (err) {
			//this.log.error(`Error getting device details \n${err}`)
			throw err;
		}
	}

	async getDeviceInfo(token: string, device: string) {
		try {
			this.log.debug('Getting current device state', device);
			const response = await axios({
				method: 'get',
				baseURL: api_endpoint,
				url: `/device/${device}`,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error getting device info ${err.message}`);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2));
				}
				throw err.code;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get device info response', JSON.stringify(response.data, null, 2));
				}
				return response.data;
			}
		} catch (err) {
			//this.log.error(`Error getting device info \n${err}`)
			throw err;
		}
	}

	async getLocationList(token: string) {
		try {
			this.log.debug('Getting Location List');
			const response = await axios({
				method: 'get',
				baseURL: alt_api_endpoint,
				url: '/location/listLocations/true',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error getting location list ${err.message}`);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2));
				}
				throw err.code;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get list locations response', JSON.stringify(response.data, null, 2));
				}
				return response.data;
			}
		} catch (err) {
			//this.log.error(`Error getting location list \n${err}`)
			throw err;
		}
	}

	async currentSchedule(token: string, device: string) {
		try {
			this.log.debug('Getting current schedule', device);
			const response = await axios({
				method: 'get',
				baseURL: api_endpoint,
				url: `/device/${device}/current_schedule`,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error getting schedule ${err.message}`);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2));
				}
				return err.response;
			});
			this.log.debug('status', response.data.status || 'No active schedule');
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get current schedule response', JSON.stringify(response.data, null, 2));
				}
				return response;
			}
		} catch (err) {
			this.log.error(`Error getting current schedule \n${err}`);
		}
	}

	async deviceStandby(token: string, device: { id: string; }, state: string) {
		try {
			this.log.debug('Setting Standby Mode on', device.id);
			const response = await axios({
				method: 'put',
				baseURL: api_endpoint,
				url: `/device/${state}`,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				data: {
					id: device.id,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error setting standby to ${state} ${err.message}`);
				this.log.warn(JSON.stringify(err.response.data, null, 2));
				this.log.debug(JSON.stringify(err, null, 2));
			});
			this.log.debug('device standby response status', response?.status);
			return response;
		} catch (err) {
			this.log.error(`Error setting standby \n${err}`);
		}
	}

	async startZone(token: string, zone: any, runtime: number) {
		try {
			this.log.debug('Starting Zone', zone);
			const response = await axios({
				method: 'put',
				baseURL: api_endpoint,
				url: '/zone/start',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				data: {
					id: zone,
					duration: runtime,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error sending start zone ${err.message}`);
				this.log.warn(JSON.stringify(err.response.data, null, 2));
				this.log.debug(JSON.stringify(err, null, 2));
			});
			this.log.debug('start response', response?.status);
			return response;
		} catch (err) {
			this.log.error(`Error Starting Zone \n${err}`);
		}
	}

	async startSchedule(token: string, schedule: any) {
		try {
			this.log.debug('Starting Schedule', schedule);
			const response = await axios({
				method: 'put',
				baseURL: api_endpoint,
				url: '/schedulerule/start',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				data: {
					id: schedule,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error sending start schedule ${err.message}`);
				this.log.warn(JSON.stringify(err.response.data, null, 2));
				this.log.debug(JSON.stringify(err, null, 2));
			});
			this.log.debug('start schedule response', response?.status);
			return response;
		} catch (err) {
			this.log.error(`Error Starting Schedule \n${err}`);
		}
	}

	async stopDevice(token: string, deviceId: string) {
		try {
			this.log.debug('Stopping', deviceId);
			const response = await axios({
				method: 'put',
				baseURL: api_endpoint,
				url: '/device/stop_water',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				data: {
					id: deviceId,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error sending stop ${err.message}`);
				this.log.warn(JSON.stringify(err.response.data, null, 2));
				this.log.debug(JSON.stringify(err, null, 2));
			});
			this.log.debug('stop response', response?.status);
			return response;
		} catch (err) {
			this.log.error(`Error Stopping Device \n${err}`);
		}
	}

	async startMultipleZone(token: string, zones: any[], duration: number) {
		try {
			const body: { name: string; id: string; duration: number; sortOrder: number; }[] = [];
			//this.log.debug('Starting Multiple Zones', zones)
			zones.forEach((zone: { enabled: boolean; name: string; id: string; }, index: number) => {
				if (zone.enabled) {
					body.push({
						name: zone.name,
						id: zone.id,
						duration: duration,
						sortOrder: index,
					});
				}
			});
			this.log.debug('multiple run data', JSON.stringify(body, null, 2));
			const response = await axios({
				method: 'put',
				baseURL: api_endpoint,
				url: '/zone/start_multiple',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				data: {
					zones: body,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error sending start ${err.message}`);
				this.log.warn(JSON.stringify(err.response.data, null, 2));
				this.log.debug(JSON.stringify(err, null, 2));
			});
			this.log.debug('start multiple response', response?.status);
			return response;
		} catch (err) {
			this.log.error(`Error Starting Multiple Zones \n${err}`);
		}
	}

	async listBaseStations(token: string, userid: string) {
		try {
			this.log.debug('Getting Base Stations List');
			const response = await axios({
				method: 'get',
				baseURL: alt_api_endpoint,
				url: `/valve/listBaseStations/${userid}`,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error getting base stations list ${err.message}`);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2));
				}
				return err.response;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get base stations list response', JSON.stringify(response.data, null, 2));
				}
				return response.data;
			}
		} catch (err) {
			this.log.error(`Error getting base stations list \n${err}`);
		}
	}

	async getBaseStation(token: string, baseStationId: string) {
		try {
			this.log.debug('Getting Base Station');
			const response = await axios({
				method: 'get',
				baseURL: alt_api_endpoint,
				url: `/valve/getBaseStation/${baseStationId}`,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error getting base station ${err.message}`);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2));
				}
				return err.response;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get base station response', JSON.stringify(response.data, null, 2));
				}
				return response.data;
			}
		} catch (err) {
			this.log.error(`Error getting base station \n${err}`);
		}
	}

	async getValveDayViews(token: string, baseStationId: string) {
		try {
			this.log.debug('Getting Base Station');
			const response = await axios({
				method: 'post',
				baseURL: alt_api_endpoint,
				url: '/summary/getValveDayViews',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
				data: {
					'start': {
						'year': new Date().getFullYear(),
						'month': new Date().getMonth() + 1,
						'day': new Date().getDate(),
					},
					'end': {
						'year': new Date().getFullYear(),
						'month': new Date().getMonth() + 1,
						'day': new Date().getDate(),
					},
					'resourceId': {
						'baseStationId': baseStationId,
					},
				},
			}).catch(err => {
				this.log.error(`Error getting base station daily views ${err.message}`);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.debug(JSON.stringify(err.response.data, null, 2));
				} else if (err.code) {
					this.log.debug(err.code);
				} else {
					this.log.warn(`Error ${err.name}`);
				}
				throw err?.code ?? err;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug(`get base station daily view response ${JSON.stringify(response.data, null, 2)}`);
				}
				return response.data;
			}
		} catch (err) {
			throw err;
			//this.log.error(`Error getting base station daily view \n${err}`)
		}
	}

	async createSkip(token: string, runId: string) {
		try {
			this.log.debug('Creating Skip Event');
			const response = await axios({
				method: 'post',
				baseURL: alt_api_endpoint,
				url: '/program/createPlannedRunSkipOverrides',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
				data: {
					'date': {
						'year': new Date().getFullYear(),
						'month': new Date().getMonth() + 1,
						'day': new Date().getDate(),
					},
					'plannedRunId': runId,
				},
			}).catch(err => {
				this.log.error(`Error creating skip event ${err.message}`);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2));
				}
				return err.response;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('Create skip response', JSON.stringify(response.data, null, 2));
				}
				return response;
			}
		} catch (err) {
			this.log.error(`Error creating skip event \n${err}`);
		}
	}

	async deleteSkip(token: string, runId: string) {
		try {
			this.log.debug('Deleting Skip Event');
			const response = await axios({
				method: 'post',
				baseURL: alt_api_endpoint,
				url: '/program/deletePlannedRunSkipOverrides',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
				data: {
					'date': {
						'year': new Date().getFullYear(),
						'month': new Date().getMonth() + 1,
						'day': new Date().getDate(),
					},
					'plannedRunId': runId,
				},
			}).catch(err => {
				this.log.error(`Error deleting skip event ${err.message}`);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2));
				}
				return err.response;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('Delete skip response', JSON.stringify(response.data, null, 2));
				}
				return response;
			}
		} catch (err) {
			this.log.error(`Error deleting skip event \n${err}`);
		}
	}

	async listValves(token: string, baseStationId: string) {
		try {
			this.log.debug('Getting valves List');
			const response = await axios({
				method: 'get',
				baseURL: alt_api_endpoint,
				url: `/valve/listValves/${baseStationId}`,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error getting valves list ${err.message}`);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2));
				}
				return err.response;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get valves list response', JSON.stringify(response.data, null, 2));
				}
				return response.data;
			}
		} catch (err) {
			this.log.error(`Error getting valves list \n${err}`);
		}
	}

	async getValve(token: string, valveId: any) {
		try {
			this.log.debug('Getting Valve');
			const response = await axios({
				method: 'get',
				baseURL: alt_api_endpoint,
				url: `/valve/getValve/${valveId}`,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error getting valve ${err.message}`);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.debug(JSON.stringify(err.response.data, null, 2));
				} else if (err.code) {
					this.log.debug(err.code);
				} else {
					this.log.warn(`Error ${err.name}`);
				}
				throw err?.code ?? err;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get valve response', JSON.stringify(response.data, null, 2));
				}
				this.log.debug(`${response.headers['x-ratelimit-remaining']} API calls remaining`);
				return response;
			}
		} catch (err) {
			throw err;
			//this.log.error(`Error getting valve \n${err}`)
		}
	}

	async startWatering(token: string, valveId: any, runtime: number) {
		try {
			this.log.debug('Start Watering', valveId);
			const response = await axios({
				method: 'put',
				baseURL: alt_api_endpoint,
				url: '/valve/startWatering',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				data: {
					valveId: valveId,
					durationSeconds: runtime,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error sending start watering ${err.message}`);
				this.log.warn(JSON.stringify(err.response.data, null, 2));
				this.log.debug(JSON.stringify(err, null, 2));
			});
			this.log.debug('start watering response', response?.status);
			return response;
		} catch (err) {
			this.log.error(`Error starting watering \n${err}`);
		}
	}

	async stopWatering(token: string, valveId: any) {
		try {
			this.log.debug('Stop Watering', valveId);
			const response = await axios({
				method: 'put',
				baseURL: alt_api_endpoint,
				url: '/valve/stopWatering',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				data: {
					valveId: valveId,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error sending stop watering ${err.message}`);
				this.log.warn(JSON.stringify(err.response.data, null, 2));
				this.log.debug(JSON.stringify(err, null, 2));
			});
			this.log.debug('stop watering response', response?.status);
			return response;
		} catch (err) {
			this.log.error(`Error stopping watering \n${err}`);
		}
	}

	async setDefaultRuntime(token: string, valveId: any, defaultRuntime: number) {
		try {
			this.log.debug('Set Default Runtime', valveId);
			const response = await axios({
				method: 'put',
				baseURL: alt_api_endpoint,
				url: '/valve/setDefaultRuntime',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				data: {
					id: valveId,
					defaultRuntimeSeconds: defaultRuntime,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error setting default runtime ${err.message}`);
				this.log.warn(JSON.stringify(err.response.data, null, 2));
				this.log.debug(JSON.stringify(err, null, 2));
			});
			this.log.debug('set default runtime response', response?.status);
			return response;
		} catch (err) {
			this.log.error(`Error setting default runtime \n${err}`);
		}
	}

	async listPrograms(token: string, valveId: any) {
		try {
			this.log.debug('Set Default Runtime', valveId);
			const response = await axios({
				method: 'get',
				baseURL: alt_api_endpoint,
				url: `program/listPrograms/${valveId}`,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error setting default runtime ${err.message}`);
				this.log.warn(JSON.stringify(err.response.data, null, 2));
				this.log.debug(JSON.stringify(err, null, 2));
			});
			this.log.debug('set default runtime response', response?.status);
			return response;
		} catch (err) {
			this.log.error(`Error setting default runtime \n${err}`);
		}
	}

	async listControllerWebhooks(token: string, id: string ){
		try {
			this.log.debug(`Get webhook ${id}`);
			const response = await axios({
				method: 'get',
				baseURL: alt_api_endpoint,
				url: `webhook/listWebhooks?resource_id.irrigation_controller_id=${id}`,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error getting webhooks ${err.message}`);
				this.log.warn(JSON.stringify(err.response.data, null, 2));
				this.log.debug(JSON.stringify(err, null, 2));
			});
			this.log.debug('get webhooks', response?.status);
			return response;
		} catch (err) {
			this.log.error(`Error getting webhooks \n${err}`);
		}
	}

	async listValveWebhooks(token: string, id: string ){
		try {
			this.log.debug(`Get webhook ${id}`);
			const response = await axios({
				method: 'get',
				baseURL: alt_api_endpoint,
				url: `webhook/listWebhooks?resource_id.valve_id=${id}`,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error(`Error getting webhooks ${err.message}`);
				this.log.warn(JSON.stringify(err.response.data, null, 2));
				this.log.debug(JSON.stringify(err, null, 2));
			});
			this.log.debug('get webhooks', response?.status);
			return response;
		} catch (err) {
			this.log.error(`Error getting webhooks \n${err}`);
		}
	}

	async configureWebhooks(token: string, external_webhook_address: string, delete_webhooks: boolean, device_id: string, device_name: string, webhook_key: string) {
		try {
			/*********************************************
			Event Type options from get events
							"id": 5 ="DEVICE_STATUS_EVENT"
							"id": 6 ="RAIN_DELAY_EVENT"
							"id": 7 ="WEATHER_INTELLIGENCE_EVENT"
							"id": 8 ="WATER_BUDGET"
							"id": 9= "SCHEDULE_STATUS_EVENT"
							"id": 8 ="WATER_BUDGET"
							"id": 10="ZONE_STATUS_EVENT"
							"id": 11="RAIN_SENSOR_DETECTION_EVENT"
							"id": 12="ZONE_DELTA"
							"id": 14="DELTA"
			**********************************************/

			const events = [
				{ id: 5 },
				{ id: 6 },
			];

			this.log.info(`Configuring Rachio webhooks for controller ID ${device_id}`);
			const response = await axios({
				method: 'get',
				baseURL: api_endpoint,
				url: '/notification/' + device_id + '/webhook',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.debug(JSON.stringify(err, null, 2));
				this.log.error(`Error retrieving webhooks ${err.message}`);
				if(err.response){
					this.log.warn(JSON.stringify(err.response.data, null, 2));
				}
				throw err.code;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('configured webhooks response', JSON.stringify(response.data, null, 2));
				}
			}
			const webhooks = response.data;
			if (this.platform.showAPIMessages) {
				this.log.debug('configured webhooks response', JSON.stringify(response.data, null, 2));
			}
			if (!webhooks || !Array.isArray(webhooks)) {
				return;
			}

			if (delete_webhooks) {
				//delete exsisting webhooks
				webhooks.forEach(async webhook => {
					if (webhook.externalId == webhook_key) {
						return;
					} //Skip the current webhook and let it be updated
					const response = await axios({
						method: 'delete',
						baseURL: api_endpoint,
						url: '/notification/webhook/' + webhook.id,
						headers: {
							Authorization: `Bearer ${token}`,
							'Content-Type': 'application/json',
							'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
						},
						responseType: 'json',
					}).catch(err => {
						this.log.debug(JSON.stringify(err, null, 2));
						this.log.error(`Error deleting old webhook ${webhook.id} error ${err.message}`);
						if(err.response){
							this.log.warn(JSON.stringify(err.response.data, null, 2));
						}
						throw err.code;
					});
					if (response.status == 204) {
						this.log.debug(`Successfully deleted old webhook ${webhook.id}`);
					}
				});
			}

			let updateWebhook: any = false;
			let count = 0;
			webhooks.forEach(async webhook => {
				if (webhook.externalId == webhook_key || webhook.url == external_webhook_address) {
					count++;
					if (count == 1) {
						updateWebhook = webhook;
						return;
					}
					const response = await axios({
						method: 'delete',
						baseURL: api_endpoint,
						url: '/notification/' + 'webhook/' + webhook.id,
						headers: {
							Authorization: `Bearer ${token}`,
							'Content-Type': 'application/json',
							'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
						},
						responseType: 'json',
					}).catch(err => {
						this.log.debug(JSON.stringify(err, null, 2));
						this.log.error(`Error deleting old webhook ${webhook.id} error ${err.message}`);
						if(err.response){
							this.log.warn(JSON.stringify(err.response.data, null, 2));
						}
						throw err.code;
					});
					if (response.status == 204) {
						this.log.debug(`Successfully deleted extra webhook ${webhook.id}`);
					}
				}
			});
			if (updateWebhook) {
				this.log.info(`Updating Rachio Webhook ID ${updateWebhook.id}, for destination ${external_webhook_address}`);
				const response = await axios({
					method: 'put',
					baseURL: api_endpoint,
					url: '/notification/webhook/',
					headers: {
						Authorization: `Bearer ${token}`,
						'Content-Type': 'application/json',
						'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
					},
					responseType: 'json',
					data: {
						id: updateWebhook.id,
						externalId: webhook_key,
						url: external_webhook_address,
						eventTypes: events,
					},
				}).catch(err => {
					this.log.debug(JSON.stringify(err, null, 2));
					this.log.error(`Error updating exsisting webhook ${updateWebhook.id} error ${err.message}`);
					if(err.response){
						this.log.warn(JSON.stringify(err.response.data, null, 2));
					}
					throw err.code;
				});
				if (response.status == 204) {
					this.log.debug(`Successfully updated webhook ${response}`);
				}
			} else {
				this.log.info('Creating webhook for ' + external_webhook_address);
				const response = await axios({
					method: 'post',
					baseURL: api_endpoint,
					url: '/notification/webhook/',
					headers: {
						Authorization: `Bearer ${token}`,
						'Content-Type': 'application/json',
						'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
					},
					responseType: 'json',
					data: {
						device: { id: device_id },
						externalId: webhook_key,
						url: external_webhook_address,
						eventTypes: events,
					},
				}).catch(err => {
					this.log.debug(JSON.stringify(err, null, 2));
					this.log.error(`Error configuring new webhook ${updateWebhook.id} error ${err.message}`);
					if(err.response){
						this.log.warn(JSON.stringify(err.response.data, null, 2));
					}
					throw err.code;
				});
				if (response.status == 204) {
					this.log.debug(`Successfully created webhook ${response}`);
				}
			}
			if (this.platform.showAPIMessages) {
				this.log.debug('create/update webhook response', JSON.stringify(response.data, null, 2));
			}
			if (response.status == 200) {
				this.log.success(`Successfully configured webhook for ${device_name} with external id "${webhook_key}"`);
			}
			return;
		} catch (err) {
			this.log.error(`Error configuring webhook for ${device_name} \n${err}`);
		}
	}

	async configureWebhooksv2(token: string, external_webhook_address: string, delete_webhooks: any, device_id: string, device_name: string, webhook_key: string, type: string) {
		try {
			/*********************************************
					Event Type options from webhook info
								"resourceType": "VALVE",
								"eventTypes": [
										"VALVE_RUN_START_EVENT",
										"VALVE_RUN_END_EVENT"

								"resourceType": "PROGRAM",
								"eventTypes": [
										"PROGRAM_RAIN_SKIP_CREATED_EVENT",
										"PROGRAM_RAIN_SKIP_CANCELED_EVENT"

								"resourceType": "IRRIGATION_CONTROLLER",
								"eventTypes": [
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

								"resourceType": "LIGHTING_CONTROLLER",
								"eventTypes": [
										"LIGHTING_ZONE_STATE_CHANGE_EVENT"

			**********************************************/

			let param;
			let resource;
			let event;
			let events;
			if (type == 'irrigation_controller_id'){
				param = {
					'resource_id.irrigation_controller_id': device_id,
				};
				resource = {
					irrigation_controller_id: device_id,
				};
				events = [
					'DEVICE_ZONE_RUN_STARTED_EVENT',
					'DEVICE_ZONE_RUN_PAUSED_EVENT',
					'DEVICE_ZONE_RUN_STOPPED_EVENT',
					'DEVICE_ZONE_RUN_COMPLETED_EVENT',
					'SCHEDULE_STARTED_EVENT',
					'SCHEDULE_STOPPED_EVENT',
					'SCHEDULE_COMPLETED_EVENT',
				];
				event = {
					event_types: events,
				};
			} else if (type == 'valve_id') {
				param = {
					'resource_id.valve_id': device_id,
				};
				resource = {
					valve_id: device_id,
				};
				events = [
					'VALVE_RUN_START_EVENT',
					'VALVE_RUN_END_EVENT',
				];
				event = {
					event_types: events,
				};
			}

			this.log.debug(`Configuring Rachio SHT webhooks for device ID ${device_id}`);
			const response = await axios({
				method: 'get',
				baseURL: alt_api_endpoint,
				url: 'webhook/listWebhooks',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
				},
				params: param,
				responseType: 'json',
			}).catch(err => {
				this.log.debug(JSON.stringify(err, null, 2));
				this.log.error(`Error retrieving SHT webhooks ${err.message}`);
				if(err.response){
					this.log.warn(JSON.stringify(err.response.data, null, 2));
				}
				throw err.code;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('configured SHT webhooks response', JSON.stringify(response.data, null, 2));
				}
			}
			const webhooks = response.data.webhooks;
			if (this.platform.showAPIMessages) {
				this.log.debug('configured SHT webhooks response', JSON.stringify(response.data, null, 2));
			}
			if (!webhooks || !Array.isArray(webhooks)) {
				return;
			}

			if (delete_webhooks) {
				//delete exsisting webhooks
				webhooks.forEach(async webhook => {
					if (webhook.externalId == webhook_key) {
						return;
					} //Skip the current webhook and let it be updated
					const response = await axios({
						method: 'delete',
						baseURL: alt_api_endpoint,
						url: 'webhook/deleteWebhook/' + webhook.id,
						headers: {
							Authorization: `Bearer ${token}`,
							'Content-Type': 'application/json',
							'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
						},
						responseType: 'json',
					}).catch(err => {
						this.log.debug(JSON.stringify(err, null, 2));
						this.log.error(`Error deleting old SHT webhook ${webhook.id} error ${err.message}`);
						if(err.response){
							this.log.warn(JSON.stringify(err.response.data, null, 2));
						}
						throw err.code;
					});
					if (response.status == 204) {
						this.log.debug(`Successfully deleted old SHT webhook ${webhook.id}`);
					}
				});
			}

			let updateWebhook: any = false;
			let count = 0;
			webhooks.forEach(async webhook => {
				if (webhook.externalId == webhook_key || webhook.url == external_webhook_address) {
					count++;
					if (count == 1) {
						updateWebhook = webhook;
						return;
					}
					const response = await axios({
						method: 'delete',
						baseURL: alt_api_endpoint,
						url: 'webhook/deleteWebhook/' + webhook.id,
						headers: {
							Authorization: `Bearer ${token}`,
							'Content-Type': 'application/json',
							'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
						},
						responseType: 'json',
					}).catch(err => {
						this.log.debug(JSON.stringify(err, null, 2));
						this.log.error(`Error deleting old SHT webhook ${webhook.id} error ${err.message}`);
						if(err.response){
							this.log.warn(JSON.stringify(err.response.data, null, 2));
						}
						throw err.code;
					});
					if (response.status == 204) { //check this
						this.log.debug(`Successfully deleted extra webhook ${webhook.id}`);
					}
				}
			});
			if (updateWebhook) {
				this.log.info(`Updating Rachio Webhook ID ${updateWebhook.id}, for destination ${external_webhook_address}`);
				const response = await axios({
					method: 'put',
					baseURL: alt_api_endpoint,
					url: 'webhook/updateWebhook',
					headers: {
						Authorization: `Bearer ${token}`,
						'Content-Type': 'application/json',
						'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
					},
					responseType: 'json',
					data: {
						id: updateWebhook.id,
						url: external_webhook_address,
						externalId: {
							data: webhook_key,
						},
						resource_id: resource,
						event_types: event,
					},
				}).catch(err => {
					this.log.debug(JSON.stringify(err, null, 2));
					this.log.error(`Error updating exsisting SHT webhook ${updateWebhook.id} error ${err.message}`);
					if(err.response){
						this.log.warn(JSON.stringify(err.response.data, null, 2));
					}
					throw err.code;
				});
				if (response.status == 204) {
					this.log.debug(`Successfully update SHT webhook ${response}`);
				}
			} else {
				this.log.info('Creating Webhook for ' + external_webhook_address);
				const response = await axios({
					method: 'post',
					baseURL: alt_api_endpoint,
					url: 'webhook/createWebhook',
					headers: {
						Authorization: `Bearer ${token}`,
						'Content-Type': 'application/json',
						'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
					},
					responseType: 'json',
					data: {
						resource_id: resource,
						externalId: webhook_key,
						url: external_webhook_address,
						event_types: events,
					},
				}).catch(err => {
					this.log.info(JSON.stringify(err, null, 2));
					this.log.error(`Error configuring new SHT webhook ${updateWebhook.id} error ${err.message}`);
					if(err.response){
						this.log.warn(JSON.stringify(err.response.data, null, 2));
					}
					throw err.code;
				});
				if (response.status == 204) { //check this
					this.log.debug(`Successfully created SHT webhook ${response}`);
				}
			}
			if (this.platform.showAPIMessages) {
				this.log.debug('create/update SHT webhooks response', JSON.stringify(response.data, null, 2));
			}
			if (response.status == 200) {
				this.log.success(`Successfully configured SHT webhook for ${device_name} with external id "${webhook_key}"`);
			}
			return;
		} catch (err) {
			this.log.error(`Error configuring SHT webhook for device id ${device_name} \n${err}`);
		}
	}

}