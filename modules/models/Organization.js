/*
    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
*/

// our modules
var config = require("../../config");


// The Organization model (created in the `module.exports` function below)
var Organization;

// Create the Organization model
module.exports = function (mongoose) {
    var Schema = mongoose.Schema;
    
    // Organization schema
    var organizationSchema = new Schema({
        // The organization name
        name: {
            type: String,
            required: true
        },
        
        // The organization name (lowercase)
        name_lowercase: {
            type: String,
            required: true,
            unique: true
        },
        
        // The date that it was created
        created: {
            type: Date,
            default: Date.now
        }
    });
    
    
    // Organization model
    return (Organization = mongoose.model("Organization", organizationSchema));
};
