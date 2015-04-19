/*
    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
*/

// node modules
var crypto = require("crypto");

// our modules
var config = require("../../config");


// The salt length for pbkdf2 hashing of passwords
var HASH_SALT_LENGTH = 16;
// The number of iterations for pbkdf2 hashing of passwords
var HASH_NUM_ITERATIONS = 10000;
// The derived key length for pbkdf2 hashing of passwords
var HASH_DERIVED_KEY_LENGTH = 30;


// The User model (created in the `module.exports` function below)
var User;

// Create the User model
module.exports = function (mongoose) {
    var Schema = mongoose.Schema;
    
    // User schema
    var userSchema = new Schema({
        // The username of the user
        username: {
            type: String,
            required: true
        },
        
        // The lowercase username of the user (for login)
        username_lowercase: {
            type: String,
            unique: true,
            required: true,
            validator: function (value) {
                return config.URL_SAFE_REGEX.test(value);
            }
        },

        // The full name of the user
        name: String,

        // The salted and hashed password of the user
        encryptedPassword: String,
        
        // The user's organization
        organization: {
            type: Schema.Types.ObjectId,
            ref: "Organization"
        },
        
        // Whether the user is a full admin
        isFullAdmin: {
            type: Boolean,
            default: false
        },
        
        // Whether the user is an organization admin
        isOrganizationAdmin: {
            type: Boolean,
            default: false
        },
        
        // Date that the user was created
        created: {
            type: Date,
            default: Date.now
        },
        
        // Date that the password was last set
        passwordCreated: {
            type: Date
        },
        
        // Who created this user (if anyone)
        creator: {
            type: Schema.Types.ObjectId,
            ref: "User"
        }
    });
    
    
    // User model virtuals
    userSchema.virtual("isAnyAdmin").get(function () {
        return this.isFullAdmin || (this.isOrganizationAdmin && this.organization);
    });
    userSchema.virtual("adminStatus").get(function () {
        return this.isFullAdmin ? "yup" : this.isOrganizationAdmin ? "kinda" : "nope";
    });
    userSchema.virtual("adminStatus").set(function (adminStatus) {
        this.isFullAdmin = adminStatus == "yup";
        this.isOrganizationAdmin = adminStatus == "kinda";
    });
    
    
    // User model instance method
    /**
     * Check user account's password.
     *
     * @param {string} password - The password to check.
     *
     * @return {Promise.<boolean>} Whether the password matches the one stored
     *         for the account.
     */
    userSchema.methods.checkPassword = function (password) {
        if (this.encryptedPassword) {
            return checkPassword(password, this.encryptedPassword);
        } else {
            return Promise.resolve(false);
        }
    };
    
    // User model instance method
    /**
     * Set a new password for a user account.
     *
     * @param {string} password - The new password.
     *
     * @return {Promise} Resolved if setting the new password was successful.
     */
    userSchema.methods.setPassword = function (password) {
        var user = this;
        return encryptPassword(password).then(function (encryptedPassword) {
            user.encryptedPassword = encryptedPassword;
            user.passwordCreated = Date.now();
            return Promise.resolve(user.save());
        });
    };
    
    /**
     * Determine whether a user is allowed to modify another user.
     *
     * @param {User} user - The other user to check if we can modify.
     *
     * @return {boolean} Whether we are allowed to modify `user`.
     */
    userSchema.methods.canModifyUser = function (user) {
        if (this.equals(user)) {
            // We're the same person!
            return true;
        }
        
        if (this.isFullAdmin) {
            // We're full admin; we do whatever the hell we want
            return true;
        }
        
        if (this.isOrganizationAdmin && this.organization && user.organization && this.organization.equals(user.organization)) {
            // We're an organization admin for the user's organization
            return true;
        }
        
        // Sorry, NO ACCESS FOR YOU
        return false;
    };
    
    
    // User model static methods
    /**
     * Check a username and password to see if it matches a user account.
     *
     * @param {string} username - The username for the account.
     * @param {string} password - The password for the account.
     *
     * @return {Promise.<?User>} The User matching this account, or null if no
     *         matching user was found.
     */
    userSchema.statics.checkLoginInfo = function (username, password) {
        return checkLoginInfo(username, password).then(function (user) {
            if (user) {
                return user.populate("organization").execPopulate();
            } else {
                return null;
            }
        });
    };
    
    /**
     * Create a new user.
     *
     * @param {string} username - The username of the new user.
     * @param {string} name - The display name of the new user.
     * @param {string} password - The password for the new user.
     * @param {string} [organizationID] - The ID of the organization of the
     *        new user.
     * @param {boolean} [isFullAdmin=false] - Whether the user is a Full Admin.
     * @param {boolean} [isOrganizationAdmin=false] - Whether the user is an
     *        Organization Admin.
     * @param {User} [creator] - The user that created this new user.
     *
     * @return {Promise.<User>} The newly created user.
     */
    userSchema.statics.createUser = function (username, name, password, organizationID, isFullAdmin, isOrganizationAdmin, creator) {
        var newUser = new User({
            username: username,
            username_lowercase: username.toLowerCase(),
            name: name,
            organization: organizationID || undefined,
            isFullAdmin: !!isFullAdmin,
            isOrganizationAdmin: !!isOrganizationAdmin,
            creator: creator ? creator._id : null
        });
        return Promise.resolve(newUser.save()).then(function () {
            // The new user was saved!
            // Now, set its password
            return newUser.setPassword(password);
        }).then(function () {
            // The password has been saved!
            // Now, return the new user
            return newUser;
        });
    };
    
    
    // User model
    return (User = mongoose.model("User", userSchema));
};


/**
 * Encrypt a password.
 *
 * @param {string} password - The user-provided password to encrypt.
 *
 * @return {Promise.<string>} The encrypted password.
 */
function encryptPassword(password) {
    return new Promise(function (resolve, reject) {
        var randomSalt = crypto.randomBytes(HASH_SALT_LENGTH).toString("base64").substring(0, HASH_SALT_LENGTH),
            numIterations = HASH_NUM_ITERATIONS,
            derivedKeyLength = HASH_DERIVED_KEY_LENGTH;
        
        // Hash the password
        crypto.pbkdf2(password, randomSalt, numIterations, derivedKeyLength, function (err, derivedKey) {
            if (err) {
                return reject(err);
            }
            
            var data = JSON.stringify([randomSalt, numIterations, derivedKeyLength, (new Buffer(derivedKey, "binary")).toString("base64")]);
            resolve(data.slice(1, -1));
        });
    });
}

/**
 * Check an encrypted password.
 *
 * @param {string} password - The user-provided password to check.
 * @param {string} encryptedPassword - The stored encrypted password to check
 *        against.
 *
 * @return {Promise.<boolean>} Whether the passwords match.
 */
function checkPassword(password, encryptedPassword) {
    return new Promise(function (resolve, reject) {
        var data;
        try {
            data = JSON.parse("[" + encryptedPassword + "]");
        } catch (err) {
            return reject(err);
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
                    reject(err);
                    return;
                }
                
                if ((new Buffer(newDerivedKey, "binary")).toString("base64") === derivedKey) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        } else {
            reject(new Error("Invalid encrypted password."));
        }
    });
}


/**
 * Check a username and password to see if it matches a user account.
 *
 * @param {string} username - The username for the account.
 * @param {string} password - The password for the account.
 *
 * @return {Promise.<?User>} The User matching this account, or null if no
 *         matching user was found.
 */
function checkLoginInfo(username, password) {
    var user;
    // Find the username
    return User.findOne({username_lowercase: username.toLowerCase()}).then(function (_user) {
        user = _user;
        // Make sure the username was good
        if (!user) {
            // Resolve with `null`
            return null;
        }

        // Check password
        return user.checkPassword(password);
    }).then(function (isTheUserTellingTheTruth) {
        if (isTheUserTellingTheTruth) {
            // Yay, the user wasn't lying to us!
            return user;
        } else {
            // The user was lying to us.
            return null;
        }
    });
}
