/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving the socket for
// sergis-author

// our modules
var config = require("../../config"),
    db = require("../db");


/**
 * Report an error.
 */
function reportError(err) {
    if (err) {
        console.error("--------------------------------------------------------------------------------");
        console.error("SerGIS Server - Author Socket ERROR at " + (new Date()) + ":\n" + (err.stack || err) + "\n\n");
    }
}


/**
 * Initialize the handler for connections to the "/author" socket.
 * This is called each time a new connection is made to the "/author" socket.
 *
 * @param socket - The Socket instance.
 * @param {Function} next - The function to call once we have initialized
 *        the socket on our end.
 */
module.exports = function (socket, next) {
    // init handler
    socket.on("init", function (sessionID, callback) {
        if (!sessionID) {
            callback(false, "Invalid session.");
            return;
        }
        
        // Since we have a session ID, try looking up username from that
        db.getSessionByID(sessionID).then(function (session) {
            if (!session || !session.username) {
                // Nothing useful in the session
                callback(false, "Invalid session.");
                return;
            }
            
            // Initialize the rest of the handlers
            initHandlers(socket, session.username);
            callback(true);
        }, function (err) {
            reportError(err);
            callback(false);
        });
    });

    // Everything's initialized for us; move on!
    next();
};


/**
 * Initialize all of the game storage-related handlers for a socket instance.
 */
function initHandlers(socket, username) {
    db.models.User.findOne({username_lowercase: username.toLowerCase()}, function (err, user) {
        if (!user) {
            // =(
            return;
        }
        
        // getGameList function; args: [] --> Object<string, Date>
        socket.on("getGameList", function (args, callback) {
            db.models.AuthorGame.find({owner: user._id})
                                .exec().then(function (games) {
                var gameList = {};
                games.forEach(function (game) {
                    gameList[game.name] = new Date(game.lastModified);
                });
                callback(true, gameList);
            }, function (err) {
                reportError(err);
                callback(false);
            });
        });

        // loadGame function; args: [gameName] --> Object
        socket.on("loadGame", function (args, callback) {
            var gameName = args[0];
            db.models.AuthorGame.findOne({owner: user._id, name_lowercase: gameName.toLowerCase()})
                                .select("jsondata")
                                .lean(true)
                                .exec().then(function (game) {
                callback(!!game.jsondata, game.jsondata || undefined);
            }, function (err) {
                reportError(err);
                callback(false);
            });
        });

        // saveGame function; args: [gameName, jsondata]
        socket.on("saveGame", function (args, callback) {
            var gameName = args[0], jsondata = args[1];
            // Try looking it up
            db.models.AuthorGame.findOne({owner: user._id, name_lowercase: gameName.toLowerCase()})
                                .select("_id")
                                .exec().then(function (game) {
                if (game) {
                    // Update the required fields
                    game.jsondata = jsondata;
                    game.lastModified = new Date();
                } else {
                    // No game matched; make a new game
                    game = new db.models.AuthorGame({
                        name: gameName,
                        name_lowercase: gameName.toLowerCase(),
                        owner: user._id,
                        jsondata: jsondata,
                        lastModified: new Date()
                    });
                }
                return game.save();
            }).then(function () {
                callback(true);
            }).then(null, function (err) {
                reportError(err);
                callback(false);
            });
        });

        // renameGame function; args: [gameName, newGameName]
        socket.on("renameGame", function (args, callback) {
            var gameName = args[0], newGameName = args[1];
            db.models.AuthorGame.findOne({owner: user._id, name_lowercase: gameName.toLowerCase()})
                                .select("_id")
                                .exec().then(function (game) {
                game.name = newGameName;
                game.name_lowercase = newGameName.toLowerCase();
                return game.save();
            }).then(function () {
                callback(true);
            }).then(null, function (err) {
                if (err && err.name == "ValidationError") {
                    callback(false, "Invalid game name.");
                } else {
                    reportError(err);
                    callback(false);
                }
            });
        });

        // removeGame function; args: [gameName]
        socket.on("removeGame", function (args, callback) {
            var gameName = args[0];
            db.models.AuthorGame.findOneAndRemove({owner: user._id, name_lowercase: gameName.toLowerCase()})
                                .exec().then(function (game) {
                callback(true);
            }, function (err) {
                reportError(err);
                callback(false);
            });
        });

        // checkGameName function; args: [gameName] --> number
        socket.on("checkGameName", function (args, callback) {
            var gameName = args[0];
            if (!gameName || !config.URL_SAFE_REGEX.test(gameName)) return callback(true, -1);
            // It's valid, check to see if it's taken
            db.models.AuthorGame.count({owner: user._id, name_lowercase: gameName.toLowerCase()})
                                .exec().then(function (count) {
                callback(true, count ? 0 : 1);
            }, function (err) {
                reportError(err);
                callback(false);
            });
        });

        // previewGame and publishGame functions; args: [gameName] --> Object
        function pubviewGame(type, args, callback) {
            var gameName = args[0];
            // Make sure the game exists
            db.models.AuthorGame.findOne({owner: user._id, name_lowercase: gameName.toLowerCase()})
                                .select("_id")
                                .exec().then(function (game) {
                if (!game) return callback(false, "Invalid game name.");
                // Okay, it's good
                callback(true, {
                    url: config.HTTP_PREFIX + "/author/" + type,
                    method: "POST",
                    data: {
                        id: "" + game._id
                    },
                    enctype: "application/x-www-form-urlencoded"
                });
            }, function (err) {
                reportError(err);
                callback(false);
            });
        }
        socket.on("previewGame", pubviewGame.bind(null, "preview"));
        socket.on("publishGame", pubviewGame.bind(null, "publish"));
    });
}
