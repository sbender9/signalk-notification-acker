/*
 * Copyright 2016 Scott Bender <scott@scottbender.net>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const debug = require('debug')('notifcation-actions')

const Bacon = require('baconjs');

const util = require('util')

module.exports = function(app) {
  var plugin = {};
  var anchor_position
  var unsubscribes = []

  plugin.start = function(props) {
    debug("starting")

    props.notifications.filter(nc => { return nc.enabled }).forEach(nconfig => {
      let command = {
        context: "vessels.self",
        subscribe: [{
          path: `notifications.${nconfig.path}`,
          policy: 'instant'
        }]
      }

      app.debug('subscribe %j', command)
      
      app.subscriptionmanager.subscribe(command, unsubscribes, subscription_error, delta => {
        delta.updates.forEach(update => {
          update.values.forEach(value => {
            if ( value.path == `notifications.${nconfig.path}` &&
                 value.value.state !== 'normal' &&
                 (nconfig.state === 'any' ||
                  value.value.state == nconfig.state) ) {
              process_notification(nconfig, value.value)
            }
          })
        })
      })
    })
  };

  plugin.stop = function() {
    unsubscribes.forEach(f => f())
    unsubscribes = []
  }
  
  plugin.id = "signalk-notification-acker"
  plugin.name = "Notifcation Acker"
  plugin.description = "SignalK Node Server Plugin that auto acknowledges configured notifications"

  plugin.schema = {
    type: "object",
    title: "Notifications",
    properties: {
      notifications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: {
              title: "The notification path (not including the leading 'notifications.'",
              type: "string",
              default: ""
            },
            state: {
              "type": "string",
              "title": "Alarm State",
              "description": "The alarm state for this command.",
              "default": "alarm",
              "enum": ["any", "alert", "warn", "alarm", "emergency"]
            },
            
            enabled: {
              type: "boolean",
              title: "Enabled",
              default: true
            },
            
            delay: {
              type: "number",
              title: "Seconds to wait before acknowledgement. Zero for immediate",
              default: 0
            },
            
            sendN2KMessages: {
              type: "string",
              title: "NMEA 2000 Messages to send",
              description: "Actisence serial format without the first date/time field. Separate multiple messages with a semi-colon"
            }
          }
        }
      }
    }
  }

  function subscription_error(err)
  {
    console.log("error: " + err)
  }
  
  function process_notification(nconfig, value) {
    app.debug(`got notification ${nconfig.path}`)
    setTimeout(() => {
      let nvalue = JSON.parse(JSON.stringify(value))
      nvalue.method = []
      let delta = {
        updates: [
          {
            values: [{
              path: nconfig.path,
              value: nvalue
            }]
          }
        ]
      }
      
      app.debug('sending delta %j', delta)
      app.handleMessage(plugin.id, delta)

      if ( nconfig.sendN2KMessages ) {
        nconfig.sendN2KMessages.split(';').forEach(msg => {
          const n2k = new Date().toISOString() + ',' + msg
          app.debug('sending n2k %s', n2k)
          app.emit('nmea2000out', n2k)
        })
      }
    }, nconfig.delay * 1000)
  }

  return plugin;
}
