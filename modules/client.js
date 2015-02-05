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

var app, io, db, config;

/**
 * Set up handlers and such.
 *
 * @param _app - The express app.
 * @param _io - The socket.io instance.
 * @param _db - The MongoDB database.
 * @param _config - The sergis-server configuration.
 */
function init(_app, _io, _db, _config) {
    app = _app; io = _io; db = _db; config = _config;
    
    // Homepage handler
    app.get("/", function (req, res) {
        res.render(config.HOMEPAGE_FILE, {
            "socket-script-location": "/socket.io/socket.io.js",
            "backend-script-location": "lib/backends/sergis-server.js"
        });
    });

    // Socket handler
    io.of("/client").on("connection", function (socket) {
        socket.emit("ready");
    });
}

exports.init = init;
