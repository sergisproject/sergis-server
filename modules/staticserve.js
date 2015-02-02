/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// node modules
var fs = require("fs"),
    path = require("path");

// required modules
var mime = require("mime");

/**
 * Serve a static page.
 */
var servePage = exports.servePage = function (req, res, file) {
    fs.readFile(file, function (err, data) {
        if (err) {
            serveError(req, res, 500, "Error reading file: " + file);
        } else {
            res.writeHead(200);
            res.end(data);
        }
    });
};

/**
 * Serve a static resource.
 */
var serveResource = exports.serveResource = function (req, res, pathname) {
    fs.stat(pathname, function (err, stats) {
        if (err || !(stats && stats.isFile())) {
            serveError(req, res, 404);
        } else {
            var nocache = (process.env.NODE_ENV && process.env.NODE_ENV.toLowerCase() == "development");
            var headers = {
                "Date": (new Date()).toUTCString(),
                "Cache-Control": "max-age=21600",
                "Accept-Ranges": "bytes",
                "Last-Modified": stats.mtime.toUTCString()
            };
            if (nocache) headers["Cache-Control"] = "no-cache";
            if (!nocache && Date.parse(req.headers["if-modified-since"]) >= Date.parse(stats.mtime)) {
                res.writeHead(304, headers);
                res.end();
            } else {
                headers["Content-Type"] = "text/plain";
                if (path.basename(pathname).indexOf(".") != -1) {
                    headers["Content-Type"] = mime.lookup(path.basename(pathname));
                }
                
                var total = stats.size;
                var range = req.headers.range;
                if (range) {
                    // For the 2 following headers... see small info here:
                    // http://delog.wordpress.com/2011/04/25/stream-webm-file-to-chrome-using-node-js/
                    // (below big code block)
                    //headers["Connection"] = "close";
                    //headers["Transfer-Encoding"] = "chunked";
                    
                    var parts = range.substring(range.indexOf("bytes=") + 6).split("-");
                    var start = parseInt(parts[0], 10);
                    var end = parts[1] ? parseInt(parts[1], 10) : total - 1;
                    var chunksize = (end + 1) - start;
                    
                    headers["Content-Range"] = "bytes " + start + "-" + end + "/" + total;
                    headers["Content-Length"] = chunksize;
                    
                    res.writeHead(206, headers);
                    if (req.method == "HEAD") {
                        res.end();
                    } else {
                        fs.createReadStream(pathname, {start: start, end: end}).pipe(res);
                    }
                } else {
                    headers["Content-Length"] = total;
                    res.writeHead(200, headers);
                    if (req.method == "HEAD") {
                        res.end();
                    } else {
                        fs.createReadStream(pathname).pipe(res);
                    }
                }
            }
        }
    });
};

/**
 * Write out an HTTP error page.
 *
 * @param req
 * @param res
 * @param {number} num - The HTTP error code.
 * @param {string} [details] - The HTTP error message.
 */
var serveError = exports.serveError = function (req, res, num, details) {
    if (!details) {
        switch (num) {
            case 400:
                details = "Bad Request";
                break;
            case 403:
                details = "Access Denied";
                break;
            case 404:
                details = "Not Found";
                break;
            case 405:
                details = "Method Not Allowed";
                break;
            case 406:
                details = "Not Acceptable";
                break;
            case 500:
                details = "Internal Server Error";
                break;
            default:
                details = "Error";
        }
    }
    res.writeHead(num, {
        "Content-Type": "text/html",
        "Cache-Control": "no-cache"
    });
    res.end("<h1>HTTP " + num + ": " + details + "</h1>");
};
