# Changes

## 1.3.1
Smart Hose timer
-  Using Rachio API V2.
-  Add support for Smart Hose Timers.
-  Bumped dependencies.

## 1.3.0-beta.0
Smart Hose timer
-  Using Rachio API V2.
-  Add support for Smart Hose Timers.
-  Battery support limited to good and bad.
-  Fixed date format for API limit reset info.
-  Added configurations to load controllers and or valves separately.
-  Bumped dependencies.

## 1.2.26
Bug Fix
-  Fixed issue introduced with IOS 17 where multiple set commands are sent from the IOS app if zone is started by sliding vs tap. This create a start stop loop.

## 1.2.25
Update
-  Refactored code to support cached accessory to prevent accessory from moving to default room in Homekit.
-  Fixed error with schedule naming.
-  Fixed Run All switch status update.
-  Change API used to discover external IP
-  Bumped dependencies.

## 1.2.24
Update
-  Added config option to automatically use detected valid IP for Webhooks.
-  Refactored startup code.
-  Bumped dependencies.
-  Fix a bug displaying remaing time after a screen refresh.

## 1.2.22
Update
-  Updated Readme.
-  Updated config UI text.
-  Added suppport for node.js v20.
-  Removed support for node.js v14.
-  Improved response when testing webhooks.
-  Refactor portion of code.
-  Bumped dependencies.

## 1.2.21
Update
- Code Cleanup.
- Bumped dependencies.
- Added API errors to log

## 1.2.20
Update
- Bumped dependencies.
- Refactored API response handling.
- Improved response without webhooks.
- Improved startup routine.
- Changed extra switch defaults from true to false.
- Code Cleanup.
- Improved error logging.
- Cleaned whitespace.
- Added option to suppress API responses in debug log.
- Added option to suppress Webhook messages in debug log.

## 1.2.19
Update
- Bumped dependencies.
- Inital support for Homebridge v2.0.0
- Removed dependency on depratacted Homekit characteristic.
- Code Cleanup.

## 1.2.18
Update
- Bumped dependencies.

## 1.2.17
Improvments
- Code Cleanup.
- Addressed old known issues.
- Fixed Homekit display for zone soak time
- Fixed displayed duration for pause time.
- Fixed warning message with durations greater than 1 hour when started from Rachio app. Homekit will only display minutes but homebridge will show the hour.
- Fixed Quick Run-All zone switch not updating to off after quick run completes.
- Bumped dependencies.
- Feature Request, Added support for TLS connection for webhooks. Will require valid certificates for local domain.
- Updated readme.

## 1.2.16
Update
- Code Cleanup.
- Added option to use HTTPS for Webhook Relay. Webhook relay now has a separate config section.
- Updated readme.
- Added explict user-agent info to API calls.
- Bumped dependencies.

## 1.2.15
Update
- Updated readme.
- Improved error handeling during startup.
- Corrected logging message zone stop from homekit.
- Changed configuration default to true for use irrigation display.
- API updates.

## 1.2.14
Fix
- Updated readme.
- Fixed a show schedule bug, not displaying all schedule type.

## 1.2.13
Update
-	Improved webhook handeling when option switches are not configured.
-	Code cleanup.

## 1.2.12
Update
- Fixed error when restating with and active schedule running and show schedules not checked.
- Changed configuration default to false for use irrigation display, due to IOS bug intoduced with 15.4 and still not fixed in 15.5
- Updated readme.
- Bumped dependencies.

## 1.2.11
Update
- Bumped dependencies.
- Code updates
- Improved error messaging for un expected webhook domain name that cause validation to fail
- Updated Readme for webhook relay
- Initial support for node.js 18

## 1.2.10
Update
- Bumped dependencies.
- Code updates

## 1.2.9
Update
- Code cleanup.
- Fix typo in config.
- Bumped dependencies.

## 1.2.8
Update
- Security update (CVE-2022-0155).

## 1.2.7
Enhancment
-	Added configuration option to load zones with intial runtime option from Rachio.
- Updated readme
- Code Cleanup

## 1.2.6
Fix
- Fixed an issue with location matching when a location has multiple controllers.
- Fixed spelling errors in logging.
- Webhook update to automatically remove a conflicting or duplicate webhook. Removes the need to clear old webhook after renaming plugin.

## 1.2.5
Update
- Code cleanup.
- Bumped dependancies.

## 1.2.4
Update
- Bumped nodejs dependancy to 14.18.0 or 16.13.0
- Bumped homebridge to 1.3.5

## 1.2.3
Fix
- Suppressed benign error message in log when show standby switch is false.

## 1.2.2
Fix
- Fixed a bug where homekit may show incorrect non-responding state.
- Bummped dependancy revs.

## 1.2.1
Enhancment
- Finalized beta.
- Cleaned up code.


## 1.2.0 Beta
Enhancment
- Added support for multiple locations.
- Fixed issue with standby switch not updating from remote source.
- Improved debug logging.
- Fixed possible bug with cache cleanup when adding more than one contoller.
- Inclued device name in additional switches.
- Corrected typos in readme.
- Corrected typos in config schema.

## 1.1.5
Fix
- Fix error handling for configurations with no external IP address defined.
- Fixed a possiible issue with updating webhooks without basic auth.
- Will not try to configure webhooks if no destination is defined.

## 1.1.4
Enhancement
- Remove restritions on webhook external IP address had to be a IPv4 address, will now support v4, v6 or any FQDN.
- Fix error messaging for unauthorized client.

## 1.1.3
Fix
- Fixed issue when removing cached accessory manually.
Enhancment
- Separated code.

## 1.1.2
Enhancement
- Added support for webhooks http basic authentication
- Reworked config page
- Optimized code
- Removed the need to process cache accesory, accessory will removed and be built new on every restart

## 1.1.1
Fix
- Release 1.1.0 intoduce a bug, do not use that release
- Fixed an issue where starting a zone from homekit after previous schedule completed may not have been possible.
- Cleaned up charateristic warnings after clearing of cache

## 1.1.0
Fix
- Fixed an issue (#5) where zone syncing would be off in homekit if webhooks failed.
- Fixed an issue (#6) better error handling of condition where previousconfig.json may be corrupt.
Enhancment
- Will simulate webhooks locally allow local functionality without webhook support.

## 1.0.6
Fix
- Fixed an issue where zones were not running for correct duration when changed in HomeKit

## 1.0.5
Enhancment
- Code cleanup

## 1.0.4
Enhancment
- Improved Plugin Config schema
- Offline status wil now show as non responding in Homekit
- Automatically remove cached accesory after a change to the config.json file is detected
- Added options to display addition switches for schedules

## 1.0.3
Fix
- webhook listener fix
- clarify some wording in config schema
- Incuded verified status in the readme

## 1.0.1
Update
- fixed typo in the readme

## 1.0.0
Initial
- First release





