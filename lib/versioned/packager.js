/*
 * Copyright 2020 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

var https = require('https')
var semver = require('semver')

function Packager() {
  this._cache = {}
}

Packager.prototype.get = function get(name, wantedVersion) {
  return this._cache[name].filter((v) => {
    return semver.satisfies(v, wantedVersion)
  })
}

Packager.prototype.load = function load(name, cb) {
  var self = this
  https.get(
    {
      host: 'registry.npmjs.org',
      path: '/' + name.replace('/', encodeURIComponent),
      headers: { accept: 'application/json' }
    },
    function handleRes(response) {
      // Accumulate the response.
      var body = ''
      response.on('data', (data) => {
        body += data.toString('utf8')
      })
      response.on('end', () => {
        // Attempt to parse the reponse.
        var info = null
        try {
          info = JSON.parse(body)
        } catch (e) {
          return cb(e)
        }

        self._cache[name] = Object.keys(info.versions)
        cb(null, info.versions)
      })
    }
  )
}

module.exports = new Packager()
