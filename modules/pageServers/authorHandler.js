/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving the SerGIS Author.

// node modules
var path = require("path");

// required modules
var express = require("express"),
    bodyParser = require("body-parser");

// our modules
var config = require("../../config"),
    db = require("../db"),
    accounts = require("../accounts");

// The router for /author/
var router = module.exports = express.Router();

// Set up body parser for POST data
router.use(bodyParser.urlencoded({
    extended: true
}));


////////////////////////////////////////////////////////////////////////////////
// The page handlers for /author/
var pageHandlers = {
    /**
     * Hande GET requests for the SerGIS Author.
     */
    authorGet: function (req, res, next) {
        // Render page
        return res.render(path.join(config.SERGIS_AUTHOR, "index.html"), {
            // lib files
            "stylesheet.css": config.AUTHOR_STATIC + "/stylesheets/stylesheet.css",
            "es6-promise-2.0.0.min.js": config.AUTHOR_STATIC + "/javascripts/es6-promise-2.0.0.min.js",
            "localforage.nopromises.min.js": config.AUTHOR_STATIC + "/javascripts/localforage.nopromises.min.js",
            "author-js-src": config.HTTP_PREFIX + "/static/author.js",

            "no-minified": false,
            "socket-io-script-src": config.SOCKET_ORIGIN + config.SOCKET_PREFIX + "/socket.io/socket.io.js",
            "socket-io-origin": config.SOCKET_ORIGIN,
            "socket-io-prefix": config.SOCKET_PREFIX,
            "session": req.sessionID
        });
    },
    
    /**
     * Handle GET requests for the publishing page
     */
    previewGet: function (req, res, next) {
        // Just throw a "Method Not Allowed"
        req.error = {
            number: 405,
            details: "Try clicking the \"Preview\" button in the SerGIS Author again."
        };
        return next("route");
    },
    
    /**
     * Handle POST requests for the preview page (coming from the author).
     */
    previewPost: function (req, res, next) {
        // Make sure the game name is good
        if (!req.body.gameName) {
            req.error = {
                number: 400,
                details: "Invalid gameName."
            };
            return next("route");
        }

        db.author.get(req.user.username, req.body.gameName, function (err, jsondata) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            if (!jsondata) {
                // AHH! We don't exist!
                req.error = {
                    number: 400,
                    details: "Invalid gameName."
                };
                return next("route");
            }

            // Render page
            return res.render(path.join(config.SERGIS_CLIENT, "index.html"), {
                // NOTE: `test` is written to a JS block!
                test: 'var SERGIS_JSON_DATA = ' + JSON.stringify(jsondata).replace(/<\/script>/g, '</scr" + "ipt>') + ';',

                // lib files
                "style.css": config.CLIENT_STATIC + "/style.css",
                "es6-promise-2.0.0.min.js": config.CLIENT_STATIC + "/es6-promise-2.0.0.min.js",
                "client-js-src": config.HTTP_PREFIX + "/static/client.local.js",
                "no-minified": false
            });
        });
    },
    
    /**
     * Handle GET requests for the publishing page (throw a 405).
     */
    publishGet: function (req, res, next) {
        // Just throw a "Method Not Allowed"
        req.error = {number: 405};
        return next("route");
    },
    
    /**
     * Handle POST requests for the publishing page (coming from the author).
     */
    publishPost: function (req, res, next) {
        // If we're coming from the publish page
        if (req.body.action == "create-game") {
            // Make sure that we have a valid game name
            if (!req.body.authorGameName) {
                req.error = {
                    number: 400,
                    details: "Invalid authorGameName."
                };
                return next("route");
            }
            
            // Get the JSON data for the game
            db.author.get(req.user.username, req.body.authorGameName, function (err, jsondata) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

                if (!jsondata) {
                    // AHH! We don't exist!
                    req.error = {
                        number: 400,
                        details: "Invalid authorGameName."
                    };
                    return next("route");
                }
                
                // Move control to accounts.createGame to check the data and create the game
                accounts.createGame(req, res, next, req.user, req.body.gameName, req.body.access, jsondata, true);
            });
        } else {
            // We must be coming right from the author (not the publish page)
            // Make sure the game name is good
            if (!req.body.gameName) {
                req.error = {
                    number: 400,
                    details: "Invalid gameName."
                };
                return next("route");
            }
            
            db.author.get(req.user.username, req.body.gameName, function (err, jsondata) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

                if (!jsondata) {
                    // AHH! We don't exist!
                    req.error = {
                        number: 400,
                        details: "Invalid gameName."
                    };
                    return next("route");
                }

                // Render the publish page
                return res.render("author-publish.ejs", {
                    me: req.user,
                    authorGameName: req.body.gameName,
                    gameNamePattern: config.URL_SAFE_REGEX.toString().slice(1, -1),
                    gameNameCharacters: config.URL_SAFE_REGEX_CHARS
                });
            });
        }
    },
    
    /**
     * Handle the end of POST requests after we just published a game.
     */
    publishDone: function (req, res, next) {
        // Render a Congrats page
        return res.render("author-publish-done.ejs", {
            me: req.user,
            gameName: req.body.gameName
        });
    }
};


////////////////////////////////////////////////////////////////////////////////
// Set up all the page handler routing
router.use(accounts.checkUser);
router.use(accounts.requireLogin);

router.get("", pageHandlers.authorGet);

router.get("/preview", pageHandlers.previewGet);
router.post("/preview", pageHandlers.previewPost);

router.get("/publish", pageHandlers.publishGet);
router.post("/publish", pageHandlers.publishPost, pageHandlers.publishDone);
