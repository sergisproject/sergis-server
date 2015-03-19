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
            db.collection("sergis-organizations").insert({
                name: organizationName
            }, function (err, organization) {
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
     * @param {string} username - The user's username (case-insensitive).
     * @param {Function} callback - Called with (userObject) if successful, or no
     *        arguments if the username is not in the database.
     */
    get: function (username, callback) {
        db.collection("sergis-users").findOne({
            username_lowercase: username.toLowerCase()
        }, function (err, user) {
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
     * @param {string} username - The username of the user trying to log in
     *        (case-insensitive).
     * @param {string} password - The password of the user trying to log in.
     * @param {Function} callback - Called with (userObject) if successful, or
     *        (false) if the username or password was incorrect.
     */
    check: function (username, password, callback) {
        db.collection("sergis-users").findOne({
            username_lowercase: username.toLowerCase()
        }, function (err, user) {
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
        db.collection("sergis-users").findOne({
            username_lowercase: username.toLowerCase()
        }, function (err, user) {
            if (err) throw err;
            
            if (user) {
                // Username already exists!
                return callback(false);
            }
            
            encryptPassword(password, function (err, encryptedPassword) {
                if (err) throw err;
                
                db.collection("sergis-users").insert({
                    username: username,
                    username_lowercase: username.toLowerCase(),
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
     * @param {string} username - The username of the user to update
     *        (case-insensitive).
     * @param {Object} update - The Mongo data to update.
     * @param {?string} newPassword - A new password for the user.
     * @param {Function} callback - Called when successful.
     */
    update: function (username, update, newPassword, callback) {
        var afterUpdate = function () {
            db.collection("sergis-users").update({
                username_lowercase: username.toLowerCase()
            }, {
                $set: update
            }, function (err, result) {
                if (err) throw err;
                return callback();
            });
        };
        if (newPassword) {
            encryptPassword(newPassword, function (err, encryptedPassword) {
                if (err) throw err;
                update.$set.encryptedPassword = encryptedPassword;
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
            if (err) throw err;
            return callback();
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
     * @param {Function} callback - Called with (gameObject) if successful, or
     *        no arguments if the gameOwner/gameName is not in the database.
     */
    get: function (gameOwner, gameName, callback) {
        db.collection("sergis-games").findOne({
            gameOwner_lowercase: gameOwner.toLowerCase(),
            gameName_lowercase: gameName.toLowerCase()
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
     * Get all the games, optionally filtered by an owner and/or access level.
     *
     * @param {?string} gameOwner - The username to filter by; will only include
     *        games owned by this username (case-insensitive).
     * @param {?string} organization - The organization to filter by (will only
     *        include games whose owner is part of this organization).
     * @param {?string} access - The access level to filter with (will only
     *        include games with this exact access level).
     * @param {Function} callback - Called with ([gameObject, gameObject, ...]).
     */
    getAll: function (gameOwner, organization, access, callback) {
        var criteria = {};
        if (gameOwner) criteria.gameOwner_lowercase = gameOwner.toLowerCase();
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
                db.collection("sergis-users").findOne({
                    username_lowercase: game.gameOwner.toLowerCase()
                }, function (err, user) {
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
     * @param {string} gameOwner - The username of the game owner.
     * @param {string} gameName - The name of the new game.
     * @param {string} access - The access level for the game.
     * @param {Object} jsondata - The json data for the game.
     * @param {Function} callback - Called with (gameObject) if successful, or
     *        (false) if the gameOwner/gameName combo is already taken.
     */
    create: function (gameOwner, gameName, access, jsondata, callback) {
        // Make sure gameOwner/gameName combo doesn't exist
        db.collection("sergis-games").findOne({
            gameOwner_lowercase: gameOwner.toLowerCase(),
            gameName_lowercase: gameName.toLowerCase()
        }, function (err, game) {
            if (err) throw err;
            
            if (game) {
                // Game already exists!
                return callback(false);
            }
            
            db.collection("sergis-games").insert({
                gameOwner: gameOwner,
                gameOwner_lowercase: gameOwner.toLowerCase(),
                gameName: gameName,
                gameName_lowercase: gameName.toLowerCase(),
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
            if (err) throw err;
            return callback();
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
            if (err) throw err;
            return callback();
        });
    },
    
    /**
     * Create a game auth token without user authentication.
     * NOTE: This function won't throw errors.
     *
     * @param {string} gameOwner - The username of the game owner
     *        (case-insensitive).
     * @param {string} gameName - The name of the game (case-insensitive).
     * @param {Function} callback - Called with (userObject, authToken) if the
     *        game is public, or (false) is authentication is needed, or no
     *        arguments if there is an error.
     */
    makeAnonymousGameToken: function (gameOwner, gameName, callback) {
        db.collection("sergis-games").findOne({
            gameOwner_lowercase: gameOwner.toLowerCase(),
            gameName_lowercase: gameName.toLowerCase()
        }, function (err, game) {
            if (err) {
                console.error("Error accessing \"" + gameOwner + "\"/\"" + gameName + "\" in sergis-games collection: ", err.stack);
                return callback();
            }

            if (!game || game.access != "public") {
                // Either bad game name, or user is not allowed to access
                return callback(false);
            }

            // All good, make auth token!
            makeToken(gameOwner, gameName, undefined, function (gamePerms, authToken) {
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
                console.error("Error accessing game in sergis-games collection: ", err.stack);
                return callback();
            }

            if (!game) {
                // Bad game name
                return callback();
            }

            db.collection("sergis-users").findOne({
                username_lowercase: gameOwner.toLowerCase()
            }, function (err, owner) {
                if (err) {
                    console.error("Error accessing user in sergis-users collection: ", err.stack);
                    return callback();
                }
                if (!owner) {
                    // Lol, the game owner doesn't exist anymore
                    return callback();
                }
                
                db.collection("sergis-users").findOne({
                    username_lowercase: username.toLowerCase()
                }, function (err, user) {
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

                        // Now, pass the control to checkAndMakeToken
                        checkAndMakeToken(game, owner, user, callback);
                    });
                });
            });
        });
    },
    
    /**
     * Create a game auth token for a user without checking authentication.
     * NOTE: This function won't throw errors.
     *
     * @param {string} gameOwner - The username of the game owner
     *        (case-insensitive).
     * @param {string} gameName - The name of the game (case-insensitive).
     * @param {string} username - The username (case-insensitive).
     * @param {Function} callback - Called with (userObject, authToken) if
     *        authentication is successful, or (false) if the username is bad,
     *        or (false, false) if the user does not have access to the game,
     *        or no arguments if there is an error (including if the user
     *        doesn't have access to the game).
     *        (See checkAndMakeToken below.)
     */
    makeGameToken: function (gameOwner, gameName, username, callback) {
        db.collection("sergis-games").findOne({
            gameOwner_lowercase: gameOwner.toLowerCase(),
            gameName_lowercase: gameName.toLowerCase()
        }, function (err, game) {
            if (err) {
                console.error("Error accessing game in sergis-games collection: ", err.stack);
                return callback();
            }

            if (!game) {
                // Bad game name
                return callback();
            }

            db.collection("sergis-users").findOne({
                username_lowercase: gameOwner.toLowerCase()
            }, function (err, owner) {
                if (err) {
                    console.error("Error accessing user in sergis-users collection: ", err.stack);
                    return callback();
                }
                if (!owner) {
                    // Bad owner
                    return callback();
                }
                
                db.collection("sergis-users").findOne({
                    username_lowercase: username.toLowerCase()
                }, function (err, user) {
                    if (err) {
                        console.error("Error accessing user in sergis-users collection: ", err.stack);
                        return callback();
                    }
                    if (!user) {
                        // Bad username
                        return callback(false);
                    }

                    // Now, pass the control to checkAndMakeToken
                    checkAndMakeToken(game, owner, user, callback);
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
                gameOwner_lowercase: tokenData.gameOwner.toLowerCase(),
                gameName_lowercase: tokenData.gameName.toLowerCase()
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
        db.collection("sergis-tokens").update({token: token}, {$set: update}, function (err, result) {
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
 * Check a game/user/owner combo for access and then make an auth token.
 *
 * @param {object} game - The game from sergis-games.
 * @param {object} owner - The owner of the game from sergis-users.
 * @param {object} user - The logged-in user from sergis-users.
 * @param {Function} callback - Called with (userObject, authToken) if
 *        authentication is successful, or (false, false) if the user does not
 *        have access to the game, or no arguments if there is an error.
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
        makeToken(game.gameOwner, game.gameName, user.username, function (gamePerms, authToken) {
            if (!gamePerms || !authToken) {
                return callback();
            }

            gamePerms.displayName = user.displayName;
            return callback(gamePerms, authToken);
        });
    } else {
        // No access for you!
        return callback(false, false);
    }
}

/**
 * Actually make an auth token.
 *
 * @param {string} gameOwner - The username of the game owner
 *        (case-insensitive).
 * @param {string} gameName - The name of the game (case-insensitive).
 * @param {string} username - The username of the user (can be `undefined`).
 * @param {Function} callback - Called with (gamePerms, authToken) if
 *        successful, or no arguments if there's an error.
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
            console.error("Error accessing in sergis-games collection: ", err.stack);
            return callback();
        }
        
        if (!game) {
            return callback();
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
