
import { Service, Characteristic, Logging } from 'homebridge';
import RachioPlatform from '../rachioplatform.js';
import RachioAPI from '../rachioapi.js';
import type { BaseStation } from '../settings.js';

export default class skipSwitch {
	public readonly Service: typeof Service;
	public readonly Characteristic: typeof Characteristic;
	delta: number[];
	timeStamp: number[];
	devices: Service[];
	constructor(
		private readonly platform: RachioPlatform,
		private readonly log: Logging = platform.log,
		private rachioapi = new RachioAPI(platform),
	) {
		this.Service = platform.Service;
		this.Characteristic = platform.Characteristic;
		this.timeStamp = [];
		this.delta = [];
		this.devices = [];
	}

	createSwitchService(switchName: string, uuid: string) {
		// Create Valve Service
		this.log.debug('adding new switch');
		const switchService: Service = new this.Service.Switch(switchName, uuid);
		switchService.addCharacteristic(this.Characteristic.ConfiguredName);
		switchService
			.setCharacteristic(this.Characteristic.On, false)
			.setCharacteristic(this.Characteristic.Name, switchName)
			.setCharacteristic(this.Characteristic.ConfiguredName, switchName)
			.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
		return switchService;
	}

	configureSwitchService(baseStation: BaseStation, switchService: Service) {
		this.log.debug('Configured switch for %s', switchService.getCharacteristic(this.Characteristic.Name).value);
		this.devices.push(switchService);
		switchService.getCharacteristic(this.Characteristic.On)
			.onGet(this.getSwitchValue.bind(this, baseStation, switchService))
			.onSet(this.setSwitchValue.bind(this, baseStation, switchService));
	}

	async setSwitchValue(baseStation: BaseStation, switchService: Service) {
		if (switchService.getCharacteristic(this.Characteristic.StatusFault).value == this.Characteristic.StatusFault.GENERAL_FAULT) {
			throw new this.platform.HapStatusError(this.platform.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		}
		this.log.warn('set',baseStation.id);
		this.log.debug('toggle skip switch state %s', switchService.getCharacteristic(this.Characteristic.Name).value);
		const programs = await this.rachioapi.getValveDayViews(this.platform.token, baseStation.id).catch(err => {
			this.log.error('Failed to get daily view', err);
			throw err;
		});

		programs.valveDayViews.forEach((day: { valveProgramRunSummaries: { valveRunSummaries: { skip: { manualOverrideTrigger: string; }; valveName: string; }[]; programId: string; programName: string; plannedRunId: string; }[]; }) => {
			day.valveProgramRunSummaries.forEach(run => {
				run.valveRunSummaries.forEach(async summary => {
					if(switchService.subtype == run.programId){
						if(summary.skip?.manualOverrideTrigger == undefined){
							this.log.info('Add skip for program % valve ',run.programName, summary.valveName);
							if (run.plannedRunId) {
								const response = await this.rachioapi.createSkip(this.platform.token, run.plannedRunId);
								if (response?.status == 200) {
									switchService.getCharacteristic(this.Characteristic.On).updateValue(true);
								} else {
									switchService.getCharacteristic(this.Characteristic.On).updateValue(false);
								}
							}
						} else {
							this.log.info('Remove skip for program % valve ',run.programName, summary.valveName);
							if (run.plannedRunId) {
								const response = await this.rachioapi.deleteSkip(this.platform.token, run.plannedRunId);
								if (response?.status == 200) {
									switchService.getCharacteristic(this.Characteristic.On).updateValue(false);
								} else {
									switchService.getCharacteristic(this.Characteristic.On).updateValue(true);
								}
							}
						}
					}
				});
			});
		});
		return;
	}

	async getSwitchValue(baseStation: BaseStation, switchService: Service) {
		const index = this.devices.findIndex(device => device.subtype === switchService.subtype);
		let currentValue = switchService.getCharacteristic(this.Characteristic.On).value;

		if(!this.timeStamp[index]) {
			this.timeStamp[index] = +new Date();
		}
		//check for duplicate call
		this.delta[index] = new Date().valueOf() - this.timeStamp[index];
		if (this.delta[index] > 60 * 60 * 1000 || this.delta[index] == 0) {  // check after 1 hour
			this.timeStamp[index] = +new Date();
		} else {
			this.log.debug('skipped program update, to soon. timestamp delta %s sec', this.delta[index]/1000);
			return currentValue;
		}

		if (switchService.getCharacteristic(this.Characteristic.StatusFault).value == this.Characteristic.StatusFault.GENERAL_FAULT) {
			throw new this.platform.HapStatusError(this.platform.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		} else {
			const programs = await this.rachioapi.getValveDayViews(this.platform.token, baseStation.id).catch(err => {
			//this.log.error('Failed to get daily view', err)
				throw (`Failed to get daily view ${err}`);
			});
			programs.valveDayViews.forEach((day: { valveProgramRunSummaries: { valveRunSummaries: { skip: { manualOverrideTrigger: string; }; valveName: string; }[]; programId: string; programName: string; plannedRunId: string; }[]; }) => {
				day.valveProgramRunSummaries.forEach(run => {
					run.valveRunSummaries.forEach(summary => {
						if(switchService.subtype == run.programId){
							if (summary.skip?.manualOverrideTrigger == undefined){
								currentValue = false;
							} else {
								currentValue = true;
							}
						}
					});
				});
			});
		}
		return currentValue;
	}
}
