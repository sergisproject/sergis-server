/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving games through
// sergis-client.

// required modules
var express = require("express"),
    bodyParser = require("body-parser");

// our modules
var config = require("../../config"),
    db = require("../db");

// The router for /game/
var router = module.exports = express.Router();

// Set up body parser for POST data
router.use(bodyParser.urlencoded({
    extended: true
}));


////////////////////////////////////////////////////////////////////////////////
// The page handlers for /game/
var pageHandlers = {
    checkGame: function (req, res, next) {
        var username = req.params.username, gameName = req.params.gameName;
        db.users.get(username, function (err, owner) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            if (!owner) {
                // Owner doesn't exist
                req.error = {number: 404};
                return next("route");
            }
            
            db.games.get(username, gameName, function (err, game) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

                if (!game) {
                    // Game doesn't exist!
                    req.error = {number: 404};
                    return next("route");
                }
                
                req.owner = owner;
                req.game = game;
                return next();
            });
        });
    },
    
    listAllGames: function (req, res, next) {
        // List ALL the games that we have access to
        var gamesByAccess = [];
        // First, get all the public games
        db.games.getAll(null, null, "public", function (err, publicGames) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            // Add the public games
            gamesByAccess.push({
                name: "Public Games",
                description: "Public games are accessible by anyone.",
                access: "public",
                organizationColumn: false,
                none: "No public games.",
                games: publicGames
            });
            // Now, if we're not logged in, we're done
            if (!req.user) {
                return res.render("games-all.ejs", {
                    me: req.user,
                    gamesByAccess: gamesByAccess
                });
            }
            
            // Nope, somebody's logged in, time to delve deeper
            // Get all the user's private games, or all the private games if we're admin,
            // or all the private games in our organization if we're an organization admin
            db.games.getAll((req.user.isAdmin || (req.user.isOrganizationAdmin && req.user.organization)) ? null : req.user.username,
                            req.user.isOrganizationAdmin ? req.user.organization : null, "private", function (err, privateGames) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

                // Add the private games
                gamesByAccess.push({
                    name: "Private Games",
                    description: "Private games are only accessible by their creator and administrators.",
                    access: "private",
                    organizationColumn: false,
                    none: "No private games.",
                    games: privateGames
                });
                // Now, if the user has no organization and they're not a full admin, we're done
                if (!req.user.isAdmin && !req.user.organization) {
                    return res.render("games-all.ejs", {
                        me: req.user,
                        gamesByAccess: gamesByAccess
                    });
                }
                
                // Nope, they have an organization; find all the organization games
                // (All if we're admin, or just the ones in our organization if we're not)
                db.games.getAll(null, req.user.isAdmin ? null : req.user.organization, "organization", function (err, organizationGames) {
                    if (err) {
                        req.error = {number: 500};
                        return next("route");
                    }

                    // Insert it between the public and private games
                    gamesByAccess.splice(1, 0, {
                        name: "Organization Games",
                        description: "Organization games are only accessible to other people in " + (req.user.isAdmin ? "the creator's organization and administrators" : req.user.organization) + ".",
                        access: "organization",
                        organizationColumn: !!req.user.isAdmin,
                        none: "No organization games.",
                        games: organizationGames
                    });
                    // And, we're finally completely done
                    return res.render("games-all.ejs", {
                        me: req.user,
                        gamesByAccess: gamesByAccess
                    });
                });
            });
        });
    },
    
    listGames: function (req, res, next) {
        // Make sure username exists
        db.users.get(req.params.username, function (err, user) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            if (!user) {
                // Lol, he doesn't exist
                req.error = {status: 404};
                return next("route");
            }

            // Lists that we are waiting for
            // true == waiting, false == ignoring
            var gameListsByAccessLevel = {
                public: true,
                organization: (req.user && req.user.isAdmin) || (req.user && req.user.organization && user.organization == req.user.organization),
                private: (req.user && req.user.isAdmin) || (req.user && req.user.username == user.username)
            };
            // Called after a list is loaded; renders the list after all are loaded.
            var checkGameLists = function () {
                var done = 0, total = 0;
                for (var access in gameListsByAccessLevel) {
                    if (gameListsByAccessLevel.hasOwnProperty(access) && gameListsByAccessLevel[access]) {
                        total++;
                        if (gameListsByAccessLevel[access] !== true) done++;
                    }
                }
                if (done >= total) {
                    var isMe = req.user && (req.user.username == user.username);
                    var gamesByAccess = [];
                    if (gameListsByAccessLevel.public) {
                        gamesByAccess.push({
                            name: "Public Games",
                            description: "Public games are accessible by anyone.",
                            access: "public",
                            none: isMe ?
                                "You have no public games." :
                                user.username + " has no public games.",
                            games: gameListsByAccessLevel.public
                        });
                    }
                    if (gameListsByAccessLevel.organization) {
                        gamesByAccess.push({
                            name: "Organization Games",
                            description: "Organization games are only accessible to other people in " + (user.organization || "your organization") + ".",
                            access: "organization",
                            none: isMe ?
                                "You have no organization games." :
                                user.username + " has no organization games.",
                            games: gameListsByAccessLevel.organization
                        });
                    }
                    if (gameListsByAccessLevel.private) {
                        gamesByAccess.push({
                            name: "Private Games",
                            description: "Private games are only accessible by " + (isMe ? "you" : user.username) + " and administrators.",
                            access: "private",
                            none: isMe ?
                                "You have no private games." :
                                user.username + " has no private games.",
                            games: gameListsByAccessLevel.private
                        });
                    }
                    // Render!
                    res.render("games.ejs", {
                        me: req.user,
                        user: user,
                        canEditGames: req.user && (req.user.isAdmin ||
                                                   (req.user.isOrganizationAdmin && req.user.organization === user.organization) ||
                                                   req.user.username == user.username),
                        gamesByAccess: gamesByAccess
                    });
                }
            };
            
            // Now, actually load the games
            Object.keys(gameListsByAccessLevel).forEach(function (access) {
                if (gameListsByAccessLevel[access]) {
                    db.games.getAll(user.username, null, access, function (err, games) {
                        // Fail silently on error
                        gameListsByAccessLevel[access] = err ? false : games;
                        checkGameLists();
                    });
                }
            });
        });
    },
    
    listGamesPost: function (req, res, next) {
        // Make sure username exists
        db.users.get(req.params.username, function (err, user) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            if (!user || user.username !== req.body.username) {
                // Invalid request
                return next();
            }
            
            if (!req.user || (!req.user.isAdmin &&
                              (!req.user.isOrganizationAdmin || req.user.organization !== user.organization) &&
                              req.user.username != user.username)) {
                // Either nobody logged in, or user ain't allowed to edit
                return next();
            }
            
            db.games.get(user.username, req.body.gameName, function (err, game) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

                if (!game) {
                    // Invalid game
                    return next();
                }
                
                switch (req.body.action) {
                    case "set-game-access":
                        if (["public", "organization", "private"].indexOf(req.body.access) != -1) {
                            db.games.update(game.gameOwner, game.gameName, {
                                access: req.body.access
                            }, function (err) {
                                if (err) {
                                    req.error = {number: 500};
                                    return next("route");
                                }

                                next();
                            });
                            return;
                        }
                        break;
                    case "download-game":
                        // Lolz, this one's funny (we don't call next())
                        res.set("Content-Type", "application/json");
                        res.set("Content-Disposition", "attachment; filename=" + game.gameName + ".json");
                        res.send(game.jsondata);
                        return;
                    case "delete-game":
                        db.games.delete(game.gameOwner, game.gameName, function (err) {
                            if (err) {
                                req.error = {number: 500};
                                return next("route");
                            }

                            next();
                        });
                        return;
                }
                
                // If we're still here, we didn't do anything
                return next();
            });
        });
    },
    
    serveGame: function (req, res, next) {
        // Render page
        return res.render(path.join(config.SERGIS_CLIENT, "index.html"), {
            test: false,
            // lib files
            "style.css": config.HTTP_PREFIX + "/client-lib/style.css",
            "es6-promise-2.0.0.min.js": config.HTTP_PREFIX + "/client-lib/es6-promise-2.0.0.min.js",
            "client-js-src": config.HTTP_PREFIX + "/static/client.js",

            "no-minified": false,
            "socket-io-script-src": config.SOCKET_ORIGIN + config.SOCKET_PREFIX + "/socket.io/socket.io.js",
            "socket-io-origin": config.SOCKET_ORIGIN,
            "socket-io-prefix": config.SOCKET_PREFIX,
            "gameOwner": req.game.gameOwner,
            "gameName": req.game.gameName,
            "session": req.sessionID,
            "logoutUrl": config.HTTP_PREFIX + "/logout"
        });
    }
};


////////////////////////////////////////////////////////////////////////////////
// Set up all the page handler routing

router.get("", pageHandlers.listAllGames);

router.get("/:username", pageHandlers.listGames);
router.post("/:username", pageHandlers.listGamesPost, pageHandlers.listGames);

router.get("/:username/:gameName", pageHandlers.checkGame, pageHandlers.serveGame);
