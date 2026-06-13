
import type { API } from 'homebridge';
import { PLATFORM_NAME } from './settings.js';
import RachioPlatform from './rachioplatform.js';

export default (api: API) => {
	api.registerPlatform(PLATFORM_NAME, RachioPlatform);
};