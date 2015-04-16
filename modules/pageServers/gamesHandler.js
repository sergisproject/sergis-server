/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving games through
// sergis-client.

// node modules
var path = require("path");

// required modules
var express = require("express"),
    bodyParser = require("body-parser");

// our modules
var config = require("../../config"),
    db = require("../db"),
    accounts = require("../accounts");

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
        var user;
        // Get the game owner
        db.models.User.findOne({username_lowercase: username.toLowerCase()})
                      .select("_id")
                      .exec().then(function (_user) {
            user = _user;
            if (!user) {
                // Owner doesn't exist
                req.error = {number: 404};
                return next("route");
            }
            
            // Get the game
            return db.models.Game.findOne({owner: user._id, name_lowercase: gameName.toLowerCase()})
                                 .select("_id")
                                 .exec();
        }).then(function (game) {
            if (!game) {
                // Game doesn't exist
                req.error = {number: 404};
                return next("route");
            }
            
            // Got everything that we need!
            req.game_id = game._id;
            return next();
        }).then(null, function (err) {
            next(err);
        });
    },
    
    listAllGames: function (req, res, next) {
        // List ALL the games that we have access to
        var gamesByAccess = [];
        // First, get all the public games
        db.models.Game.getAll(null, null, "public").then(function (publicGames) {
            // Add the public games
            gamesByAccess.push({
                name: "Public Games",
                description: "Public games are accessible by anyone.",
                access: "public",
                organizationColumn: false,
                none: "No public games.",
                games: publicGames
            });
        }).then(function () {
            // If the user has no organization and they're not a full admin, just continue
            if (!req.user || (!req.user.isFullAdmin && !req.user.organization)) {
                return;
            }
            
            // Nope, they have an organization; find all the organization games
            // (All if we're admin, or just the ones in our organization if we're not)
            return db.models.Game.getAll(null, req.user.isFullAdmin ? null : req.user.organization, "organization");
        }).then(function (organizationGames) {
            // If we didn't get organization games, then just continue
            if (!organizationGames) return;

            // Add the organization games
            gamesByAccess.push({
                name: "Organization Games",
                description: "Organization games are only accessible to other people in " + (req.user.isFullAdmin ? "the creator's organization and administrators" : req.user.organization) + ".",
                access: "organization",
                organizationColumn: !!req.user.isFullAdmin,
                none: "No organization games.",
                games: organizationGames
            });
        }).then(function () {
            // If no user is logged in, just continue
            if (!req.user) {
                return;
            }
            
            // Get all the user's private games, or all the private games if we're admin,
            // or all the private games in our organization if we're an organization admin
            return db.models.Game.getAll(req.user.isAnyAdmin ? null : req.user,
                                         req.user.isOrganizationAdmin ? req.user.organization : null,
                                         "private");
        }).then(function (privateGames) {
            // If we didn't get private games, then just continue
            if (!privateGames) return;
            
            // Add the private games
            gamesByAccess.push({
                name: "Private Games",
                description: "Private games are only accessible by their creator and administrators.",
                access: "private",
                organizationColumn: false,
                none: "No private games.",
                games: privateGames
            });
        }).then(function () {
            // And, we're finally completely done.
            res.render("games-all.hbs", {
                title: "SerGIS Games",
                me: req.user,
                gamesByAccess: gamesByAccess,
                formCheckers: true
            });
        }).then(null, function (err) {
            next(err);
        });
    },
    
    listGames: function (req, res, next) {
        // Get the user
        var user;
        db.models.User.findOne({username_lowercase: req.params.username.toLowerCase()})
                      .populate("organization")
                      .exec().then(function (_user) {
            user = _user;
            if (!user) {
                // Lol, user doesn't exist
                req.error = {status: 404};
                return next("route");
            }
            
            var promises = [];
            
            // Get the user's public games
            promises.push(db.models.Game.getAll(user, null, "public"));
            
            // Get the user's organization games, if applicable
            var myOrganization = req.user && req.user.organization;
            var theirOrganization = user.organization;
            if ((req.user && req.user.canModifyUser(user)) || (myOrganization && theirOrganization && myOrganization.equals(theirOrganization))) {
                promises.push(db.models.Game.getAll(user, null, "organization").then(function (organizationGames) {
                    // If the user isn't actually part of an organization, then don't return a list of games if there aren't any.
                    // (This could occur if we're an admin looking at this user.)
                    if (!theirOrganization && organizationGames.length === 0) {
                        return false;
                    } else {
                        // Either we have games to show, or they're really part of an organization (so we want the "no organization games" message)
                        return organizationGames;
                    }
                }));
            } else {
                promises.push(Promise.resolve(false));
            }
            
            // Get the user's private games, if applicable
            if (req.user && req.user.canModifyUser(user)) {
                promises.push(db.models.Game.getAll(user, null, "private"));
            } else {
                promises.push(Promise.resolve(false));
            }
            
            return Promise.all(promises);
        }).then(function (allGames) {
            if (!allGames) return;
            
            var publicGames = allGames[0],
                organizationGames = allGames[1],
                privateGames = allGames[2];
            var isMe = req.user && req.user.equals(user);
            var gamesByAccess = [];
            
            if (publicGames) {
                gamesByAccess.push({
                    name: "Public Games",
                    description: "Public games are accessible by anyone.",
                    access: "public",
                    none: isMe ?
                        "You have no public games." :
                        user.username + " has no public games.",
                    games: publicGames
                });
            }
            if (organizationGames) {
                gamesByAccess.push({
                    name: "Organization Games",
                    description: "Organization games are only accessible to other people in " + (
                        (user.organization && user.organization.name) || (isMe ? "your organization" : "the creator's organization")
                    ) + ".",
                    access: "organization",
                    none: isMe ?
                        "You have no organization games." :
                        user.username + " has no organization games.",
                    games: organizationGames
                });
            }
            if (privateGames) {
                gamesByAccess.push({
                    name: "Private Games",
                    description: "Private games are only accessible by " + (isMe ? "you" : user.username) + " and administrators.",
                    access: "private",
                    none: isMe ?
                        "You have no private games." :
                        user.username + " has no private games.",
                    games: privateGames
                });
            }
            // Render!
            res.render("games.hbs", {
                title: "SerGIS Games",
                me: req.user,
                user: user,
                isMe: req.user && req.user.equals(user),
                canEditGames: req.user && req.user.canModifyUser(user),
                gamesByAccess: gamesByAccess,
                formCheckers: true
            });
        }).then(null, function (err) {
            next(err);
        });
    },
    
    listGamesPost: function (req, res, next) {
        // We know that both req.user and req.otherUser are set,
        // and req.user has permission to modify req.otherUser's stuff
        db.models.Game.findById(req.body.game)
                      .populate("owner")
                      .exec().then(function (game) {
            if (!game || !game.owner.equals(req.otherUser)) {
                // Invalid game, or game owner, passed in
                console.log("GAME:" + game);
                console.log("USER:" + req.otherUser);
                return next();
            }

            switch (req.body.action) {
                case "set-game-access":
                    if (["public", "organization", "private"].indexOf(req.body.access) != -1) {
                        game.access = req.body.access;
                        game.save().then(function () {
                            next();
                        }, function (err) {
                            next(err);
                        });
                        return;
                    }
                    break;
                case "download-game":
                    // Lolz, this one's funny (we don't call next())
                    res.set("Content-Type", "application/json");
                    res.set("Content-Disposition", "attachment; filename=" + game.name + ".json");
                    db.models.Game.findById(game._id)
                                  .select("jsondata")
                                  .lean(true)
                                  .exec().then(function (game) {
                        res.send(game.jsondata);
                    }, function (err) {
                        next(err);
                    });
                    return;
                case "delete-game":
                    game.remove().then(function () {
                        console.log("Removed game: " + game.name);
                        next();
                    }, function (err) {
                        next(err);
                    });
                    return;
            }

            // If we're still here, we didn't do anything
            return next();
        });
    },
    
    serveGame: function (req, res, next) {
        // Render page
        res.render(path.join(config.SERGIS_CLIENT, "index.html"), {
            stylesheetPath: config.CLIENT_STATIC + "/style.css",
            client_js_src: config.HTTP_PREFIX + "/static/client.min.js",
            socket_io_script_src: config.SOCKET_ORIGIN + config.SOCKET_PREFIX + "/socket.io/socket.io.js",
            socket_io_origin: config.SOCKET_ORIGIN,
            socket_io_prefix: config.SOCKET_PREFIX,
            game: req.game_id,
            session: req.sessionID,

            test: false
        });
    }
};


////////////////////////////////////////////////////////////////////////////////
// Set up all the page handler routing
router.use(accounts.checkUser);

router.get("", pageHandlers.listAllGames);

router.get("/:username", pageHandlers.listGames);
router.post("/:username", accounts.requireLogin, accounts.requireOtherAccountAccess, pageHandlers.listGamesPost, pageHandlers.listGames);

router.get("/:username/:gameName", pageHandlers.checkGame, pageHandlers.serveGame);
