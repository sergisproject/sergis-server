/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving account and
// administrative pages for sergis-server.

// required modules
var express = require("express"),
    bodyParser = require("body-parser"),
    multer = require("multer");

// our modules
var config = require("../config"),
    db = require("./db");

// The router for /account/
var router = module.exports = express.Router();

// Set up body parser for POST data
router.use(bodyParser.urlencoded({
    extended: true
}));

// Set up multer for POST data (multipart/form-data, used for file uploads)
router.use(multer({
    limits: {
        // Max file size: 5 MB (in bytes)
        fileSize: 1024 * 1024 * 5,
        // Max # of files per request
        files: 1
    },
    // Store files in memory instead of on disk
    // WARNING: THIS IS DANGEROUS!
    inMemory: true
}));


////////////////////////////////////////////////////////////////////////////////
// The page handlers for /account/
var pageHandlers = {
    /**
     * Get the account in question for an account URL, and make sure that the
     * user has permission to access.
     */
    checkAccount: function (req, res, next) {
        var otherUsername = req.params.username;
        // Let's get the data on the account that we're trying to open
        db.users.get(otherUsername, function (otherUser) {
            // Now, are we sure that this other user exists?
            if (!otherUser) {
                // Nope! Send a 404 if we're admin, 403 otherwise.
                req.error = {number: user.isAdmin ? 404 : 403};
                return next("route");
            }

            // Alrighty, now, do we have permission to access him?
            if (!req.user.isAdmin && !(req.user.isOrganizationAdmin && req.user.organization == otherUser.organization)) {
                // Not allowed! Send along a good ol' 403
                req.error = {number: 403};
                return next("route");
            }

            // Alrighty, finally, yes, we do have permission to access this guy, no matter who he is
            req.otherUser = otherUser;
            return next();
        });
    },
    
    /**
     * Show info on an account.
     * (If we're here, then we know that we have permission.)
     */
    account: function (req, res, next) {
        // NOTE: It isn't guaranteed that the use of "otherUser" means that
        // we're on an admin page.
        // accountActions["update-user"] will set otherUser right after updating
        // it, whether it originally came from req.user or req.otherUser.
        var user = req.otherUser || req.user;
        // Get the organization list, in case we need it
        db.organizations.getAll(function (organizations) {
            return res.render("account.ejs", {
                me: req.user,
                user: user,
                statusMessages: req.statusMessages || false,
                organizations: organizations,
                gameNamePattern: config.URL_SAFE_REGEX.toString().slice(1, -1),
                gameNameCharacters: config.URL_SAFE_REGEX_CHARS,
            });
        });
    },
    
    /**
     * Handle POST requests for a user account page.
     * (If we're here, then we know that we have permission.)
     */
    accountPost: function (req, res, next) {
        // Double-check
        var user = req.otherUser || req.user;
        var isMe = user.username == req.user.username;
        if (user.username != req.body.username) {
            req.error = {number: 400};
            return next("route");
        }
        
        // Now, are we trying to do something specific?
        switch (req.body.action) {
            case "update-user":
                accountActions["update-user"](req, res, next, user, isMe);
                return;
            case "create-game":
                accountActions["create-game"](req, res, next, user, isMe);
                return;
            case "delete-user":
                accountActions["delete-user"](req, res, next, user, isMe);
                return;
        }
        
        // Never mind, it's possible that we came here w/o doing anything
        next();
    },
    
    /**
     * Handle POST requests for the publishing page.
     */
    publishPost: function (req, res, next) {
        req.error = {number: 400};
        return next("route");
    },
    
    /**
     * Serve admin page.
     */
    admin: function (req, res, next) {
        // First check: is the user an admin at all?
        if (!req.user.isAdmin && !(req.user.isOrganizationAdmin && req.user.organization)) {
            // Nope! Silly user
            req.error = {number: 403};
            return next("route");
        }
        
        // Yup, the user actually gotst some rights
        // Let's get them something to look at
        db.users.getAll((req.user.isOrganizationAdmin && req.user.organization) ? req.user.organization : null, function (users) {
            // Get the organization list too
            db.organizations.getAll(function (organizations) {
                // Now, render all that shit
                return res.render("admin.ejs", {
                    me: req.user,
                    users: users,
                    statusMessages: req.statusMessages || false,
                    organization: req.user.isOrganizationAdmin && req.user.organization,
                    organizations: organizations,
                    usernamePattern: config.URL_SAFE_REGEX.toString().slice(1, -1),
                    usernameCharacters: config.URL_SAFE_REGEX_CHARS
                });
            });
        });
    },
    
    /**
     * Handle POST requests the admin page, then serve admin page.
     */
    adminPost: function (req, res, next) {
        req.user.isAdmin = 1;
        // First check: is the user an admin at all?
        if (!req.user.isAdmin && !(req.user.isOrganizationAdmin && req.user.organization)) {
            // Nope! Silly user
            req.error = {number: 403};
            return next("route");
        }
        
        // If the user is just an organization admin...
        if (req.user.isOrganizationAdmin) {
            // All the things that organization admins can do
            switch (req.body.action) {
                case "create-user":
                    adminActions["create-user"](req, res, next, req.body.username, req.body.password,
                                                req.body.displayName, req.user.organization, "nope");
                    return;
                case "delete-user":
                    adminActions["delete-user"](req, res, next, req.body.username, req.user.organization);
                    return;
            }
        } else {
            // The user is a full-fledged admin!
            switch (req.body.action) {
                case "create-organization":
                    adminActions["create-organization"](req, res, next, req.body.organization);
                    return;
                case "create-user":
                    adminActions["create-user"](req, res, next, req.body.username, req.body.password,
                                                req.body.displayName, req.body.organization, req.body.admin);
                    return;
                case "set-user-organization":
                    adminActions["set-user-organization"](req, res, next, req.body.username, req.body.organization);
                    return;
                case "set-user-admin":
                    adminActions["set-user-admin"](req, res, next, req.body.username, req.body.admin);
                    return;
                case "delete-user":
                    adminActions["delete-user"](req, res, next, req.body.username);
                    return;
            }
        }
        
        // Never mind, it's possible that we came here w/o doing anything
        next();
    },
    
    /**
     * Serve login page.
     */
    login: function (req, res, next, loginErrorMsg) {
        return res.render("account-login.ejs", {
            error: loginErrorMsg || false
        });
    }
};


////////////////////////////////////////////////////////////////////////////////
// Account actions
var accountActions = {
    /**
     * Handle a request for the updating of a user.
     */
    "update-user": function (req, res, next, user, isMe) {
        var $set = {};
        req.statusMessages = [];
        // Check if the display name is changed
        if (req.body.displayName && req.body.displayName != user.displayName) {
            $set.displayName = req.body.displayName;
            req.statusMessages.push("The display name for " + user.username + " has been updated.");
        }
        // Check if the password should be changed
        if (req.body.password1 && req.body.password2) {
            if (req.body.password1 == req.body.password2) {
                $set.password = req.body.password1;
                req.statusMessages.push("The password for " + user.username + " has been updated.");
            } else {
                req.statusMessages.push("ERROR: New passwords did not match.");
            }
        }
        // Check if the organization is changed
        if (!isMe && req.user.isAdmin && req.body.organization && req.body.organization != user.organization) {
            $set.organization = req.body.organization;
            req.statusMessages.push("The organization for " + user.username + " has been updated.");
        }
        // Check if the admin status is changed
        var oldAdminStatus = user.isAdmin ? "yup" : user.isOrganizationAdmin ? "kinda" : "nope";
        if (!isMe && req.user.isAdmin && req.body.admin && req.body.admin != oldAdminStatus) {
            $set.isAdmin = req.body.admin == "yup";
            $set.isOrganizationAdmin = req.body.admin == "kinda";
            req.statusMessages.push("The admin status for " + user.username + " has been updated.");
        }
        
        // Set the changes if there are any
        if (JSON.stringify($set) != "{}") {
            // Yay, there's changes to update!
            db.users.update(user.username, {$set: $set}, function () {
                // Update req.otherUser
                db.users.get(user.username, function (user) {
                    if (!user) {
                        // Ahh! He's gone!
                        req.error = {status: 500};
                        return next("route");
                    }
                    
                    req.otherUser = user;
                    return next();
                });
            });
        } else {
            // Nothing to change
            return next();
        }
    },
    
    /**
     * Handle a request for creating a new game under a user account.
     */
    "create-game": function (req, res, next, user, isMe) {
        // First, make sure everything's here and good
        if (!req.body.gameName) {
            return res.render("error-back.ejs", {
                title: "SerGIS Account - " + user.username,
                subtitle: "Error Creating Game",
                details: "Game name is missing."
            });
        }
        if (!config.URL_SAFE_REGEX.test(req.body.gameName)) {
            return res.render("error-back.ejs", {
                title: "SerGIS Account - " + user.username,
                subtitle: "Error Creating Game",
                details: "Invalid game name. Game names may consist of any letters, digits, and the following characters: " + config.URL_SAFE_REGEX_CHARS
            });
        }
        if (!req.body.access || ["public", "organization", "private"].indexOf(req.body.access) == -1) {
            return res.render("error-back.ejs", {
                title: "SerGIS Account - " + user.username,
                subtitle: "Error Creating Game",
                details: "Invalid access level."
            });
        }
        if (!req.files.jsonfile) {
            return res.render("error-back.ejs", {
                title: "SerGIS Account - " + user.username,
                subtitle: "Error Creating Game",
                details: "No SerGIS JSON Game Data file has been provided."
            });
        }

        // Next, make sure the game name isn't taken
        db.games.get(user.username, req.body.gameName, function (game) {
            if (game) {
                // Ahh! Game with this username/gameName combo already exists!
                return res.render("error-back.ejs", {
                    title: "SerGIS Account - " + user.username,
                    subtitle: "Error Creating Game",
                    details: (isMe ? "You" : "This Account") + " already has a game named \"" + req.body.gameName + "\". Game names must be unique."
                });
            }
            
            // Now, check the JSON game data
            var jsondata, jsonerr;
            try {
                jsondata = JSON.parse(req.files.jsonfile.buffer.toString());
            } catch (err) {
                jsondata = null;
                jsonerr = err;
            }
            if (!jsondata) {
                return res.render("error-back.ejs", {
                    title: "SerGIS Account - " + user.username,
                    subtitle: "Error Creating Game",
                    details: "Invalid SerGIS JSON Game Data file.\n\n" + (jsonerr ? jsonerr.name + ": " + jsonerr.message : "")
                });
            }
            
            // Okay, everything should be good now!
            db.games.create(user.username, req.body.gameName, req.body.access, jsondata, function (game) {
                req.statusMessages = [game ? (req.body.gameName + " created successfully!") : "Error creating game."];
                return next();
            });
        });
    },
    
    /**
     * Handle a request for deleting a user account.
     */
    "delete-user": function (req, res, next, user) {
        // Full Admin accounts cannot be deleted.
        if (user.isAdmin) {
            req.statusMessages = ["Full Admin accounts cannot be deleted."];
            return next();
        }
        
        db.users.delete(user.username, function () {
            if (isMe) {
                // We deleted ourselves
                req.session.destroy(function (err) {
                    if (err) throw err;
                    // Just redirect to the home page
                    return res.redirect((config.HTTP_PREFIX || "") + "/");
                });
            } else {
                // We deleted somebody else, so just redirect to admin page
                return res.redirect((config.HTTP_PREFIX || "") + "/account/admin");
            }
        });
    }
};


////////////////////////////////////////////////////////////////////////////////
// Admin actions
var adminActions = {
    /**
     * Handle a request for the creation of a user.
     */
    "create-user": function (req, res, next, username, password, displayName, organization, admin) {
        var errorMsg;
        if (!username) {
            errorMsg = "No username provided.";
        } else if (!config.URL_SAFE_REGEX.test(username)) {
            errorMsg = "Invalid username.\nUsernames may consist of any letters, digits, and the following characters: " + config.URL_SAFE_REGEX_CHARS;
        } else if (!displayName) {
            errorMsg = "No display name provided.";
        }

        if (errorMsg) {
            return res.render("error-back.ejs", {
                title: "SerGIS Server Admin",
                subtitle: "Error Creating Account",
                details: errorMsg
            });
        }

        // Finally... create the account
        db.users.create(username, password, displayName, organization, admin, function (user) {
            if (user === false) {
                // Error...
                return res.render("error-back.ejs", {
                    title: "SerGIS Server Admin",
                    subtitle: "Error Creating Account",
                    details: "Username already exists."
                });
            }
            
            // Everything successful; continue on our merry way!
            req.statusMessages = ["User \"" + username + "\" has been created."];
            return next();
        });
    },
    
    /**
     * Handle a request for the deletion of a user.
     */
    "delete-user": function (req, res, next, username, organization) {
        db.users.get(username, function (user) {
            if (!user) {
                // Well, our job is practically done for us
                return next();
            }
            
            // Make sure that we're not deleting ourselves, or an admin account
            if (user.username == req.user.username || user.isAdmin) {
                // Ahh!! Just pretend we didn't do anything
                // (This technically isn't possible to do from the admin home page anyway,
                // so this shouldn't ever be reached.)
                return next();
            }
            
            // If we need to check the organization, do so
            if (organization && user.organization !== organization) {
                // Pretend we're not here
                return next();
            }
            
            // All good!
            db.users.delete(username, function () {
                req.statusMessages = ["User \"" + username + "\" has been deleted."];
                return next();
            });
        });
    },
    
    /**
     * Handle creating a new organization.
     */
    "create-organization": function (req, res, next, organizationName) {
        if (!organizationName) {
            return res.render("error-back.ejs", {
                title: "SerGIS Server Admin",
                subtitle: "Error Creating Organization",
                details: "No organization name provided."
            });
        }
        
        db.organizations.create(organizationName, function (organization) {
            req.statusMessages = ["Oranization \"" + organizationName + "\" has been created."];
            return next();
        });
    },
    
    /**
     * Set the organization of a user.
     */
    "set-user-organization": function (req, res, next, username, organizationName) {
        // Make sure username is A-Ok
        db.users.get(username, function (user) {
            if (!user) {
                return res.render("error-back.ejs", {
                    title: "SerGIS Server Admin",
                    subtitle: "Error Updating User",
                    details: "Invalid username."
                });
            }
            
            // If we're setting the organization to nothing, then just do it now
            if (!organizationName) {
                // Okay, now update the user
                db.users.update(username, {
                    $set: {
                        organization: null
                    }
                }, function () {
                    // All good now!
                    req.statusMessages = ["The organization has been set to none for user \"" + username + "\"."];
                    return next();
                });
                return;
            }
            
            // Since we need to, let's make sure organizationName is A-Ok
            db.organizations.get(organizationName, function (organization) {
                if (!organization) {
                    return res.render("error-back.ejs", {
                        title: "SerGIS Server Admin",
                        subtitle: "Error Updating User",
                        details: "Invalid organization."
                    });
                }
                
                // Okay, now update the user
                db.users.update(username, {
                    $set: {
                        organization: organizationName
                    }
                }, function () {
                    // All good now!
                    req.statusMessages = ["The organization has been set to \"" + organizationName + "\" for user \"" + username + "\"."];
                    return next();
                });
            });
        });
    },
    
    /**
     * Set the admin status of a user.
     */
    "set-user-admin": function (req, res, next, username, admin) {
        // Make sure the username is A-Ok
        db.users.get(username, function (user) {
            if (!user) {
                return res.render("error-back.ejs", {
                    title: "SerGIS Server Admin",
                    subtitle: "Error Updating User",
                    details: "Invalid username."
                });
            }
            
            // Make sure we're not changing ourselves
            if (user.username == req.user.username) {
                // Pretend that nothing happened.
                return next();
            }
            
            // Okay, now update the user
            db.users.update(username, {
                $set: {
                    isAdmin: admin == "yup",
                    isOrganizationAdmin: admin == "kinda",
                }
            }, function () {
                // All good now!
                req.statusMessages = ["User \"" + username + "\" is now " + (admin == "yup" ? " an Admin." : admin == "kinda" ? "an Organization Admin." : "not an admin.")];
                return next();
            });
        });
    }
};


////////////////////////////////////////////////////////////////////////////////
// Set up login
router.use(function (req, res, next) {
    // Test admin account, if we don't have any accounts in the database yet
    /*
    req.user = {
        username: "admin",
        displayName: "Admin",
        isAdmin: true
    };
    */
    
    // Is it a login request?
    if (req.method == "POST" && req.body.login == "account-login") {
        // Kill any previous account that the user might have been logged in to
        req.session.username = undefined;
        req.user = undefined;
        // See if it's valid
        db.users.check(req.body.username, req.body.password, function (user) {
            if (user) {
                // Yay! Correct!
                // Re-add any pre-login POST data
                var postData = req.session.preLoginPostData;
                if (postData && postData.length) {
                    for (var i = 0; i < postData.length; i++) {
                        req.body[postData[i][0]] = postData[i][1];
                    }
                    req.session.preLoginPostData = undefined;
                }

                // Store the username in the session
                req.session.username = user.username;

                // Store the user with the request
                req.user = user;

                // Continue on our merry way
                return next();
            } else if (user === false) {
                // Bad username/password
                pageHandlers.login(req, res, next, "Username or password incorrect.");
            } else {
                // Error!
                req.error = {number: 500};
                return next("route");
            }
        });
    } else if (!req.user) {
        // No user session!!
        // Store any POST data coming to this page before we show the login page
        if (req.body) {
            var postData = [];
            for (var item in req.body) {
                if (req.body.hasOwnProperty(item)) {
                    postData.push([item, req.body[item]]);
                }
            }
            req.session.preLoginPostData = postData;
        }
        // Serve login page
        pageHandlers.login(req, res, next);
    } else {
        // Everything's good; just continue on our merry way!
        return next();
    }
});


////////////////////////////////////////////////////////////////////////////////
// Set up all the page handler routing
router.get("", pageHandlers.account);
router.post("", pageHandlers.accountPost, pageHandlers.account);

router.post("/publish", pageHandlers.publishPost);

router.get("/admin", pageHandlers.admin);
router.post("/admin", pageHandlers.adminPost, pageHandlers.admin);

router.get("/admin/:username", pageHandlers.checkAccount, pageHandlers.account);
router.post("/admin/:username", pageHandlers.checkAccount, pageHandlers.accountPost, pageHandlers.account);
