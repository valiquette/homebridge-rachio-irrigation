import pkg from '../package.json' with { type: 'json' };
import { PrimitiveTypes } from 'homebridge';
export const PLATFORM_NAME = 'rachio'; // This is the name of the platform that users will use to register the plugin in the Homebridge config.json
export const PLUGIN_NAME = pkg.name; //This must match the name of your plugin as defined the package.json
export const PLUGIN_VERSION = pkg.version; //version

export type bridgeDevice = {
			id: string;
			serialNumber: string | number | boolean | PrimitiveTypes[] | {[key: string]: PrimitiveTypes;};
			reportedState: {
				connected: boolean;
				wifiBridgeFirmwareVersion: string | number | boolean | PrimitiveTypes[] | {[key: string]: PrimitiveTypes};
			};
}

export type location = {
			property: {
				address: {
					locality: string | number | boolean | PrimitiveTypes[] | {[key: string]: PrimitiveTypes;};
				};
			};
}

export type batteryService = {
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

export type Controller = {
	id: string;
	status: string
	name: string;
	serialNumber: string;
	model: string;
	macAddress: string;
	zones: {
		id: string;
		zoneNumber: number;
		enabled: boolean
		runtime: number
	}[]
	programId: string;
}

export type Value = { value: string | number | boolean | PrimitiveTypes[] | { [key: string]: PrimitiveTypes; }; }