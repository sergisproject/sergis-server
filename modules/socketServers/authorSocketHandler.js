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
 * @typedef {Object} AuthorGameSocketInfo
 * @description An object representing an AuthorGame and all the sockets
 *              connected to it.
 *
 * @property {Array} sockets - The sockets connected to this game.
 * @property {Object} lockedPrompts - Any prompts that are currently locked;
 *           each key is a prompt index, and each corresponding value is the
 *           socket ID of the connection that has that prompt locked.
 */


/**
 * The currently-opened games. Each keys is an AuthorGame ID, and the
 * corresponding value is an AuthorGameSocket object.
 *
 * @type {Object.<string, AuthorGameSocketInfo>}
 */
var openedGames = {};

/**
 * The user corresponding to each socket.
 */
var usersBySocketID = {};


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
            if (!session || !session.user_id) {
                // Nothing useful in the session
                callback(false, "Invalid session.");
                return;
            }
            
            // Find the user
            db.models.User.findById(session.user_id).populate("organization").exec(function (err, user) {
                if (err || !user) {
                    if (err) reportError(err);
                    // =(
                    callback(false, "Invalid user in session.");
                    return;
                }
                
                // Initialize the rest of the handlers
                initHandlers(socket, user);
                callback(true);
            });
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
function initHandlers(socket, user) {
    // The current game that the user is editing
    var currentGameID = null;

    // Add us to usersBySocketID
    usersBySocketID[socket.id] = user;

    // Set up disconnection
    socket.on("disconnect", function () {
        // Disconnect us from our current game (if applicable)
        if (currentGameID) disconnectGame();
        
        // Remove us from usersBySocketID
        delete usersBySocketID[socket.id];
    });


    ////////////////////////////////////////////////////////////////////////////
    // Helper Functions

    /**
     * Check if anyone else has a game opened.
     *
     * @param game - The game to check (must have "_id" selected; nothing else
     *        required).
     *
     * @return {?string} `null` if nobody has it opened, or an error message if
     *         one or more people do.
     */
    function checkGameAvailability(game) {
        if (openedGames.hasOwnProperty(game._id) && openedGames[game._id].sockets.length) {
            // Others have it open!
            var otherUsers = [];
            openedGames[game._id].sockets.forEach(function (socket) {
                otherUsers.push(usersBySocketID[socket.id].name);
            });
            return openedGames[game._id].sockets.length + " other users currently have this game opened: " + otherUsers.join(", ");
        }
        
        // If we're here, we're good
        return null;
    }

    /**
     * Connect to a new "current" game.
     *
     * @param game - The AuthorGame object to connect to.
     */
    function connectGame(game) {
        // This is our new current game
        currentGameID = game._id;
        
        if (!openedGames.hasOwnProperty(game._id)) {
            openedGames[game._id] = {
                sockets: [],
                lockedPrompts: {}
            };
        }
        // Add our socket to the sockets list
        openedGames[game._id].sockets.push(socket);
    }

    /**
     * Disconnect from the "current" game.
     */
    function disconnectGame() {
        var gameID = currentGameID;
        // We no longer have a current game
        currentGameID = null;
        
        // Remove our socket from the sockets list
        var sockets = openedGames[gameID].sockets;
        for (var i = sockets.length - 1; i >= 0; i--) {
            if (sockets[i] == socket) {
                // Splice it out
                sockets.splice(i, 1);
            }
        }
        // Unlock ourself from any prompts
        var foundLockedPrompts = false;
        Object.keys(openedGames[gameID].lockedPrompts).forEach(function (promptIndex) {
            if (openedGames[gameID].lockedPrompts[promptIndex] == socket.id) {
                // We have it locked; unlock it
                delete openedGames[gameID].lockedPrompts[promptIndex];
                foundLockedPrompts = true;
            }
        });
        
        // If we had locked prompts, then update the other sockets
        if (foundLockedPrompts) sendLockedPrompts();
    }

    /**
     * Run something for each socket other than ourselves.
     *
     * @param {Function} callback - Called with the other socket objects (not
     *        including our socket).
     */
    function forEachOtherSocket(callback) {
        if (!currentGameID) return;
        // Send the locked prompts list to all the other sockets (but not to us)
        openedGames[currentGameID].sockets.forEach(function (otherSocket) {
            if (otherSocket != socket) callback(otherSocket);
        });
    }

    /**
     * Get the current list of locked prompts (not including ours), in the
     * format similar to that which is emitted on promptLock events.
     *
     * @param {string} [socketID] - An optional socket ID for which locked
     *        prompts should NOT be included.
     */
    function getLockedPrompts(socketID) {
        var lockedPrompts = {};
        Object.keys(openedGames[currentGameID].lockedPrompts).forEach(function (promptIndex) {
            if (!socketID || openedGames[currentGameID].lockedPrompts[promptIndex] != socketID) {
                var user = usersBySocketID[openedGames[currentGameID].lockedPrompts[promptIndex]];
                lockedPrompts[promptIndex] = {
                    username: user.username,
                    displayName: user.name
                };
            }
        });
    }

    /**
     * Send the lockedPrompts object to all the other sockets for this game.
     */
    function sendLockedPrompts() {
        forEachOtherSocket(function (otherSocket) {
            // Send the prompt list to this socket
            otherSocket.emit("promptLock", getLockedPrompts(otherSocket.id));
        });
    }

    /**
     * Send a game update to all the other sockets for this game.
     */
    function sendGameUpdate(jsondata, path) {
        forEachOtherSocket(function (otherSocket) {
            otherSocket.emit("gameUpdate", jsondata, path);
        });
    }


    ////////////////////////////////////////////////////////////////////////////
    // SOCKET EVENT HANDLERS
    // see http://sergisproject.github.io/docs/author.html

    // getUserList function; args: [] --> Array<AuthorUser>
    socket.on("getUserList", function (args, callback) {
        // Get all the users that this user can access
        if (!user.organization) {
            // The user ain't allowed to access nadie
            callback(true, []);
            return;
        }

        db.models.User.find({organization: user.organization._id}).exec().then(function (users) {
            // Yay, a list of users!
            var userList = users.filter(function (otherUser) {
                // Make sure it's not us
                return !user.equals(otherUser);
            }).map(function (otherUser) {
                return {
                    username: otherUser.username,
                    displayName: otherUser.name,
                    groupName: user.organization.name
                };
            });
            callback(true, userList);
        }, function (err) {
            reportError(err);
            callback(false);
        });
    });

    // getGameList function; args: [] --> Array<AuthorGame>
    socket.on("getGameList", function (args, callback) {
        db.models.AuthorGame.find({})
                            .or([{owner: user._id}, {sharedWith: user._id}])
                            .populate("owner sharedWith")
                            .exec().then(function (games) {
            var gameList = games.map(function (game) {
                var isOurs = !!game.owner.equals(user);
                
                // Find out who this game is shared with (if anyone)
                var sharedWith;
                if (isOurs && game.sharedWith) {
                    sharedWith = game.sharedWith.map(function (sharedUser) {
                        return {
                            username: sharedUser.username,
                            displayName: sharedUser.name
                        };
                    });
                }
                
                // Find out if anyone else is currently editing this game
                var currentlyEditing = [];
                if (openedGames.hasOwnProperty(game._id)) {
                    openedGames[game._id].sockets.forEach(function (otherSocket) {
                        // Only if it's not our socket
                        if (otherSocket != socket) {
                            currentlyEditing.push({
                                username: usersBySocketID[otherSocket.id].username,
                                displayName: usersBySocketID[otherSocket.id].name
                            });
                        }
                    });
                }
                
                return {
                    name: game.name,
                    lastModified: new Date(game.lastModified),
                    owner: isOurs ? undefined : {
                        displayName: game.owner.name,
                        username: game.owner.username
                    },
                    allowSharing: isOurs,
                    sharedWith: sharedWith,
                    currentlyEditing: currentlyEditing
                };
            });
            callback(true, gameList);
        }, function (err) {
            reportError(err);
            callback(false);
        });
    });

    // renameGame function; args: [gameName, newGameName]
    socket.on("renameGame", function (args, callback) {
        var gameName = args[0], newGameName = args[1];
        if (typeof gameName != "string" || !gameName ||
            typeof newGameName != "string" || !newGameName) {
            callback(false, "Invalid game name.");
            return;
        }
        db.models.AuthorGame.findOne({
            owner: user._id,
            name_lowercase: gameName.toLowerCase()
        }).select("_id name name_lowercase").exec().then(function (game) {
            if (!game) {
                callback(false, "Invalid game name.");
                return;
            }
            
            // Make sure that nobody else is currently editing the game
            var gameAvailability = checkGameAvailability(game);
            if (gameAvailability !== null) {
                // Others have it open!
                callback(false, gameAvailability);
                return;
            }
            
            game.name = newGameName;
            game.name_lowercase = newGameName.toLowerCase();
            return game.save().then(function () {
                callback(true);
            });
        }).then(null, function (err) {
            if (err && (err == "invalid" || err.name == "ValidationError")) {
                callback(false, "Invalid new game name.");
            } else {
                reportError(err);
                callback(false);
            }
        });
    });

    // shareGame function; args: [gameName, username]
    socket.on("shareGame", function (args, callback) {
        var gameName = args[0], username = args[1];
        var game;
        if (typeof gameName != "string" || !gameName ||
            typeof username != "string" || !username ||
            username.toLowerCase() == user.username.toLowerCase()) {
            callback(false, "Invalid game name or username.");
            return;
        }
        db.models.AuthorGame.findOne({
            owner: user._id,
            name_lowercase: gameName.toLowerCase()
        }).exec().then(function (_game) {
            game = _game;
            
            // Find the username that they're looking for
            return db.models.User.findOne({username_lowercase: username.toLowerCase()}).exec();
        }).then(function (sharedUser) {
            if (!game) {
                // Invalid game!
                callback(false, "Invalid game name.");
                return;
            }
            if (!sharedUser) {
                // Invalid user!
                callback(false, "Invalid username.");
                return;
            }
            
            if (!game.sharedWith) game.sharedWith = [];
            game.sharedWith.push(sharedUser._id);
            return game.save().then(function () {
                callback(true);
            });
        }).then(null, function (err) {
            reportError(err);
            callback(false);
        });
    });

    // unshareGame function; args: [gameName, username]
    socket.on("unshareGame", function (args, callback) {
        var gameName = args[0], username = args[1];
        var game;
        if (typeof gameName != "string" || !gameName ||
            typeof username != "string" || !username ||
            username.toLowerCase() == user.username.toLowerCase()) {
            callback(false, "Invalid game name or username.");
            return;
        }
        db.models.AuthorGame.findOne({
            owner: user._id,
            name_lowercase: gameName.toLowerCase()
        }).exec().then(function (_game) {
            game = _game;
            
            // Find the username that they're looking for
            return db.models.User.findOne({username_lowercase: username.toLowerCase()}).exec();
        }).then(function (sharedUser) {
            if (!game) {
                // Invalid game!
                callback(false, "Invalid game name.");
                return;
            }
            if (!sharedUser) {
                // Invalid user!
                callback(false, "Invalid username.");
                return;
            }
            
            if (!game.sharedWith) game.sharedWith = [];
            for (var i = game.sharedWith.length - 1; i >= 0; i--) {
                if (game.sharedWith[i].equals(sharedUser._id)) {
                    // Splice it out
                    game.sharedWith.splice(i, 1);
                }
            }
            return game.save().then(function () {
                callback(true);
            });
        }).then(null, function (err) {
            reportError(err);
            callback(false);
        });
    });

    // removeGame function; args: [gameName]
    socket.on("removeGame", function (args, callback) {
        var gameName = args[0];
        if (typeof gameName != "string" || !gameName) {
            callback(false, "Invalid game name.");
            return;
        }
        db.models.AuthorGame.findOne({
            owner: user._id,
            name_lowercase: gameName.toLowerCase()
        }).exec().then(function (game) {
            if (!game) {
                callback(false, "Invalid game name.");
                return;
            }
            
            // Make sure that nobody else is currently editing the game
            var gameAvailability = checkGameAvailability(game);
            if (gameAvailability !== null) {
                // Others have it open!
                callback(false, gameAvailability);
                return;
            }
            
            // Remove the game
            return game.remove().then(function () {
                callback(true);
            });
        }).then(null, function (err) {
            reportError(err);
            callback(false);
        });
    });

    // checkGameName function; args: [gameName] --> number
    socket.on("checkGameName", function (args, callback) {
        var gameName = args[0];
        if (typeof gameName != "string" || !gameName ||
            !config.URL_SAFE_REGEX.test(gameName)) {
            // Either missing, or didn't pass the regex
            return callback(true, -1);
        }
        // It's valid, check to see if it's taken
        db.models.AuthorGame.count({
            owner: user._id,
            name_lowercase: gameName.toLowerCase()
        }).exec().then(function (count) {
            callback(true, count ? 0 : 1);
        }, function (err) {
            reportError(err);
            callback(false);
        });
    });

    // loadGame function; args: [gameName, ownerUsername] --> Object
    socket.on("loadGame", function (args, callback) {
        var gameName = args[0], ownerUsername = args[1];
        var game;
        if (typeof gameName != "string" || !gameName) {
            callback(false, "Invalid game name.");
            return;
        }
        return Promise.resolve().then(function () {
            // If we have an owner specified, we need to get a reference to him
            if (ownerUsername) {
                return db.models.User.findOne({username_lowercase: ownerUsername.toLowerCase()}).exec();
            } else {
                // We're the owner
                return user;
            }
        }).then(function (owner) {
            if (!owner) {
                callback(false, "Invalid username.");
                return;
            }
            return db.models.AuthorGame.findOne({
                owner: owner._id,
                name_lowercase: gameName.toLowerCase()
            }).exec().then(function (_game) {
                game = _game;
                // Check if the game exists
                if (!game && !ownerUsername) {
                    // Game don't exist, but we can create it
                    game = new db.models.AuthorGame({
                        name: gameName,
                        name_lowercase: gameName.toLowerCase(),
                        owner: user._id,
                        jsondata: {},
                        sharedWith: [],
                        lastModified: new Date()
                    });
                    return game.save();
                }
            }).then(function () {
                // Make sure that the game exists
                if (!game) {
                    callback(false, "Invalid game name.");
                    return;
                }
                
                // Check permissions if needed
                if (ownerUsername) {
                    var foundUser = false;
                    if (game.sharedWith) {
                        for (var i = 0; i < game.sharedWith.length; i++) {
                            if (game.sharedWith[i].equals(user._id)) {
                                // Found us!
                                foundUser = true;
                                break;
                            }
                        }
                    }
                    if (!foundUser) {
                        // User ain't got no permissions for this game
                        callback(false, "Invalid game.");
                        return;
                    }
                }
                
                // Looks like we're all good!
                // Get the JSON data to send back to the author
                return db.models.AuthorGame.findById(game._id)
                                           .select("jsondata")
                                           .lean(true)
                                           .exec().then(function (gameWithJSON) {
                    if (!gameWithJSON) {
                        callback(false, "Invalid game.");
                        return;
                    }
                    
                    // Disconnect from any previous game that we were editing
                    if (currentGameID) disconnectGame();

                    // Tell the world that we're editing this game
                    connectGame(game);

                    // Return back to the author
                    callback(true, {
                        jsondata: gameWithJSON.jsondata || {},
                        lockedPrompts: getLockedPrompts(socket.id)
                    });
                });
            });
        }).then(null, function (err) {
            reportError(err);
            callback(false);
        });
    });

    // saveCurrentGame function; args: [jsondata, path]
    socket.on("saveCurrentGame", function (args, callback) {
        var jsondata = args[0], path = args[1];
        
        if (!currentGameID) {
            callback(false, "No current game.");
            return;
        }
        
        // The "$set" object to send to MongoDB
        var $set = {};
        
        if (path) {
            if (!/^([A-Za-z0-9]+\.)*[A-Za-z0-9]+$/.test(path)) {
                // Invalid path!
                callback(false, "Invalid path.");
                return;
            } else {
                // We're updating somewhere in the depths of the jsondata
                $set["jsondata." + path] = jsondata;
            }
        } else {
            // Make sure there's no path
            path = undefined;
            // We just need to "$set" all of the jsondata
            $set.jsondata = jsondata;
        }

        // Set the lastModified date
        $set.lastModified = new Date();

        // Propogate the changes to the other author instances
        sendGameUpdate(jsondata, path);

        // Update the database
        db.models.AuthorGame.findByIdAndUpdate(currentGameID, {$set: $set}).exec().then(function () {
            // All done! Return to the author
            callback(true);
        }, function (err) {
            reportError(err);
            callback(false);
        });
    });

    // previewCurrentGame and publishCurrentGame functions; args: [] --> AuthorRequest
    function pubviewCurrentGame(type, args, callback) {
        if (!currentGameID) {
            callback(false, "No current game.");
            return;
        }
        
        callback(true, {
            url: config.HTTP_PREFIX + "/author/" + type,
            method: "POST",
            data: {
                id: "" + currentGameID
            },
            enctype: "application/x-www-form-urlencoded"
        });
    }
    socket.on("previewCurrentGame", pubviewCurrentGame.bind(null, "preview"));
    socket.on("publishCurrentGame", pubviewCurrentGame.bind(null, "publish"));

    // lockCurrentPrompt function; args: [promptIndex]
    socket.on("lockCurrentPrompt", function (args, callback) {
        var promptIndex = args[0];
        
        if (!currentGameID) {
            callback(false, "No current game.");
            return;
        }
        
        if (typeof promptIndex != "number" || promptIndex < 0) {
            callback(false, "Invalid prompt index.");
            return;
        }
        
        if (openedGames[currentGameID].lockedPrompts.hasOwnProperty(promptIndex)) {
            callback(false, "Prompt is already locked by " + usersBySocketID[openedGames[currentGameID].lockedPrompts[promptIndex]].name);
            return;
        }
        
        // Finally, we can lock the prompt for ourself
        openedGames[currentGameID].lockedPrompts[promptIndex] = socket.id;
        
        // Propogate the changes
        sendLockedPrompts();
        
        // Return to the author
        callback(true);
    });
    
    // unlockCurrentPrompt function; args: [promptIndex]
    socket.on("unlockCurrentPrompt", function (args, callback) {
        var promptIndex = args[0];
        
        if (!currentGameID) {
            callback(false, "No current game.");
            return;
        }
        
        if (typeof promptIndex != "number" || !openedGames[currentGameID].lockedPrompts.hasOwnProperty(promptIndex)) {
            callback(false, "Invalid prompt index.");
            return;
        }
        
        if (openedGames[currentGameID].lockedPrompts[promptIndex] != socket.id) {
            // Locked by somebody else!
            callback(false, "Prompt is locked by " + usersBySocketID[openedGames[currentGameID].lockedPrompts[promptIndex]].name);
            return;
        }
        
        // Finally, we can unlock the prompt
        delete openedGames[currentGameID].lockedPrompts[promptIndex];
        
        // Propogate the changes
        sendLockedPrompts();
        
        // Return to the author
        callback(true);
    });
}
