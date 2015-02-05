/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving administrative pages
// for sergis-server.

// node modules
var fs = require("fs"),
    path = require("path");

// required modules
var bodyParser = require("body-parser");

var app, io, db, config;

/**
 * Set up handlers and such.
 *
 * @param _app - The express app.
 * @param _io - The socket.io instance.
 * @param _db - The MongoDB database.
 * @param _config - The sergis-server configuration.
 */
function init(_app, _io, _db, _config) {
    app = _app; io = _io; db = _db; config = _config;
    
    // Admin homepage
    app.get("/admin", function (req, res) {
        res.render(path.join(config.TEMPLATES_DIR, "admin.html"), {});
    });

    app.use("/admin", bodyParser.urlencoded({extended: true}));

    app.post("/admin", function (req, res) {
        console.log("POST from admin page");
        if (req.body.jsondata) {
            console.log(req.body.jsondata);
            try {
                var jsondata = JSON.parse(req.body.jsondata);
            } catch (err) {}
            if (!jsondata) {
                console.error("Invalid JSON data");
                res.status(500);
                res.end("<h1>Error</h1><h2>See console.</h2>");
            } else {
                var testjson = db.collection("testjson");
                testjson.insert(jsondata, function (err, result) {
                    if (err) {
                        console.error("Error inserting into testjson database: ", err);
                        res.status(500);
                        res.end("<h1>Error</h1><h2>See console</h2>");
                    } else {
                        console.log("Inserted document into the document collection: ", result);
                        res.redirect("/admin");
                    }
                });
            }
        }
    });
}

exports.init = init;
