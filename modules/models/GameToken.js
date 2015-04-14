/*
    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
*/

// our modules
var config = require("../../config");


// The GameToken model (created in the `module.exports` function below)
var GameToken;

// Create the GameToken model
module.exports = function (mongoose) {
    var Schema = mongoose.Schema;
    
    // GameToken schema
    var gameTokenSchema = new Schema({
        // The token
        token: {
            type: String,
            required: true,
            unique: true
        },
        
        // The game
        game: {
            type: Schema.Types.ObjectId,
            ref: "Game",
            required: true
        },
        
        // The user playing this game
        user: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        
        // The game state
        state: {
            type: Schema.Types.Mixed
        },
        
        // The SerGIS Client User object
        clientUserObject: {
            type: Schema.Types.Mixed
        },
        
        // The date that it was created
        created: {
            type: Date,
            default: Date.now
        }
    });
    
    
    // GameToken model static method
    /**
     * Make a new game token.
     *
     * @param {Game} game - The game to make a token for.
     * @param {User} [user] - The user who is playing the game (if any).
     *
     * @return {Promise.<GameToken>} The new GameToken.
     */
    gameTokenSchema.statics.makeGameToken = function (game, user) {
        return new Promise(function (resolve, reject) {
            if (!game.isAccessibleByUser(user)) {
                // Ahh! The user doesn't have access to this game!
                return reject();
            }
            
            var token = Number(randInt(10) + "" + (new Date()).getTime() + "" + randInt(10)).toString(36);
            var gameToken = new GameToken({
                token: token,
                game: game,
                user: user,
                state: {
                    gameName: game.name,
                    // Default state
                    currentPromptIndex: null,
                    nextAllowedPromptIndex: null,
                    userChoices: [],
                    userChoiceOrder: []
                },
                clientUserObject: {
                    jumpingBackAllowed: !!game.jsondata.jumpingBackAllowed,
                    jumpingForwardAllowed: !!game.jsondata.jumpingForwardAllowed,
                    layout: game.jsondata.layout,
                    homeURL: config.HTTP_PREFIX + "/games",
                    displayName: user ? user.name : undefined
                }
            });
            resolve(gameToken.save().then(function () {
                return gameToken;
            }));
        });
    };
    
    
    
    // GameToken model
    return (GameToken = mongoose.model("GameToken", gameTokenSchema));
};

/**
 * Make a quick and dirty random integer.
 *
 * @param {number} d - The number of digits in the number.
 */
function randInt(d) {
    return Math.floor((Math.random() * 9 + 1) * Math.pow(10, d-1));
}
