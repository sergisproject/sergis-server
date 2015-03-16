# SerGIS Server

The Node.js-based server for interaction with the SerGIS Web Client for [the SerGIS Project](http://sergisproject.github.io/)

## Pre-reqs

The server must have a recent version of [node.js](http://www.nodejs.org/) and [npm](https://npmjs.org/) (usually installed with node.js).

SerGIS Server has a few node.js dependencies; to install these, run `npm install` in a terminal in the root directory of the codebase. Also, make sure the submodule in `sergis-client` is there (if you cloned the git repo, run `git submodule init` and/or `git submodule update`).

Also, SerGIS Server requires a [MongoDB](https://www.mongodb.org/) server to run.

## TODOs

- Make usernames and gamenames case-insensitive

## License

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.

For more, see `LICENSE.txt` and `CONTRIBUTORS.txt`.
