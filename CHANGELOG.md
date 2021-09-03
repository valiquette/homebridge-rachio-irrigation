# Changes
### 1.1.2
- [Enhancement] 
-   Optimized code 
-   Cleaned up charateristic warnings after clearing of cache
-   Removed the need to cache accesory, accessory will be build new on every restart

### 1.1.1
- [Fix] 
-   Fixed an issue where starting a zone from homekit after previous schedule completed may not have been possible.
-   Cleaned up charateristic warnings after clearing of cache

### 1.1.0
- [Fix] 
-   Fixed an issue (#5) where zone syncing would be off in homekit if webhooks failed.
-   Fixed an issue (#6) better error handling of condition where previousconfig.json may be corrupt.
- [Enhancment] 
-   Will simulate webhooks locally allow local functionality without webhook support. 

### 1.0.6
- [Fix] 
-   Fixed an issue where zones were not running for correct duration when changed in HomeKit

### 1.0.5
- [Enhancment] 
-   Code cleanup

### 1.0.4
- [Enhancment] 
-   Improved Plugin Config schema
-   Offline status wil now show as non responding in Homekit
-   Automatically remove cached accesory after a change to the config.json file is detected
-   Added options to display addition switches for schedules

### 1.0.3
- [Fix] 
-   webhook listener fix
-   clarify some wording in config schema
<br> Incuded verified status in the readme

### 1.0.1 
- [Update] 
-   fixed typo in the readme

### 1.0.0
- [Initial] 
-   First release





