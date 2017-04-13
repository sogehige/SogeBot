'use strict'

function define (name, value) {
  Object.defineProperty(exports, name, {
    value: value,
    enumerable: true
  })
}

// Permissions
define('OWNER_ONLY', 0)
define('VIEWERS', 1)
define('MODS', 2)
define('REGULAR', 3)
define('DISABLE', -1)

// Connection status
define('DISCONNECTED', 0)
define('CONNECTING', 1)
define('RECONNECTING', 2)
define('CONNECTED', 3)
