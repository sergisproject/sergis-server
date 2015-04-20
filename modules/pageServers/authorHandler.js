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
var express = require("express");

// our modules
var config = require("../../config"),
    db = require("../db"),
    accounts = require("../accounts");

// The router for /author/
var router = module.exports = express.Router();


////////////////////////////////////////////////////////////////////////////////
// The page handlers for /author/
var pageHandlers = {
    /**
     * Hande GET requests for the SerGIS Author.
     */
    authorGet: function (req, res, next) {
        // Render page
        res.render(path.join(config.SERGIS_AUTHOR, "index.html"), {
            stylesheetPath: config.AUTHOR_STATIC + "/stylesheets/stylesheet.css",
            author_js_src: config.HTTP_PREFIX + "/static/author.min.js",
            socket_io_script_src: config.SOCKET_ORIGIN + config.SOCKET_PREFIX + "/socket.io/socket.io.js",
            socket_io_origin: config.SOCKET_ORIGIN,
            socket_io_prefix: config.SOCKET_PREFIX,
            session: req.sessionID,
            
            // NOTE: author_links is written to a JS var!
            author_links: JSON.stringify([
                {
                    name: "Home",
                    href: config.HTTP_PREFIX + "/"
                },
                {
                    name: "Games",
                    href: config.HTTP_PREFIX + "/games"
                },
                {
                    name: "My Account",
                    href: config.HTTP_PREFIX + "/account"
                },
                {
                    name: "Log Out",
                    href: config.HTTP_PREFIX + "/logout"
                }
            ]),
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
        if (!req.body.id) {
            req.error = {
                number: 400,
                details: "Invalid game ID."
            };
            return next("route");
        }

        db.models.AuthorGame.findById(req.body.id)
                            .select("jsondata")
                            .lean(true)
                            .exec().then(function (game) {
            if (!game) {
                // AHH! We don't exist!
                req.error = {
                    number: 400,
                    details: "Invalid game ID."
                };
                return next("route");
            }
            
            // Render page
            res.render(path.join(config.SERGIS_CLIENT, "index.html"), {
                stylesheetPath: config.CLIENT_STATIC + "/style.css",
                client_js_src: config.HTTP_PREFIX + "/static/client.local.min.js",
                
                // NOTE: `test` is written to a JS block!
                test: 'var SERGIS_JSON_DATA = ' + JSON.stringify(game.jsondata).replace(/<\/script>/g, '</scr" + "ipt>') + ';'
            });
        }, function (err) {
            next(err);
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
            // Make sure that we have all the required params
            if (!req.body.authorGameID || !req.body.overwrite) {
                req.error = {number: 400};
                return next("route");
            }
            
            // Figure out the new game name
            var overwrite = req.body.overwrite == "yessir";
            var gameName = req.body.newGame; // replaced by oldGame later if needed
            
            return Promise.resolve().then(function () {
                // Get the old game, if needed
                if (!overwrite) return;
                return db.models.Game.findById(req.body.oldGame).exec();
            }).then(function (oldGame) {
                if (overwrite) {
                    // If we're overwriting, then oldGame MUST exists
                    if (!oldGame) {
                        // BAD!
                        req.error = {
                            number: 400,
                            details: "Invalid old game ID."
                        };
                        next("route");
                        return Promise.reject();
                    }
                    
                    // Store the old game's game
                    gameName = oldGame.name;
                    
                    // Delete the old game
                    return oldGame.remove();
                }
            }).then(function () {
                // Get the JSON data for the game
                return db.models.AuthorGame.findById(req.body.authorGameID)
                                           .select("jsondata")
                                           .lean(true)
                                           .exec();
            }).then(function (game) {
                if (!game) {
                    // AHH! We don't exist!
                    req.error = {
                        number: 400,
                        details: "Invalid author game ID."
                    };
                    next("route");
                    return Promise.reject();
                }
                
                // Move control to accounts.createGame to check the data and create the game
                req.gameName = gameName;
                accounts.createGame(req, res, next, req.user, gameName, req.body.access, game.jsondata, true);
            }, function (err) {
                // If there's no error, then we already returned/reported it
                if (err) {
                    next(err);
                }
            });
        } else {
            // We must be coming right from the author (not the publish page)
            // Make sure the game ID is good
            if (!req.body.id) {
                req.error = {
                    number: 400,
                    details: "Invalid game ID."
                };
                return next("route");
            }
            
            var game;
            db.models.AuthorGame.findById(req.body.id)
                                .exec().then(function (_game) {
                game = _game;
                if (!game) {
                    // AHH! We don't exist!
                    req.error = {
                        number: 400,
                        details: "Invalid game ID."
                    };
                    return next("route");
                }

                // Get a list of all the existing published games
                return db.models.Game.getAll(req.user);
            }).then(function (oldGames) {
                if (!oldGames) return;
                
                var foundOldGameName = false;
                var gamesToOverwrite = oldGames.map(function (oldGame) {
                    if (game.name_lowercase == oldGame.name_lowercase) {
                        foundOldGameName = true;
                    }
                    return {
                        _id: oldGame._id,
                        name: oldGame.name,
                        access: oldGame.access,
                        selected: game.name_lowercase == oldGame.name_lowercase
                    };
                });
                // Render the publish page
                res.render("author-publish.hbs", {
                    title: "SerGIS Account - " + req.user.username,
                    nostyle: true,
                    me: req.user,
                    authorGameID: game._id,
                    authorGameName: game.name,
                    gameNamePattern: config.URL_SAFE_REGEX.toString().slice(1, -1),
                    gameNameCharacters: config.URL_SAFE_REGEX_CHARS,
                    gamesToOverwrite: gamesToOverwrite,
                    newGameName: !foundOldGameName,
                    oldGameName: foundOldGameName
                });
            }, function (err) {
                next(err);
            });
        }
    },
    
    /**
     * Handle the end of POST requests after we just published a game.
     */
    publishDone: function (req, res, next) {
        // Render a Congrats page
        res.render("author-publish-done.hbs", {
            title: "SerGIS Account - " + req.user.username,
            nostyle: true,
            me: req.user,
            gameName: req.gameName
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
