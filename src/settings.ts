
import pkg from '../package.json' with { type: 'json' };
export const PLATFORM_NAME = 'rachio'; // This is the name of the platform that users will use to register the plugin in the Homebridge config.json
export const PLUGIN_NAME = pkg.name; //This must match the name of your plugin as defined the package.json
export const PLUGIN_VERSION = pkg.version; //version

export type Property = {
	property: {
		name: string;
		address: {
			id: string;
			lineOne: string;
			lineTwo: string;
			locality: string;
			timeZone: string;
		};
	};
}

export type BatteryService = {
	name: string;
	id: string;
	state: {
		reportedState: {
			batteryStatus: string;
		};
	};
}

export type Schedule = {
	name: string;
	id: string
}

export type BaseStation = {
	id: string;
	serialNumber: string;
	name: string;
	macAddress: string
	reportedState: {
		connected: boolean;
		wifiBridgeFirmwareVersion: string;
		firmwareUpgradeAvailable: boolean;
		lastStateUpdate: string
	};
}

export type Controller = {
	id: string;
	status: string
	name: string;
	serialNumber: string;
	model: string;
	macAddress: string;
	zones: {
		id: string;
		name: string;
		zoneNumber: number;
		enabled: boolean;
		runtime: number;
		fixedRuntime: number;
		customNozzle: {
			name: string
		}
	}[]
	scheduleModeType: string;
	flexScheduleRules: {
		id: string;
		name: string;
		zones: {
			zoneId: string,
			duration: number,
			sortOrder: number;
		}[];
	}[]
	scheduleRules: {
		id: string;
		name: string;
		zones: {
			zoneId: string,
			duration: number,
			sortOrder: number;
		}[],
	}[];
}

export type Valve = {
	id: string;
	name: string;
	baseStationId: string;
	enabled: boolean;
	state: {
		reportedState: {
			connected: boolean;
			defaultRuntimeSeconds: number;
			lastStateUpdate: string;
			lastSeen: string;
			batteryStatus: string;
			firmwareVersion: string;
			firmwareRetryRequired: boolean;
			firmwareUpgradeAvailable: boolean;
			firmwareUpgradeInProgress: boolean;
			lastWateringAction: {
				start: string;
				durationSeconds: number;
				reason: string;
			}
		}
		desiredState: {
			defaultRuntimeSeconds: number;
		}
	}
	zone: number;
}

export type Zone = {
	id: string;
	name: string;
	zoneNumber: number;
	enabled: boolean;
	runtime: number;
	fixedRuntime: number;
	customNozzle: {
		name: string
	}
}