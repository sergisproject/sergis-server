/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving sergis-client

// node modules
var fs = require("fs"),
    path = require("path");

// required modules
var express = require("express");

// SerGIS Server globals
var config, db;

// The router for /game/
var router = express.Router();

// Initialize everything
module.exports = function (_config, _db) {
    config = _config;
    db = _db;
    
    // Set up all the page handlers
    router.get(config.USERNAME_URL_REGEX, function (req, res) {
        pageHandlers.gameGet(req, res);
    });
    
    return router;
};


var pageHandlers = {
    gameGet: function (req, res) {
        var username = config.USERNAME_URL_REGEX.exec(req.path)[1] || "";
        // See if username exists
        db.collection("sergis-games").find({username: username}).toArray(function (err, games) {
            if (err || games.length == 0) username = "";
            // Render page
            res.render(config.GAME_INDEX, {
                test: "",
                // lib files
                "style.css": "/lib/style.css",
                "es6-promise-2.0.0.min.js": "/lib/es6-promise-2.0.0.min.js",
                "main.js": "/lib/main.js",
                "frontend-script-src": "/lib/frontends/arcgis.js",
                "backend-script-src": "/lib/backends/sergis-server.js",
                
                "socket-io-script-src": (config.SOCKET_ORIGIN || "") + "/socket.io/socket.io.js",
                "socket-io-origin": config.SOCKET_ORIGIN || "",
                "backend-script-username": username
            });
        });
    }
};
