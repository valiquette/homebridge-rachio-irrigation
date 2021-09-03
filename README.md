# homebridge-rachio-irrigation
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
<br>Rachio Irrigation System platform plugin for [HomeBridge](https://github.com/nfarina/homebridge).


## About

This plugin provides 3 options for use in HomeKit<br>Both option have additional switches as options for Standby mode and a Run All along with any Rachio Schedules
1.	Irrigation System Accessory with zones that are linked (default in configuration)
2.	Irrigation System Accessory with separate zones shown as a single tile 
3.	Irrigation System Accessory with separate zones shown as a separate tiles (option in Homekit)



### Screenshots
<p>
 <div align="center">
  <img width=260 src="images/IMG_3910.PNG"/>
  <img width=260 src="images/IMG_3909.PNG"/>
  <img width=260 src="images/IMG_3911.PNG"/>
  <img width=260 src="images/IMG_3915.PNG"/>
  <img width=260 src="images/IMG_3912.PNG"/>
  <img width=260 src="images/IMG_3913.PNG"/>
 </div align="left">
</p>
<br>There are plus and minus to each, so why not have options.
<br>


# API Key

You can acquire your API key from Rachio io.app [documented here](https://rachio.readme.io/docs/authentication).

## Note on Webhooks

`homebridge-rachio-irrigation` requires webhooks to update Homekit accessory status in real time such as a defined schedule from the Rachio app.


In order to support webhooks
<br>You must know your external network IP address. [You can discover it here](https://www.myexternalip.com) to be entered in the config as the "external_Webhook_address"
<br>You must enable port fowarding on your router this server is conected to. Follow you routers instructions for this set.
<br>The port forwarding should look like external_webhook_port -> internal_port for your servers IP address which can be found on the Homebridge Status page in system information
<br>The startup log will show if the configuration is correct and working.

If you see log messages like `Webhook received from an unknown external id`, you may set the `clear_previous_webhooks` flag to `true` to remove previous webhooks before creating or updating the webhook for this plugin. Note: this will clear all webhooks tied to your Rachio API key, so be careful if you rely on Rachio webhooks apart from this plugin.

## Installation
1. Install this plugin using: npm install -g homebridge-rachio-irrigation
2. Suggest running as a child bridge	
3. Use plugin settings to edit ``config.json`` and add your login detail.
4. Run Homebridge
5. Pair to HomeKit

## Config.json example
```
"platforms": [
        {
            "name": "Rachio-Dev",
            "api_key": "da441e57-f2b6-4dc9-967a-f24d978c6c60",
            "default_runtime": 3,
            "use_irrigation_display": true,
            "show_standby": true,
            "show_runall": false,
            "show_schedules": true,
            "external_IP_address": "76.25.73.137",
            "external_webhook_port": 12453,
            "internal_webhook_port": 27543,
            "delete_webhooks": false,
            "_bridge": {
                "username": "0E:79:49:DC:71:A9",
                "port": 46062
            },
            "platform": "rachio"
        }
]
```
