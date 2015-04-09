/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving the socket for sergis-client

// node modules
var crypto = require("crypto");

// our modules
var config = require("../config");

// SerGIS Server globals
var db;


// The salt length for pbkdf2 hashing of passwords
var HASH_SALT_LENGTH = 16;
// The number of iterations for pbkdf2 hashing of passwords
var HASH_NUM_ITERATIONS = 10000;
// The derived key length for pbkdf2 hashing of passwords
var HASH_DERIVED_KEY_LENGTH = 30;


/******************************************************************************
 ** NOTE REGARDING CALLBACKS IN THIS FILE:
 **   Each callback is called with 2 parameters: error, data.
 **   If an error occurred, `error` is truthy.
 **     (The error automatically reported to the Error Console.)
 **   If no error occurred, `error` is null and `data` is populated.
 **     (Some functions have multiple `data` arguments.)
 ******************************************************************************/


/**
 * Handle a database error.
 *
 * @param {string} whereAreWe - The function or area where the error occurred.
 * @param {Error} err - The error that occurred.
 * @param {Array} [data] - Any extra data, such as parameters.
 */
function dbError(whereAreWe, err, data) {
    console.error("DATABASE ERROR in " + whereAreWe + (data ? " (" + data.join(", ") + ")" : "") + ": ", err.stack);
}


/**
 * Store a reference to the Mongo database.
 */
exports.init = function (_db) {
    db = _db;
};

/**
 * To get a session object, in case it's ever needed.
 *
 * @param {string} sessionID - The session ID.
 * @param {Function} callback - Called with the session object.
 */
exports.getSessionByID = function (sessionID, callback) {
    db.collection("sessions").findOne({_id: sessionID}, function (err, session) {
        if (err) {
            dbError("getSessionById", err, [sessionID]);
            return callback(err);
        }

        var sessionObject;
        try {
            sessionObject = JSON.parse(session.session);
        } catch (err) {}
        return callback(null, sessionObject || undefined);
    });
};

////////////////////////////////////////////////////////////////////////////////
// sergis-organizations
exports.organizations = {
    /**
     * Get a list of all the possible user organizations as strings.
     *
     * @param {Function} callback - Called with an array of the organization
     *        names.
     */
    getAll: function (callback) {
        db.collection("sergis-organizations").find({}).toArray(function (err, organizations) {
            if (err) {
                dbError("organizations.getAll", err);
                return callback(err);
            }
            
            return callback(null, organizations.map(function (organization) {
                return organization.name;
            }));
        });
    },

    /**
     * Get a specific organization.
     *
     * @param {string} organizationName - The name of the organization.
     * @param {Function} callback - Called with the organization object.
     */
    get: function (organizationName, callback) {
        db.collection("sergis-organizations").find({name: organizationName}, function (err, organization) {
            if (err) {
                dbError("organizations.get", err, [organizationName]);
                return callback(err);
            }
            
            return callback(null, organization);
        });
    },

    /**
     * Make a new organization.
     *
     * @param {string} organizationName - The name of the organization.
     * @param {Function} callback - Called with the new organization.
     */
    create: function (organizationName, callback) {
        db.collection("sergis-organizations").findOne({name: organizationName}, function (err, organization) {
            if (err) {
                dbError("organizations.create", err, [organizationName]);
                return callback(err);
            }
            
            if (organization) {
                // Whoopsie, it's already in there
                // Just pretend it's brand new
                return callback(null, organization);
            }

            // Add it in
            db.collection("sergis-organizations").insert({
                name: organizationName
            }, function (err, organization) {
                if (err) {
                    dbError("organizations.create::insert", err, [organizationName]);
                    return callback(err);
                }
                
                return callback(null, organization);
            });
        });
    }
};

////////////////////////////////////////////////////////////////////////////////
// sergis-users
exports.users = {
    /**
     * Get a user by username without checking the password.
     *
     * @param {string} username - The user's username (case-insensitive).
     * @param {Function} callback - Called with the userObject if successful,
     *        or no data if the username is not in the database.
     */
    get: function (username, callback) {
        db.collection("sergis-users").findOne({
            username_lowercase: username.toLowerCase()
        }, function (err, user) {
            if (err) {
                dbError("users.get", err, [username]);
                return callback(err);
            }
            
            return callback(null, user || undefined);
        });
    },

    /**
     * Get all the users, optionally filtered by an organization.
     *
     * @param {?string} organization - The organization used to filter.
     * @param {Function} callback - Called with an array of the user objects.
     */
    getAll: function (organization, callback) {
        if (organization) {
            db.collection("sergis-users").find({organization: organization}).toArray(function (err, users) {
                if (err) {
                    dbError("users.getAll", err, [organization]);
                    return callback(err);
                }

                return callback(null, users);
            });
        } else {
            db.collection("sergis-users").find({}).toArray(function (err, users) {
                if (err) {
                    dbError("users.getAll", err);
                    return callback(err);
                }

                return callback(null, users);
            });
        }
    },

    /**
     * Get a user via a username and password.
     *
     * @param {string} username - The username of the user trying to log in
     *        (case-insensitive).
     * @param {string} password - The password of the user trying to log in.
     * @param {Function} callback - Called with the userObject if successful,
     *        or false if the username or password was incorrect.
     */
    check: function (username, password, callback) {
        db.collection("sergis-users").findOne({
            username_lowercase: username.toLowerCase()
        }, function (err, user) {
            if (err) {
                dbError("users.check", err, [username]);
                return callback(err);
            }

            if (!user) {
                return callback(null, false);
            }

            checkPassword(password, user.encryptedPassword, function (err, isCorrect) {
                if (err) {
                    dbError("users.check::check", err, [username]);
                    return callback(err);
                }

                return callback(null, isCorrect ? user : false);
            });
        });
    },
    
    /**
     * Create a new user.
     *
     * @param {string} username - The new user's username (must be unique).
     * @param {string} password - The new user's password.
     * @param {string} displayName - The new user's display name.
     * @param {?string} organization - The new user's organization (or null).
     * @param {string} admin - The new user's admin status ("yup", "kinda", or
     *        "nope". Default is "nope")
     * @param {Function} callback - Called with the userObject if successful,
     *        or false if the username is already taken.
     */
    create: function (username, password, displayName, organization, admin, callback) {
        // Make sure username doesn't exist
        db.collection("sergis-users").findOne({
            username_lowercase: username.toLowerCase()
        }, function (err, user) {
            if (err) {
                dbError("users.create", err, [username]);
                return callback(err);
            }
            
            if (user) {
                // Username already exists!
                return callback(null, false);
            }
            
            encryptPassword(password, function (err, encryptedPassword) {
                if (err) {
                    dbError("users.create::encrypt", err, [username]);
                    return callback(err);
                }
                
                db.collection("sergis-users").insert({
                    username: username,
                    username_lowercase: username.toLowerCase(),
                    encryptedPassword: encryptedPassword,
                    displayName: displayName,
                    organization: organization,
                    isAdmin: admin == "yup",
                    isOrganizationAdmin: admin == "kinda"
                }, function (err, user) {
                    if (err) {
                        dbError("users.get::insert", err, [username]);
                        return callback(err);
                    }
                    
                    // We're done!!
                    return callback(null, user);
                });
            });
        });
    },
    
    /**
     * Update a user.
     *
     * @param {string} username - The username of the user to update
     *        (case-insensitive).
     * @param {?Object} update - The Mongo data to update.
     * @param {?string} newPassword - A new password for the user.
     * @param {Function} callback - Called when successful.
     */
    update: function (username, update, newPassword, callback) {
        if (!update) update = {};
        var afterUpdate = function () {
            db.collection("sergis-users").update({
                username_lowercase: username.toLowerCase()
            }, {
                $set: update
            }, function (err, result) {
                if (err) {
                    dbError("users.update", err, [username]);
                    return callback(err);
                }

                return callback(null);
            });
        };
        if (newPassword) {
            encryptPassword(newPassword, function (err, encryptedPassword) {
                if (err) {
                    dbError("users.update::encrypt", err, [username]);
                    return callback(err);
                }

                update.encryptedPassword = encryptedPassword;
                afterUpdate();
            });
        } else {
            afterUpdate();
        }
    },
    
    /**
     * Delete a user.
     *
     * @param {string} username - The username of the user to delete
     *        (case-insensitive).
     * @param {Function} callback - Called when the attempted removal is done.
     */
    delete: function (username, callback) {
        db.collection("sergis-users").remove({
            username_lowercase: username.toLowerCase()
        }, function (err, result) {
            if (err) {
                dbError("users.delete", err, [username]);
                return callback(err);
            }

            return callback(null);
        });
    }
};

////////////////////////////////////////////////////////////////////////////////
// sergis-games, and sergis-tokens
exports.games = {
    /**
     * Get a game by gameOwner and gameName.
     *
     * @param {string} gameOwner - The username of the game owner
     *        (case-insensitive).
     * @param {string} gameName - The name of the game (case-insensitive).
     * @param {Function} callback - Called with the gameObject if successful,
     *        or no arguments if the gameOwner/gameName is not in the database.
     */
    get: function (gameOwner, gameName, callback) {
        db.collection("sergis-games").findOne({
            gameOwner_lowercase: gameOwner.toLowerCase(),
            gameName_lowercase: gameName.toLowerCase()
        }, function (err, game) {
            if (err) {
                dbError("games.get", err, [gameOwner, gameName]);
                return callback(err);
            }
            
            if (game) {
                return callback(null, game);
            } else {
                return callback(null);
            }
        });
    },

    /**
     * Get all the games, optionally filtered by an owner and/or access level.
     *
     * @param {?string} gameOwner - The username to filter by; will only include
     *        games owned by this username (case-insensitive).
     * @param {?string} organization - The organization to filter by (will only
     *        include games whose owner is part of this organization).
     * @param {?string} access - The access level to filter with (will only
     *        include games with this exact access level).
     * @param {Function} callback - Called with an array of the game objects.
     */
    getAll: function (gameOwner, organization, access, callback) {
        var criteria = {};
        if (gameOwner) criteria.gameOwner_lowercase = gameOwner.toLowerCase();
        if (access) criteria.access = access;
        db.collection("sergis-games").find(criteria).toArray(function (err, games) {
            if (err) {
                dbError("games.getAll", err);
                return callback(err);
            }
            
            // If there are no games, we're done
            if (games.length == 0) {
                return callback(null, []);
            }
            
            // It's not our lucky day... we have to check each game's owner
            var done = 0, total = games.length;
            var organizationGames = [];

            // Called after each game is loaded
            var gameAddedToList = function () {
                if (++done >= total) {
                    // We're all done!
                    callback(null, organizationGames);
                }
            };

            games.forEach(function (game) {
                db.collection("sergis-users").findOne({
                    username_lowercase: game.gameOwner.toLowerCase()
                }, function (err, user) {
                    if (err) {
                        dbError("games.getAll::find", err);
                        //return callback(err);
                        // We don't want to return; just finish processing the rest
                    } else {
                        if (!organization || user.organization === organization) {
                            // Yay, we found one!
                            // Add some user info to it
                            game.ownerDisplayName = user.displayName;
                            game.ownerOrganization = user.organization;
                            organizationGames.push(game);
                        }
                    }
                    gameAddedToList();
                });
            });
        });
    },
    
    /**
     * Create a new game.
     *
     * @param {string} gameOwner - The username of the game owner.
     * @param {string} gameName - The name of the new game.
     * @param {string} access - The access level for the game.
     * @param {Object} jsondata - The json data for the game.
     * @param {Function} callback - Called with the gameObject if successful,
     *        or false if the gameOwner/gameName combo is already taken.
     */
    create: function (gameOwner, gameName, access, jsondata, callback) {
        // Make sure gameOwner/gameName combo doesn't exist
        db.collection("sergis-games").findOne({
            gameOwner_lowercase: gameOwner.toLowerCase(),
            gameName_lowercase: gameName.toLowerCase()
        }, function (err, game) {
            if (err) {
                dbError("games.create", err, [gameOwner, gameName]);
                return callback(err);
            }
            
            if (game) {
                // Game already exists!
                return callback(null, false);
            }
            
            db.collection("sergis-games").insert({
                gameOwner: gameOwner,
                gameOwner_lowercase: gameOwner.toLowerCase(),
                gameName: gameName,
                gameName_lowercase: gameName.toLowerCase(),
                access: access,
                jsondata: jsondata
            }, function (err, game) {
                if (err) {
                    dbError("games.create::insert", err, [gameOwner, gameName]);
                    return callback(err);
                }

                // We're done!!
                return callback(null, game);
            });
        });
    },
    
    /**
     * Update a game.
     *
     * @param {string} gameOwner - The username of the game owner
     *        (case-insensitive).
     * @param {string} gameName - The gameName of the game to update
     *        (case-insensitive).
     * @param {Object} update - The Mongo data to update.
     * @param {Function} callback - Called when successful.
     */
    update: function (gameOwner, gameName, update, callback) {
        db.collection("sergis-games").update({
            gameOwner_lowercase: gameOwner.toLowerCase(),
            gameName_lowercase: gameName.toLowerCase()
        }, {
            $set: update
        }, function (err, result) {
            if (err) {
                dbError("games.update", err, [gameOwner, gameName]);
                return callback(err);
            }
            
            return callback(null);
        });
    },
    
    /**
     * Delete a game.
     *
     * @param {string} gameOwner - The username of the game owner
     *        (case-insensitive).
     * @param {string} gameName - The gameName of the game to delete
     *        (case-insensitive).
     * @param {Function} callback - Called when the attempted removal is done.
     */
    delete: function (gameOwner, gameName, callback) {
        db.collection("sergis-games").remove({
            gameOwner_lowercase: gameOwner.toLowerCase(),
            gameName_lowercase: gameName.toLowerCase()
        }, function (err, result) {
            if (err) {
                dbError("games.delete", err, [gameOwner, gameName]);
                return callback(err);
            }
            
            return callback(null);
        });
    },
    
    /**
     * Create a game auth token without user authentication.
     *
     * @param {string} gameOwner - The username of the game owner
     *        (case-insensitive).
     * @param {string} gameName - The name of the game (case-insensitive).
     * @param {Function} callback - Called with (userObject, authToken) if the
     *        game is public, or (false) is authentication is needed.
     */
    makeAnonymousGameToken: function (gameOwner, gameName, callback) {
        db.collection("sergis-games").findOne({
            gameOwner_lowercase: gameOwner.toLowerCase(),
            gameName_lowercase: gameName.toLowerCase()
        }, function (err, game) {
            if (err) {
                dbError("games.makeAnonymousGameToken", err, [gameOwner, gameName]);
                return callback(err);
            }

            if (!game || game.access != "public") {
                // Either bad game name, or user is not allowed to access
                return callback(null, false);
            }

            // All good, make auth token!
            makeToken(gameOwner, gameName, undefined, callback);
        });
    },

    /**
     * Get user info and create a game auth token.
     *
     * @param {string} gameOwner - The username of the game owner
     *        (case-insensitive).
     * @param {string} gameName - The name of the game (case-insensitive).
     * @param {string} username - The username (case-insensitive).
     * @param {string} password - The password.
     * @param {Function} callback - Called with (userObject, authToken) if
     *        authentication is successful, or (false) if the username or
     *        password is incorrect, or (false, false) if the user does not have
     *        accessor to the game, or no arguments if there is an error.
     *        (See checkAndMakeToken below.)
     */
    makeAuthenticatedGameToken: function (gameOwner, gameName, username, password, callback) {
        db.collection("sergis-games").findOne({
            gameOwner_lowercase: gameOwner.toLowerCase(),
            gameName_lowercase: gameName.toLowerCase()
        }, function (err, game) {
            if (err) {
                dbError("games.makeAuthenticatedGameToken", err, [gameOwner, gameName, username]);
                return callback(err);
            }
            
            if (!game) {
                // Bad game name
                return callback(null);
            }

            db.collection("sergis-users").findOne({
                username_lowercase: gameOwner.toLowerCase()
            }, function (err, owner) {
                if (err) {
                    dbError("games.makeAuthenticatedGameToken::1", err, [gameOwner, gameName, username]);
                    return callback(err);
                }

                if (!owner) {
                    // Lol, the game owner doesn't exist anymore
                    return callback(null);
                }
                
                db.collection("sergis-users").findOne({
                    username_lowercase: username.toLowerCase()
                }, function (err, user) {
                    if (err) {
                        dbError("games.makeAuthenticatedGameToken::2", err, [gameOwner, gameName, username]);
                        return callback(err);
                    }

                    if (!user) {
                        // Bad username
                        return callback(null, false);
                    }

                    checkPassword(password, user.encryptedPassword, function (err, isCorrect) {
                        if (err) {
                            dbError("games.makeAuthenticatedGameToken::3", err, [gameOwner, gameName, username]);
                            return callback(err);
                        }

                        if (!isCorrect) {
                            // Good username, bad password
                            return callback(null, false);
                        }

                        // Now, pass the control to checkAndMakeToken
                        checkAndMakeToken(game, owner, user, callback);
                    });
                });
            });
        });
    },
    
    /**
     * Create a game auth token for a user without checking authentication.
     *
     * @param {string} gameOwner - The username of the game owner
     *        (case-insensitive).
     * @param {string} gameName - The name of the game (case-insensitive).
     * @param {string} username - The username (case-insensitive).
     * @param {Function} callback - Called with (userObject, authToken) if
     *        authentication is successful, or (false) if the username is bad,
     *        or (false, false) if the user does not have access to the game,
     *        or no arguments if the user doesn't have access to the game or
     *        there is a data error.
     *        (See checkAndMakeToken below.)
     */
    makeGameToken: function (gameOwner, gameName, username, callback) {
        db.collection("sergis-games").findOne({
            gameOwner_lowercase: gameOwner.toLowerCase(),
            gameName_lowercase: gameName.toLowerCase()
        }, function (err, game) {
            if (err) {
                dbError("games.makeGameToken", err, [gameOwner, gameName, username]);
                return callback(err);
            }
            
            if (!game) {
                // Bad game name
                return callback(null);
            }

            db.collection("sergis-users").findOne({
                username_lowercase: gameOwner.toLowerCase()
            }, function (err, owner) {
                if (err) {
                    dbError("games.makeGameToken::1", err, [gameOwner, gameName, username]);
                    return callback(err);
                }

                if (!owner) {
                    // Bad owner
                    return callback(null);
                }
                
                db.collection("sergis-users").findOne({
                    username_lowercase: username.toLowerCase()
                }, function (err, user) {
                    if (err) {
                        dbError("games.makeGameToken::2", err, [gameOwner, gameName, username]);
                        return callback(err);
                    }

                    if (!user) {
                        // Bad username
                        return callback(null, false);
                    }

                    // Now, pass the control to checkAndMakeToken
                    checkAndMakeToken(game, owner, user, callback);
                });
            });
        });
    },

    /**
     * Delete a game auth token (i.e., log a user out of a game).
     *
     * @param {string} token - The auth token.
     * @param {Function} callback - Called with true if successful.
     */
    deleteGameToken: function (token, callback) {
        db.collection("sergis-tokens").remove({token: token}, function (err, result) {
            if (err) {
                dbError("games.deleteGameToken", err);
                return callback(err);
            }
            
            return callback(null, true);
        });
    },

    /**
     * Get data from the token database and the corresponding game.
     *
     * @param {string} token - The token to look up.
     * @param {Function} callback - Called with (game, tokenData).
     */
    getGameAndTokenData: function (token, callback) {
        db.collection("sergis-tokens").findOne({token: token}, function (err, tokenData) {
            if (err) {
                dbError("games.getGameAndTokenData", err);
                return callback(err);
            }
            
            db.collection("sergis-games").findOne({
                gameOwner_lowercase: tokenData.gameOwner.toLowerCase(),
                gameName_lowercase: tokenData.gameName.toLowerCase()
            }, function (err, game) {
                if (err) {
                    dbError("games.getGameAndTokenData", err);
                    return callback(err);
                }

                return callback(null, game, tokenData);
            });
        });
    },

    /**
     * Update data in the token database.
     *
     * @param {string} token - The token to update.
     * @param {Object} update - The object to tell MongoDB what to update.
     * @param {Function} callback - Called with (true) if successful.
     */
    updateGameTokenData: function (token, update, callback) {
        db.collection("sergis-tokens").update({token: token}, {$set: update}, function (err, result) {
            if (err) {
                dbError("games.updateGameTokenData", err);
                return callback(err);
            }
            
            return callback(null, true);
        });
    }
};


////////////////////////////////////////////////////////////////////////////////
// sergis-author-games, and sergis-author-tokens
exports.author = {
    /**
     * Get an author game by gameOwner and gameName.
     *
     * @param {string} gameOwner - The username of the game owner
     *        (case-insensitive).
     * @param {string} gameName - The name of the game (case-insensitive).
     * @param {Function} callback - Called with jsondata if successful, or
     *        no data if the gameOwner/gameName is not in the database.
     */
    get: function (gameOwner, gameName, callback) {
        db.collection("sergis-author-games").findOne({
            gameOwner_lowercase: gameOwner.toLowerCase(),
            gameName_lowercase: gameName.toLowerCase()
        }, function (err, game) {
            if (err) {
                dbError("author.get", err, [gameOwner, gameName]);
                return callback(err);
            }
            
            if (game && game.jsondata) {
                return callback(null, game.jsondata);
            } else {
                return callback(null);
            }
        });
    },

    /**
     * Get all the author games by a user.
     *
     * @param {string} gameOwner - The username to filter by; will only include
     *        games owned by this username (case-insensitive).
     * @param {Function} callback - Called with an object whose keys are game
     *        names and values are last modified dates.
     */
    getAll: function (gameOwner, callback) {
        db.collection("sergis-author-games").find({
            gameOwner_lowercase: gameOwner.toLowerCase()
        }).toArray(function (err, games) {
            if (err) {
                dbError("author.getAll", err, [gameOwner]);
                return callback(err);
            }
            
            // If there are no games, we're done
            if (games.length == 0) {
                return callback(null, {});
            }
            
            var gameList = {};
            games.forEach(function (game) {
                gameList[game.gameName] = new Date(game.lastModified);
            });
            return callback(null, gameList);
        });
    },
    
    /**
     * Create a new author game.
     *
     * @param {string} gameOwner - The username of the game owner.
     * @param {string} gameName - The name of the new game.
     * @param {Object} jsondata - The new jsondata.
     * @param {Function} callback - Called with true if successful, or
     *        false if the gameOwner/gameName combo is already taken.
     */
    create: function (gameOwner, gameName, jsondata, callback) {
        // Make sure gameOwner/gameName combo doesn't exist
        db.collection("sergis-author-games").findOne({
            gameOwner_lowercase: gameOwner.toLowerCase(),
            gameName_lowercase: gameName.toLowerCase()
        }, function (err, game) {
            if (err) {
                dbError("author.create", err, [gameOwner, gameName]);
                return callback(err);
            }
            
            if (game) {
                // Game already exists!
                return callback(null, false);
            }
            
            db.collection("sergis-author-games").insert({
                gameOwner: gameOwner,
                gameOwner_lowercase: gameOwner.toLowerCase(),
                gameName: gameName,
                gameName_lowercase: gameName.toLowerCase(),
                lastModified: (new Date()).getTime(),
                jsondata: jsondata
            }, function (err, game) {
                if (err) {
                    dbError("author.create::insert", err, [gameOwner, gameName]);
                    return callback(err);
                }

                // We're done!!
                return callback(null, true);
            });
        });
    },
    
    /**
     * Update an author game.
     *
     * @param {string} gameOwner - The username of the game owner
     *        (case-insensitive).
     * @param {string} gameName - The gameName of the game to update
     *        (case-insensitive).
     * @param {Object} jsondata - The new jsondata.
     * @param {Function} callback - Called when successful.
     */
    update: function (gameOwner, gameName, jsondata, callback) {
        db.collection("sergis-author-games").update({
            gameOwner_lowercase: gameOwner.toLowerCase(),
            gameName_lowercase: gameName.toLowerCase()
        }, {
            $set: {
                lastModified: (new Date()).getTime(),
                jsondata: jsondata
            }
        }, function (err, result) {
            if (err) {
                dbError("author.update", err, [gameOwner, gameName]);
                return callback(err);
            }
            
            return callback(null);
        });
    },
    
    /**
     * Delete an author game.
     *
     * @param {string} gameOwner - The username of the game owner
     *        (case-insensitive).
     * @param {string} gameName - The gameName of the game to delete
     *        (case-insensitive).
     * @param {Function} callback - Called when the attempted removal is done.
     */
    delete: function (gameOwner, gameName, callback) {
        db.collection("sergis-author-games").remove({
            gameOwner_lowercase: gameOwner.toLowerCase(),
            gameName_lowercase: gameName.toLowerCase()
        }, function (err, result) {
            if (err) {
                dbError("author.delete", err, [gameOwner, gameName]);
                return callback(err);
            }
            
            return callback(null);
        });
    }
};


////////////////////////////////////////////////////////////////////////////////
// Helper Functions

/**
 * Make a quick and dirty random integer.
 *
 * @param {number} d - The number of digits in the number.
 */
function randInt(d) {
    return Math.floor((Math.random() * 9 + 1) * Math.pow(10, d-1));
}

/**
 * Encrypt a password.
 *
 * @param {string} password - The user-provided password to encrypt.
 * @param {Function} callback - Called with (null, password) if successful, or
 *        (err) if there was an error.
 */
function encryptPassword(password, callback) {
    var randomSalt = crypto.randomBytes(HASH_SALT_LENGTH).toString("base64").substring(0, HASH_SALT_LENGTH),
        numIterations = HASH_NUM_ITERATIONS,
        derivedKeyLength = HASH_DERIVED_KEY_LENGTH;

    // Hash the password
    crypto.pbkdf2(password, randomSalt, numIterations, derivedKeyLength, function (err, derivedKey) {
        if (err) {
            return callback(err);
        }

        var data = JSON.stringify([randomSalt, numIterations, derivedKeyLength, (new Buffer(derivedKey, "binary")).toString("base64")]);
        return callback(null, data.slice(1, -1));
    });
}

/**
 * Check an encrypted password.
 *
 * @param {string} password - The user-provided password to check.
 * @param {string} encryptedPassword - The stored encrypted password to check
 *        against.
 * @param {Function} callback - Called with (null, true) if the passwords match,
 *        (null, false) if they don't, or (err) if there's an error.
 */
function checkPassword(password, encryptedPassword, callback) {
    var data;
    try {
        data = JSON.parse("[" + encryptedPassword + "]");
    } catch (err) {
        return callback(err);
    }

    if (data && Array.isArray(data) && data.length == 4 &&
        typeof data[0] == "string" && // random salt
        typeof data[1] == "number" && // number of iterations
        typeof data[2] == "number" && // derived key length
        typeof data[3] == "string") { // derived key

        var randomSalt = data[0],
            numIterations = data[1],
            derivedKeyLength = data[2],
            derivedKey = data[3];

        // Hash the provided password
        crypto.pbkdf2(password, randomSalt, numIterations, derivedKeyLength, function (err, newDerivedKey) {
            if (err) {
                return callback(err);
            }

            if ((new Buffer(newDerivedKey, "binary")).toString("base64") === derivedKey) {
                return callback(null, true);
            } else {
                return callback(null, false);
            }
        });
    } else {
        return callback(new Error("Invalid encrypted password."));
    }
}

/**
 * Check a game/user/owner combo for access and then make an auth token.
 *
 * @param {object} game - The game from sergis-games.
 * @param {object} owner - The owner of the game from sergis-users.
 * @param {object} user - The logged-in user from sergis-users.
 * @param {Function} callback - Called with (null, userObject, authToken) if
 *        authentication is successful, or (null, false, false) if the user
 *        does not have access to the game, or (err) if there is an error.
 */
function checkAndMakeToken(game, owner, user, callback) {
    // Is this user allowed to access this game?
        // If they're an admin, or the game is public
    if (user.isAdmin || game.access == "public" ||
        // If the game is organization and they're in the same organization as the owner
        (game.access == "organization" && owner.organization && owner.organization === user.organization) ||
        // If they're an organization admin and in the same organization as the owner
        (user.isOrganizationAdmin && user.organization && user.organization === owner.organization) ||
        // If they are the owner
        owner.username == user.username) {

        // All good, make a token!
        makeToken(game.gameOwner, game.gameName, user.username, callback);
    } else {
        // No access for you!
        return callback(null, false, false);
    }
}

/**
 * Actually make an auth token.
 *
 * @param {string} gameOwner - The username of the game owner
 *        (case-insensitive).
 * @param {string} gameName - The name of the game (case-insensitive).
 * @param {string} username - The username of the user (can be `undefined`).
 * @param {Function} callback - Called with (null, gamePerms, authToken) if
 *        successful, or (err) if there's an error, or no arguments if something
 *        didn't exist.
 *        (gamePerms is an object with "jumpingBackAllowed" and
 *        "jumpingForwardAllowed)
 */
function makeToken(gameOwner, gameName, username, callback) {
    var token = Number(randInt(10) + "" + (new Date()).getTime() + "" + randInt(10)).toString(36);
    db.collection("sergis-games").findOne({
        gameOwner_lowercase: gameOwner.toLowerCase(),
        gameName_lowercase: gameName.toLowerCase()
    }, function (err, game) {
        if (err) {
            dbError("makeToken", err, [gameOwner, gameName]);
            return callback(err);
        }
        
        if (!game) {
            return callback(null);
        }
        
        db.collection("sergis-tokens").insert({
            token: token,
            gameOwner: gameOwner.toLowerCase(),
            gameName: gameName.toLowerCase(),
            username: username,
            state: {
                // Default state
                currentPromptIndex: null,
                nextAllowedPromptIndex: null,
                userChoices: [],
                userChoiceOrder: []
            }
        }, function (err, result) {
            if (err) {
                dbError("makeToken::insert", err, [gameOwner, gameName]);
                return callback(err);
            }
            
            return callback(null, {
                jumpingBackAllowed: !!game.jsondata.jumpingBackAllowed,
                jumpingForwardAllowed: !!game.jsondata.jumpingForwardAllowed,
                buttons: [
                    {
                        label: "Home",
                        action: (config.HTTP_PREFIX || "") + "/"
                    }
                ]
            }, token);
        });
    });
}
