
import { Service, Characteristic, Logging, PlatformConfig } from 'homebridge';
import RachioPlatform from './rachioplatform.js';
import RachioAPI from './rachioapi.js';

export default class poll {
	public readonly Service: typeof Service;
	public readonly Characteristic: typeof Characteristic;
	lastInterval: number[];
	timeStamp: number[];
	constructor(
		private readonly platform: RachioPlatform,
		private readonly log: Logging = platform.log,
		private readonly config: PlatformConfig = platform.config,
		private rachioapi = new RachioAPI(platform),
	) {
		this.Service = platform.Service;
		this.Characteristic = platform.Characteristic;
		this.lastInterval = [];
		this.timeStamp = [];
		this.config.liveTimeout = this.config.liveRefreshTimeout ? this.config.liveRefreshTimeout : 2; //min
		this.config.liveRefresh = this.config.liveRefreshRate ? this.config.liveRefreshRate : 20; //sec
	}

	async startLiveUpdate(valveService: Service) {
		//check for duplicate call
		const delta: number[] = [];
		const interval: number[] = [];
		const index = this.platform.valveServices.findIndex(valve => valve.subtype === valveService.subtype);
		delta[index] = new Date().valueOf() - this.timeStamp[index];
		if (delta[index] > 500 || delta[index] == 0) {
			//calls within 1/2 sec will be skipped as duplicate
			this.timeStamp[index] = +new Date();
		} else {
			this.log.debug('Skipped new live update due to duplicate call, timestamp delta %s ms', delta[index]);
			this.timeStamp[index] = +new Date();
			return;
		}
		clearInterval(this.lastInterval[index]);
		const startTime = new Date().getTime(); //live refresh start time
		if (!this.config.liveUpdate) {
			this.log.debug('Live update started');
		}
		this.config.liveUpdate = true;
		this.getUpdate(valveService, interval); //fist call
		interval[index] = Number(setInterval(async () => {
			if (new Date().getTime() - startTime > this.config.liveTimeout* 60 * 1000 + 500) {
				clearInterval(interval[index]);
				this.config.liveUpdate = false;
				this.log.debug('Live update stopped');
				return;
			}
			this.getUpdate(valveService, interval); //remaing calls.
			clearInterval(interval[index]);
		}, this.config.liveRefresh * 1000));
		this.lastInterval[index] = interval[index];
	}

	async getUpdate(valveService: Service, interval: number[]) {
		const pause = (delay: number) => new Promise(resolve => setTimeout(resolve, delay));
		const index = this.platform.valveServices.findIndex(valve => valve.subtype === valveService.subtype);
		try {
			this.log.debug('updating valve Id', index);
			const response = await this.rachioapi.getValve(this.platform.token, valveService.subtype).catch((err: string) => {
				this.log.error('Failed to get valve', err);
			});

			if (response?.status == 429) {
				this.log.warn('exceeded API rate limiting for the day, backing off');
				clearInterval(interval[index]);
				await pause(15 * 60 * 1000);
				return;
			}

			if (response?.status == 200) {
				const update = response?.data;
				let timeRemaining = 0;
				let duration = update.valve.state.desiredState.defaultRuntimeSeconds;

				if (update.valve.state.reportedState.lastWateringAction) {
					const start = update.valve.state.reportedState.lastWateringAction.start;
					duration = update.valve.state.reportedState.lastWateringAction.durationSeconds;
					const endTime = new Date(start).getTime() + duration * 1000;
					timeRemaining = Math.max(Math.round((endTime - Date.now()) / 1000), 0);

					valveService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.ACTIVE);
					valveService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE);
					valveService.getCharacteristic(this.Characteristic.SetDuration).updateValue(duration);
					valveService.getCharacteristic(this.Characteristic.RemainingDuration).updateValue(timeRemaining);
					this.platform.endTime[index] = endTime;
				} else {
					valveService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.INACTIVE);
					valveService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
					//valveService.getCharacteristic(this.Characteristic.SetDuration).updateValue(duration)
					//valveService.getCharacteristic(this.Characteristic.RemainingDuration).updateValue(0)
					this.platform.endTime[index] = 0;
				}
				return;
			}
		} catch (err) {
			this.log.error('error trying to update valve status', err);
		}
	}
}
