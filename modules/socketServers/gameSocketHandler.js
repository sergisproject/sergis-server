/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving the socket for
// sergis-client

// node modules
var path = require("path");

// our modules
var config = require("../../config"),
    db = require("../db"),
    gameCommon = require(path.join(config.SERGIS_CLIENT, "lib", "backends", "game-common"));


/**
 * Report an error.
 */
function reportError(err) {
    if (err) {
        console.error("--------------------------------------------------------------------------------");
        console.error("SerGIS Server - Game Socket ERROR at " + (new Date()) + ":\n" + (err.stack || err) + "\n\n");
    }
}


/**
 * Initialize the handler for connections to the "/game" socket.
 * This is called each time a new connection is made to the "/game" socket.
 *
 * @param socket - The Socket instance.
 * @param {Function} next - The function to call once we have initialized
 *        the socket on our end.
 */
module.exports = function (socket, next) {
    // logIn handler
    socket.on("logIn", function (gameID, username, password, callback) {
        if (!gameID) {
            callback();
            return;
        }
        
        // Check the login info
        db.models.User.checkLoginInfo(username, password).then(function (user) {
            if (!user) {
                callback(false);
                return;
            }
            
            // We have the user; get the game
            return db.models.Game.findById(gameID).populate("owner").exec().then(function (game) {
                if (!game) {
                    callback();
                    return;
                }

                // We have the game; make a game token
                return db.models.GameToken.makeGameToken(game, user).then(function (gameToken) {
                    if (!gameToken) return callback();
                    
                    // All good!
                    callback(gameToken.clientUserObject, gameToken.token);
                }, function (err) {
                    // The user probably doesn't have access to this game
                    callback(false, false);
                });
            });
        }).then(null, function (err) {
            reportError(err);
            callback();
        });
    });

    // getUser handler
    socket.on("getUser", function (gameID, sessionID, callback) {
        if (!gameID) {
            callback();
            return;
        }
        
        var game;
        Promise.resolve(db.models.Game.findById(gameID).populate("owner").exec()).then(function (_game) {
            game = _game;
            if (!game) return;
            
            // Get the session by its ID
            return db.getSessionByID(sessionID);
        }).then(function (session) {
            if (!session || !session.user_id) {
                // No session
                return;
            }
            
            // Get user from session username
            return db.models.User.findById(session.user_id).exec();
        }).then(function (user) {
            if (!game) return;
            
            // Whether we have a user or not, try making a game token
            return db.models.GameToken.makeGameToken(game, user);
        }).then(function (gameToken) {
            if (!gameToken) return callback();
            callback(gameToken.clientUserObject, gameToken.token);
        }).then(null, function (err) {
            reportError(err);
            callback();
        });
    });

    // game function handler
    socket.on("game", function (token, func, args, callback) {
        if (gameCommon.hasOwnProperty(func) && typeof gameCommon[func] == "function") {
            var gameToken, data;
            Promise.resolve(db.models.GameToken.findOne({token: token}).populate({
                path: "game",
                select: "+jsondata",
                options: {lean: true}
            }).exec()).then(function (_gameToken) {
                gameToken = _gameToken;
                if (!gameToken) {
                    callback(false, "Invalid token");
                    return Promise.reject();
                }
                
                var game = gameToken.game;
                if (!game.jsondata || !game.jsondata.promptList || !game.jsondata.promptList.length) {
                    callback(false, "Invalid game data");
                    return Promise.reject();
                }

                // Run the function (in gameCommon)
                args = [game.jsondata, gameToken.state].concat(args);
                return gameCommon[func].apply(gameCommon, args).then(null, function (data) {
                    // gameCommon...'s Promise rejected
                    callback(false, data);
                });
            }).then(function (_data) {
                data = _data;
                // gameCommon function's Promise resolved
                // If it was a "getGameOverContent", delete the token (we're done)
                if (func == "getGameOverContent") {
                    return gameToken.remove();
                } else {
                    // Otherwise, make sure state is updated
                    gameToken.markModified("state");
                    return gameToken.save();
                }
            }).then(function () {
                // Yay, all good!
                callback(true, data);
            }, function (err) {
                if (err) {
                    // Server DB error
                    reportError(err);
                    callback(false, "Server error");
                }
            });
        } else {
            return callback(false, func + " does not exist.");
        }
    });


    // Everything's initialized for us; move on!
    next();
};
