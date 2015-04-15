/*
    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
*/

// our modules
var config = require("../../config");


// The Game model (created in the `module.exports` function below)
var Game;

// Create the Game model
module.exports = function (mongoose) {
    var Schema = mongoose.Schema;
    
    // Game schema
    var gameSchema = new Schema({
        // The game owner
        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        
        // The game name
        name: {
            type: String,
            required: true
        },
        
        // The game name (lowercase)
        name_lowercase: {
            type: String,
            required: true,
            unique: true,
            validator: function (value) {
                return config.URL_SAFE_REGEX.test(value);
            }
        },
        
        // The access level
        access: {
            type: String,
            enum: ["public", "organization", "private"],
            default: "private"
        },
        
        // The JSON data
        jsondata: {
            type: Schema.Types.Mixed,
            select: false
        },
        
        // The date that it was created
        created: {
            type: Date,
            default: Date.now
        }
    });
    
    
    // Game model instance method
    /**
     * Determine whether the game is accessible by a certain user.
     *
     * @param {?User} user - The user to check, if any.
     *
     * @return {boolean} Whether they are allowed to access.
     */
    gameSchema.methods.isAccessibleByUser = function (user) {
        var game = this;
        
        // If there's no user, then the game must be public for the person to be able to access
        if (!user) {
            return game.access == "public";
        }

        // If there's a user, then check the game's 3 possible access cases
        if (game.access == "public") {
            // Game is public; anyone can access
            return true;
        }
        var isInOrganization = user.organization && game.owner.organization &&
            game.owner.organization.equals(user.organization);
        if (game.access == "organization" && (user.isFullAdmin || isInOrganization)) {
            // Game is organization access; the user is in the owner's organization or the user is a full admin
            return true;
        }
        // (we don't know if game.owner is populated or now)
        if ((game.owner._id || game.owner).equals(user._id) || user.isFullAdmin || (user.isOrganizationAdmin && isInOrganization)) {
            // Game is private; the user is the owner or an admin
            return true;
        }

        // If we're still here, the user didn't have access
        return false;
    };
    
    
    // Game model static method
    /**
     * Get all the games, optionally filtered by an owner and/or access level.
     *
     * @param {User} [owner] - The game owner to filter by.
     * @param {Organization} [organization] - The organization to filter by
     *        (will only include games whose owner is part of the organization).
     * @param {string} [access] - The access level to filter with (will only
     *        include games with this exact access level).
     *
     * @return {Promise.<Array.<Game>>} The games that match this criteria.
     */
    gameSchema.statics.getAll = function (owner, organization, access) {
        var criteria = {};
        if (owner) criteria.owner = owner;
        if (access) criteria.access = access;
        return Promise.resolve(Game.find(criteria).populate("owner").exec()).then(function (games) {
            if (!organization) {
                // We don't have to check organization; we're done
                return games;
            }
            
            // Check each game owner's organization
            return games.filter(function (game) {
                return game.owner.organization && game.owner.organization.equals(organization._id);
            });
        });
    };
    
    
    // Game model
    return (Game = mongoose.model("Game", gameSchema));
};
