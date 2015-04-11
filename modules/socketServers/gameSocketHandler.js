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
 * Initialize the handler for connections to the "/game" socket.
 * This is called each time a new connection is made to the "/game" socket.
 *
 * @param socket - The Socket instance.
 * @param {Function} next - The function to call once we have initialized
 *        the socket on our end.
 */
module.exports = function (socket, next) {
    // logIn handler
    socket.on("logIn", function (gameOwner, gameName, username, password, callback) {
        db.games.makeAuthenticatedGameToken(gameOwner, gameName, username, password, function (err, userObject, authToken) {
            if (err) return callback();
            callback(userObject, authToken);
        });
    });

    // getUser handler
    socket.on("getUser", function (gameOwner, gameName, sessionID, callback) {
        if (!gameOwner || !gameName) {
            return callback();
        }
        
        function last_resort() {
            // Try logging in without authentication, if possible
            db.games.makeAnonymousGameToken(gameOwner, gameName, function (err, userObject, authToken) {
                if (err) return callback();
                callback(userObject, authToken);
            });
        };
        
        if (!sessionID) {
            return last_resort();
        }
        
        // Since we have a session ID, try looking up username from that
        db.getSessionByID(sessionID, function (err, session) {
            if (err || !session || !session.username) {
                // No session
                return last_resort();
            }
            
            // We should be good!
            db.games.makeGameToken(gameOwner, gameName, session.username, function (err, userObject, authToken) {
                if (err) return callback();
                callback(userObject, authToken);
            });
        });
    });

    // game function handler
    socket.on("game", function (token, func, args, callback) {
        if (gameCommon.hasOwnProperty(func) && typeof gameCommon[func] == "function") {
            db.games.getGameAndTokenData(token, function (err, game, tokenData) {
                if (err) {
                    return callback(false, "Server error");
                }
                
                if (!game || !tokenData) {
                    return callback(false, "Invalid token");
                }
                
                if (!game.jsondata || !game.jsondata.promptList || !game.jsondata.promptList.length) {
                    return callback(false, "Invalid game data");
                }

                var state = tokenData.state;
                args = [game.jsondata, tokenData.state].concat(args);
                gameCommon[func].apply(gameCommon, args).then(function (data) {
                    // Promise resolved
                    // If it was a "getGameOverContent", delete the token (we're done)
                    if (func == "getGameOverContent") {
                        db.games.deleteGameToken(tokenData.token, function (err, result) {
                            if (err) {
                                console.error("ERROR UPDATING TOKEN GAME STATE: ", err && err.stack);
                                return callback(false, "Server Error");
                            }

                            // Yay, all good!
                            callback(true, data);
                        });
                    } else {
                        // Otherwise, make sure state is updated
                        db.games.updateGameTokenData(tokenData.token, {state: tokenData.state}, function (err, success) {
                            if (err) {
                                console.error("ERROR UPDATING TOKEN GAME STATE: ", err && err.stack);
                                return callback(false, "Server Error");
                            }

                            // Yay, all good!
                            callback(true, data);
                        });
                    }
                }, function (err) {
                    // Promise rejected
                    callback(false, data);
                });
            });
        } else {
            return callback(false, func + " does not exist.");
        }
    });


    // Everything's initialized for us; move on!
    return next();
};
