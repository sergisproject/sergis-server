/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving account and
// administrative pages for sergis-server.

// node modules
var path = require("path");

// required modules
var express = require("express"),
    bodyParser = require("body-parser"),
    multer = require("multer");

// our modules
var config = require("../../config"),
    db = require("../db"),
    accounts = require("../accounts");

// The router for /account/
var router = module.exports = express.Router();

// Set up body parser for POST data
router.use(bodyParser.urlencoded({
    extended: true
}));

// Set up multer for POST data (multipart/form-data, used for file uploads or big things)
router.use(multer({
    limits: {
        // Max file size: 5 MB (in bytes)
        fileSize: 1024 * 1024 * 5,
        // Max # of files per request
        files: 2,
        // Max field size: 15 MB (in bytes)
        // Remember, MongoDB's max document size is 16 MB
        fieldSize: 1024 * 1024 * 15
    },
    // Store files in memory instead of on disk
    // WARNING: THIS IS DANGEROUS!
    inMemory: true
}));


////////////////////////////////////////////////////////////////////////////////
// The page handlers for /account/
var pageHandlers = {
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
        db.organizations.getAll(function (err, organizations) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            return res.render("account.ejs", {
                me: req.user,
                user: user,
                statusMessages: req.statusMessages || false,
                organizations: organizations,
                gameNamePattern: config.URL_SAFE_REGEX.toString().slice(1, -1),
                gameNameCharacters: config.URL_SAFE_REGEX_CHARS
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
        if (user.username.toLowerCase() != req.body.username.toLowerCase()) {
            req.error = {number: 400};
            return next("route");
        }
        
        // Now, are we trying to do something specific?
        switch (req.body.action) {
            case "update-user":
                accountActions["update-user"](req, res, next, user);
                return;
            case "create-game":
                accountActions["create-game"](req, res, next, user);
                return;
            case "delete-user":
                accountActions["delete-user"](req, res, next, user);
                return;
        }
        
        // Never mind, it's possible that we came here w/o doing anything
        next();
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
        db.users.getAll((req.user.isOrganizationAdmin && req.user.organization) ? req.user.organization : null, function (err, users) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            // Get the organization list too
            db.organizations.getAll(function (err, organizations) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

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
    }
};


////////////////////////////////////////////////////////////////////////////////
// Account actions
var accountActions = {
    /**
     * Handle a request for the updating of a user.
     */
    "update-user": function (req, res, next, user) {
        var update = {};
        var newPassword;
        req.statusMessages = [];
        
        // Check if the display name is changed
        if (req.body.displayName && req.body.displayName != user.displayName) {
            update.displayName = req.body.displayName;
            req.statusMessages.push("The display name for " + user.username + " has been updated.");
        }
        
        // Check if the password should be changed
        if (req.body.password1 && req.body.password2) {
            if (req.body.password1 == req.body.password2) {
                newPassword = req.body.password1;
                req.statusMessages.push("The password for " + user.username + " has been updated.");
            } else {
                req.statusMessages.push("ERROR: New passwords did not match.");
            }
        }
        
        // Check if the organization is changed (admin only)
        if (req.user.isAdmin && req.body.organization && req.body.organization != user.organization) {
            update.organization = req.body.organization;
            req.statusMessages.push("The organization for " + user.username + " has been updated.");
        }
        
        // Check if the admin status is changed (admin only)
        var oldAdminStatus = user.isAdmin ? "yup" : user.isOrganizationAdmin ? "kinda" : "nope";
        if (req.user.username != user.username && req.user.isAdmin && req.body.admin && req.body.admin != oldAdminStatus) {
            update.isAdmin = req.body.admin == "yup";
            update.isOrganizationAdmin = req.body.admin == "kinda";
            req.statusMessages.push("The admin status for " + user.username + " has been updated.");
        }
        
        // Set the changes if there are any
        if (JSON.stringify(update) != "{}" || newPassword) {
            // Yay, there's changes to update!
            db.users.update(user.username, update, newPassword, function (err) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

                // Re-get the user we just updated (store it in req.otherUser)
                db.users.get(user.username, function (err, user) {
                    if (err) {
                        req.error = {number: 500};
                        return next("route");
                    }

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
    "create-game": function (req, res, next, user) {
        // Pass control to accounts.createGame
        accounts.createGame(req, res, next, user, req.body.gameName, req.body.access);
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
        
        db.users.delete(user.username, function (err) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            if (req.user.username == user.username) {
                // We deleted ourselves
                req.session.destroy(function (err) {
                    if (err) {
                        console.error("ERROR DESTROYING SESSION: ", err.stack);
                    }
                    // Just redirect to the home page
                    return res.redirect(config.HTTP_PREFIX + "/");
                });
            } else {
                // We deleted somebody else, so just redirect to admin page
                return res.redirect(config.HTTP_PREFIX + "/account/admin");
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
        db.users.create(username, password, displayName, organization, admin, function (err, user) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
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
        db.users.get(username, function (err, user) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
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
            db.users.delete(username, function (err) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

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
        
        db.organizations.create(organizationName, function (err, organization) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
            req.statusMessages = ["Oranization \"" + organizationName + "\" has been created."];
            return next();
        });
    },
    
    /**
     * Set the organization of a user.
     */
    "set-user-organization": function (req, res, next, username, organizationName) {
        // Make sure username is A-Ok
        db.users.get(username, function (err, user) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
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
                    organization: null
                }, null, function (err) {
                    if (err) {
                        req.error = {number: 500};
                        return next("route");
                    }

                    // All good now!
                    req.statusMessages = ["The organization has been set to none for user \"" + username + "\"."];
                    return next();
                });
                return;
            }
            
            // Since we need to, let's make sure organizationName is A-Ok
            db.organizations.get(organizationName, function (err, organization) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

                if (!organization) {
                    return res.render("error-back.ejs", {
                        title: "SerGIS Server Admin",
                        subtitle: "Error Updating User",
                        details: "Invalid organization."
                    });
                }
                
                // Okay, now update the user
                db.users.update(username, {
                    organization: organizationName
                }, null, function (err) {
                    if (err) {
                        req.error = {number: 500};
                        return next("route");
                    }

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
        db.users.get(username, function (err, user) {
            if (err) {
                req.error = {number: 500};
                return next("route");
            }
            
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
                isAdmin: admin == "yup",
                isOrganizationAdmin: admin == "kinda",
            }, null, function (err) {
                if (err) {
                    req.error = {number: 500};
                    return next("route");
                }

                // All good now!
                req.statusMessages = ["User \"" + username + "\" is now " + (admin == "yup" ? " an Admin." : admin == "kinda" ? "an Organization Admin." : "not an admin.")];
                return next();
            });
        });
    }
};


////////////////////////////////////////////////////////////////////////////////
// Set up all the page handler routing
router.use(accounts.checkUser);
router.use(accounts.requireLogin);

router.get("", pageHandlers.account);
router.post("", pageHandlers.accountPost, pageHandlers.account);

router.get("/author", function (req, res, next) {
    // Redirect from old author URL
    res.redirect(config.HTTP_PREFIX + "/author");
});

router.get("/admin", pageHandlers.admin);
router.post("/admin", pageHandlers.adminPost, pageHandlers.admin);

router.get("/admin/:username", accounts.requireOtherAccountAccess, pageHandlers.account);
router.post("/admin/:username", accounts.requireOtherAccountAccess, pageHandlers.accountPost, pageHandlers.account);
