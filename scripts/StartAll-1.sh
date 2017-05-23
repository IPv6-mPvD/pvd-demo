#!/bin/sh

# In the context of a demo, we want to start some of the pvdid
# related daemons and utilities

# This script is intended to be started on a host (at least,
# it offers host [aka non router] functionality)

# It supposes for now that source repositories have been cloned
# besides this repository. This is not fine

# Make sure to run any sudo command before starting this script
# (otherwise starting the pvdid-daemon will fail by waiting input
# on stdin)

cd ../pvdid-daemon || exit 1

nohup node ./tests/httpsServer.js >/dev/null 2>&1 &
nohup sudo /bin/sh -c 'while true; do ./src/obj/pvdid-daemon; sleep 1; done' >/dev/null 2>&1 &
nohup node ./utils/pvdid-monitor -d >/dev/null 2>&1 &


cd ../pvdid-demo
nohup ./pvd-html-client/pvdHttpServer.js >/dev/null 2>&1 &
