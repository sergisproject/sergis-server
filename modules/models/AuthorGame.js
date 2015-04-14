/*
    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
*/

// our modules
var config = require("../../config");


// The AuthorGame model (created in the `module.exports` function below)
var AuthorGame;

// Create the AuthorGame model
module.exports = function (mongoose) {
    var Schema = mongoose.Schema;
    
    // AuthorGame schema
    var authorGameSchema = new Schema({
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
        
        // The JSON data for the game
        jsondata: {
            type: Schema.Types.Mixed
        },
        
        // The date that it was created
        created: {
            type: Date,
            default: Date.now
        },
        
        // The date that it was last modified
        lastModified: {
            type: Date,
            default: Date.now
        }
    });
    
    
    // AuthorGame model
    return (AuthorGame = mongoose.model("AuthorGame", authorGameSchema));
};
