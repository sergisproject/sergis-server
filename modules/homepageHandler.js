/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles any miscellaneous URLs for sergis-server

// node modules
var fs = require("fs"),
    path = require("path");

// required modules
var express = require("express");

// SerGIS Server globals
var config, db;

// Initialize everything
module.exports = function (_config, _db) {
    config = _config;
    db = _db;
    
    return function (req, res, next) {
        switch (req.method) {
            case "GET":
                if (req.path == "/") {
                    pageHandlers.homepageGet(req, res);
                } else if (req.path == "/preview") {
                    pageHandlers.previewGet(req, res);
                } else {
                    pageHandlers.error(req, res, 404, "File Not Found");
                }
                break;
            default:
                pageHandlers.error(req, res, 405, "Method Not Allowed");
        }
    };
};


var pageHandlers = {
    homepageGet: function (req, res) {
        res.render(path.join(config.TEMPLATES_DIR, "homepage.html"), {
            noerror: true
        });
    },
    
    previewGet: function (req, res) {
        // Serve sergis-client without changing the backend (i.e. keeping local.js).
        // Used for the "Preview" functionality in the SerGIS Author, etc.
        res.render(config.GAME_INDEX, {
            test: "",
            // lib files
            "style.css": "/lib/style.css",
            "es6-promise-2.0.0.min.js": "/lib/es6-promise-2.0.0.min.js",
            "main.js": "/lib/main.js",
            "frontend-script-src": "/lib/frontends/arcgis.js",
            "backend-script-src": "/lib/backends/local.js"
        });
    },
    
    error: function (req, res, number, details) {
        res.status(number);
        res.render(path.join(config.TEMPLATES_DIR, "error.html"), {
            number: number,
            details: details
        });
    }
};
