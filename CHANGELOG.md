# Changes
## 1.2.
Update
-   Bumped nodejs dependancy to 14.18.0 or 16.13.0
-   Bumped homebridge to 1.3.5

## 1.2.3
Fix
-   Suppressed benign error message in log when show standby switch is false.

## 1.2.2
Fix
-   Fixed a bug where homekit may show incorrect non-responding state.
-   Bummped dependancy revs.

## 1.2.1
Enhancment 
-   Finalized beta.
-   Cleaned up code.


## 1.2.0 Beta
Enhancment 
-   Added support for multiple locations.
-   Fixed issue with standby switch not updating from remote source.
-   Improved debug logging.
-   Fixed possible bug with cache cleanup when adding more than one contoller.
-   Inclued device name in additional switches.
-   Corrected typos in readme.
-   Corrected typos in config schema.

## 1.1.5
Fix 
-   Fix error handling for configurations with no external IP address defined.
-   Fixed a possiible issue with updating webhooks without basic auth.
-   Will not try to configure webhooks if no destination is defined.

## 1.1.4
Enhancement 
-   Remove restritions on webhook external IP address had to be a IPv4 address, will now support v4, v6 or any FQDN.
-   Fix error messaging for unauthorized client. 

## 1.1.3
Fix
-   Fixed issue when removing cached accessory manually. 
Enhancment 
-   Separated code.

## 1.1.2
Enhancement
-   Added support for webhooks http basic authentication
-   Reworked config page 
-   Optimized code 
-   Removed the need to process cache accesory, accessory will removed and be built new on every restart

## 1.1.1
Fix 
-   Release 1.1.0 intoduce a bug, do not use that release
-   Fixed an issue where starting a zone from homekit after previous schedule completed may not have been possible.
-   Cleaned up charateristic warnings after clearing of cache

## 1.1.0
Fix
-   Fixed an issue (#5) where zone syncing would be off in homekit if webhooks failed.
-   Fixed an issue (#6) better error handling of condition where previousconfig.json may be corrupt.
Enhancment 
-   Will simulate webhooks locally allow local functionality without webhook support. 

## 1.0.6
Fix 
-   Fixed an issue where zones were not running for correct duration when changed in HomeKit

## 1.0.5
Enhancment
-   Code cleanup

## 1.0.4
Enhancment 
-   Improved Plugin Config schema
-   Offline status wil now show as non responding in Homekit
-   Automatically remove cached accesory after a change to the config.json file is detected
-   Added options to display addition switches for schedules

## 1.0.3
Fix
-   webhook listener fix
-   clarify some wording in config schema
<br> Incuded verified status in the readme

## 1.0.1 
Update
-   fixed typo in the readme

## 1.0.0
Initial 
-   First release





