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


/**
 * Store a reference to the Mongo database.
 */
exports.init = function (_db) {
    db = _db;
};

/**
 * If a reference to the actual Mongo DB is ever needed.
 */
exports.getDB = function () {
    return db;
}

////////////////////////////////////////////////////////////////////////////////
// sergis-organizations
exports.organizations = {
    /**
     * Get a list of all the possible user organizations as strings.
     *
     * @param {Function} callback - Called with ([organizationName,
     *        organizationName, ...]).
     */
    getAll: function (callback) {
        db.collection("sergis-organizations").find({}).toArray(function (err, organizations) {
            if (err) throw err;
            return callback(organizations.map(function (organization) {
                return organization.name;
            }));
        });
    },

    /**
     * Get a specific organization.
     *
     * @param {string} organizationName - The name of the organization.
     * @param {Function} callback - Called with (organization).
     */
    get: function (organizationName, callback) {
        db.collection("sergis-organizations").find({name: organizationName}, function (err, organization) {
            if (err) throw err;
            return callback(organization);
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
            if (err) throw err;
            
            if (organization) {
                // Whoopsie, it's already in there
                // Just pretend it's brand new
                return callback(organization);
            }

            // Add it in
            db.collection("sergis-organizations").insert({name: organizationName}, function (err, organization) {
                if (err) throw err;
                return callback(organization);
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
     * @param {string} username
     * @param {Function} callback - Called with (userObject) if successful, or no
     *        arguments if the username is not in the database.
     */
    get: function (username, callback) {
        db.collection("sergis-users").findOne({username: username}, function (err, user) {
            if (err) throw err;
            if (user) {
                return callback(user);
            } else {
                return callback();
            }
        });
    },

    /**
     * Get all the users, optionally filtered by an organization.
     *
     * @param {?string} organization - The organization used to filter.
     * @param {Function} callback - Called with ([userObject, userObject, ...]).
     */
    getAll: function (organization, callback) {
        if (organization) {
            db.collection("sergis-users").find({organization: organization}).toArray(function (err, users) {
                if (err) throw err;
                return callback(users);
            });
        } else {
            db.collection("sergis-users").find({}).toArray(function (err, users) {
                if (err) throw err;
                return callback(users);
            });
        }
    },

    /**
     * Get a user via a username and password.
     *
     * @param {string} username - The username of the user trying to log in.
     * @param {string} password - The password of the user trying to log in.
     * @param {Function} callback - Called with (userObject) if successful, or
     *        (false) if the username or password was incorrect.
     */
    check: function (username, password, callback) {
        db.collection("sergis-users").findOne({username: username}, function (err, user) {
            if (err) throw err;

            if (!user) {
                return callback(false);
            }

            checkPassword(password, user.encryptedPassword, function (err, isCorrect) {
                if (err) throw err;
                return callback(isCorrect ? user : false);
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
     * @param {Function} callback - Called with (userObject) if successful, or
     *        (false) if the username is already taken.
     */
    create: function (username, password, displayName, organization, admin, callback) {
        // Make sure username doesn't exist
        db.collection("sergis-users").findOne({username: username}, function (err, user) {
            if (err) throw err;
            
            if (user) {
                // Username already exists!
                return callback(false);
            }
            
            encryptPassword(password, function (err, encryptedPassword) {
                if (err) throw err;
                
                db.collection("sergis-users").insert({
                    username: username,
                    encryptedPassword: encryptedPassword,
                    displayName: displayName,
                    organization: organization,
                    isAdmin: admin == "yup",
                    isOrganizationAdmin: admin == "kinda"
                }, function (err, user) {
                    if (err) throw err;
                    
                    // We're done!!
                    return callback(user);
                });
            });
        });
    },
    
    /**
     * Update a user.
     *
     * @param {string} username - The username of the user to update.
     * @param {Object} update - The Mongo data to update.
     * @param {Function} callback - Called when successful.
     */
    update: function (username, update, callback) {
        var afterUpdate = function () {
            db.collection("sergis-users").update({username: username}, update, function (err, result) {
                if (err) throw err;
                return callback();
            });
        };
        if (update.password) {
            encryptPassword(update.password, function (err, encryptedPassword) {
                if (err) throw err;
                delete update.password;
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
     * @param {string} username - The username of the user to delete.
     * @param {Function} callback - Called when the attempted removal is done.
     */
    delete: function (username, callback) {
        db.collection("sergis-users").remove({username: username}, function (err, result) {
            if (err) throw err;
            return callback();
        });
    }
};

////////////////////////////////////////////////////////////////////////////////
// sergis-games, and sergis-tokens
exports.games = {
    /**
     * Get a game by username and gameName.
     *
     * @param {string} gameUsername - The name of the user that owns the game.
     * @param {string} gameName - The name of the game.
     * @param {Function} callback - Called with (gameObject) if successful, or
     *        no arguments if the username/gameName is not in the database.
     */
    get: function (gameUsername, gameName, callback) {
        db.collection("sergis-games").findOne({
            username: gameUsername,
            gameName: gameName
        }, function (err, game) {
            if (err) throw err;
            if (game) {
                return callback(game);
            } else {
                return callback();
            }
        });
    },

    /**
     * Get all the games, optionally filtered by a username, or access level.
     *
     * @param {?string} username - The username to filter by (will only include
     *        games owned by this username).
     * @param {?string} organization - The organization to filter by (will only
     *        include games whose owner is part of this organization).
     * @param {?string} access - The access level to filter with (will only
     *        include games with this exact access level).
     * @param {Function} callback - Called with ([gameObject, gameObject, ...]).
     */
    getAll: function (username, organization, access, callback) {
        var criteria = {};
        if (username) criteria.username = username;
        if (access) criteria.access = access;
        db.collection("sergis-games").find(criteria).toArray(function (err, games) {
            if (err) throw err;
            // If there are no games, we're done
            if (games.length == 0) {
                return callback([]);
            }
            
            // It's not our lucky day... we have to check each game's owner
            var done = 0, total = games.length;
            var organizationGames = [];

            // Called after each game is loaded
            var gameAddedToList = function () {
                if (++done >= total) {
                    // We're all done!
                    callback(organizationGames);
                }
            };

            games.forEach(function (game) {
                db.collection("sergis-users").findOne({username: game.username}, function (err, user) {
                    if (err) throw err;

                    if (!organization || user.organization === organization) {
                        // Yay, we found one!
                        // Add the display name to it
                        game.ownerDisplayName = user.displayName;
                        organizationGames.push(game);
                    }
                    gameAddedToList();
                });
            });
        });
    },
    
    /**
     * Create a new game.
     *
     * @param {string} username - The username of the user that owns this game.
     * @param {string} gameName - The name of the new game.
     * @param {string} access - The access level for the game.
     * @param {Object} jsondata - The json data for the game.
     * @param {Function} callback - Called with (gameObject) if successful, or
     *        (false) if the username/gameName combo is already taken.
     */
    create: function (username, gameName, access, jsondata, callback) {
        // Make sure username/gameName combo doesn't exist
        db.collection("sergis-games").findOne({
            username: username,
            gameName: gameName
        }, function (err, game) {
            if (err) throw err;
            
            if (game) {
                // Game already exists!
                return callback(false);
            }
            
            db.collection("sergis-games").insert({
                username: username,
                gameName: gameName,
                access: access,
                jsondata: jsondata
            }, function (err, game) {
                if (err) throw err;

                // We're done!!
                return callback(game);
            });
        });
    },
    
    /**
     * Update a game.
     *
     * @param {string} gameUsername - The name of the user that owns the game.
     * @param {string} gameName - The gameName of the game to update.
     * @param {Object} update - The Mongo data to update.
     * @param {Function} callback - Called when successful.
     */
    update: function (gameUsername, gameName, update, callback) {
        db.collection("sergis-games").update({
            username: gameUsername,
            gameName: gameName
        }, update, function (err, result) {
            if (err) throw err;
            return callback();
        });
    },
    
    /**
     * Delete a game.
     *
     * @param {string} gameUsername - The name of the user that owns the game.
     * @param {string} gameName - The gameName of the game to delete.
     * @param {Function} callback - Called when the attempted removal is done.
     */
    delete: function (gameUsername, gameName, callback) {
        db.collection("sergis-games").remove({
            username: gameUsername,
            gameName: gameName
        }, function (err, result) {
            if (err) throw err;
            return callback();
        });
    },
    
    /**
     * Create a game auth token without user authentication.
     * NOTE: This function won't throw errors.
     *
     * @param {string} gameUsername - The name of the user that owns the game.
     * @param {string} gameName - The name of the game.
     * @param {Function} callback - Called with (userObject, authToken) if the
     *        game is public, or (false) is authentication is needed, or no
     *        arguments if there is an error.
     */
    makeAnonymousGameToken: function (gameUsername, gameName, callback) {
        db.collection("sergis-games").findOne({
            username: gameUsername,
            gameName: gameName
        }, function (err, game) {
            if (err) {
                console.error("Error accessing \"" + gameUsername + "\"/\"" + gameName + "\" in sergis-games collection: ", err.stack);
                return callback();
            }

            if (!game || game.access != "public") {
                // Either bad game name, or user is not allowed to access
                return callback(false);
            }

            // All good, make auth token!
            makeToken(gameUsername, gameName, undefined, function (gamePerms, authToken) {
                if (!gamePerms || !authToken) {
                    return callback();
                }

                return callback(gamePerms, authToken);
            });
        });
    },

    /**
     * Get user info and create a game auth token.
     * NOTE: This function won't throw errors.
     *
     * @param {string} gameUsername - The name of the user that owns the game.
     * @param {string} gameName - The name of the game.
     * @param {string} username - The username.
     * @param {string} password - The password.
     * @param {Function} callback - Called with (userObject, authToken) if
     *        authentication is successful, or (false) if the username or
     *        password is incorrect, or no arguments if there is an error
     *        (including when the user doesn't have access to the game).
     */
    makeAuthenticatedGameToken: function (gameUsername, gameName, username, password, callback) {
        db.collection("sergis-games").findOne({
            username: gameUsername,
            gameName: gameName
        }, function (err, game) {
            if (err) {
                console.error("Error accessing game in sergis-games collection: ", err.stack);
                return callback();
            }

            if (!game || (game.access != "public" && game.access != "organization" && game.username != username)) {
                // Bad game name, or private game not owned by us
                return callback();
            }

            db.collection("sergis-users").findOne({username: gameUsername}, function (err, owner) {
                if (err) {
                    console.error("Error accessing user in sergis-users collection: ", err.stack);
                    return callback();
                }
                if (!owner) {
                    // Lol, the game owner doesn't exist anymore
                    return callback();
                }
                
                db.collection("sergis-users").findOne({username: username}, function (err, user) {
                    if (err) {
                        console.error("Error accessing user in sergis-users collection: ", err.stack);
                        return callback();
                    }
                    if (!user) {
                        // Bad username
                        return callback(false);
                    }

                    checkPassword(password, user.encryptedPassword, function (err, isCorrect) {
                        if (err) {
                            console.error("Error checking encrypted password: ", err.stack);
                            return callback();
                        }
                        if (!isCorrect) {
                            // Good username, bad password
                            return callback(false);
                        }

                        // Now, is this user allowed to access this game?
                        if (game.access == "public" ||
                            (game.access == "organization" && owner.organization && owner.organization === user.organization) ||
                            owner.username == user.username) {

                            // All good, make a token!
                            makeToken(gameUsername, gameName, username, function (gamePerms, authToken) {
                                if (!gamePerms || !authToken) {
                                    return callback();
                                }

                                gamePerms.displayName = user.displayName;
                                return callback(gamePerms, authToken);
                            });
                        } else {
                            // No access for you!
                            return callback();
                        }
                    });
                });
            });
        });
    },
    
    /**
     * Create a game auth token for a user without checking authentication.
     * NOTE: This function won't throw errors.
     *
     * @param {string} gameUsername - The name of the user that owns the game.
     * @param {string} gameName - The name of the game.
     * @param {string} username - The username.
     * @param {Function} callback - Called with (userObject, authToken) if
     *        authentication is successful, or (false) if the username is bad,
     *        or no arguments if there is an error (including if the user
     *        doesn't have access to the game).
     */
    makeGameToken: function (gameUsername, gameName, username, callback) {
        db.collection("sergis-games").findOne({
            username: gameUsername,
            gameName: gameName
        }, function (err, game) {
            if (err) {
                console.error("Error accessing game in sergis-games collection: ", err.stack);
                return callback();
            }

            if (!game || (game.access != "public" && game.access != "organization" && game.username != username)) {
                // Bad game name, or private game not owned by us
                return callback();
            }

            db.collection("sergis-users").findOne({username: gameUsername}, function (err, owner) {
                if (err) {
                    console.error("Error accessing user in sergis-users collection: ", err.stack);
                    return callback();
                }
                if (!owner) {
                    // Bad owner
                    return callback();
                }
                
                db.collection("sergis-users").findOne({username: username}, function (err, user) {
                    if (err) {
                        console.error("Error accessing user in sergis-users collection: ", err.stack);
                        return callback();
                    }
                    if (!user) {
                        // Bad username
                        return callback(false);
                    }

                    // Now, is this user allowed to access this game?
                    if (game.access == "public" ||
                        (game.access == "organization" && owner.organization && owner.organization === user.organization) ||
                        owner.username == user.username) {

                        // All good, make a token!
                        makeToken(gameUsername, gameName, username, function (gamePerms, authToken) {
                            if (!gamePerms || !authToken) {
                                return callback();
                            }

                            gamePerms.displayName = user.displayName;
                            return callback(gamePerms, authToken);
                        });
                    } else {
                        // No access for you!
                        return callback();
                    }
                });
            });
        });
    },

    /**
     * Delete a game auth token (i.e., log a user out of a game).
     * NOTE: This function won't throw errors.
     *
     * @param {string} token - The auth token.
     * @param {Function} callback - Called with (true) if successful, or no
     *        arguments if there was an error.
     */
    deleteGameToken: function (token, callback) {
        db.collection("sergis-tokens").remove({token: token}, function (err, result) {
            if (err) {
                console.error("Error removing from sergis-tokens collection: ", err.stack);
                return callback();
            }
            return callback(true);
        });
    },

    /**
     * Get data from the token database and the corresponding game.
     * NOTE: This function won't throw errors.
     *
     * @param {string} token - The token to look up.
     * @param {Function} callback - Called with (game, tokenData) if successful,
     *        or no arguments if there was an error.
     */
    getGameAndTokenData: function (token, callback) {
        db.collection("sergis-tokens").findOne({token: token}, function (err, tokenData) {
            if (err) {
                console.error("Error accessing sergis-tokens collection: ", err.stack);
                return callback();
            }

            db.collection("sergis-games").findOne({
                username: tokenData.gameUsername,
                gameName: tokenData.gameName
            }, function (err, game) {
                if (err) {
                    console.error("Error accessing sergis-games collection: ", err.stack);
                    return callback();
                }

                return callback(game, tokenData);
            });
        });
    },

    /**
     * Update data in the token database.
     * NOTE: This function won't throw errors.
     *
     * @param {string} token - The token to update.
     * @param {Object} update - The object to tell MongoDB what to update.
     * @param {Function} callback - Called with (true) if successful, or no
     *        arguments if there was an error.
     */
    updateGameTokenData: function (token, update, callback) {
        db.collection("sergis-tokens").update({token: token}, update, function (err, result) {
            if (err) {
                console.error("Error updating in sergis-tokens collection: ", err.stack);
                return callback();
            }

            return callback(true);
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
 * Actually make an auth token.
 *
 * @param {string} gameUsername - The name of the user that owns the game.
 * @param {string} gameName - The name of the game.
 * @param {string} username - The username of the user (can be `undefined`).
 * @param {Function} callback - Called with (gamePerms, authToken) if
 *        successful, or no arguments if there's an error.
 *        (gamePerms is an object with "jumpingBackAllowed" and
 *        "jumpingForwardAllowed)
 */
function makeToken(gameUsername, gameName, username, callback) {
    var token = Number(randInt(10) + "" + (new Date()).getTime() + "" + randInt(10)).toString(36);
    db.collection("sergis-games").findOne({
        username: gameUsername,
        gameName: gameName
    }, function (err, game) {
        if (err) {
            console.error("Error accessing in sergis-games collection: ", err.stack);
            return callback();
        }
        
        if (!game) {
            return callback();
        }
        
        db.collection("sergis-tokens").insert({
            token: token,
            gameUsername: gameUsername,
            gameName: gameName,
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
                console.error("Error inserting into sergis-tokens collection: ", err.stack);
                return callback();
            }
            return callback({
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