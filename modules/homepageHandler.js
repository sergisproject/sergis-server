/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles any miscellaneous URLs for sergis-server

// required modules
var express = require("express");

// our modules
var config = require("../config"),
    db = require("./db");

// Common error titles
var ERROR_TITLES = {
    400: "Bad Request",
    403: "Access Denied",
    404: "Not Found",
    405: "Method Not Allowed",
    406: "Not Acceptable",
    500: "Internal Server Error"
};

// Initialize everything
module.exports = function (req, res, next) {
    // Check if the session says we should serve an error
    if (req.error) {
        var number = req.error.number || 404,
            title = req.error.title,
            details = req.error.details || "";
        req.error = null;
        if (!title) {
            if (ERROR_TITLES[number]) {
                title = ERROR_TITLES[number];
            } else {
                title = "SerGIS Error";
            }
        }
        // Serve the error
        pageHandlers.error(req, res, number, title, details);
        // Don't do anything else
        return;
    }

    // I'm probably posessed by a demon right now, because I just made SWITCH-LOOP-CEPTION
    switch (req.method) {
        case "GET":
            switch (req.path) {
                case "/":
                    pageHandlers.homepageGet(req, res);
                    break;
                case "/preview":
                    pageHandlers.previewGet(req, res);
                    break;
                case "/logout":
                    pageHandlers.logoutGet(req, res);
                    break;
                default:
                    pageHandlers.error(req, res, 404, "Not Found");
            }
            break;
        default:
            pageHandlers.error(req, res, 405, "Method Not Allowed");
    }
};


var pageHandlers = {
    homepageGet: function (req, res) {
        res.render("homepage.ejs", {
            me: req.user,
        });
    },
    
    previewGet: function (req, res) {
        // Serve sergis-client without changing the backend (i.e. keeping local.js).
        // Used for the "Preview" functionality in the SerGIS Author, etc.
        res.render(config.GAME_INDEX, {
            test: false,
            // lib files
            "style.css": (config.HTTP_PREFIX || "") + "/lib/style.css",
            "es6-promise-2.0.0.min.js": (config.HTTP_PREFIX || "") + "/lib/es6-promise-2.0.0.min.js",
            "main.js": (config.HTTP_PREFIX || "") + "/lib/main.js",
            "frontend-script-src": (config.HTTP_PREFIX || "") + "/lib/frontends/arcgis.js",
            "backend-script-src": (config.HTTP_PREFIX || "") + "/lib/backends/local.js"
        });
    },
    
    logoutGet: function (req, res) {
        req.session.destroy(function (err) {
            if (err) throw err;
            
            // We're probably good now!
            res.redirect(config.HTTP_PREFIX + "/");
        });
    },
    
    error: function (req, res, number, title, details) {
        res.status(number);
        res.render("error.ejs", {
            me: req.user,
            number: number,
            title: title,
            details: details
        });
    }
};
